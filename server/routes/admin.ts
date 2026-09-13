import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import {
  categoryEnum, competitionCategories, competitionLevels, competitionRewards,
  competitionSubmissions, competitions, levelEnum, mentorAwards, mentorSubmissions, mentors,
  opportunityTypeEnum, regionEnum, reviewEvents, rewardEnum, submissionCategories,
  submissionLevels, submissionRewards,
} from '../db/schema.js';
import type { AppEnv } from '../lib/guards.js';
import { requireReviewer } from '../lib/guards.js';
import { newId, slugify } from '../lib/id.js';
import { notify } from '../lib/email.js';
import { filesOf, publicFile } from '../lib/files.js';
import { firstIssue } from './public.js';

export const admin = new Hono<AppEnv>();
admin.use('*', requireReviewer);

/** ต้องตรงกับรายการตรวจที่หน้าเว็บแสดง ฝั่งเซิร์ฟเวอร์เป็นฝ่ายบังคับตัวจริง */
export const competitionChecks = [
  'ลิงก์ประกาศต้นทางเปิดได้จริง และเป็นประกาศของงานนี้',
  'ชื่อหน่วยงานตรงกับที่ปรากฏในประกาศ',
  'วันปิดรับยังไม่ผ่าน และตรงกับต้นทาง',
  'เงินรางวัลและค่าสมัครตรงกับต้นทาง',
  'คำบรรยายไม่ใช่ข้อความคัดลอกมาทั้งก้อนจากเว็บอื่น',
  'ไม่ใช่การขายของหรือรับสมัครงานที่แฝงมาเป็นการแข่งขัน',
];

export const mentorChecks = [
  'ตัวตนและที่ทำงานตรวจสอบได้จากข้อมูลที่ให้มา',
  'หลักฐานรางวัลเป็นของผู้สมัครจริง และตรงกับเวทีที่อ้าง',
  'ขอบเขตช่วยได้และช่วยไม่ได้เขียนชัด และไม่ขัดกับกติกาของเวที',
  'ราคาและคิวสมเหตุสมผล ไม่มีการชวนไปคุยนอกระบบ',
];

const decisionBody = z.object({
  decision: z.enum(['publish', 'info', 'reject']),
  note: z.string().trim().max(2000).default(''),
  checks: z.array(z.string()).default([]),
});

/** กฎเดียวกับที่หน้าเว็บบังคับ แต่บังคับซ้ำที่นี่ เพราะหน้าเว็บถูกข้ามได้เสมอ */
function guardDecision(body: z.infer<typeof decisionBody>, required: string[]) {
  if (body.decision === 'publish') {
    const missing = required.filter((item) => !body.checks.includes(item));
    if (missing.length) {
      throw new HTTPException(422, { message: `ยังตรวจไม่ครบ เหลืออีก ${missing.length} ข้อ` });
    }
    return;
  }
  if (!body.note.trim()) {
    throw new HTTPException(422, { message: 'ต้องกรอกเหตุผล เพราะข้อความนี้คือสิ่งที่ผู้ส่งจะได้อ่าน' });
  }
}

const statusOf = { publish: 'published', info: 'info', reject: 'rejected' } as const;

/* ---------- ภาพรวม ---------- */

admin.get('/overview', async (c) => {
  const [waitingCompetitions, waitingMentors, closingSoon, stale, closed] = await Promise.all([
    db.select().from(competitionSubmissions)
      .where(eq(competitionSubmissions.status, 'pending')).orderBy(asc(competitionSubmissions.submittedAt)),
    db.select().from(mentorSubmissions)
      .where(eq(mentorSubmissions.status, 'pending')).orderBy(asc(mentorSubmissions.submittedAt)),
    db.select({ slug: competitions.slug, name: competitions.name, closesAt: competitions.closesAt })
      .from(competitions)
      .where(sql`${competitions.closesAt} >= current_date and ${competitions.closesAt} <= current_date + 7`)
      .orderBy(asc(competitions.closesAt)),
    db.select({ slug: competitions.slug, name: competitions.name, lastVerifiedAt: competitions.lastVerifiedAt })
      .from(competitions)
      .where(and(
        eq(competitions.source, 'editorial'),
        sql`${competitions.lastVerifiedAt} < current_date - 30`,
      ))
      .orderBy(asc(competitions.lastVerifiedAt)),
    db.select({ slug: competitions.slug, name: competitions.name, closesAt: competitions.closesAt })
      .from(competitions).where(sql`${competitions.closesAt} < current_date`)
      .orderBy(desc(competitions.closesAt)),
  ]);

  const submittedAt = [...waitingCompetitions, ...waitingMentors].map((row) => row.submittedAt.getTime());
  const oldestDays = submittedAt.length
    ? Math.floor((Date.now() - Math.min(...submittedAt)) / 86400000)
    : 0;

  return c.json({
    waiting: {
      competitions: waitingCompetitions.length,
      mentors: waitingMentors.length,
      total: waitingCompetitions.length + waitingMentors.length,
      oldestDays,
    },
    closingSoon, stale, closed,
  });
});

