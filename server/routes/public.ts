import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import {
  categoryEnum, competitionSubmissions, competitions as competitionsTable, levelEnum, mentorAwards,
  mentorSubmissions, mentors, opportunityTypeEnum, regionEnum, rewardEnum, submissionCategories,
  submissionLevels, submissionRewards,
} from '../db/schema.js';
import { competitionOptions, findCompetitionBySlug, listCompetitions, relatedCompetitions } from '../db/queries.js';
import type { CompetitionRecord, ListQuery } from '../db/queries.js';
import type { AppEnv } from '../lib/guards.js';
import { requireUser } from '../lib/guards.js';
import { newId } from '../lib/id.js';
import { notify } from '../lib/email.js';

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
  return c.json({
    items: rows.map((row) => ({ ...row.mentors, wonName: row.competitions?.name ?? null })),
  });
});

/* ---------- รับใบที่ส่งเข้ามา ---------- */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ไม่ถูกต้อง');

const competitionSubmissionBody = z.object({
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

  await notify(body.contactEmail, 'ได้รับใบลงงานแข่งแล้ว',
    `ได้รับ "${body.name}" เข้าคิวตรวจแล้ว ทีมงานจะแจ้งผลภายใน 2 วันทำการ`);
  return c.json({ id }, 201);
});

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
  price: z.number().int().min(0).max(100000),
  paidSlot: z.string().datetime({ offset: true }).or(isoDate),
  freeSlot: z.string().datetime({ offset: true }).or(isoDate),
  awards: z.array(z.object({
    title: z.string().trim().min(1).max(200),
    competitionSlug: z.string().trim().max(120).nullable().default(null),
    year: z.string().trim().min(1).max(10),
    evidence: z.string().trim().min(1).max(400),
  })).max(2).default([]),
});

publicApi.post('/submissions/mentor', requireUser, async (c) => {
  const parsed = mentorSubmissionBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: firstIssue(parsed.error) });
  const body = parsed.data;
  const user = c.get('user')!;
  const id = newId('ms');

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
      price: body.price,
      paidSlot: new Date(body.paidSlot),
      freeSlot: new Date(body.freeSlot),
    });
    if (body.awards.length) {
      await tx.insert(mentorAwards).values(body.awards.map((award) => ({
        id: newId('aw'),
        submissionId: id,
        title: award.title,
        competitionSlug: award.competitionSlug,
        year: award.year,
        evidence: award.evidence,
      })));
    }
  });

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
