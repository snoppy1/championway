import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import {
  categoryEnum, competitionSubmissions, competitions as competitionsTable, files as filesTable,
  levelEnum, mentorAwards, mentorSubmissions, mentors, opportunityTypeEnum, regionEnum, reviewEvents, rewardEnum,
  submissionCategories, submissionLevels, submissionRewards,
} from '../db/schema.js';
import { competitionOptions, findCompetitionBySlug, listCompetitions, relatedCompetitions } from '../db/queries.js';
import type { CompetitionRecord, ListQuery } from '../db/queries.js';
import type { AppEnv } from '../lib/guards.js';
import { requireUser } from '../lib/guards.js';
import { newId } from '../lib/id.js';
import { notify } from '../lib/email.js';
import { notifyStaff } from '../lib/staff-notify.js';
import { env } from '../lib/env.js';
import { uploadsUsable } from '../lib/env.js';
import { attachFiles, fileProblem, publicFile, readStoredFile, storeFile } from '../lib/files.js';
import { monthEdge } from '../lib/dates.js';
import { kindKeys, themeKeys } from '../../src/data/focus.js';
import { topicValues } from '../../src/data/stored-values.js';
import type { Kind, Theme } from '../../src/data/focus.js';

export const publicApi = new Hono<AppEnv>();

/** ข้อความผิดพลาดต้องบอกว่าเป็นฟิลด์ไหน ไม่อย่างนั้นทั้งผู้กรอกและคนแก้บั๊กต้องเดาเอง */
export function firstIssue(error: z.ZodError) {
  const issue = error.issues[0];
  const path = issue.path.join('.');
  return path ? `${path}: ${issue.message}` : issue.message;
}


/** ช่วงขนาดทีมต้องตรงกับ teamSizeOptions ในหน้าเว็บ */
const teamBuckets: Record<string, { min: number; max: number }> = {
  solo: { min: 1, max: 1 },
  small: { min: 2, max: 3 },
  mid: { min: 4, max: 6 },
  large: { min: 7, max: Number.MAX_SAFE_INTEGER },
};

export const PRIZE_CEILING = 500000;
const PER_PAGE = 6;

function pickList<T extends string>(raw: string | undefined, allowed: readonly T[]): T[] {
  if (!raw) return [];
  const set = new Set(raw.split(',').filter((value): value is T => (allowed as readonly string[]).includes(value)));
  return [...set];
}

function readQuery(url: URL): ListQuery {
  const get = (key: string) => url.searchParams.get(key) ?? undefined;
  const number = (key: string, fallback: number) => {
    const raw = get(key);
    if (raw === undefined || raw.trim() === '') return fallback;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  };
  const prizeMin = number('pmin', 0);
  const prizeMaxRaw = number('pmax', PRIZE_CEILING);
  const sortRaw = get('sort') ?? 'deadline';
  const timingRaw = get('when') ?? '';
  const page = Math.max(1, Math.trunc(number('page', 1)) || 1);

  return {
    kind: kindKeys.includes((get('kind') ?? '') as Kind) ? get('kind') : undefined,
    themes: pickList(get('theme'), themeKeys),
    query: get('q') ?? '',
    // `category` เป็นชื่อเดิมของ `cat` ลิงก์เก่าที่แชร์ไว้แล้วจึงยังเปิดได้
    categories: [...new Set([
      ...pickList(get('cat'), categoryEnum.enumValues),
      ...pickList(get('category'), categoryEnum.enumValues),
    ])],
    types: pickList(get('type'), opportunityTypeEnum.enumValues),
    levels: pickList(get('level'), levelEnum.enumValues),
    regions: pickList(get('region'), regionEnum.enumValues),
    rewards: pickList(get('reward'), rewardEnum.enumValues),
    teamSizes: pickList(get('team'), Object.keys(teamBuckets)).map((id) => teamBuckets[id]),
    prizeMin: prizeMin <= prizeMaxRaw ? prizeMin : 0,
    // ค่าสูงสุดเท่ากับเพดานแปลว่าไม่จำกัด ไม่ใช่ 500,000 พอดี
    prizeMax: prizeMaxRaw >= PRIZE_CEILING || prizeMaxRaw < prizeMin ? null : prizeMaxRaw,
    freeOnly: get('free') === '1',
    timing: (['d7', 'd30', 'upcoming'] as const).includes(timingRaw as never) ? timingRaw as ListQuery['timing'] : '',
    sort: (['deadline', 'new', 'prize', 'name'] as const).includes(sortRaw as never) ? sortRaw as ListQuery['sort'] : 'deadline',
    slugs: get('slugs') ? (get('slugs') as string).split(',').filter(Boolean) : null,
    page,
    perPage: Math.min(50, Math.max(1, Math.trunc(number('perPage', PER_PAGE)) || PER_PAGE)),
  };
}

