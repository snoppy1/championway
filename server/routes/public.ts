import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import {
  categoryEnum, competitionSubmissions, competitions as competitionsTable, files as filesTable,
  levelEnum, mentorAwards, mentorSubmissions, mentors, opportunityTypeEnum, regionEnum, rewardEnum,
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
import { attachFiles, fileProblem, publicFile, readLocalFile, storeFile } from '../lib/files.js';
import { kindKeys, themeKeys } from '../../src/data/focus.js';
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

/** ไฟล์ที่เก็บในเครื่องต้องผ่าน API เพื่อให้ตรวจสิทธิ์ก่อน ของที่อยู่บน blob เปิดตรงได้ */
publicApi.get('/files/:id', requireUser, async (c) => {
  const user = c.get('user')!;
  const [row] = await db.select().from(filesTable).where(eq(filesTable.id, c.req.param('id'))).limit(1);
  if (!row) throw new HTTPException(404, { message: 'ไม่พบไฟล์นี้' });

  const reviewer = user.role === 'reviewer' || user.role === 'admin';
  const owner = row.ownerType === 'user' && row.ownerId === user.id;
  if (!reviewer && !owner) throw new HTTPException(403, { message: 'ไม่มีสิทธิ์เปิดไฟล์นี้' });
  if (row.path.startsWith('http')) return c.redirect(row.path);

  return c.body(await readLocalFile(row), 200, {
    'content-type': row.mime,
    'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(row.originalName)}`,
  });
});

/* ---------- รับใบที่ส่งเข้ามา ---------- */

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
      opensAt: body.opensAt ?? null,
      closesAt: body.closesAt,
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
  // หน้าเว็บบังคับเลือกความถนัดสองข้อพอดี ฝั่งเซิร์ฟเวอร์ต้องบังคับซ้ำ
  topics: z.array(z.string().trim().min(1).max(80)).length(2, 'เลือกความถนัดสองข้อ'),
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
    // ลิงก์ต้องเป็น http(s) ห้าม javascript: data: (หน้า admin อาจทำเป็นลิงก์) ค่าที่ไม่ใช่ลิงก์คือชื่อไฟล์แนบ
    evidence: z.string().trim().min(1).max(400).refine(safeEvidence, 'ลิงก์หลักฐานต้องขึ้นต้นด้วย https://'),
    wantsMentor: z.boolean().default(false),
  })).min(1, 'เพิ่มประสบการณ์แข่งขันอย่างน้อยหนึ่งรายการ').max(30),
  /** id ของไฟล์หลักฐานที่อัปโหลดไว้ก่อนหน้า */
  fileIds: z.array(z.string().max(60)).max(4).default([]),
}).refine((v) => [v.contactEmail, v.contactLine, v.contactPhone, v.contactInstagram, v.contactLink].some(Boolean),
  { message: 'ใส่ช่องทางติดต่ออย่างน้อยหนึ่งช่อง', path: ['contactEmail'] });

publicApi.post('/submissions/mentor', requireUser, async (c) => {
  const parsed = mentorSubmissionBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: firstIssue(parsed.error) });
  const body = parsed.data;
  const user = c.get('user')!;
  const id = newId('ms');
  /* เวทีที่อ้างต้องมีในระบบจริง ถึงจะติ๊กเป็นเมนเทอร์ได้ และตั้งราคาได้เฉพาะเวทีที่ติ๊กไว้ในประสบการณ์
     (เป็นเมนเทอร์ได้เฉพาะเวทีที่เคยแข่งเอง) ราคาของเวทีอื่นที่ส่งมาถูกทิ้ง */
  const claimed = [...new Set(body.awards.map((award) => award.competitionSlug).filter((slug): slug is string => Boolean(slug)))];
  const known = claimed.length
    ? await db.select({ id: competitionsTable.id, slug: competitionsTable.slug }).from(competitionsTable).where(inArray(competitionsTable.slug, claimed))
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

  await db.transaction(async (tx) => {
    await tx.insert(mentorSubmissions).values({
      id,
      userId: user.id,
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
      price: null,
      minutes: null,
      contactEmail: body.contactEmail,
      contactLine: body.contactLine,
      contactPhone: body.contactPhone,
      contactInstagram: body.contactInstagram,
      contactLink: body.contactLink,
      competitionIds: offers.map((offer) => offer.competitionId),
      competitionOffers: offers,
      paidSlot: body.paidSlot ? new Date(body.paidSlot) : null,
      freeSlot: body.freeSlot ? new Date(body.freeSlot) : null,
    });
    if (body.awards.length) {
      await tx.insert(mentorAwards).values(body.awards.map((award) => ({
        id: newId('aw'),
        submissionId: id,
        title: award.title,
        // เก็บ slug เฉพาะเวทีที่มีในระบบ ชื่อที่พิมพ์เองอยู่ใน title
        competitionSlug: award.competitionSlug && idOf.has(award.competitionSlug) ? award.competitionSlug : null,
        year: award.year,
        evidence: award.evidence,
        result: award.result,
        detail: award.detail,
        wantsMentor: Boolean(award.wantsMentor && award.competitionSlug && mentorFor.has(award.competitionSlug)),
      })));
    }
  });

  await attachFiles(body.fileIds, user.id, 'mentor_submission', id);
  await notifyStaff('mentor_application', user.id, `ใบสมัครเมนเทอร์ใหม่: ${body.firstName} ${body.lastName.slice(0, 1)}.`,
    `${body.firstName} ${body.lastName.slice(0, 1)}. (${body.nickname}) ส่งใบสมัครเมนเทอร์ รอตรวจ

${env.appOrigin}/admin/mentors/${id}`);
  await notify(body.email, 'ได้รับใบสมัครเมนเทอร์แล้ว',
    'ได้รับใบสมัครเข้าคิวตรวจแล้ว ทีมงานจะแจ้งผลทางอีเมลทุกกรณี');
  return c.json({ id }, 201);
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
