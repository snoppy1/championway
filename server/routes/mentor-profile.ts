import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { and, desc, eq, ilike, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { competitions, hackathonNames, mentorExperiences, mentorSkills, mentors, mentorSubmissions } from '../db/schema.js';
import { env } from '../lib/env.js';
import { newId } from '../lib/id.js';
import { notifyStaff } from '../lib/staff-notify.js';
import { requireUser, type AppEnv } from '../lib/guards.js';
import {
  countries, experienceKinds, experienceResults, formats, genders, helpsWith, languages, learnerLevels, missingSections, modes, replyHoursOptions, sessionLengths,
  normalizeName, skillLevels, skillTags, slotProblem, teachingStyles, teamRoles,
} from '../../src/data/matching.js';
import type { MentorProfileV2, SkillTag } from '../../src/data/matching.js';

/* โปรไฟล์เมนเทอร์แบบใหม่ (spec docs/superpowers/specs/2026-10-13-mentor-matching-design.md)
   หมวด A, B, D, E ที่ /consult/zone/profile หมวด C ที่ /consult/zone/experiences หมวด F คำนวณเอง (lib/mentor-stats.ts)
   ต่อไว้ใต้ /api ก่อน routes/consult.ts มิดเดิลแวร์ของ consult จึงไม่ครอบเส้นทางนี้ ต้องตั้ง no-store และกันคำขอข้ามเว็บเองข้างล่าง */

export const mentorProfile = new Hono<AppEnv>();

/* ข้อความ error ตอบตามภาษาที่หน้าเว็บส่งมา (header x-lang) โค้ดในไฟล์นี้โยนแค่รหัส ข้อความจริงอยู่ตรงนี้ที่เดียว
   ใช้ร่วมกับใบสมัครเมนเทอร์ (routes/public.ts) ที่ตรวจโปรไฟล์ชุดเดียวกัน */
export const profileMessages = {
  invalid: ['ข้อมูลไม่ถูกต้อง', 'Some details are not valid.'],
  mentorOnly: ['ต้องเป็นเมนเทอร์ที่ผ่านอนุมัติ', 'Only approved mentors can do this.'],
  origin: ['คำขอต้องมาจากเว็บนี้', 'Requests must come from this site.'],
  country: ['เลือกประเทศจากรายการ', 'Choose a country from the list.'],
  repeats: ['มีตัวเลือกซ้ำ', 'An option is picked more than once.'],
  slot: ['ช่วงเวลาว่างไม่ถูกต้อง (ใช้ HH:MM และเวลาจบต้องหลังเวลาเริ่ม)', 'A time is not valid. Use HH:MM, and the end must be after the start.'],
  sessionMinutes: ['เวลาต่อ Session เลือกได้ 30, 60 หรือ 90 นาที', 'Session length can be 30, 60 or 90 minutes.'],
  sessionsPerWeek: ['จำนวน Session ต่อสัปดาห์ต้องอยู่ระหว่าง 1 ถึง 20', 'Sessions per week must be from 1 to 20.'],
  replyHours: ['เลือกเวลาตอบกลับจากรายการ', 'Choose a reply time from the list.'],
  profileIncomplete: ['กรอกโปรไฟล์ให้ครบทุกหมวด', 'Fill in every part of your profile.'],
  year: ['ปีที่เข้าร่วมเป็น พ.ศ. 4 หลัก', 'Enter a 4-digit B.E. year, for example 2567.'],
  name: ['ใส่ชื่องานแข่ง', 'Enter the competition name.'],
  responsibility: ['บอกสิ่งที่รับผิดชอบในการแข่งขัน', 'Say what you were responsible for.'],
  lessons: ['บอกประสบการณ์ที่ส่งต่อให้ทีมรุ่นต่อไปได้', 'Say what you can pass on to the next teams.'],
  https: ['ลิงก์หลักฐานต้องขึ้นต้นด้วย https://', 'The evidence link must start with https://'],
  award: ['ระบุรางวัลที่ได้', 'Name the award you won.'],
  resultOther: ['อธิบายผลการแข่งขัน', 'Describe the result.'],
  roleOther: ['ระบุบทบาทในทีม', 'Describe your role.'],
  waitingFull: ['มีประสบการณ์รอตรวจครบ 10 รายการแล้ว รอทีมงานตรวจก่อน', 'You already have 10 entries waiting for review. Please wait for our team to check them.'],
  noCompetition: ['ไม่พบงานแข่งนี้', 'This competition was not found.'],
  duplicate: ['มีงานนี้ในปีนี้อยู่แล้ว', 'You already added this competition for that year.'],
  notFound: ['ไม่พบรายการนี้', 'This entry was not found.'],
  evidenceNeeded: ['แนบไฟล์หลักฐานหรือใส่ลิงก์หลักฐานของทุกงาน', 'Add an evidence file or link for every competition.'],
  priceUnit: ['บอกด้วยว่าราคานี้คิดต่ออะไร เช่น ชั่วโมง หรือโปรเจกต์', 'Say what the price is per, for example per hour or per project.'],
} as const;
export type ProfileMessage = keyof typeof profileMessages;
const isMessage = (value: string): value is ProfileMessage => Object.hasOwn(profileMessages, value);
/** ข้อความของรหัสตามภาษาที่ขอ (ค่าเริ่มต้นอังกฤษ เหมือนหน้าเว็บ) */
export const profileMessage = (code: ProfileMessage, lang: string | undefined) => profileMessages[code][lang === 'th' ? 0 : 1];

type Status = 400 | 403 | 404 | 409;
const fail = (code: ProfileMessage, status: Status = 400): never => { throw new HTTPException(status, { message: code }); };
/** ข้อความแรกจาก zod เป็นรหัสของเราเสมอ ข้อความตั้งต้นของ zod (ภาษาอังกฤษล้วน) กลายเป็น "ข้อมูลไม่ถูกต้อง" */
export const issueCode = (error: z.ZodError): ProfileMessage => {
  const message = error.issues[0]?.message ?? '';
  return isMessage(message) ? message : 'invalid';
};
async function parse<T>(c: { req: { json: () => Promise<unknown> } }, schema: z.ZodType<T>) {
  const result = schema.safeParse(await c.req.json().catch(() => null));
  if (!result.success) return fail(issueCode(result.error));
  return result.data;
}
async function requireMentor(userId: string) {
  const [row] = await db.select({ mentor: mentors }).from(mentors)
    .innerJoin(mentorSubmissions, and(eq(mentorSubmissions.publishedMentorId, mentors.id), eq(mentorSubmissions.status, 'published')))
    .where(eq(mentorSubmissions.userId, userId)).limit(1);
  return row?.mentor ?? fail('mentorOnly', 403);
}

// เหมือน routes/consult.ts: ข้อมูลส่วนตัวห้ามแคช และคำขอที่เปลี่ยนข้อมูลต้องมาจากเว็บนี้
mentorProfile.use('/consult/*', async (c, next) => {
  c.header('Cache-Control', 'private, no-store');
  const origin = c.req.header('origin');
  if (c.req.method !== 'GET' && origin && origin !== env.appOrigin) return c.json({ error: profileMessage('origin', c.req.header('x-lang')) }, 403);
  await next();
});

mentorProfile.onError((error, c) => {
  if (error instanceof HTTPException) {
    return c.json({ error: isMessage(error.message) ? profileMessage(error.message, c.req.header('x-lang')) : error.message }, error.status);
  }
  console.error('[api]', error);
  return c.json({ error: c.req.header('x-lang') === 'th' ? 'เกิดข้อผิดพลาดในระบบ ลองใหม่อีกครั้ง' : 'Something went wrong. Please try again.' }, 500);
});

const noRepeats = (v: readonly unknown[]) => new Set(v).size === v.length;
/* บันทึกได้แม้ยังกรอกไม่ครบ (เมนเทอร์ที่ย้ายมาจากระบบเดิมทยอยกรอกทีละหมวด) หมวดที่ยังว่างดูจาก missingSections
   ใบสมัครเมนเทอร์ใช้ชุดเดียวกันแต่บังคับให้ครบ (profileComplete) */
export const profileFields = z.object({
  headline: z.string().trim().max(80),
  country: z.union([z.enum(countries), z.literal('')], { message: 'country' }),
  timeZone: z.string().trim().min(1).max(60),
  languages: z.array(z.enum(languages)).refine(noRepeats, 'repeats'),
  background: z.string().trim().max(200),
  gender: z.enum(genders).nullable(),
  skills: z.array(z.object({ tag: z.enum(skillTags as [SkillTag, ...SkillTag[]]), level: z.enum(skillLevels) })).max(skillTags.length)
    .refine((v) => noRepeats(v.map((s) => s.tag)), 'repeats'),
  helpsWith: z.array(z.enum(helpsWith)).refine(noRepeats, 'repeats'),
  learnerLevels: z.array(z.enum(learnerLevels)).refine(noRepeats, 'repeats'),
  teachingStyles: z.array(z.enum(teachingStyles)).refine(noRepeats, 'repeats'),
  formats: z.array(z.enum(formats)).refine(noRepeats, 'repeats'),
  deliverables: z.string().trim().max(500),
  availability: z.array(z.object({ day: z.number().int(), from: z.string(), to: z.string() })).max(21)
    .refine((v) => v.every((slot) => slotProblem(slot) === null), 'slot'),
  sessionsPerWeek: z.number().int().min(1, 'sessionsPerWeek').max(20, 'sessionsPerWeek').nullable(),
  sessionMinutes: z.array(z.number().int())
    .refine((v) => v.every((m) => (sessionLengths as readonly number[]).includes(m)), 'sessionMinutes').refine(noRepeats, 'repeats'),
  acceptingRequests: z.boolean(),
  replyHours: z.number().int().nullable()
    .refine((v) => v === null || (replyHoursOptions as readonly number[]).includes(v), 'replyHours'),
  acceptsUrgent: z.boolean(),
  mode: z.enum(modes).nullable(),
});
export type ProfileFields = z.infer<typeof profileFields>;

/** เขียนหมวด A, B, D, E ลงเมนเทอร์ ทักษะแทนทั้งชุด ใช้ทั้งตอนบันทึกโปรไฟล์และตอนอนุมัติใบสมัคร */
export async function writeProfile(tx: Tx, mentorId: string, { skills, ...columns }: ProfileFields) {
  await tx.update(mentors).set(columns).where(eq(mentors.id, mentorId));
  await tx.delete(mentorSkills).where(eq(mentorSkills.mentorId, mentorId));
  if (skills.length) await tx.insert(mentorSkills).values(skills.map((s) => ({ mentorId, tag: s.tag, level: s.level })));
}
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** โปรไฟล์ A–E ของเมนเทอร์หนึ่งคน พร้อมหมวดที่ยังขาด (ประสบการณ์ที่ไม่ผ่านการตรวจไม่นับว่ากรอกหมวด C แล้ว) */
export async function loadProfileV2(mentorId: string) {
  const [[m], skills, [{ count }]] = await Promise.all([
    db.select().from(mentors).where(eq(mentors.id, mentorId)),
    db.select({ tag: mentorSkills.tag, level: mentorSkills.level }).from(mentorSkills).where(eq(mentorSkills.mentorId, mentorId)).orderBy(mentorSkills.tag),
    db.select({ count: sql<number>`count(*)::int` }).from(mentorExperiences)
      .where(and(eq(mentorExperiences.mentorId, mentorId), sql`${mentorExperiences.status} <> 'rejected'`)),
  ]);
  const profile = {
    headline: m.headline, country: m.country, timeZone: m.timeZone, languages: m.languages, background: m.background, gender: m.gender ?? null,
    skills, helpsWith: m.helpsWith, learnerLevels: m.learnerLevels, teachingStyles: m.teachingStyles, formats: m.formats, deliverables: m.deliverables,
    availability: m.availability, sessionsPerWeek: m.sessionsPerWeek, sessionMinutes: m.sessionMinutes, acceptingRequests: m.acceptingRequests,
    replyHours: m.replyHours, acceptsUrgent: m.acceptsUrgent, mode: m.mode ?? null,
  } as MentorProfileV2;
  const missing = missingSections(profile, count);
  return { profile, missing, complete: missing.length === 0 };
}

mentorProfile.get('/consult/zone/profile', requireUser, async (c) => {
  const mentor = await requireMentor(c.get('user')!.id);
  return c.json(await loadProfileV2(mentor.id));
});

mentorProfile.put('/consult/zone/profile', requireUser, async (c) => {
  const mentor = await requireMentor(c.get('user')!.id);
  const body = await parse(c, profileFields);
  await db.transaction((tx) => writeProfile(tx, mentor.id, body));
  return c.json(await loadProfileV2(mentor.id));
});

/* ---------- หมวด C: ประสบการณ์แข่งขัน ---------- */

/** ปี พ.ศ. 4 หลัก ไม่เกินปีปัจจุบัน */
export const beYear = z.string().regex(/^25\d\d$/, 'year').refine((v) => Number(v) <= new Date().getFullYear() + 543, 'year');
const experienceBody = z.object({
  competitionSlug: z.string().trim().max(200).optional(),
  name: z.string().trim().max(200).default(''),
  year: beYear,
  kind: z.enum(experienceKinds),
  result: z.enum(experienceResults),
  detail: z.string().trim().max(200).default(''),
  role: z.enum(teamRoles),
  roleOther: z.string().trim().max(80).default(''),
  responsibility: z.string().trim().min(1, 'responsibility').max(1000),
  evidenceUrl: z.string().trim().max(500).refine((v) => /^https:\/\/\S+$/i.test(v), 'https'),
  lessons: z.string().trim().max(1000).default(''),
}).refine((v) => v.competitionSlug || v.name.length > 0, 'name')
  .refine((v) => v.result !== 'winner' || v.detail.length > 0, 'award')
  .refine((v) => v.result !== 'other' || v.detail.length > 0, 'resultOther')
  .refine((v) => v.role !== 'other' || v.roleOther.length > 0, 'roleOther');

/** ชื่องานแข่งที่พิมพ์เอง: ตรงกับงานในระบบ (ตัวพิมพ์และช่องว่างไม่สน) ผูกกับงานนั้น ไม่ตรงก็ใช้หรือเพิ่มในรายชื่อเติมคำอัตโนมัติ */
export async function resolveCompetitionName(tx: Tx | typeof db, typed: string, userId: string | null) {
  const name = typed.trim().replace(/\s+/g, ' ');
  const normalized = normalizeName(name);
  const [event] = await tx.select({ id: competitions.id, name: competitions.name }).from(competitions)
    .where(sql`regexp_replace(lower(trim(${competitions.name})), '\\s+', ' ', 'g') = ${normalized}`).limit(1);
  if (event) return { competitionId: event.id as string | null, hackathonNameId: null as string | null, name: event.name };
  await tx.insert(hackathonNames).values({ id: newId('hkn'), name, normalized, createdBy: userId }).onConflictDoNothing();
  const [row] = await tx.select().from(hackathonNames).where(eq(hackathonNames.normalized, normalized));
  return { competitionId: null as string | null, hackathonNameId: row.id as string | null, name: row.name };
}

export const experienceJson = (row: typeof mentorExperiences.$inferSelect, slug: string | null) => ({
  id: row.id, name: row.name, competitionSlug: slug, year: row.year, kind: row.kind, result: row.result, detail: row.detail,
  role: row.role, roleOther: row.roleOther, responsibility: row.responsibility, evidenceUrl: row.evidenceUrl, lessons: row.lessons,
  status: row.status, reason: row.reason, createdAt: row.createdAt,
});

mentorProfile.get('/consult/zone/experiences', requireUser, async (c) => {
  const mentor = await requireMentor(c.get('user')!.id);
  const rows = await db.select({ row: mentorExperiences, slug: competitions.slug }).from(mentorExperiences)
    .leftJoin(competitions, eq(competitions.id, mentorExperiences.competitionId))
    .where(eq(mentorExperiences.mentorId, mentor.id)).orderBy(desc(mentorExperiences.createdAt));
  return c.json({ items: rows.map(({ row, slug }) => experienceJson(row, slug)) });
});

mentorProfile.post('/consult/zone/experiences', requireUser, async (c) => {
  const user = c.get('user')!;
  const mentor = await requireMentor(user.id);
  const body = await parse(c, experienceBody);
  const [{ waiting }] = await db.select({ waiting: sql<number>`count(*)::int` }).from(mentorExperiences)
    .where(and(eq(mentorExperiences.mentorId, mentor.id), eq(mentorExperiences.status, 'pending')));
  if (waiting >= 10) return fail('waitingFull', 409);

  let competitionId: string | null = null;
  let hackathonNameId: string | null = null;
  let name = body.name.replace(/\s+/g, ' ');
  if (body.competitionSlug) {
    const [event] = await db.select({ id: competitions.id, name: competitions.name }).from(competitions).where(eq(competitions.slug, body.competitionSlug));
    if (!event) return fail('noCompetition', 404);
    competitionId = event.id;
    name = event.name;
  } else {
    ({ competitionId, hackathonNameId, name } = await resolveCompetitionName(db, name, user.id));
  }
  const id = newId('exp');
  const [created] = await db.insert(mentorExperiences).values({
    id, mentorId: mentor.id, competitionId, hackathonNameId, name, year: body.year, kind: body.kind, result: body.result, detail: body.detail,
    role: body.role, roleOther: body.role === 'other' ? body.roleOther : '', responsibility: body.responsibility, evidenceUrl: body.evidenceUrl,
    lessons: body.lessons, status: 'pending',
  }).onConflictDoNothing().returning({ id: mentorExperiences.id });
  if (!created) return fail('duplicate', 409);
  await notifyStaff('competition_request', user.id, `ประสบการณ์เมนเทอร์รอตรวจ: ${name} ${body.year}`,
    `${mentor.name} เพิ่มประสบการณ์ "${name}" ปี ${body.year} พร้อมลิงก์หลักฐาน รอตรวจ

${env.appOrigin}/admin/experiences`);
  return c.json({ id }, 201);
});

mentorProfile.delete('/consult/zone/experiences/:id', requireUser, async (c) => {
  const mentor = await requireMentor(c.get('user')!.id);
  // ลบได้เฉพาะที่ยังไม่ผ่านการตรวจ ที่ตรวจแล้วเป็นหลักฐานของคะแนนและป้าย ต้องให้ทีมงานจัดการ
  const [gone] = await db.delete(mentorExperiences)
    .where(and(eq(mentorExperiences.id, c.req.param('id')), eq(mentorExperiences.mentorId, mentor.id), inArray(mentorExperiences.status, ['pending', 'rejected'])))
    .returning({ id: mentorExperiences.id });
  if (!gone) return fail('notFound', 404);
  return c.json({ ok: true });
});

/** เติมชื่องานแข่งอัตโนมัติ: งานที่มีหน้าในระบบ (มี slug) และชื่อที่เมนเทอร์เคยพิมพ์ไว้ (มี id) */
mentorProfile.get('/hackathon-names', async (c) => {
  const q = normalizeName(c.req.query('q') ?? '').slice(0, 80);
  if (q.length < 2) return c.json({ items: [] });
  const pattern = `%${q.replace(/[%_\\]/g, (ch) => `\\${ch}`)}%`;
  const [listed, typed] = await Promise.all([
    db.select({ slug: competitions.slug, name: competitions.name }).from(competitions).where(ilike(competitions.name, pattern)).orderBy(competitions.name).limit(8),
    db.select({ id: hackathonNames.id, name: hackathonNames.name }).from(hackathonNames).where(ilike(hackathonNames.normalized, pattern)).orderBy(hackathonNames.name).limit(8),
  ]);
  // ชื่อที่ตรงกับงานที่มีหน้าในระบบแล้ว แสดงครั้งเดียว (แบบมีหน้า)
  const pages = new Set(listed.map((r) => normalizeName(r.name)));
  const names = typed.filter((r) => !pages.has(normalizeName(r.name)));
  return c.json({ items: [...listed.map((r) => ({ id: null, slug: r.slug, name: r.name })), ...names.map((r) => ({ id: r.id, slug: null, name: r.name }))].slice(0, 8) });
});