/* ---------- คิวงานแข่ง ---------- */

const statusFilter = z.enum(['pending', 'info', 'published', 'rejected']).optional();

admin.get('/competition-submissions', async (c) => {
  const status = statusFilter.safeParse(c.req.query('status') || undefined);
  if (!status.success) throw new HTTPException(400, { message: 'สถานะไม่ถูกต้อง' });
  const rows = await db.select().from(competitionSubmissions)
    .where(status.data ? eq(competitionSubmissions.status, status.data) : undefined)
    // รอนานสุดก่อน ไม่ใช่ใหม่สุดก่อน ไม่อย่างนั้นใบที่ตรวจยากจะถูกดองไปเรื่อย ๆ
    .orderBy(asc(competitionSubmissions.submittedAt));
  const ids = rows.map((row) => row.id);
  const cats = ids.length
    ? await db.select().from(submissionCategories)
      .where(inArray(submissionCategories.submissionId, ids)).orderBy(asc(submissionCategories.position))
    : [];
  return c.json({
    items: rows.map((row) => ({
      ...row,
      categories: cats.filter((item) => item.submissionId === row.id).map((item) => item.category),
    })),
  });
});

async function loadCompetitionSubmission(id: string) {
  const [row] = await db.select().from(competitionSubmissions).where(eq(competitionSubmissions.id, id)).limit(1);
  if (!row) throw new HTTPException(404, { message: 'ไม่พบใบนี้' });
  const [cats, levels, rewards, events] = await Promise.all([
    db.select().from(submissionCategories).where(eq(submissionCategories.submissionId, id))
      .orderBy(asc(submissionCategories.position)),
    db.select().from(submissionLevels).where(eq(submissionLevels.submissionId, id)),
    db.select().from(submissionRewards).where(eq(submissionRewards.submissionId, id)),
    db.select().from(reviewEvents)
      .where(and(eq(reviewEvents.target, 'competition'), eq(reviewEvents.targetId, id)))
      .orderBy(desc(reviewEvents.createdAt)),
  ]);
  return {
    ...row,
    categories: cats.map((item) => item.category),
    levels: levels.map((item) => item.level),
    rewards: rewards.map((item) => item.reward),
    files: (await filesOf('competition_submission', id)).map(publicFile),
    events,
  };
}

admin.get('/competition-submissions/:id', async (c) => {
  return c.json({ submission: await loadCompetitionSubmission(c.req.param('id')), checks: competitionChecks });
});

