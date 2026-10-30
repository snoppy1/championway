import { Hono } from 'hono';
import { and, count, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import {
  competitions, consultations, hackathonNames, learnerProfiles, matchRequests, matchResults, mentorExperiences, mentorReviews,
  mentorSkills, mentors, mentorSubmissions, projects, users,
} from '../db/schema.js';
import { env } from '../lib/env.js';
import { newId } from '../lib/id.js';
import { notify } from '../lib/email.js';
import { requireUser, type AppEnv } from '../lib/guards.js';
import { MATCHING_VERSION, rank } from '../lib/matching.js';
import type { MatchMentor, MatchRequest, Reason } from '../lib/matching.js';
import {
  competitionKinds, countries, helpAreas, interestFields, languages, learnerLevels, missingSections, normalizeName, projectStages, projectStarts,
  requestFormats, requestGenders, requestLanguages, requestStyles, skillTags, urgencies,
} from '../../src/data/matching.js';
import type { MentorProfileV2, SkillTag } from '../../src/data/matching.js';

/* หา Mentor ให้ฉัน (spec 2026-10-13 ข้อ 4.2, 5, 6) โปรไฟล์ผู้เรียน → โปรเจกต์ → คำขอจับคู่ → ผล → เริ่มปรึกษา
   ผลคำนวณครั้งเดียวตอนส่งและเก็บไว้ (match_results) เปิดดูซ้ำได้ผลเดิม แก้โปรไฟล์เมนเทอร์ทีหลังไม่เปลี่ยนผลที่เก็บไว้
   เริ่มปรึกษาใช้สถานะ contacted ของการติดต่อนอกเว็บเดิม (routes/consult.ts) ปิดงานและรีวิวที่หน้า Consulting เหมือนเดิม */

export const matching = new Hono<AppEnv>();

const PROJECT_LIMIT = 20;
const REQUEST_LIMIT_PER_DAY = 10;

const messages = {
  invalid: ['ข้อมูลไม่ถูกต้อง', 'Some details are not valid.'],
  origin: ['คำขอต้องมาจากเว็บนี้', 'Requests must come from this site.'],
  needProfile: ['กรอกข้อมูลเกี่ยวกับคุณก่อน', 'Tell us about you first.'],
  projectLimit: ['คุณมีโปรเจกต์ครบ 20 แล้ว ลบโปรเจกต์เก่าก่อนเพื่อเริ่มใหม่', 'You’ve reached 20 projects. Delete one to start another.'],
  requestLimit: ['วันนี้คุณส่งคำขอครบ 10 ครั้งแล้ว ลองใหม่พรุ่งนี้', 'You’ve sent 10 requests today. Try again tomorrow.'],
  notFound: ['ไม่พบรายการนี้', 'This was not found.'],
  competitionKind: ['เลือกประเภทงานแข่ง', 'Choose the kind of competition.'],
  competition: ['ใส่ชื่องานแข่ง', 'Enter the competition name.'],
  verifyEmail: ['ยืนยันอีเมลก่อนจึงจะเริ่มปรึกษาได้', 'Verify your email before you start a consultation.'],
  notInResults: ['เมนเทอร์คนนี้ไม่อยู่ในผลจับคู่นี้', 'This mentor is not in these matches.'],
  unavailable: ['เมนเทอร์คนนี้ไม่รับคำขอใหม่แล้ว', 'This mentor is not taking new requests.'],
  openConsult: ['โปรเจกต์นี้มีการปรึกษาที่ยังไม่จบ ปิดการปรึกษานั้นก่อนจึงจะเริ่มกับคนใหม่ได้', 'This project already has an open consultation. Finish it before you start with someone new.'],
  self: ['ปรึกษาตัวเองไม่ได้', 'You can’t consult yourself.'],
} as const;
type Code = keyof typeof messages;
type Status = 400 | 403 | 404 | 409 | 429;
class Fail extends Error { constructor(public code: Code, public status: Status) { super(code); } }
const fail = (code: Code, status: Status = 400): never => { throw new Fail(code, status); };
const say = (code: Code, lang: string | undefined) => messages[code][lang === 'th' ? 0 : 1];

// ต่อไว้ใต้ /api ตรง ๆ มิดเดิลแวร์จึงต้องระบุเส้นทางของตัวเอง ไม่ใช่ '*' ซึ่งจะครอบทุกเส้นทางของเว็บ
const guard = async (c: Parameters<Parameters<typeof matching.use>[1]>[0], next: () => Promise<void>) => {
  c.header('Cache-Control', 'private, no-store');
  const origin = c.req.header('origin');
  if (c.req.method !== 'GET' && origin && origin !== env.appOrigin) return c.json({ error: say('origin', c.req.header('x-lang')), code: 'origin' }, 403);
  await next();
};
for (const path of ['/learner/*', '/projects', '/projects/*', '/matches/*']) matching.use(path, guard);
matching.onError((error, c) => {
  if (error instanceof Fail) return c.json({ error: say(error.code, c.req.header('x-lang')), code: error.code }, error.status);
  throw error;
});

async function parse<T>(c: { req: { json: () => Promise<unknown> } }, schema: z.ZodType<T>) {
  const result = schema.safeParse(await c.req.json().catch(() => null));
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? '';
    return fail(Object.hasOwn(messages, message) ? message as Code : 'invalid');
  }
  return result.data;
}
const noRepeats = (v: readonly unknown[]) => new Set(v).size === v.length;