/** แปลงแถวในฐานข้อมูลให้เป็นรูปเดียวกับ Competition ที่หน้าเว็บใช้อยู่แล้ว */
export function toCompetition(record: CompetitionRecord) {
  return {
    id: record.id, kind: record.kind, themes: record.themes,
    slug: record.slug,
    name: record.name,
    categories: record.categories,
    type: record.type,
    org: record.org,
    closesAt: record.closesAt,
    opensAt: record.opensAt ?? undefined,
    closesPrecision: record.closesPrecision,
    opensPrecision: record.opensPrecision,
    eventDate: record.eventDate ?? undefined,
    region: record.region,
    venue: record.venue ?? undefined,
    prizeValue: record.prizeValue,
    prizeNote: record.prizeNote ?? undefined,
    rewards: record.rewards,
    fee: record.fee ?? undefined,
    levels: record.levels,
    teamMin: record.teamMin,
    teamMax: record.teamMax,
    description: record.description,
    keywords: record.keywords,
    featured: record.featured || undefined,
    sourceUrl: record.sourceUrl,
    source: record.source,
    lastVerifiedAt: record.lastVerifiedAt,
    registerUrl: record.registerUrl ?? undefined,
    posterUrl: record.posterUrl ?? undefined,
    overview: record.overview ?? undefined,
    audience: record.audience ?? undefined,
    format: record.format,
    deliverables: record.deliverables,
    preparation: record.preparation,
  };
}

publicApi.get('/competitions', async (c) => {
  const input = readQuery(new URL(c.req.url));
  const { total, page, pageCount, items } = await listCompetitions(input);
  return c.json({ total, page, pageCount, perPage: input.perPage, items: items.map(toCompetition) });
});

publicApi.get('/competitions/options', async (c) => c.json({ items: await competitionOptions() }));

publicApi.get('/competitions/:slug', async (c) => {
  const record = await findCompetitionBySlug(c.req.param('slug'));
  if (!record) throw new HTTPException(404, { message: 'ไม่พบเวทีนี้' });
  const related = await relatedCompetitions(record);
  return c.json({ competition: toCompetition(record), related: related.map(toCompetition) });
});

publicApi.get('/mentors', async (c) => {
  // join ชื่อเวทีที่ชนะมาด้วย หน้าเว็บจะได้ไม่ต้องถือรายการเวทีทั้งหมดไว้เพื่อค้นชื่อ
  const rows = await db.select().from(mentors)
    .leftJoin(competitionsTable, eq(competitionsTable.slug, mentors.wonSlug))
    .orderBy(asc(mentors.name));
  /* ส่งออกเฉพาะช่องที่เป็นข้อมูลสาธารณะ ห้ามกระจายทั้งแถว ช่องทางติดต่อ (contact_*) เห็นได้เฉพาะคนที่ยืนยันอีเมล
     และกดติดต่อเมนเทอร์คนนั้นแล้ว ผ่าน /api/consult/mentors/:id เท่านั้น (Astra รีวิว 3 ต.ค. 2569) */
  return c.json({
    items: rows.map(({ mentors: m, competitions }) => ({
      id: m.id, name: m.name, avatar: m.avatar, bio: m.bio, replyTime: m.replyTime, wonSlug: m.wonSlug,
      category: m.category, topics: m.topics, price: m.price, minutes: m.minutes, unit: m.priceUnit, best: m.best, cannot: m.cannot,
      firstSlotInDays: m.firstSlotInDays, verified: m.verified, weeklyRank: m.weeklyRank, weeklyFocus: m.weeklyFocus,
      confirmedThemes: m.confirmedThemes, disabledThemes: m.disabledThemes,
      wonName: competitions?.name ?? null,
    })),
  });
});

/* ---------- ไฟล์แนบ ---------- */

/* อัปโหลดก่อนส่งใบ ไฟล์จะเป็นของผู้ใช้ไปก่อน แล้วค่อยผูกเข้ากับใบตอนกดส่ง
   ทำแบบนี้เพราะตอนเลือกไฟล์ยังไม่มีใบให้ผูก และผู้ใช้ควรเห็นผลการตรวจไฟล์ทันที */
publicApi.post('/files', requireUser, async (c) => {
  if (!uploadsUsable) {
    throw new HTTPException(503, {
      message: 'ยังไม่ได้ตั้งค่าที่เก็บไฟล์ของสภาพแวดล้อมนี้ จึงยังรับไฟล์ไม่ได้',
    });
  }
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) throw new HTTPException(400, { message: 'ไม่พบไฟล์ที่ส่งมา' });
  const problem = fileProblem(file);
  if (problem) throw new HTTPException(400, { message: problem });

  const user = c.get('user')!;
  const stored = await storeFile('user', user.id, file);
  return c.json({ file: publicFile(stored) }, 201);
});

/** ไฟล์ที่เก็บในเครื่องต้องผ่าน API เพื่อให้ตรวจสิทธิ์ก่อน ของที่อยู่บน blob เปิดตรงได้
    โปสเตอร์เวทีเป็นของสาธารณะ ทุกคนเปิดได้โดยไม่ต้องเข้าสู่ระบบ ไฟล์อื่นต้องเป็นเจ้าของหรือทีมตรวจ */
