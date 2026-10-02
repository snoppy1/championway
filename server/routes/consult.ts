import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { and, desc, eq, inArray, isNull, lte, gt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import {
  competitionRequests, competitions, consultations, hirePayments, mentorCompetitionChoices, mentorPayoutAccounts, mentorPayouts,
  mentorReviews, mentors, mentorSubmissions, risingStarPeriods, users,
} from '../db/schema.js';
import { requireUser, type AppEnv } from '../lib/guards.js';
import { unreadByRoom } from './chat.js';
import { completeByMember, dispute, markPaid } from '../lib/hire-money.js';
import { paymentProvider } from '../lib/payments.js';
import { seal, secretBoxReady } from '../lib/secret-box.js';
import { newId } from '../lib/id.js';
import { env } from '../lib/env.js';
import { notify } from '../lib/email.js';
import { bangkokMonth, byRating, ratingJson, ratingsBetween } from '../lib/ratings.js';

/* จ้างเมนเทอร์ผ่านเว็บ (ผู้ใช้ตัดสิน 1 ต.ค. 2569 แทนการติดต่อนอกเว็บ)

   นักเรียน: ส่งคำขอจ้าง (งานแข่ง จำนวนชั่วโมง เวลาที่อยากนัด สิ่งที่อยากให้ช่วย) → รอเมนเทอร์รับ
             → คุยในแชต (routes/chat.ts) → กดเสร็จงาน → รีวิวได้หนึ่งครั้ง
   เมนเทอร์: Mentor zone รับหรือปฏิเสธคำขอ เลือกงานแข่งที่รับปรึกษาพร้อมราคา ขอเพิ่มงานแข่ง
   รอบถัดไป: จ่ายเงินผ่าน Stripe ระหว่าง "รับ" กับ "เปิดแชต" และห้องวิดีโอตามชั่วโมงที่จ้าง

   ช่องทางติดต่อนอกเว็บ (LINE, IG, เบอร์โทร) ไม่ส่งออกจาก API อีกแล้ว คอลัมน์ยังเก็บไว้ในฐานข้อมูล

   กันปั๊มคะแนน
   - จ้างและรีวิวได้เฉพาะบัญชีที่ยืนยันอีเมลแล้ว
   - รีวิวผูกกับงานที่นักเรียนกดเสร็จแล้ว หนึ่งงานหนึ่งรีวิว (unique index ในฐานข้อมูล)
   - เมนเทอร์จ้างหรือรีวิวตัวเองไม่ได้
   - เปลี่ยนสถานะด้วย update แบบมีเงื่อนไขสถานะเดิม กดซ้ำหรือกดพร้อมกันจึงไม่เกิดผลสองครั้ง */

export const consult = new Hono<AppEnv>();
consult.use('*', async (c, next) => {
  c.header('Cache-Control', 'private, no-store');
  const origin = c.req.header('origin');
  if (c.req.method !== 'GET' && origin && origin !== env.appOrigin) return c.json({ error: 'คำขอต้องมาจากเว็บนี้' }, 403);
  await next();
});

type Status = 400 | 401 | 403 | 404 | 409;
const fail = (message: string, status: Status = 400): never => { throw new HTTPException(status, { message }); };
async function parse<T>(c: { req: { json: () => Promise<unknown> } }, schema: z.ZodType<T>) {
  const result = schema.safeParse(await c.req.json().catch(() => null));
  if (!result.success) return fail(result.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง');
  return result.data;
}

/** ราคา: บาทกับนาที อัตราเล็ก ๆ อย่าง 10 บาท / 1 นาที ก็ได้ */
const priceBody = z.object({
  price: z.number().int().min(0, 'ราคาต้องไม่ติดลบ').max(100000),
  minutes: z.number().int().min(1, 'ความยาวอย่างน้อย 1 นาที').max(600),
});
/** เมนเทอร์ที่ผ่านอนุมัติและผูกกับบัญชีแล้ว พร้อม user id ของเจ้าของ */
async function approvedMentors(ids?: string[]) {
  return db.select({ mentor: mentors, userId: mentorSubmissions.userId, experience: mentorSubmissions.experience })
    .from(mentors)
    .innerJoin(mentorSubmissions, and(eq(mentorSubmissions.publishedMentorId, mentors.id), eq(mentorSubmissions.status, 'published')))
    .where(and(sql`${mentorSubmissions.userId} is not null`, ids ? inArray(mentors.id, ids) : undefined));
}
async function ownMentor(userId: string) {
  const [row] = await db.select({ mentor: mentors }).from(mentors)
    .innerJoin(mentorSubmissions, and(eq(mentorSubmissions.publishedMentorId, mentors.id), eq(mentorSubmissions.status, 'published')))
    .where(eq(mentorSubmissions.userId, userId)).limit(1);
  return row?.mentor ?? null;
}
async function activeMemberIds(now = new Date()) {
  const rows = await db.select({ mentorId: risingStarPeriods.mentorId }).from(risingStarPeriods)
    .where(and(lte(risingStarPeriods.startsAt, now), gt(risingStarPeriods.endsAt, now)));
  return new Set(rows.map((row) => row.mentorId));
}
const card = (m: typeof mentors.$inferSelect) => ({
  id: m.id, name: m.name, initial: m.avatar.replace(/^[เแโใไ]+/, '').slice(0, 1) || m.avatar.slice(0, 1),
  specialty: m.weeklyFocus ?? m.bio, verified: m.verified,
});

/* ---------- ใครเป็นเมนเทอร์ และรายชื่องานที่เลือกได้ ---------- */

/** แถบบนใช้ตัดสินว่าจะโชว์ Mentor zone หรือ Consulting */
consult.get('/me', async (c) => {
  const user = c.get('user');
  const mentor = user ? await ownMentor(user.id) : null;
  return c.json({ mentorId: mentor?.id ?? null });
});

/** งานที่ยังเปิดรับสมัคร ใช้ในฟอร์มสมัครเมนเทอร์ให้ติ๊กเลือก ไม่มีข้อมูลส่วนตัว เปิดสาธารณะได้ */
consult.get('/open-competitions', async (c) => {
  const rows = await db.select({ slug: competitions.slug, name: competitions.name, org: competitions.org, closesAt: competitions.closesAt })
    .from(competitions).where(sql`${competitions.closesAt} >= (now() at time zone 'Asia/Bangkok')::date`).orderBy(competitions.closesAt);
  return c.json({ items: rows });
});

/* ---------- หน้างานแข่ง: Available Mentors ---------- */

consult.get('/competitions/:slug/mentors', async (c) => {
  const [event] = await db.select().from(competitions).where(eq(competitions.slug, c.req.param('slug'))).limit(1);
  if (!event) return fail('ไม่พบงานแข่งนี้', 404);
  const choices = await db.select().from(mentorCompetitionChoices)
    .where(and(eq(mentorCompetitionChoices.competitionId, event.id), eq(mentorCompetitionChoices.choice, 'help')));
  const rows = choices.length ? await approvedMentors(choices.map((row) => row.mentorId)) : [];
  const now = new Date();
  const month = bangkokMonth(now, 0);
  const [ratings, members] = await Promise.all([ratingsBetween(month.start, month.end), activeMemberIds(now)]);
  const byId = new Map(rows.map((row) => [row.mentor.id, row.mentor]));
  const priceOf = new Map(choices.map((row) => [row.mentorId, { price: row.price, minutes: row.minutes }]));
  const entry = (id: string) => ({ ...card(byId.get(id)!), ...priceOf.get(id)!, rating: ratingJson(ratings.get(id)) });
  const ids = [...byId.keys()];
  const risingStar = ids.filter((id) => members.has(id)).sort(byRating(ratings, (id) => byId.get(id)!.name))
    .map((id, index) => ({ rank: index + 1, ...entry(id) }));
  const others = ids.filter((id) => !members.has(id)).sort((a, b) => byId.get(a)!.name.localeCompare(byId.get(b)!.name, 'th'))
    .map(entry);
  return c.json({ competition: { id: event.id, slug: event.slug, name: event.name }, risingStar, others });
});

/* ---------- หน้าเมนเทอร์ ---------- */

consult.get('/mentors/:id', async (c) => {
  const [row] = await approvedMentors([c.req.param('id')]);
  if (!row) return fail('ไม่พบเมนเทอร์', 404);
  const m = row.mentor;
  const now = new Date();
  const month = bangkokMonth(now, 0);
  const [monthly, allTime, members, offered, reviews] = await Promise.all([
    ratingsBetween(month.start, month.end),
    ratingsBetween(new Date(0), now),
    activeMemberIds(now),
    db.select({ slug: competitions.slug, name: competitions.name, closesAt: competitions.closesAt, price: mentorCompetitionChoices.price, minutes: mentorCompetitionChoices.minutes })
      .from(mentorCompetitionChoices).innerJoin(competitions, eq(competitions.id, mentorCompetitionChoices.competitionId))
      .where(and(eq(mentorCompetitionChoices.mentorId, m.id), eq(mentorCompetitionChoices.choice, 'help'))),
    // แสดงชื่อผู้รีวิวแค่ชื่อแรก ไม่เปิดอีเมลหรือบัญชี
    db.select({ stars: mentorReviews.stars, comment: mentorReviews.comment, createdAt: mentorReviews.createdAt, name: users.name })
      .from(mentorReviews).innerJoin(users, eq(users.id, mentorReviews.userId))
      .where(and(eq(mentorReviews.mentorId, m.id), isNull(mentorReviews.hiddenAt)))
      .orderBy(desc(mentorReviews.createdAt)).limit(20),
  ]);

  const viewer = c.get('user');
  let hire: { id: string; status: string; reviewed: boolean; roomId: string | null } | null = null;
  if (viewer) {
    const [latest] = await db.select({ id: consultations.id, status: consultations.status, roomId: consultations.roomId }).from(consultations)
      .where(and(eq(consultations.userId, viewer.id), eq(consultations.mentorId, m.id)))
      .orderBy(desc(consultations.createdAt)).limit(1);
    if (latest) {
      const [review] = await db.select({ id: mentorReviews.id }).from(mentorReviews).where(eq(mentorReviews.consultationId, latest.id));
      hire = { ...latest, reviewed: Boolean(review) };
    }
  }

  return c.json({
    mentor: {
      ...card(m), bio: m.bio, experience: row.experience, best: m.best, cannot: m.cannot,
      risingStar: members.has(m.id), rating: ratingJson(monthly.get(m.id)), allTime: ratingJson(allTime.get(m.id)),
      price: m.price, minutes: m.minutes,
    },
    competitions: offered,
    reviews: reviews.map((r) => ({ stars: r.stars, comment: r.comment, createdAt: r.createdAt, name: r.name.split(/\s+/)[0] })),
    viewer: viewer ? { signedIn: true, emailVerified: viewer.emailVerified, isSelf: row.userId === viewer.id } : null,
    hire,
  });
});

/* ---------- แถบ Consulting ของนักเรียน ---------- */

consult.get('/mine', requireUser, async (c) => {
  const user = c.get('user')!;
  const rows = await db.select({ consultation: consultations, mentor: mentors, competitionName: competitions.name, competitionSlug: competitions.slug, reviewId: mentorReviews.id, stars: mentorReviews.stars })
    .from(consultations)
    .innerJoin(mentors, eq(mentors.id, consultations.mentorId))
    .leftJoin(competitions, eq(competitions.id, consultations.competitionId))
    .leftJoin(mentorReviews, eq(mentorReviews.consultationId, consultations.id))
    .where(eq(consultations.userId, user.id))
    .orderBy(desc(consultations.createdAt));
  // ห้องแชตที่ยังไม่ได้อ่าน ให้แถบ Consulting ขึ้นจุดแจ้งเตือน
  const unread = await unreadByRoom(user.id);
  return c.json({
    emailVerified: user.emailVerified,
    // หน้าเว็บใช้ตัดสินว่าจะโชว์ปุ่มจ่ายเงินหรือข้อความ "ยังไม่เปิดรับชำระเงิน"
    paymentsOpen: paymentProvider() !== null,
    items: rows.map((r) => ({
      id: r.consultation.id, status: r.consultation.status, createdAt: r.consultation.createdAt,
      acceptedAt: r.consultation.acceptedAt, completedAt: r.consultation.completedAt,
      minutes: r.consultation.minutes, price: r.consultation.price, preferredAt: r.consultation.preferredAt,
      note: r.consultation.note, reason: r.consultation.reason,
      roomId: r.consultation.roomId, unread: r.consultation.roomId ? unread.get(r.consultation.roomId) ?? 0 : 0,
      paidAt: r.consultation.paidAt, disputedAt: r.consultation.disputedAt,
      mentor: card(r.mentor), competition: r.competitionSlug ? { slug: r.competitionSlug, name: r.competitionName } : null,
      review: r.reviewId ? { stars: r.stars } : null,
    })),
  });
});

consult.post('/:id/review', requireUser, async (c) => {
  const user = c.get('user')!;
  if (!user.emailVerified) return fail('ยืนยันอีเมลก่อนจึงจะรีวิวได้', 403);
  const body = await parse(c, z.object({
    stars: z.number().int().min(1, 'ให้ดาว 1 ถึง 5').max(5, 'ให้ดาว 1 ถึง 5'),
    comment: z.string().trim().max(1000).default(''),
  }));
  const [row] = await db.select().from(consultations)
    .where(and(eq(consultations.id, c.req.param('id')), eq(consultations.userId, user.id))).limit(1);
  if (!row) return fail('ไม่พบรายการนี้', 404);
  if (row.status !== 'completed') return fail('รีวิวได้หลังกดเสร็จงานแล้ว', 409);
  const owner = await ownMentor(user.id);
  if (owner?.id === row.mentorId) return fail('รีวิวตัวเองไม่ได้', 403);
  const [created] = await db.insert(mentorReviews)
    .values({ id: newId('rvw'), consultationId: row.id, userId: user.id, mentorId: row.mentorId, stars: body.stars, comment: body.comment })
    .onConflictDoNothing().returning({ id: mentorReviews.id });
  if (!created) return fail('รีวิวงานนี้ไปแล้ว', 409);
  return c.json({ ok: true }, 201);
});

/* ---------- Mentor zone ---------- */

consult.get('/zone', requireUser, async (c) => {
  const user = c.get('user')!;
  const mentor = await ownMentor(user.id);
  if (!mentor) return c.json({ mentor: null });
  const now = new Date();
  const month = bangkokMonth(now, 0);
  const [chosen, open, requests, pending, monthly, members] = await Promise.all([
    db.select({ slug: competitions.slug, name: competitions.name, closesAt: competitions.closesAt, price: mentorCompetitionChoices.price, minutes: mentorCompetitionChoices.minutes })
      .from(mentorCompetitionChoices).innerJoin(competitions, eq(competitions.id, mentorCompetitionChoices.competitionId))
      .where(and(eq(mentorCompetitionChoices.mentorId, mentor.id), eq(mentorCompetitionChoices.choice, 'help'))),
    // งานที่ยังเปิดรับสมัคร ให้เลือกมารับปรึกษา
    db.select({ slug: competitions.slug, name: competitions.name, org: competitions.org, closesAt: competitions.closesAt, description: competitions.description, sourceUrl: competitions.sourceUrl })
      .from(competitions).where(sql`${competitions.closesAt} >= (now() at time zone 'Asia/Bangkok')::date`).orderBy(competitions.closesAt),
    db.select().from(competitionRequests).where(eq(competitionRequests.mentorId, mentor.id)).orderBy(desc(competitionRequests.createdAt)),
    db.select({ hire: consultations, student: users.name, competitionName: competitions.name, competitionSlug: competitions.slug })
      .from(consultations).innerJoin(users, eq(users.id, consultations.userId))
      .leftJoin(competitions, eq(competitions.id, consultations.competitionId))
      .where(eq(consultations.mentorId, mentor.id))
      .orderBy(desc(consultations.createdAt)).limit(100),
    ratingsBetween(month.start, month.end),
    activeMemberIds(now),
  ]);
  const unread = await unreadByRoom(user.id);
  const [account] = await db.select().from(mentorPayoutAccounts).where(eq(mentorPayoutAccounts.mentorId, mentor.id));
  const payouts = await db.select({ hireId: mentorPayouts.hireId, status: mentorPayouts.status, amount: mentorPayouts.amount, paidAt: mentorPayouts.paidAt, note: mentorPayouts.note })
    .from(mentorPayouts).where(eq(mentorPayouts.mentorId, mentor.id));
  const payoutOf = new Map(payouts.map((p) => [p.hireId, p]));
  return c.json({
    mentor: { ...card(mentor), risingStar: members.has(mentor.id), rating: ratingJson(monthly.get(mentor.id)), price: mentor.price, minutes: mentor.minutes },
    // เลขบัญชีเต็มไม่ส่งออก แม้แต่เจ้าของ เห็นแค่ 4 ตัวท้าย
    payoutAccount: account ? { accountName: account.accountName, bankCode: account.bankCode, last4: account.accountLast4, status: account.status } : null,
    competitions: chosen,
    available: open,
    requests: requests.map((r) => ({ id: r.id, name: r.name, url: r.url, details: r.details, price: r.price, minutes: r.minutes, status: r.status, reason: r.reason, createdAt: r.createdAt })),
    hires: pending.map(({ hire, student, competitionName, competitionSlug }) => ({
      id: hire.id, status: hire.status, createdAt: hire.createdAt, acceptedAt: hire.acceptedAt, completedAt: hire.completedAt,
      minutes: hire.minutes, price: hire.price, preferredAt: hire.preferredAt, note: hire.note, reason: hire.reason,
      roomId: hire.roomId, unread: hire.roomId ? unread.get(hire.roomId) ?? 0 : 0,
      paidAt: hire.paidAt, disputedAt: hire.disputedAt,
      payout: payoutOf.has(hire.id) ? { status: payoutOf.get(hire.id)!.status, amount: payoutOf.get(hire.id)!.amount, paidAt: payoutOf.get(hire.id)!.paidAt, reference: payoutOf.get(hire.id)!.status === 'paid' ? payoutOf.get(hire.id)!.note : '' } : null,
      student: student.split(/\s+/)[0],
      competition: competitionSlug ? { slug: competitionSlug, name: competitionName } : null,
    })),
  });
});

async function requireOwnMentor(userId: string) {
  return await ownMentor(userId) ?? fail('ต้องเป็นเมนเทอร์ที่ผ่านอนุมัติ', 403);
}

consult.put('/zone/competitions/:slug', requireUser, async (c) => {
  const mentor = await requireOwnMentor(c.get('user')!.id);
  const body = await parse(c, priceBody);
  const [event] = await db.select({ id: competitions.id }).from(competitions).where(eq(competitions.slug, c.req.param('slug'))).limit(1);
  if (!event) return fail('ไม่พบงานแข่งนี้', 404);
  await db.insert(mentorCompetitionChoices).values({ mentorId: mentor.id, competitionId: event.id, choice: 'help', ...body })
    .onConflictDoUpdate({ target: [mentorCompetitionChoices.mentorId, mentorCompetitionChoices.competitionId], set: { choice: 'help', ...body, updatedAt: new Date() } });
  return c.json({ ok: true });
});

consult.delete('/zone/competitions/:slug', requireUser, async (c) => {
  const mentor = await requireOwnMentor(c.get('user')!.id);
  const [event] = await db.select({ id: competitions.id }).from(competitions).where(eq(competitions.slug, c.req.param('slug'))).limit(1);
  if (!event) return fail('ไม่พบงานแข่งนี้', 404);
  await db.delete(mentorCompetitionChoices)
    .where(and(eq(mentorCompetitionChoices.mentorId, mentor.id), eq(mentorCompetitionChoices.competitionId, event.id)));
  return c.json({ ok: true });
});

consult.post('/zone/requests', requireUser, async (c) => {
  const user = c.get('user')!;
  const mentor = await requireOwnMentor(user.id);
  const body = await parse(c, priceBody.extend({
    name: z.string().trim().min(1, 'กรอกชื่องาน').max(200),
    url: z.string().trim().url('ลิงก์ไม่ถูกต้อง').max(500).refine((v) => /^https?:\/\//i.test(v), 'ลิงก์ต้องขึ้นต้นด้วย https://'),
    details: z.string().trim().max(2000).default(''),
  }));
  const id = newId('creq');
  // ล็อกแถวเมนเทอร์ก่อนนับ ส่งพร้อมกันหลายคำขอจะไม่ทะลุเพดาน 10 รายการ (Astra รีวิว 2 ต.ค. 2569)
  await db.transaction(async (tx) => {
    await tx.select({ id: mentors.id }).from(mentors).where(eq(mentors.id, mentor.id)).for('update');
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(competitionRequests)
      .where(and(eq(competitionRequests.mentorId, mentor.id), eq(competitionRequests.status, 'pending')));
    if (count >= 10) return fail('มีคำขอรอตรวจอยู่ 10 รายการแล้ว รอทีมงานตรวจก่อน', 409);
    await tx.insert(competitionRequests).values({ id, mentorId: mentor.id, userId: user.id, ...body });
  });
  return c.json({ id }, 201);
});

/* ---------- จ้างเมนเทอร์ ---------- */

const hireBody = z.object({
  competition: z.string().trim().min(1, 'เลือกงานแข่ง').max(200),
  hours: z.number().int().min(1, 'จ้างอย่างน้อย 1 ชั่วโมง').max(10, 'จ้างได้ไม่เกิน 10 ชั่วโมงต่อครั้ง'),
  preferredAt: z.string().datetime({ offset: true }).nullish(),
  note: z.string().trim().min(1, 'บอกเมนเทอร์สั้น ๆ ว่าอยากให้ช่วยเรื่องอะไร').max(1500),
});

/** อีเมลถึงอีกฝั่ง ล้มเหลวได้โดยไม่ทำให้คำขอพัง (notify จัดการเอง) */
async function mentorEmail(mentorId: string) {
  const [row] = await db.select({ email: users.email, userId: users.id }).from(mentorSubmissions)
    .innerJoin(users, eq(users.id, mentorSubmissions.userId))
    .where(and(eq(mentorSubmissions.publishedMentorId, mentorId), eq(mentorSubmissions.status, 'published'))).limit(1);
  return row ?? null;
}

consult.post('/mentors/:id/hire', requireUser, async (c) => {
  const user = c.get('user')!;
  // ยืนยันอีเมลก่อนจ้าง กันบัญชีปลอมยิงคำขอใส่เมนเทอร์ และใช้อีเมลนี้แจ้งผลการจ้าง
  if (!user.emailVerified) return fail('ยืนยันอีเมลก่อนจึงจะจ้างเมนเทอร์ได้', 403);
  const [row] = await approvedMentors([c.req.param('id')]);
  if (!row) return fail('ไม่พบเมนเทอร์', 404);
  if (row.userId === user.id) return fail('จ้างตัวเองไม่ได้');
  const body = await parse(c, hireBody);
  if (body.preferredAt && new Date(body.preferredAt) <= new Date()) return fail('เลือกเวลาในอนาคต');
  // ราคามาจากงานที่เมนเทอร์เปิดรับเท่านั้น ราคาที่หน้าเว็บส่งมาไม่นับ
  const [offer] = await db.select({ competitionId: competitions.id, name: competitions.name, price: mentorCompetitionChoices.price, minutes: mentorCompetitionChoices.minutes })
    .from(mentorCompetitionChoices).innerJoin(competitions, eq(competitions.id, mentorCompetitionChoices.competitionId))
    .where(and(eq(mentorCompetitionChoices.mentorId, row.mentor.id), eq(mentorCompetitionChoices.choice, 'help'), eq(competitions.slug, body.competition)))
    .limit(1);
  if (!offer || offer.price == null || !offer.minutes) return fail('เมนเทอร์ไม่ได้รับปรึกษางานนี้', 409);
  const minutes = body.hours * 60;
  const price = Math.ceil(offer.price * minutes / offer.minutes);
  // ค้างได้ทีละหนึ่งงานต่อคู่ (unique index) ส่งซ้ำได้งานเดิมกลับมา
  const [created] = await db.insert(consultations).values({
    id: newId('hire'), userId: user.id, mentorId: row.mentor.id, competitionId: offer.competitionId,
    minutes, price, preferredAt: body.preferredAt ? new Date(body.preferredAt) : null, note: body.note,
  }).onConflictDoNothing().returning({ id: consultations.id, status: consultations.status });
  if (!created) return fail('มีงานที่ยังไม่เสร็จกับเมนเทอร์คนนี้อยู่แล้ว ดูได้ที่แถบการปรึกษา', 409);
  const owner = await mentorEmail(row.mentor.id);
  if (owner) {
    await notify(owner.email, `คำขอจ้างใหม่จาก ${user.name} / New hire request`,
      `${user.name} ขอจ้างคุณ ${body.hours} ชั่วโมง สำหรับ ${offer.name} รวม ${price.toLocaleString('th-TH')} บาท\n`
      + `${user.name} wants to hire you for ${body.hours} hour(s) on ${offer.name}, ${price} THB in total.\n\n${env.appOrigin}/mentor-zone#hire-${created.id}`);
  }
  return c.json({ hire: created }, 201);
});

/** เปลี่ยนสถานะเฉพาะเมื่อสถานะเดิมตรง กดซ้ำหรือกดพร้อมกันได้ผลครั้งเดียว */
async function transition(id: string, where: ReturnType<typeof and>, set: Partial<typeof consultations.$inferInsert>) {
  const [row] = await db.update(consultations).set(set).where(and(eq(consultations.id, id), where)).returning();
  return row ?? null;
}
async function emailMember(userId: string, subject: string, body: string) {
  const [member] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  if (member) await notify(member.email, subject, body);
}

consult.post('/:id/accept', requireUser, async (c) => {
  const user = c.get('user')!;
  const mentor = await requireOwnMentor(user.id);
  // รับงานแล้วรอนักเรียนจ่ายเงิน แชตเปิดหลังจ่ายสำเร็จ (lib/hire-money.ts markPaid)
  const row = await transition(c.req.param('id'), and(eq(consultations.mentorId, mentor.id), eq(consultations.status, 'requested')),
    { status: 'accepted', acceptedAt: new Date() });
  if (!row) return fail('คำขอนี้ถูกตอบไปแล้วหรือถูกยกเลิก', 409);
  await emailMember(row.userId, `${mentor.name} รับงานของคุณแล้ว ชำระเงินเพื่อเริ่มงาน / Your mentor accepted — pay to start`,
    `${mentor.name} รับงานแล้ว ชำระเงิน ${row.price.toLocaleString('th-TH')} บาท แล้วแชตจะเปิดให้คุยกัน\n`
    + `${mentor.name} accepted. Pay ${row.price} THB to open the chat.\n\n${env.appOrigin}/consulting#hire-${row.id}`);
  return c.json({ ok: true, status: row.status });
});

consult.post('/:id/decline', requireUser, async (c) => {
  const mentor = await requireOwnMentor(c.get('user')!.id);
  const body = await parse(c, z.object({ reason: z.string().trim().min(1, 'บอกเหตุผลสั้น ๆ ให้นักเรียนทราบ').max(1000) }));
  const row = await transition(c.req.param('id'), and(eq(consultations.mentorId, mentor.id), eq(consultations.status, 'requested')),
    { status: 'declined', reason: body.reason, cancelledAt: new Date() });
  if (!row) return fail('คำขอนี้ถูกตอบไปแล้วหรือถูกยกเลิก', 409);
  await emailMember(row.userId, `${mentor.name} ไม่สะดวกรับงานนี้ / Your mentor declined`, `${body.reason}\n\n${env.appOrigin}/consulting`);
  return c.json({ ok: true, status: row.status });
});

/** ยกเลิกได้ก่อนจ่ายเงินเท่านั้น จ่ายแล้วต้องแจ้งปัญหาให้ทีมงานตัดสิน (เงินจะได้ไม่หายระหว่างทาง) */
consult.post('/:id/cancel', requireUser, async (c) => {
  const user = c.get('user')!;
  const body = await parse(c, z.object({ reason: z.string().trim().max(1000).default('') }).nullable()) ?? { reason: '' };
  const row = await transition(c.req.param('id'), and(eq(consultations.userId, user.id), inArray(consultations.status, ['requested', 'accepted'])),
    { status: 'cancelled', reason: body.reason, cancelledAt: new Date() });
  if (!row) return fail('ยกเลิกไม่ได้ ถ้าจ่ายเงินแล้วให้กดแจ้งปัญหา', 409);
  return c.json({ ok: true, status: row.status });
});

consult.post('/:id/complete', requireUser, async (c) => {
  const hire = await completeByMember(c.req.param('id'), c.get('user')!.id);
  if (!hire) return fail('กดเสร็จงานได้หลังจ่ายเงินแล้วเท่านั้น', 409);
  return c.json({ ok: true, status: 'completed' });
});

consult.post('/:id/dispute', requireUser, async (c) => {
  const body = await parse(c, z.object({ reason: z.string().trim().min(1, 'เล่าสั้น ๆ ว่าเกิดอะไรขึ้น').max(2000) }));
  const row = await dispute(c.req.param('id'), c.get('user')!.id, body.reason);
  if (!row) return fail('แจ้งปัญหาได้เฉพาะงานที่จ่ายแล้วและยังไม่เสร็จ และแจ้งได้ครั้งเดียว', 409);
  return c.json({ ok: true });
});

/* ---------- จ่ายเงิน ---------- */

consult.post('/:id/pay', requireUser, async (c) => {
  const user = c.get('user')!;
  const provider = paymentProvider();
  if (!provider) return fail('ระบบชำระเงินยังไม่เปิด', 409);
  const [hire] = await db.select().from(consultations)
    .where(and(eq(consultations.id, c.req.param('id')), eq(consultations.userId, user.id))).limit(1);
  if (!hire) return fail('ไม่พบงานนี้', 404);
  if (hire.status !== 'accepted') return fail('จ่ายได้หลังเมนเทอร์รับงานแล้ว และจ่ายได้ครั้งเดียว', 409);
  if (hire.price < 1) return fail('ยอดเงินไม่ถูกต้อง', 409);
  // ยอดมาจากแถวการจ้างเสมอ (ราคาที่ล็อกไว้ตอนส่งคำขอ) ไม่รับยอดจากหน้าเว็บ
  const paymentId = newId('pay');
  await db.insert(hirePayments).values({ id: paymentId, hireId: hire.id, provider: provider.name, amount: hire.price });
  const checkout = await provider.createCheckout({
    paymentId, hireId: hire.id, amount: hire.price, email: user.email, description: `ChampionWays hire ${hire.id}`,
  });
  await db.update(hirePayments).set({ providerRef: checkout.providerRef }).where(eq(hirePayments.id, paymentId));
  return c.json({ url: checkout.url, paymentId });
});

/** สถานะการจ่าย ให้หน้าที่ผู้ใช้กลับมาจากหน้าจ่ายเงินใช้ถาม เห็นได้เฉพาะเจ้าของงาน */
consult.get('/payments/:id', requireUser, async (c) => {
  const [row] = await db.select({ payment: hirePayments, hire: consultations }).from(hirePayments)
    .innerJoin(consultations, eq(consultations.id, hirePayments.hireId))
    .where(and(eq(hirePayments.id, c.req.param('id')), eq(consultations.userId, c.get('user')!.id))).limit(1);
  if (!row) return fail('ไม่พบรายการนี้', 404);
  return c.json({
    status: row.payment.status, amount: row.payment.amount, provider: row.payment.provider,
    hire: { id: row.hire.id, status: row.hire.status, roomId: row.hire.roomId },
  });
});

/** ตัวจำลองการจ่ายเงิน ใช้ได้เฉพาะ dev/test ขณะยังไม่มีผู้ให้บริการจริง */
consult.post('/payments/:id/simulate', requireUser, async (c) => {
  const provider = paymentProvider();
  if (provider?.name !== 'simulated') return fail('ไม่พบหน้านี้', 404);
  const [row] = await db.select({ id: hirePayments.id, provider: hirePayments.provider }).from(hirePayments)
    .innerJoin(consultations, eq(consultations.id, hirePayments.hireId))
    .where(and(eq(hirePayments.id, c.req.param('id')), eq(consultations.userId, c.get('user')!.id))).limit(1);
  if (!row || row.provider !== 'simulated') return fail('ไม่พบรายการนี้', 404);
  const result = await markPaid(row.id);
  if (!result) return fail('รายการนี้จ่ายไปแล้วหรือปิดไปแล้ว', 409);
  return c.json({ ok: true, ...result });
});

/* ---------- บัญชีรับเงินของเมนเทอร์ ---------- */

/** ธนาคารที่รองรับ (รหัสตามที่ผู้ให้บริการไทยใช้) */
export const bankCodes = ['bbl', 'kbank', 'ktb', 'scb', 'bay', 'ttb', 'gsb', 'baac', 'uob', 'cimb', 'kk', 'tisco', 'lhb', 'ghb', 'icbc'] as const;

consult.put('/zone/payout-account', requireUser, async (c) => {
  const mentor = await requireOwnMentor(c.get('user')!.id);
  if (!secretBoxReady()) return fail('ระบบเก็บบัญชีรับเงินยังไม่พร้อม แจ้งทีมงาน', 409);
  const body = await parse(c, z.object({
    accountName: z.string().trim().min(2, 'กรอกชื่อบัญชี').max(120),
    bankCode: z.enum(bankCodes, { message: 'เลือกธนาคาร' }),
    accountNumber: z.string().trim().transform((v) => v.replace(/[\s-]/g, '')).pipe(z.string().regex(/^\d{10,15}$/, 'เลขบัญชีต้องเป็นตัวเลข 10–15 หลัก')),
  }));
  const values = {
    accountName: body.accountName, bankCode: body.bankCode,
    accountNumberEncrypted: seal(body.accountNumber), accountLast4: body.accountNumber.slice(-4),
    // แก้บัญชีแล้วต้องตรวจใหม่ ผูกกับผู้ให้บริการใหม่
    providerRecipientId: null, status: 'pending' as const, updatedAt: new Date(),
  };
  await db.insert(mentorPayoutAccounts).values({ mentorId: mentor.id, ...values })
    .onConflictDoUpdate({ target: mentorPayoutAccounts.mentorId, set: values });
  return c.json({ ok: true });
});