/* ---------- โปรไฟล์ผู้เรียน (หน้า 1–2) ---------- */

const profileBody = z.object({
  level: z.enum(learnerLevels),
  interestsFields: z.array(z.enum(interestFields)).min(1).refine(noRepeats),
  skills: z.array(z.enum(skillTags as [SkillTag, ...SkillTag[]])).max(skillTags.length).refine(noRepeats),
  languages: z.array(z.enum(languages)).min(1).refine(noRepeats),
  country: z.enum(countries),
  interests: z.string().trim().max(500),
});

async function profileOf(userId: string) {
  const [row] = await db.select().from(learnerProfiles).where(eq(learnerProfiles.userId, userId));
  return row ? {
    level: row.level, interestsFields: row.interestsFields, skills: row.skills, languages: row.languages, country: row.country, interests: row.interests,
  } : null;
}

matching.get('/learner/profile', requireUser, async (c) => {
  const user = c.get('user')!;
  return c.json({ profile: await profileOf(user.id), user: { name: user.name } });
});

matching.put('/learner/profile', requireUser, async (c) => {
  const user = c.get('user')!;
  const body = await parse(c, profileBody);
  await db.insert(learnerProfiles).values({ userId: user.id, ...body, updatedAt: new Date() })
    .onConflictDoUpdate({ target: learnerProfiles.userId, set: { ...body, updatedAt: new Date() } });
  return c.json({ profile: body });
});

/* ---------- โปรเจกต์ (หน้า 0, 3–5) ---------- */

const projectBody = z.object({
  name: z.string().trim().min(1).max(80),
  start: z.enum(projectStarts),
  competitionKind: z.enum(competitionKinds).nullable(),
  /** งานที่มีหน้าในระบบ (จากรายการเติมคำ) */
  competitionSlug: z.string().trim().max(200).nullable(),
  /** ชื่อที่พิมพ์เอง หรือชื่อที่เลือกจากรายการชื่อที่เมนเทอร์เคยพิมพ์ */
  competitionName: z.string().trim().max(200),
  stage: z.enum(projectStages),
}).superRefine((v, ctx) => {
  if (v.start !== 'has_competition') return;
  if (!v.competitionKind) ctx.addIssue({ code: 'custom', message: 'competitionKind' });
  if (!v.competitionSlug && !v.competitionName) ctx.addIssue({ code: 'custom', message: 'competition' });
});

async function projectColumns(body: z.infer<typeof projectBody>) {
  if (body.start !== 'has_competition') return { name: body.name, start: body.start, competitionKind: null, competitionId: null, competitionName: '', stage: body.stage };
  let competitionId: string | null = null;
  let competitionName = body.competitionName;
  if (body.competitionSlug) {
    const [event] = await db.select({ id: competitions.id, name: competitions.name }).from(competitions).where(eq(competitions.slug, body.competitionSlug)).limit(1);
    if (event) { competitionId = event.id; competitionName = event.name; }
  }
  if (!competitionId && !competitionName) fail('competition');
  return { name: body.name, start: body.start, competitionKind: body.competitionKind, competitionId, competitionName, stage: body.stage };
}