publicApi.get('/files/:id', async (c) => {
  const [row] = await db.select().from(filesTable).where(eq(filesTable.id, c.req.param('id'))).limit(1);
  const user = c.get('user');
  // โปสเตอร์ที่ทีมงานอัปโหลด หรือรูปที่ผู้จัดแนบมาแล้วกลายเป็นโปสเตอร์ของเวทีที่เผยแพร่แล้ว เปิดได้ทุกคน
  const own = `/api/files/${row?.id}`;
  // รูปโปรไฟล์ของเมนเทอร์ที่เผยแพร่แล้วก็เป็นของสาธารณะเหมือนโปสเตอร์
  const poster = row?.ownerType === 'competition_poster' || (row ? (
    (await db.select({ id: competitionsTable.id }).from(competitionsTable).where(eq(competitionsTable.posterUrl, own)).limit(1)).length > 0
    || (await db.select({ id: mentors.id }).from(mentors).where(eq(mentors.photoUrl, own)).limit(1)).length > 0
  ) : false);
  if (!poster) {
    if (!user) throw new HTTPException(401, { message: 'กรุณาเข้าสู่ระบบก่อน' });
    if (!row) throw new HTTPException(404, { message: 'ไม่พบไฟล์นี้' });
    const reviewer = user.role === 'reviewer' || user.role === 'admin';
    // ผู้สมัครเปิดไฟล์ที่แนบกับใบสมัครเมนเทอร์ของตัวเองได้ (ต้องเห็นตอนแก้ใบที่ทีมงานขอข้อมูลเพิ่ม)
    const owner = (row.ownerType === 'user' && row.ownerId === user.id) || (row.ownerType === 'mentor_submission'
      && (await db.select({ id: mentorSubmissions.id }).from(mentorSubmissions)
        .where(and(eq(mentorSubmissions.id, row.ownerId), eq(mentorSubmissions.userId, user.id))).limit(1)).length > 0);
    if (!reviewer && !owner) throw new HTTPException(403, { message: 'ไม่มีสิทธิ์เปิดไฟล์นี้' });
  }
  if (!row) throw new HTTPException(404, { message: 'ไม่พบไฟล์นี้' });
  if (row.path.startsWith('http')) return c.redirect(row.path);

  return c.body(await readStoredFile(row) as ArrayBuffer, 200, {
    'content-type': row.mime,
    // โปสเตอร์เก็บในแคชได้ ไฟล์ส่วนตัว (หลักฐาน รูปโปรไฟล์) ห้ามแคชร่วม
    'cache-control': poster ? 'public, max-age=86400' : 'private, no-store',
    'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(row.originalName)}`,
  });
});

/* ---------- รับใบที่ส่งเข้ามา ---------- */

const standardTopics = new Set<string>(Object.values(topicValues));

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ไม่ถูกต้อง');

const competitionSubmissionBody = z.object({
  // ผู้จัดรู้ดีที่สุดว่างานของตัวเองเป็นแบบไหน จึงให้กรอกมาตั้งแต่ต้น ผู้ตรวจแก้ได้ภายหลัง
  kind: z.enum(kindKeys as [Kind, ...Kind[]], { message: 'เลือกประเภทงาน' }),
  themes: z.array(z.enum(themeKeys as [Theme, ...Theme[]]))
    .min(1, 'เลือกหมวดอย่างน้อยหนึ่งหมวด').max(4)
    .transform((list) => [...new Set(list)]),
  organizerName: z.string().trim().min(1).max(200),
  contactName: z.string().trim().min(1).max(120),
  contactRole: z.string().trim().min(1).max(120),
  contactEmail: z.string().trim().toLowerCase().email().max(200),
  contactPhone: z.string().trim().min(1).max(40),
  organizerUrl: z.string().trim().url('ลิงก์เว็บหรือเพจไม่ถูกต้อง').max(500),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(400),
  type: z.enum(opportunityTypeEnum.enumValues),
  categories: z.array(z.enum(categoryEnum.enumValues)).min(1).max(3),
  levels: z.array(z.enum(levelEnum.enumValues)).min(1),
  rewards: z.array(z.enum(rewardEnum.enumValues)).max(5).default([]),
  teamMin: z.number().int().min(1).max(100),
  teamMax: z.number().int().min(1).max(100),
  opensAt: isoDate.optional(),
  closesAt: isoDate,
  /** รู้แค่เดือน: เก็บเป็นวันแรก (เปิด) และวันสุดท้าย (ปิด) ของเดือน (6 ต.ค. 2569) */
  datePrecision: z.enum(['day', 'month']).default('day'),
  eventDate: isoDate.optional(),
  region: z.enum(regionEnum.enumValues),
  venue: z.string().trim().max(200).optional(),
  prizeValue: z.number().int().min(0).max(100000000),
  prizeNote: z.string().trim().max(200).optional(),
  fee: z.number().int().min(0).max(1000000).optional(),
  // ลิงก์ประกาศต้นทางบังคับเสมอ ทั้งเพื่อความน่าเชื่อถือและความถูกต้องทางกฎหมาย
  sourceUrl: z.string().trim().url('ต้องมีลิงก์ประกาศต้นทางที่เปิดได้').max(500),
  registerUrl: z.string().trim().url().max(500).optional(),
  /** id ของไฟล์ที่อัปโหลดไว้ก่อนหน้า เช่นโปสเตอร์ของงาน */
  fileIds: z.array(z.string().max(60)).max(3).default([]),
}).refine((value) => value.teamMax >= value.teamMin, {
  message: 'ขนาดทีมสูงสุดต้องไม่น้อยกว่าขนาดต่ำสุด', path: ['teamMax'],
});

