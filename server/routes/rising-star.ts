import { Hono } from 'hono';
import { and, desc, eq, gt, gte, inArray, isNotNull, lt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { consultations, mentorExperiences, mentorSkills, mentorSubmissions, mentors, risingStarPeriods } from '../db/schema.js';
import { skillGroups } from '../../src/data/matching.js';
import type { SkillGroup } from '../../src/data/matching.js';
import type { AppEnv } from '../lib/guards.js';
import { bangkokMonth, byRating, ratingJson, ratingsBetween } from '../lib/ratings.js';
import type { Rating } from '../lib/ratings.js';
import { billingEnabled, membershipOf } from '../lib/billing.js';

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
// ช่วงศูนย์วัน (คืนเงินก่อนเริ่ม) ไม่นับ
const overlaps = (p: Period, start: Date, end: Date) => p.endsAt > p.startsAt && p.startsAt < end && p.endsAt > start;

/* ผลงานที่เด่นที่สุดของเมนเทอร์แต่ละคน ใช้บนการ์ดหน้าแรก นับเฉพาะประสบการณ์ที่ตรวจแล้ว
   ได้รางวัลก่อน แล้วเข้ารอบ ผลอื่น และเข้าร่วม ผลเท่ากันเอาปีล่าสุด */
const resultOrder = { winner: 0, finalist: 1, other: 2, participant: 3 } as const;
type Credit = { result: keyof typeof resultOrder; name: string; year: string };

async function creditsOf(ids: string[]) {
  const credits = new Map<string, Credit>();
  if (!ids.length) return credits;
  const rows = await db.select({ mentorId: mentorExperiences.mentorId, result: mentorExperiences.result, name: mentorExperiences.name, year: mentorExperiences.year })
    .from(mentorExperiences).where(and(inArray(mentorExperiences.mentorId, ids), eq(mentorExperiences.status, 'verified')));
  for (const row of rows) {
    const best = credits.get(row.mentorId);
    if (!best || resultOrder[row.result] < resultOrder[best.result] || (resultOrder[row.result] === resultOrder[best.result] && row.year > best.year)) {
      credits.set(row.mentorId, row);
    }
  }
  return credits;
}
const creditJson = (credit: Credit | undefined) => (credit ? { result: credit.result, name: credit.name } : null);

/* สายของเมนเทอร์สำหรับตัวกรองอันดับบนหน้าแรก (spec ข้อ 13) ดูจากกลุ่มทักษะที่มีมากที่สุด
   ธุรกิจและการนำเสนอ = business, ออกแบบ = design, ที่เหลือ = technology, ไม่มีทักษะ = ไม่มีสาย */
type Field = 'business' | 'technology' | 'design';
const fieldOfGroup = (group: SkillGroup): Field => (group === 'business' || group === 'pitch' ? 'business' : group === 'design' ? 'design' : 'technology');
const groupOfTag = new Map<string, SkillGroup>(
  (Object.entries(skillGroups) as [SkillGroup, readonly string[]][]).flatMap(([group, tags]) => tags.map((tag) => [tag, group] as const)),
);

async function fieldsOf(ids: string[]) {
  const fields = new Map<string, Field>();
  if (!ids.length) return fields;
  const rows = await db.select({ mentorId: mentorSkills.mentorId, tag: mentorSkills.tag }).from(mentorSkills).where(inArray(mentorSkills.mentorId, ids));
  const counts = new Map<string, Map<Field, number>>();
  for (const row of rows) {
    const group = groupOfTag.get(row.tag);
    if (!group) continue;
    const field = fieldOfGroup(group);
    const mine = counts.get(row.mentorId) ?? new Map<Field, number>();
    mine.set(field, (mine.get(field) ?? 0) + 1);
    counts.set(row.mentorId, mine);
  }
  for (const [id, mine] of counts) fields.set(id, [...mine].sort((a, b) => b[1] - a[1])[0][0]);
  return fields;
}

/* การ์ด "เมนเทอร์ใหม่" บนหน้าแรก: เมนเทอร์ที่เผยแพร่ล่าสุดก่อน (ผู้ใช้ขอ 5 ต.ค. 2569)
   แถวในตาราง mentors เกิดตอนทีมงานอนุมัติใบสมัคร createdAt จึงเป็นวันที่เข้าร่วม
   ส่งชื่อ ผลงานเด่น เรื่องที่ช่วยได้ และราคา ไม่มีช่องทางติดต่อ */
const NEWEST = 10;

risingStar.get('/newest', async (c) => {
  const rows = await db.select({
    id: mentors.id, name: mentors.name, avatar: mentors.avatar, bio: mentors.bio, focus: mentors.weeklyFocus, photoUrl: mentors.photoUrl,
    headline: mentors.headline, helpsWith: mentors.helpsWith, price: mentors.price, minutes: mentors.minutes, unit: mentors.priceUnit, createdAt: mentors.createdAt,
  }).from(mentors).orderBy(desc(mentors.createdAt), mentors.id).limit(NEWEST);
  const credits = await creditsOf(rows.map((row) => row.id));
  c.header('Cache-Control', 'public, max-age=60');
  return c.json({
    items: rows.map((mentor) => ({
      id: mentor.id, name: mentor.name, initial: initialOf(mentor.avatar || mentor.name), specialty: mentor.focus ?? mentor.bio, photoUrl: mentor.photoUrl,
      headline: mentor.headline, helpsWith: mentor.helpsWith.slice(0, 2), price: mentor.price, minutes: mentor.minutes, unit: mentor.unit,
      joinedAt: mentor.createdAt.toISOString(), credit: creditJson(credits.get(mentor.id)),
    })),
  });
});

/* อันดับ Rising Star บนหน้าแรก (spec ข้อ 13): เฉพาะคนที่เป็นสมาชิกในเดือนนั้น เรียงตามรีวิวของเดือน
   ด้วยกติกาเดิม (byRating) เลือกได้เดือนนี้หรือเดือนที่แล้ว ตัวกรองสายทำที่หน้าเว็บ */
risingStar.get('/board', async (c) => {
  const now = new Date();
  const last = c.req.query('period') === 'last';
  const month = bangkokMonth(now, last ? -1 : 0);
  const [periods, ratings] = await Promise.all([
    db.select({ mentorId: risingStarPeriods.mentorId, startsAt: risingStarPeriods.startsAt, endsAt: risingStarPeriods.endsAt, source: risingStarPeriods.source })
      .from(risingStarPeriods).where(gt(risingStarPeriods.endsAt, month.start)),
    ratingsBetween(month.start, month.end),
  ]);
  const inMonth = periods.filter((p) => overlaps(p, month.start, month.end));
  const ids = [...new Set(inMonth.map((p) => p.mentorId))];
  const rows = ids.length ? await db.select({
    id: mentors.id, name: mentors.name, avatar: mentors.avatar, bio: mentors.bio, focus: mentors.weeklyFocus, photoUrl: mentors.photoUrl, headline: mentors.headline,
  }).from(mentors).where(inArray(mentors.id, ids)) : [];
  const found = rows.map((row) => row.id);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const [credits, fields, sessions] = await Promise.all([
    creditsOf(found),
    fieldsOf(found),
    found.length ? db.select({ mentorId: consultations.mentorId }).from(consultations).where(and(
      inArray(consultations.mentorId, found), gte(consultations.confirmedAt, month.start), lt(consultations.confirmedAt, month.end),
    )) : Promise.resolve([] as { mentorId: string }[]),
  ]);
  const sessionCount = new Map<string, number>();
  for (const row of sessions) sessionCount.set(row.mentorId, (sessionCount.get(row.mentorId) ?? 0) + 1);

  const items = [...found].sort(byRating(ratings, (id) => byId.get(id)!.name)).map((id, index) => {
    const mentor = byId.get(id)!;
    return {
      rank: index + 1, id, name: mentor.name, initial: initialOf(mentor.avatar || mentor.name), photoUrl: mentor.photoUrl,
      headline: mentor.headline || (mentor.focus ?? mentor.bio), field: fields.get(id) ?? null, credit: creditJson(credits.get(id)),
      rating: ratingJson(ratings.get(id)), sessions: sessionCount.get(id) ?? 0,
    };
  });

  // คนที่เปิดหน้าเป็นเมนเทอร์แต่ยังไม่เป็นสมาชิก เห็นกล่องชวนสมัคร Rising Star
  let viewer = null;
  const user = c.get('user');
  if (user) {
    const [own] = await db.select({ mentorId: mentorSubmissions.publishedMentorId }).from(mentorSubmissions)
      .where(and(eq(mentorSubmissions.userId, user.id), eq(mentorSubmissions.status, 'published'), isNotNull(mentorSubmissions.publishedMentorId))).limit(1);
    if (own?.mentorId) {
      const mine = own.mentorId;
      viewer = { member: periods.some((p) => p.mentorId === mine && p.startsAt <= now && p.endsAt > now) };
    }
  }

  c.header('Cache-Control', 'private, no-store');
  return c.json({ month: month.key, closesAt: last ? null : month.end.toISOString(), items, viewer, demo: inMonth.some((p) => p.source === 'demo') });
});

risingStar.get('/', async (c) => {
  const now = new Date();
  const months = [0, -1, -2].map((offset) => bangkokMonth(now, offset));
  const [thisMonth, , twoAgo] = months;

  const [allMentors, periods, monthRatings] = await Promise.all([
    db.select({
      id: mentors.id, name: mentors.name, avatar: mentors.avatar, bio: mentors.bio,
      focus: mentors.weeklyFocus, price: mentors.price, minutes: mentors.minutes, unit: mentors.priceUnit, photoUrl: mentors.photoUrl,
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
      specialty: mentor.focus ?? mentor.bio, price: mentor.price, minutes: mentor.minutes, unit: mentor.unit, photoUrl: mentor.photoUrl,
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
        billing: billingEnabled() ? await (async () => {
          const state = await membershipOf(mine, now);
          return { subscription: state.subscription, canSubscribe: state.canSubscribe, canPrepay: state.canPrepay };
        })() : null,
      };
    }
  }

  // มีช่วงสมาชิกตัวอย่างอยู่ในสามเดือนนี้ หน้าเว็บจะติดป้ายว่าอันดับยังไม่ใช่ข้อมูลจริง
  const demo = periods.some((p) => p.source === 'demo');

  c.header('Cache-Control', 'private, no-store');
  return c.json({ hall, ranked, others, viewer, demo });
});