async function ownProject(userId: string, id: string) {
  const [row] = await db.select().from(projects).where(and(eq(projects.id, id), eq(projects.userId, userId)));
  return row ?? fail('notFound', 404);
}

const startOfDay = () => new Date(Date.now() - 86400000);
async function requestsToday(userId: string) {
  const [row] = await db.select({ n: count() }).from(matchRequests).where(and(eq(matchRequests.userId, userId), gte(matchRequests.createdAt, startOfDay())));
  return row?.n ?? 0;
}

/** การปรึกษาที่เริ่มจากผลจับคู่ของโปรเจกต์และยังไม่ได้กดว่าได้รับคำแนะนำ (spec 6.1) */
async function openConsultations(projectIds: string[]) {
  if (!projectIds.length) return new Map<string, { id: string; mentorId: string; mentorName: string }>();
  const rows = await db.select({ id: consultations.id, mentorId: consultations.mentorId, mentorName: mentors.name, projectId: matchRequests.projectId })
    .from(consultations)
    .innerJoin(matchRequests, eq(matchRequests.id, consultations.matchRequestId))
    .innerJoin(mentors, eq(mentors.id, consultations.mentorId))
    .where(and(inArray(matchRequests.projectId, projectIds), eq(consultations.status, 'contacted')));
  return new Map(rows.map(({ projectId, ...row }) => [projectId, row]));
}

/** เมนเทอร์ที่แสดงบนการ์ดโปรเจกต์ (หน้า /projects): กำลังปรึกษาอยู่ก่อน ไม่มีก็คนล่าสุดที่ปรึกษาจบแล้ว พร้อมดาวที่รีวิวไว้ */
async function cardMentors(projectIds: string[]) {
  const out = new Map<string, { state: 'consulting' | 'done'; id: string; name: string; avatar: string; photoUrl: string | null; stars: number | null }>();
  if (!projectIds.length) return out;
  const rows = await db.select({
    projectId: matchRequests.projectId, status: consultations.status, createdAt: consultations.createdAt,
    id: mentors.id, name: mentors.name, avatar: mentors.avatar, photoUrl: mentors.photoUrl, stars: mentorReviews.stars,
  }).from(consultations)
    .innerJoin(matchRequests, eq(matchRequests.id, consultations.matchRequestId))
    .innerJoin(mentors, eq(mentors.id, consultations.mentorId))
    .leftJoin(mentorReviews, eq(mentorReviews.consultationId, consultations.id))
    .where(and(inArray(matchRequests.projectId, projectIds), inArray(consultations.status, ['contacted', 'claimed', 'completed'])))
    .orderBy(desc(consultations.createdAt));
  for (const state of ['consulting', 'done'] as const) {
    for (const row of rows) {
      if (out.has(row.projectId) || (state === 'done') !== (row.status === 'completed')) continue;
      out.set(row.projectId, { state, id: row.id, name: row.name, avatar: row.avatar, photoUrl: row.photoUrl, stars: row.stars ?? null });
    }
  }
  return out;
}

matching.get('/projects', requireUser, async (c) => {
  const user = c.get('user')!;
  const rows = await db.select().from(projects).where(eq(projects.userId, user.id)).orderBy(desc(projects.updatedAt));
  const ids = rows.map((row) => row.id);
  const [open, latest, today, profile, cards] = await Promise.all([
    openConsultations(ids),
    ids.length ? db.selectDistinctOn([matchRequests.projectId], { projectId: matchRequests.projectId, id: matchRequests.id, createdAt: matchRequests.createdAt })
      .from(matchRequests).where(inArray(matchRequests.projectId, ids)).orderBy(matchRequests.projectId, desc(matchRequests.createdAt)) : [],
    requestsToday(user.id),
    profileOf(user.id),
    cardMentors(ids),
  ]);
  const latestOf = new Map(latest.map((row) => [row.projectId, row]));
  return c.json({
    items: rows.map((row) => ({
      id: row.id, name: row.name, start: row.start, competitionKind: row.competitionKind, competitionName: row.competitionName || null,
      stage: row.stage, updatedAt: row.updatedAt, open: open.get(row.id) ?? null, lastRequestId: latestOf.get(row.id)?.id ?? null, mentor: cards.get(row.id) ?? null,
    })),
    projectLimitReached: rows.length >= PROJECT_LIMIT,
    requestLimitReached: today >= REQUEST_LIMIT_PER_DAY,
    hasProfile: Boolean(profile),
  });
});