publicApi.post('/submissions/competition', requireUser, async (c) => {
  const parsed = competitionSubmissionBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: firstIssue(parsed.error) });
  const body = parsed.data;
  const user = c.get('user')!;
  const id = newId('cs');

  await db.transaction(async (tx) => {
    await tx.insert(competitionSubmissions).values({
      id,
      kind: body.kind,
      themes: body.themes,
      userId: user.id,
      organizerName: body.organizerName,
      contactName: body.contactName,
      contactRole: body.contactRole,
      contactEmail: body.contactEmail,
      contactPhone: body.contactPhone,
      organizerUrl: body.organizerUrl,
      name: body.name,
      description: body.description,
      type: body.type,
      teamMin: body.teamMin,
      teamMax: body.teamMax,
      opensAt: body.opensAt ? (body.datePrecision === 'month' ? monthEdge(body.opensAt, 'first') : body.opensAt) : null,
      closesAt: body.datePrecision === 'month' ? monthEdge(body.closesAt, 'last') : body.closesAt,
      opensPrecision: body.datePrecision,
      closesPrecision: body.datePrecision,
      eventDate: body.eventDate ?? null,
      region: body.region,
      venue: body.venue ?? null,
      prizeValue: body.prizeValue,
      prizeNote: body.prizeNote ?? null,
      fee: body.fee ?? null,
      sourceUrl: body.sourceUrl,
      registerUrl: body.registerUrl ?? null,
    });
    await tx.insert(submissionCategories).values(
      body.categories.map((category, position) => ({ submissionId: id, category, position })),
    );
    await tx.insert(submissionLevels).values(body.levels.map((level) => ({ submissionId: id, level })));
    if (body.rewards.length) {
      await tx.insert(submissionRewards).values(body.rewards.map((reward) => ({ submissionId: id, reward })));
    }
  });

  await attachFiles(body.fileIds, user.id, 'competition_submission', id);
  await notify(body.contactEmail, 'ได้รับใบลงงานแข่งแล้ว',
    `ได้รับ "${body.name}" เข้าคิวตรวจแล้ว ทีมงานจะแจ้งผลภายใน 2 วันทำการ`);
  await notifyStaff('competition_submission', user.id, `งานแข่งใหม่รอตรวจ: ${body.name}`,
    `${body.organizerName} ส่ง "${body.name}" เข้ามาให้ตรวจ

${env.appOrigin}/admin/competitions/${id}`);
  return c.json({ id }, 201);
});

/* หลักฐานเป็นลิงก์ http(s) หรือข้อความ (ชื่อไฟล์แนบ) ห้ามอักขระควบคุม เช่น java<TAB>script: ที่เบราว์เซอร์ตัดทิ้งแล้วกลายเป็นลิงก์อันตราย
   ถ้าตีความเป็น URL ได้ ต้องเป็น http(s) เท่านั้น (Astra รีวิว 4 ต.ค. 2569) */
function safeEvidence(value: string) {
  if (/[\u0000-\u001f\u007f]/.test(value)) return false;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return !/^[a-z][a-z0-9+.-]*:/i.test(value);
  }
}