admin.post('/competition-submissions/:id/decision', async (c) => {
  const parsed = decisionBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: firstIssue(parsed.error) });
  const body = parsed.data;
  guardDecision(body, competitionChecks);

  const id = c.req.param('id');
  const submission = await loadCompetitionSubmission(id);
  const reviewer = c.get('user')!;
  let publishedSlug: string | null = null;

  await db.transaction(async (tx) => {
    if (body.decision === 'publish') {
      // ใบที่เผยแพร่ไปแล้วห้ามสร้างเวทีซ้ำ
      if (submission.publishedCompetitionId) {
        throw new HTTPException(409, { message: 'ใบนี้เผยแพร่ไปแล้ว' });
      }
      const competitionId = newId('cmp');
      const base = slugify(submission.name, competitionId);
      const taken = await tx.select({ slug: competitions.slug }).from(competitions)
        .where(sql`${competitions.slug} = ${base} or ${competitions.slug} like ${`${base}-%`}`);
      publishedSlug = taken.some((row) => row.slug === base) ? `${base}-${taken.length + 1}` : base;

      await tx.insert(competitions).values({
        id: competitionId,
        slug: publishedSlug,
        name: submission.name,
        description: submission.description,
        type: submission.type,
        org: submission.organizerName,
        closesAt: submission.closesAt,
        opensAt: submission.opensAt,
        eventDate: submission.eventDate,
        region: submission.region,
        venue: submission.venue,
        prizeValue: submission.prizeValue,
        prizeNote: submission.prizeNote,
        fee: submission.fee,
        teamMin: submission.teamMin,
        teamMax: submission.teamMax,
        keywords: [],
        sourceUrl: submission.sourceUrl,
        source: 'organiser',
        lastVerifiedAt: new Date().toISOString().slice(0, 10),
        registerUrl: submission.registerUrl,
      });
      await tx.insert(competitionCategories).values(
        submission.categories.map((category, position) => ({ competitionId, category, position })),
      );
      if (submission.levels.length) {
        await tx.insert(competitionLevels).values(submission.levels.map((level) => ({ competitionId, level })));
      }
      if (submission.rewards.length) {
        await tx.insert(competitionRewards).values(submission.rewards.map((reward) => ({ competitionId, reward })));
      }
      await tx.update(competitionSubmissions)
        .set({ status: 'published', publishedCompetitionId: competitionId })
        .where(eq(competitionSubmissions.id, id));
    } else {
      await tx.update(competitionSubmissions)
        .set({ status: statusOf[body.decision] })
        .where(eq(competitionSubmissions.id, id));
    }

    await tx.insert(reviewEvents).values({
      id: newId('rev'),
      target: 'competition',
      targetId: id,
      decision: body.decision,
      note: body.note,
      checks: body.checks,
      reviewedBy: reviewer.id,
    });
  });

  const subject = { publish: 'งานแข่งของคุณขึ้นเว็บแล้ว', info: 'ขอข้อมูลเพิ่มเติม', reject: 'ใบลงงานแข่งยังไม่ผ่าน' }[body.decision];
  await notify(submission.contactEmail, subject, body.note || 'ตรวจครบทุกข้อแล้ว');

  return c.json({ ok: true, status: statusOf[body.decision], slug: publishedSlug });
});

/* ---------- คิวเมนเทอร์ ---------- */

admin.get('/mentor-submissions', async (c) => {
  const status = statusFilter.safeParse(c.req.query('status') || undefined);
  if (!status.success) throw new HTTPException(400, { message: 'สถานะไม่ถูกต้อง' });
  const rows = await db.select().from(mentorSubmissions)
    .where(status.data ? eq(mentorSubmissions.status, status.data) : undefined)
    .orderBy(asc(mentorSubmissions.submittedAt));
  const ids = rows.map((row) => row.id);
  const awards = ids.length
    ? await db.select().from(mentorAwards).where(inArray(mentorAwards.submissionId, ids))
    : [];
  return c.json({
    items: rows.map((row) => ({
      ...row,
      awardCount: awards.filter((award) => award.submissionId === row.id).length,
    })),
  });
});

async function loadMentorSubmission(id: string) {
  const [row] = await db.select().from(mentorSubmissions).where(eq(mentorSubmissions.id, id)).limit(1);
  if (!row) throw new HTTPException(404, { message: 'ไม่พบใบนี้' });
  const [awards, events] = await Promise.all([
    db.select().from(mentorAwards).where(eq(mentorAwards.submissionId, id)),
    db.select().from(reviewEvents)
      .where(and(eq(reviewEvents.target, 'mentor'), eq(reviewEvents.targetId, id)))
      .orderBy(desc(reviewEvents.createdAt)),
  ]);
  // บอกคนตรวจว่าเวทีที่อ้างมีอยู่จริงในระบบไหม จุดที่ไม่มีคือจุดที่ต้องตรวจด้วยมือ
  const slugs = awards.map((award) => award.competitionSlug).filter((slug): slug is string => Boolean(slug));
  const known = slugs.length
    ? await db.select({ slug: competitions.slug, name: competitions.name })
      .from(competitions).where(inArray(competitions.slug, slugs))
    : [];
  return {
    ...row,
    awards: awards.map((award) => ({
      ...award,
      matched: known.find((item) => item.slug === award.competitionSlug) ?? null,
    })),
    files: (await filesOf('mentor_submission', id)).map(publicFile),
    events,
  };
}