/** รายละเอียดโปรเจกต์หนึ่งอัน กับเมนเทอร์ทุกคนที่เคยติดต่อจากผลจับคู่ของโปรเจกต์นี้ (หน้า /projects/:id) */
matching.get('/projects/:id', requireUser, async (c) => {
  const user = c.get('user')!;
  const project = await ownProject(user.id, c.req.param('id'));
  const [requests, consulted] = await Promise.all([
    db.select({ id: matchRequests.id, answers: matchRequests.answers, createdAt: matchRequests.createdAt }).from(matchRequests)
      .where(eq(matchRequests.projectId, project.id)).orderBy(desc(matchRequests.createdAt)),
    db.select({
      id: consultations.id, status: consultations.status, createdAt: consultations.createdAt,
      mentorId: mentors.id, mentorName: mentors.name, avatar: mentors.avatar, photoUrl: mentors.photoUrl, headline: mentors.headline,
    }).from(consultations)
      .innerJoin(matchRequests, eq(matchRequests.id, consultations.matchRequestId))
      .innerJoin(mentors, eq(mentors.id, consultations.mentorId))
      .where(eq(matchRequests.projectId, project.id))
      .orderBy(desc(consultations.createdAt)),
  ]);
  return c.json({
    project: {
      id: project.id, name: project.name, start: project.start, competitionKind: project.competitionKind,
      competitionName: project.competitionName || null, stage: project.stage, createdAt: project.createdAt, updatedAt: project.updatedAt,
    },
    lastRequest: requests[0] ? { id: requests[0].id, answers: requests[0].answers, createdAt: requests[0].createdAt } : null,
    requestCount: requests.length,
    mentors: consulted.map((row) => ({
      consultationId: row.id, status: row.status, since: row.createdAt,
      mentor: { id: row.mentorId, name: row.mentorName, avatar: row.avatar, photoUrl: row.photoUrl, headline: row.headline },
    })),
  });
});

matching.post('/projects', requireUser, async (c) => {
  const user = c.get('user')!;
  const body = await parse(c, projectBody);
  const columns = await projectColumns(body);
  // ล็อกแถวผู้ใช้ก่อนนับ ส่งพร้อมกันหลายแท็บจึงไม่เกิน 20
  const created = await db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, user.id)).for('update');
    const [{ n }] = await tx.select({ n: count() }).from(projects).where(eq(projects.userId, user.id));
    if (n >= PROJECT_LIMIT) return null;
    const [row] = await tx.insert(projects).values({ id: newId('prj'), userId: user.id, ...columns }).returning({ id: projects.id });
    return row;
  });
  if (!created) return fail('projectLimit', 409);
  return c.json({ project: { id: created.id } }, 201);
});

matching.put('/projects/:id', requireUser, async (c) => {
  const user = c.get('user')!;
  const project = await ownProject(user.id, c.req.param('id'));
  const columns = await projectColumns(await parse(c, projectBody));
  await db.update(projects).set({ ...columns, updatedAt: new Date() }).where(eq(projects.id, project.id));
  return c.json({ project: { id: project.id } });
});

matching.delete('/projects/:id', requireUser, async (c) => {
  const user = c.get('user')!;
  const project = await ownProject(user.id, c.req.param('id'));
  await db.delete(projects).where(eq(projects.id, project.id));
  return c.json({ ok: true });
});

/* ---------- ส่งคำขอและคำนวณผล (หน้า 6–9) ---------- */

const answersBody = z.object({
  helpAreas: z.array(z.enum(helpAreas)).min(1).refine(noRepeats),
  skillLevel: z.enum(learnerLevels),
  style: z.enum(requestStyles),
  format: z.enum(requestFormats),
  urgency: z.enum(urgencies),
  language: z.enum(requestLanguages),
  gender: z.enum(requestGenders),
  note: z.string().trim().max(1000),
  noteTags: z.array(z.enum(helpAreas)).refine(noRepeats),
});