const mentorSubmissionBody = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  nickname: z.string().trim().min(1).max(40),
  email: z.string().trim().toLowerCase().email().max(200),
  phone: z.string().trim().max(40).default(''),
  occupation: z.string().trim().min(1).max(80),
  organization: z.string().trim().min(1).max(200),
  role: z.string().trim().min(1).max(120),
  experience: z.string().trim().min(1).max(2000),
  portfolio: z.string().trim().max(500).default(''),
  best: z.string().trim().min(1).max(1000),
  cannot: z.string().trim().min(1).max(1000),
  /* ความถนัด (ผู้ใช้ขอ 7 ต.ค. 2569): เลือกจากรายการได้ไม่เกินสี่ข้อ บวก "อื่นๆ" ที่พิมพ์เองได้อีกหนึ่งข้อ รวมแล้วต้องมีอย่างน้อยหนึ่งข้อ
     ข้อที่พิมพ์เองเก็บเป็นข้อความตามที่พิมพ์ อยู่ท้ายรายการ */
  topics: z.array(z.string().trim().min(1).max(80)).min(1, 'เลือกความถนัดอย่างน้อยหนึ่งข้อ').max(5)
    .transform((list) => [...new Set(list)])
    .refine((list) => list.filter((topic) => standardTopics.has(topic)).length <= 4, 'เลือกความถนัดจากรายการได้ไม่เกินสี่ข้อ')
    .refine((list) => list.filter((topic) => !standardTopics.has(topic)).length <= 1, 'ความถนัดอื่นๆ ใส่ได้หนึ่งข้อ'),
  /* ช่องทางติดต่อที่นักเรียนเห็นหลังกด Contact Mentor ต้องมีอย่างน้อยหนึ่งช่อง (ตรวจใน refine ด้านล่าง) */
  contactEmail: z.string().trim().max(200).refine((v) => !v || z.string().email().safeParse(v).success, 'อีเมลติดต่อไม่ถูกต้อง').default(''),
  contactLine: z.string().trim().max(100).default(''),
  contactPhone: z.string().trim().max(40).default(''),
  contactInstagram: z.string().trim().max(100).default(''),
  contactLink: z.string().trim().max(500).refine((v) => !v || /^https?:\/\//i.test(v), 'ลิงก์ต้องขึ้นต้นด้วย https://').default(''),
  /* ราคาของเวทีที่ติ๊ก "อยากเป็นเมนเทอร์" ไว้ในประสบการณ์ (ผู้ใช้ตัดสิน 4 ต.ค. 2569)
     0 = ฟรี (ไม่มีหน่วย) · มากกว่า 0 ต้องบอกว่าคิดต่ออะไร เช่น "ชั่วโมง" "โปรเจกต์" */
  offers: z.array(z.object({
    slug: z.string().trim().min(1).max(200),
    price: z.number().int().min(0).max(100000),
    unit: z.string().trim().max(40).default(''),
  }).refine((o) => o.price === 0 || o.unit.length > 0, 'บอกด้วยว่าราคานี้คิดต่ออะไร เช่น ชั่วโมง หรือโปรเจกต์'))
    .max(50).default([]),
  paidSlot: z.string().datetime({ offset: true }).or(isoDate).nullish(),
  freeSlot: z.string().datetime({ offset: true }).or(isoDate).nullish(),
  /** ประสบการณ์แข่งขัน ต้องมีอย่างน้อยหนึ่งรายการ (เป็นเมนเทอร์ได้ต้องเคยแข่ง) ไม่จำกัดว่าต้องได้รางวัล */
  awards: z.array(z.object({
    title: z.string().trim().min(1).max(200),
    competitionSlug: z.string().trim().max(200).nullable().default(null),
    result: z.enum(['winner', 'finalist', 'participant']).default('winner'),
    detail: z.string().trim().max(200).default(''),
    year: z.string().trim().min(1).max(10),
    // ลิงก์ต้องเป็น http(s) ห้าม javascript: data: (หน้า admin อาจทำเป็นลิงก์) ไม่บังคับแล้ว เพราะบังคับแนบไฟล์แทน
    evidence: z.string().trim().max(400).refine((v) => !v || safeEvidence(v), 'ลิงก์หลักฐานต้องขึ้นต้นด้วย https://').default(''),
    /** ไฟล์หลักฐานที่อัปโหลดผ่าน /api/files ก่อนส่งใบ บังคับทุกรายการ (ผู้ใช้ขอ 6 ต.ค. 2569) แนบได้สูงสุดห้าไฟล์ (7 ต.ค.) */
    evidenceFileIds: z.array(z.string().trim().min(1).max(60)).min(1, 'แนบไฟล์หลักฐานของทุกเวที').max(5, 'แนบไฟล์หลักฐานได้ไม่เกินห้าไฟล์ต่อเวที'),
    wantsMentor: z.boolean().default(false),
    /** ราคาของเวทีที่ยังไม่มีในระบบ (ติ๊กอยากเป็นเมนเทอร์) อนุมัติแล้วกลายเป็นคำขอเพิ่มเวที */
    offer: z.object({ price: z.number().int().min(0).max(100000), unit: z.string().trim().max(40).default('') })
      .refine((o) => o.price === 0 || o.unit.length > 0, 'บอกด้วยว่าราคานี้คิดต่ออะไร เช่น ชั่วโมง หรือโปรเจกต์').nullish(),
  })).min(1, 'เพิ่มประสบการณ์แข่งขันอย่างน้อยหนึ่งรายการ').max(30),
  /** รูปโปรไฟล์ที่อัปโหลดผ่าน /api/files ก่อนส่งใบ บังคับ เมนเทอร์ทุกคนมีรูปบนหน้าเวที (ผู้ใช้ขอ 6 ต.ค. 2569) */
  photoFileId: z.string().trim().min(1, 'เพิ่มรูปโปรไฟล์').max(60),
  /** id ของไฟล์หลักฐานที่อัปโหลดไว้ก่อนหน้า */
  fileIds: z.array(z.string().max(60)).max(4).default([]),
}).refine((v) => [v.contactEmail, v.contactLine, v.contactPhone, v.contactInstagram, v.contactLink].some(Boolean),
  { message: 'ใส่ช่องทางติดต่ออย่างน้อยหนึ่งช่อง', path: ['contactEmail'] });

type MentorBody = z.infer<typeof mentorSubmissionBody>;

