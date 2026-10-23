import { Hono } from 'hono';
import { and, count, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { mentorExperiences, mentorReviews, mentorSubmissions, mentors, users } from '../db/schema.js';
import type { AppEnv } from '../lib/guards.js';
import { ratingJson, ratingsBetween } from '../lib/ratings.js';

/* ข้อมูลจริงของหน้าแรกแบบใหม่ (Claude Design "ChampionWays", เจ้าของตัดสิน 23 ต.ค. 2569: ใช้ข้อมูลจริง ซ่อนส่วนที่ยังไม่มี)
   - mentors: เมนเทอร์ที่ผ่านอนุมัติ ล่าสุดก่อน พร้อมดาวเฉลี่ยทั้งหมด จำนวนงานแข่งที่ตรวจแล้ว และเรื่องที่ช่วยได้
   - stories: รีวิวจริงที่มีข้อความ ได้ 4 ดาวขึ้นไป ไม่ถูกซ่อน แสดงชื่อแรกกับอักษรแรกของนามสกุลเท่านั้น
   ไม่มีช่องทางติดต่อ ไม่มีอีเมล */

export const landing = new Hono<AppEnv>();

const MENTORS = 8;
const STORIES = 3;
const initialOf = (text: string) => text.replace(/^[เแโใไ]+/, '').slice(0, 1).toUpperCase() || text.slice(0, 1);
/** "Mew Suksan" → "Mew S." */
const shortName = (name: string) => {
  const [first = '', last = ''] = name.trim().split(/\s+/);
  return last ? `${first} ${last.replace(/^[เแโใไ]+/, '').slice(0, 1)}.` : first;
};

landing.get('/', async (c) => {
  const rows = await db.select({
    id: mentors.id, name: mentors.name, avatar: mentors.avatar, photoUrl: mentors.photoUrl, headline: mentors.headline,
    bio: mentors.bio, focus: mentors.weeklyFocus, helpsWith: mentors.helpsWith,
  }).from(mentors)
    .innerJoin(mentorSubmissions, and(eq(mentorSubmissions.publishedMentorId, mentors.id), eq(mentorSubmissions.status, 'published')))
    .orderBy(desc(mentors.createdAt), mentors.id).limit(MENTORS);
  const ids = rows.map((row) => row.id);
  const [ratings, events, stories] = await Promise.all([
    ratingsBetween(new Date(0), new Date()),
    ids.length ? db.select({ mentorId: mentorExperiences.mentorId, n: count() }).from(mentorExperiences)
      .where(and(inArray(mentorExperiences.mentorId, ids), eq(mentorExperiences.status, 'verified'))).groupBy(mentorExperiences.mentorId) : [],
    db.select({ comment: mentorReviews.comment, stars: mentorReviews.stars, reviewer: users.name, mentor: mentors.name })
      .from(mentorReviews).innerJoin(users, eq(users.id, mentorReviews.userId)).innerJoin(mentors, eq(mentors.id, mentorReviews.mentorId))
      .where(and(isNull(mentorReviews.hiddenAt), gte(mentorReviews.stars, 4), sql`length(trim(${mentorReviews.comment})) >= 20`))
      .orderBy(desc(mentorReviews.createdAt)).limit(STORIES),
  ]);
  const eventsOf = new Map(events.map((row) => [row.mentorId, row.n]));
  c.header('Cache-Control', 'public, max-age=60');
  return c.json({
    mentors: rows.map((m) => ({
      id: m.id, name: m.name, initial: initialOf(m.avatar || m.name), photoUrl: m.photoUrl, headline: m.headline,
      bio: m.focus ?? m.bio, helpsWith: m.helpsWith.slice(0, 3), rating: ratingJson(ratings.get(m.id)), events: eventsOf.get(m.id) ?? 0,
    })),
    stories: stories.map((s) => ({ comment: s.comment.trim(), stars: s.stars, name: shortName(s.reviewer), initial: initialOf(s.reviewer), mentor: s.mentor })),
  });
});