/** เมนเทอร์ทุกคนที่ผ่านอนุมัติและผูกกับบัญชีแล้ว ในรูปที่สูตรอ่านได้ */
async function matchMentors(): Promise<MatchMentor[]> {
  const rows = await db.select({ mentor: mentors }).from(mentors)
    .innerJoin(mentorSubmissions, and(eq(mentorSubmissions.publishedMentorId, mentors.id), eq(mentorSubmissions.status, 'published')))
    .where(sql`${mentorSubmissions.userId} is not null`);
  const ids = rows.map((row) => row.mentor.id);
  if (!ids.length) return [];
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const [skills, experiences, reviews, done, open] = await Promise.all([
    db.select().from(mentorSkills).where(inArray(mentorSkills.mentorId, ids)),
    db.select({ row: mentorExperiences, typed: hackathonNames.normalized }).from(mentorExperiences)
      .leftJoin(hackathonNames, eq(hackathonNames.id, mentorExperiences.hackathonNameId))
      .where(and(inArray(mentorExperiences.mentorId, ids), sql`${mentorExperiences.status} <> 'rejected'`)),
    db.select({ mentorId: mentorReviews.mentorId, n: count(), average: sql<number>`avg(${mentorReviews.stars})::float` }).from(mentorReviews)
      .where(and(inArray(mentorReviews.mentorId, ids), isNull(mentorReviews.hiddenAt))).groupBy(mentorReviews.mentorId),
    db.select({ mentorId: consultations.mentorId, n: count() }).from(consultations)
      .where(and(inArray(consultations.mentorId, ids), eq(consultations.status, 'completed'))).groupBy(consultations.mentorId),
    db.select({ mentorId: consultations.mentorId, n: count() }).from(consultations)
      .where(and(inArray(consultations.mentorId, ids), inArray(consultations.status, ['contacted', 'claimed']), gte(consultations.createdAt, weekAgo)))
      .groupBy(consultations.mentorId),
  ]);
  const group = <T extends { mentorId: string }>(list: T[]) => {
    const map = new Map<string, T[]>();
    for (const item of list) map.set(item.mentorId, [...(map.get(item.mentorId) ?? []), item]);
    return map;
  };
  const skillsOf = group(skills);
  const expOf = group(experiences.map((e) => ({ ...e, mentorId: e.row.mentorId })));
  const reviewsOf = new Map(reviews.map((r) => [r.mentorId, r]));
  const doneOf = new Map(done.map((r) => [r.mentorId, r.n]));
  const openOf = new Map(open.map((r) => [r.mentorId, r.n]));
  return rows.map(({ mentor: m }) => {
    const mine = expOf.get(m.id) ?? [];
    const profile = {
      headline: m.headline, country: m.country, timeZone: m.timeZone, languages: m.languages, background: m.background, gender: m.gender ?? null,
      skills: (skillsOf.get(m.id) ?? []).map((s) => ({ tag: s.tag, level: s.level })), helpsWith: m.helpsWith, learnerLevels: m.learnerLevels,
      teachingStyles: m.teachingStyles, formats: m.formats, deliverables: m.deliverables, availability: m.availability, sessionsPerWeek: m.sessionsPerWeek,
      sessionMinutes: m.sessionMinutes, acceptingRequests: m.acceptingRequests, replyHours: m.replyHours, acceptsUrgent: m.acceptsUrgent, mode: m.mode ?? null,
    } as MentorProfileV2;
    const review = reviewsOf.get(m.id);
    return {
      id: m.id,
      complete: missingSections(profile, mine.length).length === 0,
      // ผ่านการอนุมัติแล้ว (คอลัมน์ mentors.verified คือป้ายเคยชนะเวทีในระบบ ไม่ใช่การอนุมัติ จึงไม่ใช้กรอง)
      verified: true,
      acceptingRequests: m.acceptingRequests,
      languages: profile.languages, gender: profile.gender, sessionsPerWeek: m.sessionsPerWeek, openThisWeek: openOf.get(m.id) ?? 0,
      skills: profile.skills, helpsWith: profile.helpsWith, learnerLevels: profile.learnerLevels, teachingStyles: profile.teachingStyles, formats: profile.formats,
      replyHours: m.replyHours, acceptsUrgent: m.acceptsUrgent,
      // นับคะแนนเฉพาะที่ทีมงานตรวจแล้ว
      experiences: mine.filter((e) => e.row.status === 'verified').map(({ row, typed }) => ({
        competitionId: row.competitionId, hackathonNameId: row.hackathonNameId, normalizedName: typed ?? normalizeName(row.name),
        kind: row.kind, result: row.result, role: row.role, year: row.year,
      })),
      reviews: review?.n ?? 0, average: review?.average ?? null, completedSessions: doneOf.get(m.id) ?? 0,
    };
  });
}