admin.get('/mentor-submissions/:id', async (c) => {
  return c.json({ submission: await loadMentorSubmission(c.req.param('id')), checks: mentorChecks });
});

admin.post('/mentor-submissions/:id/decision', async (c) => {
  const parsed = decisionBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: firstIssue(parsed.error) });
  const body = parsed.data;
  guardDecision(body, mentorChecks);

  const id = c.req.param('id');
  const submission = await loadMentorSubmission(id);
  const reviewer = c.get('user')!;
  let mentorId: string | null = null;

  await db.transaction(async (tx) => {
    if (body.decision === 'publish') {
      if (submission.publishedMentorId) throw new HTTPException(409, { message: 'ใบนี้เผยแพร่ไปแล้ว' });
      // ป้าย "ยืนยันแล้ว" ผูกกับเวทีที่ชนะ ซึ่งออกให้ได้ต่อเมื่อหลักฐานตรงกับเวทีในระบบ
      const verifiedAward = submission.awards.find((award) => award.matched);
      const [primary] = verifiedAward
        ? await tx.select().from(competitionCategories)
          .innerJoin(competitions, eq(competitions.id, competitionCategories.competitionId))
          .where(and(eq(competitions.slug, verifiedAward.matched!.slug), eq(competitionCategories.position, 0)))
          .limit(1)
        : [];

      mentorId = newId('mtr');
      await tx.insert(mentors).values({
        id: mentorId,
        // หน้าเว็บแสดงชื่อกับนามสกุลย่อ ตามที่ฟอร์มสมัครสัญญากับผู้สมัครไว้
        name: `${submission.firstName} ${submission.lastName.slice(0, 1)}.`,
        avatar: submission.nickname.slice(0, 1),
        bio: submission.experience,
        replyTime: 'ตอบกลับภายใน 1 วัน',
        wonSlug: verifiedAward?.matched?.slug ?? null,
        category: primary?.competition_categories.category ?? null,
        topics: [],
        price: submission.price,
        best: submission.best,
        cannot: submission.cannot,
        verified: Boolean(verifiedAward),
      });
      await tx.update(mentorSubmissions)
        .set({ status: 'published', publishedMentorId: mentorId })
        .where(eq(mentorSubmissions.id, id));
    } else {
      await tx.update(mentorSubmissions)
        .set({ status: statusOf[body.decision] })
        .where(eq(mentorSubmissions.id, id));
    }

    await tx.insert(reviewEvents).values({
      id: newId('rev'),
      target: 'mentor',
      targetId: id,
      decision: body.decision,
      note: body.note,
      checks: body.checks,
      reviewedBy: reviewer.id,
    });
  });

  const subject = { publish: 'ใบสมัครเมนเทอร์ผ่านแล้ว', info: 'ขอข้อมูลเพิ่มเติม', reject: 'ใบสมัครเมนเทอร์ยังไม่ผ่าน' }[body.decision];
  await notify(submission.email, subject, body.note || 'ตรวจครบทุกข้อแล้ว');

  return c.json({ ok: true, status: statusOf[body.decision], mentorId });
});

/* ---------- เวทีที่ทีมงานกรอกเอง ---------- */

/* ช่วงเริ่มต้นยังไม่มีผู้จัดมาลงงานเอง ทีมงานจึงต้องคัดจากประกาศจริงมากรอก
   ตาม organiser-submission.md ข้อ 3 ชั้นที่ 1 เวทีที่สร้างทางนี้เป็น source
   editorial เสมอ และบังคับให้มีลิงก์ประกาศต้นทาง เพราะผู้ใช้ต้องตรวจสอบเองได้

   ห้าส่วนเนื้อหายาวกรอกได้จากที่นี่ที่เดียว ผู้จัดที่ส่งใบเข้ามาไม่ได้กรอกให้ */

const isoDay = /^\d{4}-\d{2}-\d{2}$/;

