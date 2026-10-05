import { and, eq, isNotNull, or, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { competitionImportSources, competitionImports, competitions } from '../../db/schema.js';
import { newId } from '../id.js';
import { importSourceIds } from '../../../src/data/imports.js';
import type { ImportDraft, ImportOrigin, ImportSource, ImportSourceId } from '../../../src/data/imports.js';
import { aiConfigured, extractCompetition } from './extract.js';
import { htmlToText, normalizeUrl, parseRss } from './parse.js';
import type { FeedItem } from './parse.js';
import { safeFetch } from './safe-fetch.js';

/* ระบบดึงงานแข่งอัตโนมัติ (5 ต.ค. 2569)
   แหล่ง RSS ที่ตรวจไว้ใน markdown/DATA-SOURCES.md ทุกแหล่งปิดไว้ก่อน แอดมินเปิดเองทีละแหล่ง
   Contester ยังไม่ใส่: ข้อกำหนดของเขาห้ามใช้เนื้อหาเชิงพาณิชย์ (รอทีมขออนุญาต)
   EventPop ไม่ใส่: robots.txt ห้ามบอตเข้า /events/ ใช้การวางลิงก์เองแทน */

export const sources: Record<ImportSourceId, { feed: string; filter?: (item: FeedItem) => boolean }> = {
  ysc: {
    feed: 'https://www.nstda.or.th/ysc/feed/',
    // RSS ของ YSC มีข่าวผลการแข่งขันและเกียรติบัตรปนมาด้วย AI แยกให้อีกชั้น
  },
  contest_thailand: { feed: 'https://contest-thailand.com/feed/' },
};

/** เพดานต่อรอบ กันค่า AI บานปลายและกันฟังก์ชันบน Vercel เกินเวลา */
export const PER_SOURCE_LIMIT = 6;
const TIME_BUDGET_MS = 200_000;

export async function sourceSettings(): Promise<ImportSource[]> {
  const rows = await db.select().from(competitionImportSources);
  return importSourceIds.map((id) => {
    const row = rows.find((item) => item.id === id);
    return {
      id, enabled: row?.enabled ?? false, lastRunAt: row?.lastRunAt?.toISOString() ?? null,
      lastError: row?.lastError ?? null, lastFound: row?.lastFound ?? 0,
    };
  });
}

/** เทียบกับเวทีที่มีอยู่แล้ว: ลิงก์ต้นทางหรือลิงก์สมัครตรงกัน หรือชื่อเหมือนกันเมื่อตัดช่องว่างและตัวพิมพ์ */
async function findDuplicate(url: string | null, draft: ImportDraft | null) {
  const conditions = [];
  if (url) conditions.push(eq(competitions.sourceUrl, url), eq(competitions.registerUrl, url));
  if (draft?.registerUrl) conditions.push(eq(competitions.registerUrl, draft.registerUrl), eq(competitions.sourceUrl, draft.registerUrl));
  const name = draft?.name?.toLowerCase().replace(/\s+/g, '');
  if (name && name.length >= 4) conditions.push(sql`lower(regexp_replace(${competitions.name}, '\\s+', '', 'g')) = ${name}`);
  if (!conditions.length) return null;
  const [row] = await db.select({ id: competitions.id }).from(competitions).where(or(...conditions)).limit(1);
  return row?.id ?? null;
}

/** อ่านประกาศหนึ่งรายการแล้วเก็บร่าง แถวถูกสร้างไว้ก่อนแล้ว (status processing) */
async function process(id: string, input: { url: string | null; title: string; text?: string }) {
  try {
    let title = input.title;
    let text = input.text ?? '';
    if (!text && input.url) {
      const page = await safeFetch(input.url);
      const parsed = htmlToText(page.body);
      title = parsed.title || title;
      text = parsed.text;
    }
    if (text.trim().length < 40) throw new Error('หน้านี้แทบไม่มีข้อความให้อ่าน (อาจต้องเปิดด้วยเบราว์เซอร์ ลองคัดลอกข้อความมาวางแทน)');
    const result = await extractCompetition({ url: input.url, title, text });
    const duplicateOf = await findDuplicate(input.url, result.draft);
    await db.update(competitionImports).set({
      title: (result.draft.name ?? title).slice(0, 300),
      status: result.itemKind === 'call' || result.itemKind === 'unsure' ? 'pending' : 'skipped',
      itemKind: result.itemKind, draft: result.draft, uncertain: result.uncertain, note: result.note || null,
      duplicateOf, error: null,
    }).where(eq(competitionImports.id, id));
  } catch (error) {
    await db.update(competitionImports).set({
      status: 'failed', error: (error instanceof Error ? error.message : String(error)).slice(0, 300),
    }).where(eq(competitionImports.id, id));
  }
}

/** จองแถวด้วย url ที่ไม่ซ้ำ ประกาศที่เคยเห็นแล้วจะคืน null และไม่ถูกอ่านซ้ำ (กันรันซ้อนกันด้วย) */
async function claim(origin: ImportOrigin, url: string | null, title: string, createdBy: string | null) {
  const [row] = await db.insert(competitionImports)
    .values({ id: newId('imp'), origin, url, title: title.slice(0, 300) || 'ไม่มีชื่อ', createdBy })
    .onConflictDoNothing().returning({ id: competitionImports.id });
  return row?.id ?? null;
}

export class ImportNotReady extends Error {}

/** ดึงแหล่งที่เปิดอยู่ (หรือเฉพาะที่ระบุ) คืนจำนวนประกาศใหม่ของแต่ละแหล่ง */
export async function runSources(only?: ImportSourceId[], startedAt = Date.now()) {
  if (!aiConfigured()) throw new ImportNotReady('ยังไม่ได้ตั้ง ANTHROPIC_API_KEY ระบบจึงยังอ่านประกาศไม่ได้');
  const enabled = (await sourceSettings()).filter((item) => item.enabled && (!only || only.includes(item.id)));
  const summary: Record<string, number | string> = {};
  for (const source of enabled) {
    /* cron กับปุ่ม "ดึงตอนนี้" รันซ้อนกันได้โดยไม่อ่านประกาศซ้ำ เพราะแต่ละประกาศถูกจองด้วย url ที่ไม่ซ้ำ (claim)
       ไม่ใช้ advisory lock แบบ session เพราะการเชื่อมต่อแบบ pool ปลดล็อกคนละ connection กับที่ล็อกได้ */
    let found = 0;
    let failure: string | null = null;
    try {
      const feed = await safeFetch(sources[source.id].feed);
      const items = parseRss(feed.body).filter(sources[source.id].filter ?? (() => true));
      for (const item of items) {
        if (found >= PER_SOURCE_LIMIT || Date.now() - startedAt > TIME_BUDGET_MS) break;
        let url: string;
        try { url = normalizeUrl(item.link); } catch { continue; }
        const id = await claim(source.id, url, item.title, null);
        if (!id) continue;
        found += 1;
        await process(id, { url, title: item.title });
      }
    } catch (error) {
      failure = (error instanceof Error ? error.message : String(error)).slice(0, 300);
    }
    await db.insert(competitionImportSources).values({ id: source.id, lastRunAt: new Date(), lastError: failure, lastFound: found })
      .onConflictDoUpdate({ target: competitionImportSources.id, set: { lastRunAt: new Date(), lastError: failure, lastFound: found } });
    summary[source.id] = failure ?? found;
  }
  return summary;
}

/** แอดมินวางลิงก์ หรือวางข้อความประกาศ (เมื่อเปิดหน้านั้นจากเซิร์ฟเวอร์ไม่ได้ เช่น Facebook) */
export async function importManual(input: { url?: string | null; text?: string | null }, userId: string) {
  if (!aiConfigured()) throw new ImportNotReady('ยังไม่ได้ตั้ง ANTHROPIC_API_KEY ระบบจึงยังอ่านประกาศไม่ได้');
  const url = input.url ? normalizeUrl(input.url) : null;
  const text = input.text?.trim() || '';
  const origin: ImportOrigin = text ? 'text' : 'link';
  const id = await claim(origin, url, url ?? text.slice(0, 80), userId);
  if (!id) {
    const [existing] = await db.select({ id: competitionImports.id, status: competitionImports.status })
      .from(competitionImports).where(eq(competitionImports.url, url!)).limit(1);
    return { id: existing.id, duplicate: true, status: existing.status };
  }
  await process(id, { url, title: url ?? '', text });
  const [row] = await db.select({ status: competitionImports.status }).from(competitionImports).where(eq(competitionImports.id, id));
  return { id, duplicate: false, status: row.status };
}

/** ลองอ่านใหม่สำหรับรายการที่ล้มเหลว เฉพาะที่มีลิงก์ (ข้อความที่วางไว้ไม่ได้เก็บ ต้องวางใหม่) */
export async function retryImport(id: string) {
  const [row] = await db.update(competitionImports).set({ status: 'processing', error: null })
    .where(and(eq(competitionImports.id, id), eq(competitionImports.status, 'failed'), isNotNull(competitionImports.url)))
    .returning();
  if (!row) return false;
  await process(id, { url: row.url, title: row.title });
  return true;
}