/** ตรวจเวที ราคา และไฟล์ของใบสมัครเมนเทอร์ ใช้ทั้งตอนส่งใบใหม่และตอนแก้ใบที่ทีมงานขอข้อมูลเพิ่ม
    ไฟล์ที่อ้างต้องเป็นของผู้สมัครเอง (อัปโหลดผ่าน /api/files) หรือผูกกับใบนี้อยู่แล้ว (ตอนแก้ใบ) */
async function prepareMentorSubmission(body: MentorBody, userId: string, existingId?: string) {
  /* เวทีที่อ้างต้องมีในระบบจริง ถึงจะติ๊กเป็นเมนเทอร์ได้ และตั้งราคาได้เฉพาะเวทีที่ติ๊กไว้ในประสบการณ์
     (เป็นเมนเทอร์ได้เฉพาะเวทีที่เคยแข่งเอง) ราคาของเวทีอื่นที่ส่งมาถูกทิ้ง */
  const claimed = [...new Set(body.awards.map((award) => award.competitionSlug).filter((slug): slug is string => Boolean(slug)))];
  const known = claimed.length
    // เฉพาะเวทีที่มีหน้าบนเว็บ (kind ไม่ว่าง) นักเรียนถึงจะเห็นเมนเทอร์ของเวทีนั้น
    ? await db.select({ id: competitionsTable.id, slug: competitionsTable.slug }).from(competitionsTable)
      .where(and(inArray(competitionsTable.slug, claimed), sql`${competitionsTable.kind} is not null`))
    : [];
  const idOf = new Map(known.map((row) => [row.slug, row.id]));
  const mentorFor = new Set(body.awards.filter((award) => award.wantsMentor && award.competitionSlug && idOf.has(award.competitionSlug))
    .map((award) => award.competitionSlug!));
  const priced = new Map<string, { price: number; unit: string }>();
  for (const offer of body.offers) {
    if (mentorFor.has(offer.slug) && !priced.has(offer.slug)) priced.set(offer.slug, { price: offer.price, unit: offer.price === 0 ? '' : offer.unit });
  }
  const missing = [...mentorFor].filter((slug) => !priced.has(slug));
  if (missing.length) throw new HTTPException(400, { message: 'ใส่ราคาของทุกเวทีที่อยากเป็นเมนเทอร์ (ฟรี หรือราคาต่ออะไร)' });
  const offers = [...mentorFor].map((slug) => ({ competitionId: idOf.get(slug)!, ...priced.get(slug)! }));
  // เวทีที่ยังไม่มีในระบบแต่ติ๊กอยากเป็นเมนเทอร์ ต้องมีราคามาด้วย
  const typedMentor = (award: MentorBody['awards'][number]) => award.wantsMentor && !(award.competitionSlug && idOf.has(award.competitionSlug));
  if (body.awards.some((award) => typedMentor(award) && !award.offer)) {
    throw new HTTPException(400, { message: 'ใส่ราคาของทุกเวทีที่อยากเป็นเมนเทอร์ (ฟรี หรือราคาต่ออะไร)' });
  }

  /* ไฟล์ที่อ้างต้องเป็นของผู้สมัครเอง และยังไม่ถูกผูกกับใบไหน หรือผูกกับใบที่กำลังแก้อยู่ รูปโปรไฟล์ต้องเป็นรูปภาพ */
  const wanted = [...new Set([body.photoFileId, ...body.awards.flatMap((award) => award.evidenceFileIds)])];
  const mine = and(eq(filesTable.ownerType, 'user'), eq(filesTable.ownerId, userId));
  const owned = await db.select({ id: filesTable.id, mime: filesTable.mime }).from(filesTable)
    .where(and(inArray(filesTable.id, wanted), existingId
      ? or(mine, and(eq(filesTable.ownerType, 'mentor_submission'), eq(filesTable.ownerId, existingId)))
      : mine));
  if (owned.length !== wanted.length) throw new HTTPException(400, { message: 'ไฟล์แนบบางไฟล์ใช้ไม่ได้ อัปโหลดใหม่อีกครั้ง' });
  if (!owned.find((file) => file.id === body.photoFileId)?.mime.startsWith('image/')) {
    throw new HTTPException(400, { message: 'รูปโปรไฟล์ต้องเป็นไฟล์ JPG, PNG หรือ WebP' });
  }
  return { idOf, mentorFor, offers, typedMentor, wanted };
}

type Prepared = Awaited<ReturnType<typeof prepareMentorSubmission>>;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** ทุกช่องของใบที่ผู้สมัครกรอกเองและแก้ได้ */
const mentorFields = (body: MentorBody, prepared: Prepared) => ({
  firstName: body.firstName,
  lastName: body.lastName,
  nickname: body.nickname,
  email: body.email,
  phone: body.phone,
  occupation: body.occupation,
  organization: body.organization,
  role: body.role,
  experience: body.experience,
  portfolio: body.portfolio,
  best: body.best,
  cannot: body.cannot,
  topics: body.topics,
  contactEmail: body.contactEmail,
  contactLine: body.contactLine,
  contactPhone: body.contactPhone,
  contactInstagram: body.contactInstagram,
  contactLink: body.contactLink,
  competitionIds: prepared.offers.map((offer) => offer.competitionId),
  competitionOffers: prepared.offers,
  paidSlot: body.paidSlot ? new Date(body.paidSlot) : null,
  freeSlot: body.freeSlot ? new Date(body.freeSlot) : null,
  photoFileId: body.photoFileId,
});

