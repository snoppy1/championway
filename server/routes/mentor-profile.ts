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
import type { MentorProfileV2 } from '../../src/data/matching.js';

/* โปรไฟล์เมนเทอร์แบบใหม่ (spec docs/superpowers/specs/2026-10-13-mentor-matching-design.md)
   หมวด A, B, D, E ที่ /consult/zone/profile หมวด C ที่ /consult/zone/experiences หมวด F คำนวณเอง (lib/mentor-stats.ts)
   ต่อไว้ใต้ /api ก่อน routes/consult.ts ตัวกันคำขอข้ามเว็บและ no-store ของ /consult/* ยังทำงานกับเส้นทางนี้ด้วย */

export const mentorProfile = new Hono<AppEnv>();

type Status = 400 | 403 | 404 | 409;
const fail = (message: string, status: Status = 400): never => { throw new HTTPException(status, { message }); };
async function parse<T>(c: { req: { json: () => Promise<unknown> } }, schema: z.ZodType<T>) {
  const result = schema.safeParse(await c.req.json().catch(() => null));
  if (!result.success) return fail(result.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง');
  return result.data;
}
async function requireMentor(userId: string) {
  const [row] = await db.select({ mentor: mentors }).from(mentors)
    .innerJoin(mentorSubmissions, and(eq(mentorSubmissions.publishedMentorId, mentors.id), eq(mentorSubmissions.status, 'published')))
    .where(eq(mentorSubmissions.userId, userId)).limit(1);
  return row?.mentor ?? fail('ต้องเป็นเมนเทอร์ที่ผ่านอนุมัติ', 403);
}

const noRepeats = (v: readonly unknown[]) => new Set(v).size === v.length;
const profileBody = z.object({
  headline: z.string().trim().max(80),
  country: z.union([z.enum(countries), z.literal('')], { message: 'เลือกประเทศจากรายการ' }),
  timeZone: z.string().trim().min(1).max(60),
  languages: z.array(z.enum(languages)).min(1, 'เลือกภาษาที่ให้คำปรึกษาอย่างน้อยหนึ่งภาษา').refine(noRepeats, 'มีตัวเลือกซ้ำ'),
  background: z.string().trim().max(200),
  gender: z.enum(genders).nullable(),
  skills: z.array(z.object({ tag: z.enum(skillTags as [string, ...string[]]), level: z.enum(skillLevels) }))
    .min(1, 'เลือกทักษะอย่างน้อยหนึ่งอย่าง').max(skillTags.length)
    .refine((v) => noRepeats(v.map((s) => s.tag)), 'ทักษะซ้ำ'),
  helpsWith: z.array(z.enum(helpsWith)).refine(noRepeats, 'มีตัวเลือกซ้ำ'),
  learnerLevels: z.array(z.enum(learnerLevels)).refine(noRepeats, 'มีตัวเลือกซ้ำ'),
  teachingStyles: z.array(z.enum(teachingStyles)).refine(noRepeats, 'มีตัวเลือกซ้ำ'),
  formats: z.array(z.enum(formats)).refine(noRepeats, 'มีตัวเลือกซ้ำ'),
  deliverables: z.string().trim().max(500),
  availability: z.array(z.object({ day: z.number().int(), from: z.string(), to: z.string() })).max(21)
    .refine((v) => v.every((slot) => slotProblem(slot) === null), 'ช่วงเวลาว่างไม่ถูกต้อง (ใช้ HH:MM และเวลาจบต้องหลังเวลาเริ่ม)'),
  sessionsPerWeek: z.number().int().min(1).max(20).nullable(),
  sessionMinutes: z.array(z.number().int())
    .refine((v) => v.every((m) => (sessionLengths as readonly number[]).includes(m)), 'เวลาต่อ Session เลือกได้ 30, 60 หรือ 90 นาที').refine(noRepeats, 'มีตัวเลือกซ้ำ'),
  acceptingRequests: z.boolean(),
  replyHours: z.number().int().nullable()
    .refine((v) => v === null || (replyHoursOptions as readonly number[]).includes(v), 'เลือกเวลาตอบกลับจากรายการ'),
  acceptsUrgent: z.boolean(),
  mode: z.enum(modes).nullable(),
});

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
  const { skills, ...columns } = await parse(c, profileBody);
  await db.transaction(async (tx) => {
    await tx.update(mentors).set(columns).where(eq(mentors.id, mentor.id));
    // แทนที่ทักษะทั้งชุด ฟอร์มส่งมาครบทุกครั้ง
    await tx.delete(mentorSkills).where(eq(mentorSkills.mentorId, mentor.id));
    await tx.insert(mentorSkills).values(skills.map((s) => ({ mentorId: mentor.id, tag: s.tag, level: s.level })));
  });
  return c.json(await loadProfileV2(mentor.id));
});

