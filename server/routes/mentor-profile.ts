import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { mentorExperiences, mentorSkills, mentors, mentorSubmissions } from '../db/schema.js';
import { requireUser, type AppEnv } from '../lib/guards.js';
import {
  countries, formats, genders, helpsWith, languages, learnerLevels, missingSections, modes, replyHoursOptions, sessionLengths,
  skillLevels, skillTags, slotProblem, teachingStyles,
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