/** ผูกไฟล์กับใบ แล้วเขียนประสบการณ์แข่งขันของใบนี้ เจ้าของไฟล์เปลี่ยนจากผู้ใช้เป็นใบสมัคร
    เปิดดูได้เฉพาะทีมตรวจกับผู้สมัคร (รูปโปรไฟล์เปิดสาธารณะหลังอนุมัติ) */
async function writeMentorAwards(tx: Tx, id: string, userId: string, body: MentorBody, prepared: Prepared) {
  await tx.update(filesTable).set({ ownerType: 'mentor_submission', ownerId: id })
    .where(and(inArray(filesTable.id, prepared.wanted), eq(filesTable.ownerType, 'user'), eq(filesTable.ownerId, userId)));
  await tx.insert(mentorAwards).values(body.awards.map((award) => ({
    id: newId('aw'),
    submissionId: id,
    title: award.title,
    // เก็บ slug เฉพาะเวทีที่มีในระบบ ชื่อที่พิมพ์เองอยู่ใน title
    competitionSlug: award.competitionSlug && prepared.idOf.has(award.competitionSlug) ? award.competitionSlug : null,
    year: award.year,
    evidence: award.evidence,
    evidenceFileIds: [...new Set(award.evidenceFileIds)],
    result: award.result,
    detail: award.detail,
    wantsMentor: Boolean(award.wantsMentor
      && ((award.competitionSlug && prepared.mentorFor.has(award.competitionSlug)) || prepared.typedMentor(award))),
    offerPrice: prepared.typedMentor(award) ? award.offer!.price : null,
    offerUnit: prepared.typedMentor(award) && award.offer!.price > 0 ? award.offer!.unit : '',
  })));
}

publicApi.post('/submissions/mentor', requireUser, async (c) => {
  const parsed = mentorSubmissionBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: firstIssue(parsed.error) });
  const body = parsed.data;
  const user = c.get('user')!;
  const id = newId('ms');
  const prepared = await prepareMentorSubmission(body, user.id);

  await db.transaction(async (tx) => {
    await tx.insert(mentorSubmissions).values({ id, userId: user.id, price: null, minutes: null, ...mentorFields(body, prepared) });
    await writeMentorAwards(tx, id, user.id, body, prepared);
  });

  await attachFiles(body.fileIds, user.id, 'mentor_submission', id);
  await notifyStaff('mentor_application', user.id, `ใบสมัครเมนเทอร์ใหม่: ${body.firstName} ${body.lastName.slice(0, 1)}.`,
    `${body.firstName} ${body.lastName.slice(0, 1)}. (${body.nickname}) ส่งใบสมัครเมนเทอร์ รอตรวจ

${env.appOrigin}/admin/mentors/${id}`);
  await notify(body.email, 'ได้รับใบสมัครเมนเทอร์แล้ว',
    'ได้รับใบสมัครเข้าคิวตรวจแล้ว ทีมงานจะแจ้งผลทางอีเมลทุกกรณี');
  return c.json({ id }, 201);
});

/* ---------- แก้ใบสมัครเมนเทอร์หลังทีมงานขอข้อมูลเพิ่ม (ผู้ใช้ขอ 7 ต.ค. 2569) ----------
   แก้ได้เฉพาะเจ้าของใบ และเฉพาะตอนสถานะ "ขอข้อมูลเพิ่ม" ส่งแล้วใบกลับเข้าคิวรอตรวจ */

const notEditable = () => new HTTPException(409, { message: 'ใบนี้แก้ไม่ได้แล้ว แก้ได้เฉพาะตอนที่ทีมงานขอข้อมูลเพิ่ม' });

async function editableMentorSubmission(id: string, userId: string) {
  const [row] = await db.select().from(mentorSubmissions)
    .where(and(eq(mentorSubmissions.id, id), eq(mentorSubmissions.userId, userId))).limit(1);
  if (!row) throw new HTTPException(404, { message: 'ไม่พบใบสมัครนี้' });
  if (row.status !== 'info') throw notEditable();
  return row;
}