const listingBody = z.object({
  name: z.string().trim().min(1, 'กรอกชื่อเวที').max(200),
  description: z.string().trim().min(1, 'กรอกคำบรรยายสั้น').max(400),
  type: z.enum(opportunityTypeEnum.enumValues),
  org: z.string().trim().min(1, 'กรอกชื่อผู้จัด').max(200),
  categories: z.array(z.enum(categoryEnum.enumValues)).min(1, 'เลือกหมวดอย่างน้อยหนึ่งหมวด').max(3),
  levels: z.array(z.enum(levelEnum.enumValues)).min(1, 'เลือกระดับอย่างน้อยหนึ่งระดับ'),
  rewards: z.array(z.enum(rewardEnum.enumValues)).max(5).default([]),
  teamMin: z.number().int().min(1).max(100),
  teamMax: z.number().int().min(1).max(100),
  opensAt: z.string().regex(isoDay).nullish(),
  closesAt: z.string().regex(isoDay, 'กรอกวันปิดรับ'),
  eventDate: z.string().regex(isoDay).nullish(),
  region: z.enum(regionEnum.enumValues),
  venue: z.string().trim().max(200).nullish(),
  prizeValue: z.number().int().min(0).max(100000000),
  prizeNote: z.string().trim().max(200).nullish(),
  fee: z.number().int().min(0).max(1000000).nullish(),
  featured: z.boolean().default(false),
  keywords: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  sourceUrl: z.string().trim().url('ต้องมีลิงก์ประกาศต้นทางที่เปิดได้').max(500),
  registerUrl: z.string().trim().url().max(500).nullish(),
  overview: z.string().trim().max(2000).nullish(),
  audience: z.string().trim().max(2000).nullish(),
  format: z.array(z.string().trim().min(1).max(300)).max(8).default([]),
  deliverables: z.array(z.string().trim().min(1).max(300)).max(8).default([]),
  preparation: z.array(z.string().trim().min(1).max(300)).max(8).default([]),
}).refine((value) => value.teamMax >= value.teamMin, {
  message: 'ขนาดทีมสูงสุดต้องไม่น้อยกว่าขนาดต่ำสุด', path: ['teamMax'],
}).refine((value) => value.prizeValue > 0 || Boolean(value.prizeNote?.trim()), {
  message: 'ไม่มีเงินรางวัลก็ได้ แต่ต้องบอกว่าผู้ชนะได้อะไรแทน', path: ['prizeNote'],
});

type ListingBody = z.infer<typeof listingBody>;

const emptyToNull = (value: string | null | undefined) => (value?.trim() ? value.trim() : null);
const todayIso = () => new Date().toISOString().slice(0, 10);

/** slug ต้องไม่ซ้ำกับที่มีอยู่ ต่อเลขท้ายเมื่อชนกัน */
async function freeSlug(name: string, fallback: string, ignoreId?: string) {
  const base = slugify(name, fallback);
  const taken = await db.select({ id: competitions.id, slug: competitions.slug }).from(competitions)
    .where(sql`${competitions.slug} = ${base} or ${competitions.slug} like ${`${base}-%`}`);
  const others = taken.filter((row) => row.id !== ignoreId);
  if (!others.some((row) => row.slug === base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!others.some((row) => row.slug === candidate)) return candidate;
  }
}

function listingValues(body: ListingBody) {
  return {
    name: body.name,
    description: body.description,
    type: body.type,
    org: body.org,
    closesAt: body.closesAt,
    opensAt: emptyToNull(body.opensAt),
    eventDate: emptyToNull(body.eventDate),
    region: body.region,
    venue: emptyToNull(body.venue),
    prizeValue: body.prizeValue,
    prizeNote: emptyToNull(body.prizeNote),
    fee: body.fee ?? null,
    teamMin: body.teamMin,
    teamMax: body.teamMax,
    featured: body.featured,
    keywords: body.keywords,
    sourceUrl: body.sourceUrl,
    registerUrl: emptyToNull(body.registerUrl),
    overview: emptyToNull(body.overview),
    audience: emptyToNull(body.audience),
    format: body.format,
    deliverables: body.deliverables,
    preparation: body.preparation,
  };
}

admin.get('/listings', async (c) => {
  const rows = await db.select().from(competitions).orderBy(asc(competitions.closesAt));
  const ids = rows.map((row) => row.id);
  const cats = ids.length
    ? await db.select().from(competitionCategories)
      .where(inArray(competitionCategories.competitionId, ids))
      .orderBy(asc(competitionCategories.position))
    : [];
  return c.json({
    items: rows.map((row) => ({
      ...row,
      categories: cats.filter((item) => item.competitionId === row.id).map((item) => item.category),
    })),
  });
});