matching.post('/projects/:id/match', requireUser, async (c) => {
  const user = c.get('user')!;
  const project = await ownProject(user.id, c.req.param('id'));
  const answers = await parse(c, answersBody);
  if (!(await profileOf(user.id))) return fail('needProfile', 409);
  if (await requestsToday(user.id) >= REQUEST_LIMIT_PER_DAY) return fail('requestLimit', 429);

  const typedName = project.competitionId ? '' : normalizeName(project.competitionName);
  const [named] = typedName ? await db.select({ id: hackathonNames.id }).from(hackathonNames).where(eq(hackathonNames.normalized, typedName)).limit(1) : [];
  const request: MatchRequest = {
    start: project.start, competitionKind: project.competitionKind, stage: project.stage,
    competitionId: project.competitionId, hackathonNameId: named?.id ?? null, competitionName: typedName,
    helpAreas: [...new Set([...answers.helpAreas, ...answers.noteTags])], skillLevel: answers.skillLevel, style: answers.style, format: answers.format,
    urgency: answers.urgency, language: answers.language, gender: answers.gender,
  };
  const results = rank(await matchMentors(), request);
  const id = newId('mrq');
  await db.transaction(async (tx) => {
    // สำเนาคำถาม 1–3 ไว้กับคำตอบ ผลจึงอ่านได้เหมือนเดิมแม้แก้โปรเจกต์ทีหลัง
    await tx.insert(matchRequests).values({
      id, projectId: project.id, userId: user.id,
      answers: { ...answers, start: project.start, competitionKind: project.competitionKind, competitionName: project.competitionName, stage: project.stage, projectName: project.name },
    });
    if (results.length) await tx.insert(matchResults).values(results.map((r, index) => ({
      requestId: id, mentorId: r.mentorId, rank: index + 1, score: r.score, parts: r.parts, reasons: r.reasons as unknown as Record<string, string | number>[], version: MATCHING_VERSION,
    })));
    await tx.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, project.id));
  });
  return c.json({ requestId: id }, 201);
});

/* ---------- ผลจับคู่และเริ่มปรึกษา ---------- */

async function ownRequest(userId: string, id: string) {
  const [row] = await db.select().from(matchRequests).where(and(eq(matchRequests.id, id), eq(matchRequests.userId, userId)));
  return row ?? fail('notFound', 404);
}

matching.get('/matches/:requestId', requireUser, async (c) => {
  const user = c.get('user')!;
  const request = await ownRequest(user.id, c.req.param('requestId'));
  const rows = await db.select({ result: matchResults, mentor: mentors }).from(matchResults)
    .innerJoin(mentors, eq(mentors.id, matchResults.mentorId))
    .where(eq(matchResults.requestId, request.id)).orderBy(matchResults.rank);
  const [open, reviewed] = await Promise.all([
    openConsultations([request.projectId]),
    rows.length ? db.select({ mentorId: mentorReviews.mentorId, n: count() }).from(mentorReviews)
      .where(and(inArray(mentorReviews.mentorId, rows.map((r) => r.mentor.id)), isNull(mentorReviews.hiddenAt))).groupBy(mentorReviews.mentorId) : [],
  ]);
  const reviewCount = new Map(reviewed.map((r) => [r.mentorId, r.n]));
  return c.json({
    request: { id: request.id, projectId: request.projectId, answers: request.answers, createdAt: request.createdAt },
    results: rows.map(({ result, mentor: m }) => ({
      rank: result.rank, score: result.score, reasons: result.reasons as unknown as Reason[],
      mentor: {
        id: m.id, name: m.name, initial: m.avatar.replace(/^[เแโใไ]+/, '').slice(0, 1) || m.avatar.slice(0, 1), photoUrl: m.photoUrl,
        headline: m.headline, price: m.price, unit: m.priceUnit, isNew: !reviewCount.get(m.id), acceptingRequests: m.acceptingRequests,
      },
    })),
    open: open.get(request.projectId) ?? null,
  });
});