publicApi.get('/submissions/mentor/:id', requireUser, async (c) => {
  const row = await editableMentorSubmission(c.req.param('id'), c.get('user')!.id);
  const [awards, [request], attached] = await Promise.all([
    db.select().from(mentorAwards).where(eq(mentorAwards.submissionId, row.id)),
    db.select({ note: reviewEvents.note }).from(reviewEvents)
      .where(and(eq(reviewEvents.target, 'mentor'), eq(reviewEvents.targetId, row.id), eq(reviewEvents.decision, 'info')))
      .orderBy(desc(reviewEvents.createdAt)).limit(1),
    db.select({ id: filesTable.id, name: filesTable.originalName, mime: filesTable.mime, size: filesTable.size }).from(filesTable)
      .where(and(eq(filesTable.ownerType, 'mentor_submission'), eq(filesTable.ownerId, row.id))),
  ]);
  const file = (fileId: string | null) => attached.find((item) => item.id === fileId) ?? null;
  // ราคาของเวทีในระบบเก็บในใบ ส่วนเวทีที่ยังไม่มีในระบบเก็บในรายการประสบการณ์
  const slugOf = row.competitionOffers.length
    ? new Map((await db.select({ id: competitionsTable.id, slug: competitionsTable.slug }).from(competitionsTable)
      .where(inArray(competitionsTable.id, row.competitionOffers.map((offer) => offer.competitionId)))).map((item) => [item.id, item.slug]))
    : new Map<string, string>();
  return c.json({
    note: request?.note ?? '',
    submission: {
      firstName: row.firstName, lastName: row.lastName, nickname: row.nickname, email: row.email,
      occupation: row.occupation, organization: row.organization, role: row.role, experience: row.experience,
      portfolio: row.portfolio, best: row.best, cannot: row.cannot, topics: row.topics,
      contactEmail: row.contactEmail, contactLine: row.contactLine, contactPhone: row.contactPhone,
      contactInstagram: row.contactInstagram, contactLink: row.contactLink,
      photo: file(row.photoFileId),
      offers: row.competitionOffers.flatMap((offer) => {
        const slug = slugOf.get(offer.competitionId);
        return slug ? [{ slug, price: offer.price ?? 0, unit: offer.unit ?? '' }] : [];
      }),
      awards: awards.map((award) => ({
        title: award.title, competitionSlug: award.competitionSlug, result: award.result, detail: award.detail, year: award.year,
        evidence: award.evidence, wantsMentor: award.wantsMentor, offerPrice: award.offerPrice, offerUnit: award.offerUnit,
        files: award.evidenceFileIds.flatMap((fileId) => file(fileId) ?? []),
      })),
    },
  });
});

publicApi.put('/submissions/mentor/:id', requireUser, async (c) => {
  const parsed = mentorSubmissionBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: firstIssue(parsed.error) });
  const body = parsed.data;
  const user = c.get('user')!;
  const { id } = await editableMentorSubmission(c.req.param('id'), user.id);
  const prepared = await prepareMentorSubmission(body, user.id, id);

  await db.transaction(async (tx) => {
    // ล็อกใบไว้ก่อน ถ้าทีมงานตัดสินใบนี้ไปพร้อมกัน ฝั่งที่มาทีหลังจะเห็นสถานะใหม่
    const [locked] = await tx.select({ status: mentorSubmissions.status }).from(mentorSubmissions)
      .where(eq(mentorSubmissions.id, id)).for('update');
    if (locked?.status !== 'info') throw notEditable();
    await tx.update(mentorSubmissions).set({ ...mentorFields(body, prepared), status: 'pending', submittedAt: new Date() })
      .where(eq(mentorSubmissions.id, id));
    await tx.delete(mentorAwards).where(eq(mentorAwards.submissionId, id));
    await writeMentorAwards(tx, id, user.id, body, prepared);
  });

  await notifyStaff('mentor_application', user.id, `ใบสมัครเมนเทอร์ส่งกลับมาแล้ว: ${body.firstName} ${body.lastName.slice(0, 1)}.`,
    `${body.firstName} ${body.lastName.slice(0, 1)}. (${body.nickname}) แก้ใบสมัครตามที่ขอข้อมูลเพิ่มแล้ว รอตรวจอีกครั้ง

${env.appOrigin}/admin/mentors/${id}`);
  await notify(body.email, 'ได้รับใบสมัครเมนเทอร์ที่แก้แล้ว',
    'ได้รับใบสมัครที่แก้แล้ว ใบกลับเข้าคิวตรวจอีกครั้ง ทีมงานจะแจ้งผลทางอีเมลทุกกรณี');
  return c.json({ id });
});

/** ใบที่ผู้ใช้คนนี้ส่งเข้ามา เพื่อให้ตามสถานะของตัวเองได้ */
publicApi.get('/submissions/mine', requireUser, async (c) => {
  const user = c.get('user')!;
  const [comps, mentorRows] = await Promise.all([
    db.select({
      id: competitionSubmissions.id, name: competitionSubmissions.name,
      status: competitionSubmissions.status, submittedAt: competitionSubmissions.submittedAt,
    }).from(competitionSubmissions).where(eq(competitionSubmissions.userId, user.id)),
    db.select({
      id: mentorSubmissions.id, nickname: mentorSubmissions.nickname,
      status: mentorSubmissions.status, submittedAt: mentorSubmissions.submittedAt,
    }).from(mentorSubmissions).where(and(eq(mentorSubmissions.userId, user.id))),
  ]);
  return c.json({ competitions: comps, mentors: mentorRows });
});
