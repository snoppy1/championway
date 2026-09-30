import { Hono } from 'hono';
import { and, eq, gt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { mentorSubmissions, mentors, risingStarPeriods } from '../db/schema.js';
import type { AppEnv } from '../lib/guards.js';
import { bangkokMonth, byRating, ratingJson, ratingsBetween } from '../lib/ratings.js';
import type { Rating } from '../lib/ratings.js';

/* ข้อมูลของหน้า Hall of Fame: สามเดือน รายชื่อที่จัดอันดับ และรายชื่อที่ไม่จัดอันดับ

   กติกา (ผู้ใช้ตัดสิน 30 ก.ย. 2569 เปลี่ยนจากนับจำนวนครั้งที่ปรึกษา)
   - จัดอันดับด้วยค่าเฉลี่ยดาวของรีวิวที่เขียนในเดือนนั้น (เวลาไทย) เริ่มนับใหม่ทุกเดือน
   - รีวิวเกิดได้เฉพาะหลังเมนเทอร์ยืนยันการปรึกษา และผู้รีวิวยืนยันอีเมลแล้ว จึงปั๊มคะแนนยาก
   - จัดอันดับเฉพาะคนที่เป็นสมาชิก Rising Star ในเดือนนั้น คนที่ไม่ได้สมัครอยู่ท้าย ไม่มีอันดับ
   - Hall of Fame ของเดือนก่อน ๆ เป็นประวัติ คนที่เคยติดอันดับยังอยู่แม้ตอนนี้หมดสมาชิกแล้ว */

export const risingStar = new Hono<AppEnv>();

const HALL_SIZE = 3;

/** ตัวอักษรแรกสำหรับรูปวงกลม ข้ามสระหน้า (เ แ โ ใ ไ) ไม่งั้น "เจ" จะขึ้นแค่ "เ" */
const initialOf = (text: string) => text.replace(/^[เแโใไ]+/, '').slice(0, 1).toUpperCase() || text.slice(0, 1);

type Period = { mentorId: string; startsAt: Date; endsAt: Date; source: string };
const overlaps = (p: Period, start: Date, end: Date) => p.startsAt < end && p.endsAt > start;

risingStar.get('/', async (c) => {
  const now = new Date();
  const months = [0, -1, -2].map((offset) => bangkokMonth(now, offset));
  const [thisMonth, , twoAgo] = months;

  const [allMentors, periods, monthRatings] = await Promise.all([
    db.select({
      id: mentors.id, name: mentors.name, avatar: mentors.avatar, bio: mentors.bio,
      focus: mentors.weeklyFocus, price: mentors.price, minutes: mentors.minutes,
    }).from(mentors),
    db.select({ mentorId: risingStarPeriods.mentorId, startsAt: risingStarPeriods.startsAt, endsAt: risingStarPeriods.endsAt, source: risingStarPeriods.source })
      .from(risingStarPeriods).where(gt(risingStarPeriods.endsAt, twoAgo.start)),
    Promise.all(months.map((month) => ratingsBetween(month.start, month.end))),
  ]);

  const byId = new Map(allMentors.map((mentor) => [mentor.id, mentor]));
  const nameOf = (id: string) => byId.get(id)!.name;
  const card = (id: string, ratings: Map<string, Rating>) => {
    const mentor = byId.get(id)!;
    return {
      id: mentor.id, name: mentor.name, initial: initialOf(mentor.avatar || mentor.name),
      specialty: mentor.focus ?? mentor.bio, price: mentor.price, minutes: mentor.minutes,
      rating: ratingJson(ratings.get(id)),
    };
  };

  const hall = months.map((month, index) => {
    const ratings = monthRatings[index];
    // ติดทำเนียบได้ต้องเป็นสมาชิกในเดือนนั้นและมีรีวิวอย่างน้อยหนึ่งอัน
    const members = [...new Set(periods.filter((p) => overlaps(p, month.start, month.end)).map((p) => p.mentorId))]
      .filter((id) => byId.has(id) && ratings.has(id))
      .sort(byRating(ratings, nameOf))
      .slice(0, HALL_SIZE);
    return {
      month: month.key,
      closesAt: month === thisMonth ? month.end.toISOString() : null,
      top: members.map((id, rank) => ({ rank: rank + 1, ...card(id, ratings) })),
    };
  });

  const current = monthRatings[0];
  const order = byRating(current, nameOf);
  const activeIds = new Set(periods.filter((p) => p.startsAt <= now && p.endsAt > now).map((p) => p.mentorId));
  const ranked = [...activeIds].filter((id) => byId.has(id)).sort(order)
    .map((id, index) => ({ rank: index + 1, ...card(id, current) }));
  const others = allMentors.filter((mentor) => !activeIds.has(mentor.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'th'))
    .map((mentor) => card(mentor.id, current));

  /* ถ้าคนที่เปิดหน้าเป็นเมนเทอร์ ส่งข้อมูลของเขาไปด้วย การ์ดชวนสมัครจะบอกได้ว่า
     "คะแนนเดือนนี้ของคุณเท่าไร ถ้าสมัครจะอยู่อันดับไหน" จากข้อมูลจริง */
  let viewer = null;
  const user = c.get('user');
  if (user) {
    const [own] = await db.select({ mentorId: mentorSubmissions.publishedMentorId }).from(mentorSubmissions)
      .where(and(eq(mentorSubmissions.userId, user.id), eq(mentorSubmissions.status, 'published'))).limit(1);
    if (own?.mentorId && byId.has(own.mentorId)) {
      const mine = own.mentorId;
      const active = periods.find((p) => p.mentorId === mine && p.startsAt <= now && p.endsAt > now);
      viewer = {
        mentorId: mine,
        active: Boolean(active),
        activeUntil: active?.endsAt.toISOString() ?? null,
        rating: ratingJson(current.get(mine)),
        projectedRank: ranked.filter((row) => row.id !== mine && order(row.id, mine) < 0).length + 1,
      };
    }
  }

  // มีช่วงสมาชิกตัวอย่างอยู่ในสามเดือนนี้ หน้าเว็บจะติดป้ายว่าอันดับยังไม่ใช่ข้อมูลจริง
  const demo = periods.some((p) => p.source === 'demo');

  c.header('Cache-Control', 'private, no-store');
  return c.json({ hall, ranked, others, viewer, demo });
});