admin.get('/listings/:id', async (c) => {
  const id = c.req.param('id');
  const [row] = await db.select().from(competitions).where(eq(competitions.id, id)).limit(1);
  if (!row) throw new HTTPException(404, { message: 'ไม่พบเวทีนี้' });
  const [cats, levels, rewards] = await Promise.all([
    db.select().from(competitionCategories).where(eq(competitionCategories.competitionId, id))
      .orderBy(asc(competitionCategories.position)),
    db.select().from(competitionLevels).where(eq(competitionLevels.competitionId, id)),
    db.select().from(competitionRewards).where(eq(competitionRewards.competitionId, id)),
  ]);
  return c.json({
    listing: {
      ...row,
      categories: cats.map((item) => item.category),
      levels: levels.map((item) => item.level),
      rewards: rewards.map((item) => item.reward),
    },
  });
});

admin.post('/listings', async (c) => {
  const parsed = listingBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: firstIssue(parsed.error) });
  const body = parsed.data;
  const id = newId('cmp');
  const slug = await freeSlug(body.name, id);

  await db.transaction(async (tx) => {
    await tx.insert(competitions).values({
      id, slug, source: 'editorial', lastVerifiedAt: todayIso(), ...listingValues(body),
    });
    await tx.insert(competitionCategories).values(
      body.categories.map((category, position) => ({ competitionId: id, category, position })),
    );
    await tx.insert(competitionLevels).values(body.levels.map((level) => ({ competitionId: id, level })));
    if (body.rewards.length) {
      await tx.insert(competitionRewards).values(body.rewards.map((reward) => ({ competitionId: id, reward })));
    }
  });
  return c.json({ id, slug }, 201);
});

admin.patch('/listings/:id', async (c) => {
  const parsed = listingBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: firstIssue(parsed.error) });
  const body = parsed.data;
  const id = c.req.param('id');
  const [existing] = await db.select().from(competitions).where(eq(competitions.id, id)).limit(1);
  if (!existing) throw new HTTPException(404, { message: 'ไม่พบเวทีนี้' });

  // ชื่อเปลี่ยนแล้วให้ slug ตามไปด้วย ลิงก์เดิมจะเสียแต่ข้อมูลที่ผิดอยู่แย่กว่า
  const slug = existing.name === body.name ? existing.slug : await freeSlug(body.name, id, id);

  await db.transaction(async (tx) => {
    await tx.update(competitions).set({
      slug,
      // แก้ข้อมูลแล้วถือว่าตรวจใหม่ในวันนี้ การ์ดเตือนข้อมูลค้างจะได้ตรงความจริง
      lastVerifiedAt: todayIso(),
      updatedAt: new Date(),
      ...listingValues(body),
    }).where(eq(competitions.id, id));
    await tx.delete(competitionCategories).where(eq(competitionCategories.competitionId, id));
    await tx.delete(competitionLevels).where(eq(competitionLevels.competitionId, id));
    await tx.delete(competitionRewards).where(eq(competitionRewards.competitionId, id));
    await tx.insert(competitionCategories).values(
      body.categories.map((category, position) => ({ competitionId: id, category, position })),
    );
    await tx.insert(competitionLevels).values(body.levels.map((level) => ({ competitionId: id, level })));
    if (body.rewards.length) {
      await tx.insert(competitionRewards).values(body.rewards.map((reward) => ({ competitionId: id, reward })));
    }
  });
  return c.json({ id, slug });
});

/** ยืนยันว่าตรวจแล้วโดยไม่ต้องแก้อะไร ใช้กับการ์ดเตือนข้อมูลค้างบนหน้าภาพรวม */
admin.post('/listings/:id/verify', async (c) => {
  const id = c.req.param('id');
  const [row] = await db.update(competitions)
    .set({ lastVerifiedAt: todayIso(), updatedAt: new Date() })
    .where(eq(competitions.id, id)).returning();
  if (!row) throw new HTTPException(404, { message: 'ไม่พบเวทีนี้' });
  return c.json({ lastVerifiedAt: row.lastVerifiedAt });
});