/* ---------- หมวด C: ประสบการณ์แข่งขัน ---------- */

const experienceBody = z.object({
  competitionSlug: z.string().trim().max(200).optional(),
  name: z.string().trim().max(200).default(''),
  year: z.string().regex(/^25\d\d$/, 'ปีที่เข้าร่วมเป็น พ.ศ. 4 หลัก'),
  kind: z.enum(experienceKinds),
  result: z.enum(experienceResults),
  detail: z.string().trim().max(200).default(''),
  role: z.enum(teamRoles),
  roleOther: z.string().trim().max(80).default(''),
  responsibility: z.string().trim().min(1, 'บอกสิ่งที่รับผิดชอบในการแข่งขัน').max(1000),
  evidenceUrl: z.string().trim().max(500).refine((v) => /^https:\/\/\S+$/i.test(v), 'ลิงก์หลักฐานต้องขึ้นต้นด้วย https://'),
  lessons: z.string().trim().max(1000).default(''),
}).refine((v) => v.competitionSlug || v.name.length > 0, 'ใส่ชื่องานแข่ง')
  .refine((v) => v.result !== 'winner' || v.detail.length > 0, 'ระบุรางวัลที่ได้')
  .refine((v) => v.result !== 'other' || v.detail.length > 0, 'อธิบายผลการแข่งขัน')
  .refine((v) => v.role !== 'other' || v.roleOther.length > 0, 'ระบุบทบาทในทีม');

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
  if (waiting >= 10) return fail('มีประสบการณ์รอตรวจครบ 10 รายการแล้ว รอทีมงานตรวจก่อน', 409);

  let competitionId: string | null = null;
  let hackathonNameId: string | null = null;
  let name = body.name.replace(/\s+/g, ' ');
  if (body.competitionSlug) {
    const [event] = await db.select({ id: competitions.id, name: competitions.name }).from(competitions).where(eq(competitions.slug, body.competitionSlug));
    if (!event) return fail('ไม่พบงานแข่งนี้', 404);
    competitionId = event.id;
    name = event.name;
  } else {
    // ชื่อที่ตรงกับงานในระบบ (ตัวพิมพ์และช่องว่างไม่สน) ผูกกับงานนั้นแทน ไม่สร้างชื่อซ้ำ
    const normalized = normalizeName(name);
    const [event] = await db.select({ id: competitions.id, name: competitions.name }).from(competitions)
      .where(sql`regexp_replace(lower(trim(${competitions.name})), '\\s+', ' ', 'g') = ${normalized}`).limit(1);
    if (event) {
      competitionId = event.id;
      name = event.name;
    } else {
      await db.insert(hackathonNames).values({ id: newId('hkn'), name, normalized, createdBy: user.id }).onConflictDoNothing();
      const [row] = await db.select().from(hackathonNames).where(eq(hackathonNames.normalized, normalized));
      hackathonNameId = row.id;
      name = row.name;
    }
  }
  const id = newId('exp');
  const [created] = await db.insert(mentorExperiences).values({
    id, mentorId: mentor.id, competitionId, hackathonNameId, name, year: body.year, kind: body.kind, result: body.result, detail: body.detail,
    role: body.role, roleOther: body.role === 'other' ? body.roleOther : '', responsibility: body.responsibility, evidenceUrl: body.evidenceUrl,
    lessons: body.lessons, status: 'pending',
  }).onConflictDoNothing().returning({ id: mentorExperiences.id });
  if (!created) return fail('มีงานนี้ในปีนี้อยู่แล้ว', 409);
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
  if (!gone) return fail('ไม่พบรายการนี้', 404);
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
  return c.json({ items: [...listed.map((r) => ({ id: null, slug: r.slug, name: r.name })), ...typed.map((r) => ({ id: r.id, slug: null, name: r.name }))].slice(0, 8) });
});
