import { Hono } from 'hono';
import { and, eq, gt, gte, lt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { bookings, mentorSlots, mentorSubmissions, mentors, risingStarPeriods } from '../db/schema.js';
import type { AppEnv } from '../lib/guards.js';

/* ข้อมูลของหน้า Rising Star: Hall of Fame สามเดือน รายชื่อที่จัดอันดับ และรายชื่อที่ไม่จัดอันดับ

   กติกาที่ตกลงไว้ (markdown/rising-star.md)
   - นับเฉพาะการปรึกษาที่ยืนยันแล้วและพ้นเวลานัดแล้ว นับตามเดือนที่นัดจบ (เวลาไทย)
     นับตอนกดจองไม่ได้ เพราะปั่นอันดับได้ด้วยการจองแล้วยกเลิก
   - จัดอันดับเฉพาะคนที่เป็นสมาชิก Rising Star ในเดือนนั้น คนที่ไม่ได้สมัครอยู่ท้าย ไม่มีอันดับ
   - Hall of Fame ของเดือนก่อน ๆ เป็นประวัติ คนที่เคยติดอันดับยังอยู่แม้ตอนนี้หมดสมาชิกแล้ว */

export const risingStar = new Hono<AppEnv>();

const BANGKOK = 7 * 3600_000;
const HALL_SIZE = 3;

/** จุดเริ่มเดือนตามเวลาไทย offset 0 = เดือนนี้, -1 = เดือนที่แล้ว ไทยไม่มีเวลาออมแสง จึงบวกลบ 7 ชั่วโมงได้ตรง ๆ */
function bangkokMonth(now: Date, offset: number) {
  const local = new Date(now.getTime() + BANGKOK);
  const start = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + offset, 1) - BANGKOK);
  const end = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + offset + 1, 1) - BANGKOK);
  const key = new Date(start.getTime() + BANGKOK).toISOString().slice(0, 7);
  return { key, start, end };
}

/** ตัวอักษรแรกสำหรับรูปวงกลม ข้ามสระหน้า (เ แ โ ใ ไ) ไม่งั้น "เจ" จะขึ้นแค่ "เ" */
const initialOf = (text: string) => text.replace(/^[เแโใไ]+/, '').slice(0, 1).toUpperCase() || text.slice(0, 1);

type Period = { mentorId: string; startsAt: Date; endsAt: Date; source: string };
const overlaps = (p: Period, start: Date, end: Date) => p.startsAt < end && p.endsAt > start;

risingStar.get('/', async (c) => {
  const now = new Date();
  const [thisMonth, lastMonth, twoAgo] = [0, -1, -2].map((offset) => bangkokMonth(now, offset));

  const [allMentors, periods, sessions] = await Promise.all([
    db.select({
      id: mentors.id, name: mentors.name, avatar: mentors.avatar, bio: mentors.bio,
      focus: mentors.weeklyFocus, price: mentors.price,
    }).from(mentors),
    db.select({ mentorId: risingStarPeriods.mentorId, startsAt: risingStarPeriods.startsAt, endsAt: risingStarPeriods.endsAt, source: risingStarPeriods.source })
      .from(risingStarPeriods).where(gt(risingStarPeriods.endsAt, twoAgo.start)),
    db.select({ mentorId: bookings.mentorId, endsAt: mentorSlots.endsAt })
      .from(bookings).innerJoin(mentorSlots, eq(bookings.slotId, mentorSlots.id))
      .where(and(eq(bookings.status, 'confirmed'), gte(mentorSlots.endsAt, twoAgo.start), lt(mentorSlots.endsAt, now))),
  ]);

  /** จำนวนการปรึกษาของเมนเทอร์แต่ละคนในเดือนหนึ่ง */
  const countIn = (month: { start: Date; end: Date }) => {
    const counts = new Map<string, number>();
    for (const row of sessions) {
      if (row.endsAt >= month.start && row.endsAt < month.end) counts.set(row.mentorId, (counts.get(row.mentorId) ?? 0) + 1);
    }
    return counts;
  };
  const byId = new Map(allMentors.map((mentor) => [mentor.id, mentor]));
  const card = (id: string, count: number) => {
    const mentor = byId.get(id)!;
    return {
      id: mentor.id, name: mentor.name, initial: initialOf(mentor.avatar || mentor.name),
      specialty: mentor.focus ?? mentor.bio, price: mentor.price, count,
    };
  };
  // เรียงตามจำนวนมากไปน้อย เท่ากันเรียงตามชื่อ ลำดับจึงคงที่ทุกครั้งที่เปิด
  const byCount = (counts: Map<string, number>) => (a: string, b: string) =>
    (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || byId.get(a)!.name.localeCompare(byId.get(b)!.name, 'th');

  const hall = [thisMonth, lastMonth, twoAgo].map((month) => {
    const counts = countIn(month);
    const members = [...new Set(periods.filter((p) => overlaps(p, month.start, month.end)).map((p) => p.mentorId))]
      .filter((id) => byId.has(id) && (counts.get(id) ?? 0) > 0)
      .sort(byCount(counts))
      .slice(0, HALL_SIZE);
    return {
      month: month.key,
      closesAt: month === thisMonth ? month.end.toISOString() : null,
      top: members.map((id, index) => ({ rank: index + 1, ...card(id, counts.get(id) ?? 0) })),
    };
  });

  const current = countIn(thisMonth);
  const activeIds = new Set(periods.filter((p) => p.startsAt <= now && p.endsAt > now).map((p) => p.mentorId));
  const ranked = [...activeIds].filter((id) => byId.has(id)).sort(byCount(current))
    .map((id, index) => ({ rank: index + 1, ...card(id, current.get(id) ?? 0) }));
  const others = allMentors.filter((mentor) => !activeIds.has(mentor.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'th'))
    .map((mentor) => card(mentor.id, current.get(mentor.id) ?? 0));

  /* ถ้าคนที่เปิดหน้าเป็นเมนเทอร์ ส่งข้อมูลของเขาไปด้วย การ์ดชวนสมัครจะได้บอกได้ว่า
     "เดือนนี้คุณปรึกษาไปแล้วกี่ครั้ง ถ้าสมัครจะอยู่อันดับไหน" จากข้อมูลจริง */
  let viewer = null;
  const user = c.get('user');
  if (user) {
    const [own] = await db.select({ mentorId: mentorSubmissions.publishedMentorId }).from(mentorSubmissions)
      .where(and(eq(mentorSubmissions.userId, user.id), eq(mentorSubmissions.status, 'published'))).limit(1);
    if (own?.mentorId && byId.has(own.mentorId)) {
      const count = current.get(own.mentorId) ?? 0;
      const active = periods.find((p) => p.mentorId === own.mentorId && p.startsAt <= now && p.endsAt > now);
      viewer = {
        mentorId: own.mentorId,
        active: Boolean(active),
        activeUntil: active?.endsAt.toISOString() ?? null,
        count,
        projectedRank: ranked.filter((row) => row.count > count).length + 1,
      };
    }
  }

  // มีช่วงสมาชิกตัวอย่างอยู่ในสามเดือนนี้ หน้าเว็บจะติดป้ายว่าอันดับยังไม่ใช่ข้อมูลจริง
  const demo = periods.some((p) => p.source === 'demo');

  c.header('Cache-Control', 'private, no-store');
  return c.json({ hall, ranked, others, viewer, demo });
});