async function ownerEmail(mentorId: string) {
  const [row] = await db.select({ email: users.email, userId: users.id }).from(mentorSubmissions)
    .innerJoin(users, eq(users.id, mentorSubmissions.userId))
    .where(and(eq(mentorSubmissions.publishedMentorId, mentorId), eq(mentorSubmissions.status, 'published'))).limit(1);
  return row ?? null;
}

matching.post('/matches/:requestId/start/:mentorId', requireUser, async (c) => {
  const user = c.get('user')!;
  if (!user.emailVerified) return fail('verifyEmail', 403);
  const request = await ownRequest(user.id, c.req.param('requestId'));
  const [result] = await db.select({ mentor: mentors }).from(matchResults).innerJoin(mentors, eq(mentors.id, matchResults.mentorId))
    .where(and(eq(matchResults.requestId, request.id), eq(matchResults.mentorId, c.req.param('mentorId'))));
  if (!result) return fail('notInResults', 404);
  const m = result.mentor;
  const owner = await ownerEmail(m.id);
  if (owner?.userId === user.id) return fail('self', 403);
  const [project] = await db.select().from(projects).where(eq(projects.id, request.projectId));
  const open = (await openConsultations([request.projectId])).get(request.projectId);
  // หนึ่งโปรเจกต์ปรึกษาค้างได้ทีละคน กดซ้ำกับคนเดิมได้รายการเดิม
  if (open && open.mentorId !== m.id) return fail('openConsult', 409);
  // ตรวจซ้ำเฉพาะการรับคำขอ (spec 8) ผลเก่าไม่เปลี่ยนตามโปรไฟล์ใหม่
  if (!open && !m.acceptingRequests) return fail('unavailable', 409);
  const [created] = open ? [] : await db.insert(consultations)
    .values({ id: newId('cns'), userId: user.id, mentorId: m.id, competitionId: project?.competitionId ?? null, status: 'contacted', minutes: 0, matchRequestId: request.id })
    .onConflictDoNothing().returning({ id: consultations.id, status: consultations.status });
  const existing = created ?? (await db.select({ id: consultations.id, status: consultations.status }).from(consultations)
    .where(and(eq(consultations.userId, user.id), eq(consultations.mentorId, m.id), inArray(consultations.status, ['contacted', 'claimed']))).limit(1))[0];
  if (!existing) return fail('openConsult', 409);
  if (created) {
    // เมนเทอร์ได้สรุปโปรเจกต์ทางอีเมล ไม่มีอีเมลของผู้เรียน (spec ข้อ 4 การตัดสินใจ 4)
    if (owner) await notify(owner.email, `${user.name.split(/\s+/)[0]} อยากปรึกษาคุณ / A team wants your advice`, summaryEmail(user.name, project, request.answers));
  }
  return c.json({
    consultation: existing,
    contacts: { email: m.contactEmail, line: m.contactLine, phone: m.contactPhone, instagram: m.contactInstagram, link: m.contactLink },
  }, created ? 201 : 200);
});

function summaryEmail(name: string, project: typeof projects.$inferSelect | undefined, answers: Record<string, unknown>) {
  const first = name.split(/\s+/)[0];
  const list = (value: unknown) => (Array.isArray(value) ? value.join(', ') : String(value ?? ''));
  return `${first} เห็นโปรไฟล์ของคุณจากผลจับคู่และจะติดต่อคุณผ่านช่องทางที่คุณให้ไว้\n`
    + `${first} found you in their mentor matches and will contact you through the channels on your profile.\n\n`
    + `Project: ${project?.name ?? ''}\n`
    + `Competition: ${project?.competitionName || '-'} (${project?.competitionKind ?? project?.start ?? ''})\n`
    + `Stage: ${project?.stage ?? ''}\n`
    + `Help with: ${list([...new Set([...(answers.helpAreas as string[] ?? []), ...(answers.noteTags as string[] ?? [])])])}\n`
    + `Level: ${list(answers.skillLevel)} · Style: ${list(answers.style)} · Format: ${list(answers.format)}\n`
    + `Timing: ${list(answers.urgency)} · Language: ${list(answers.language)}\n`
    + (answers.note ? `Note: ${list(answers.note)}\n` : '')
    + `\nดูได้ใน Mentor zone / See it in your Mentor zone: ${env.appOrigin}/mentor-zone`;
}
