import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { and, desc, eq, inArray, isNull, lte, gt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import {
  competitionRequests, competitions, consultations, mentorCompetitionChoices, mentorReviews, mentors,
  mentorSubmissions, risingStarPeriods, users,
} from '../db/schema.js';
import { requireUser, type AppEnv } from '../lib/guards.js';
import { newId } from '../lib/id.js';
import { env } from '../lib/env.js';
import { notify } from '../lib/email.js';
import { bangkokMonth, byRating, ratingJson, ratingsBetween } from '../lib/ratings.js';

/* ติดต่อเมนเทอร์ ยืนยัน และรีวิว (แทนระบบจองกับแชตในเว็บ ผู้ใช้ตัดสิน 30 ก.ย. 2569)

   นักเรียน: กด Contact Mentor → เห็นช่องทางติดต่อ → คุยกันนอกเว็บ → กด "I received guidance"
             → ระบบส่งอีเมลหาเมนเทอร์ → เมนเทอร์กด Confirm → นักเรียนรีวิวได้หนึ่งครั้ง
   เมนเทอร์: Mentor zone เลือกงานแข่งที่รับปรึกษาพร้อมราคา ขอเพิ่มงานแข่ง ยืนยันการปรึกษา

   กันปั๊มคะแนน
   - เห็นช่องทางติดต่อและรีวิวได้เฉพาะบัญชีที่ยืนยันอีเมลแล้ว
   - รีวิวผูกกับการปรึกษาที่เมนเทอร์ยืนยันแล้ว หนึ่งการปรึกษาหนึ่งรีวิว (unique index ในฐานข้อมูล)
   - เมนเทอร์ติดต่อหรือรีวิวตัวเองไม่ได้
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
export const contactBody = z.object({
  contactEmail: z.string().trim().max(200).refine((v) => !v || z.string().email().safeParse(v).success, 'อีเมลติดต่อไม่ถูกต้อง').default(''),
  contactLine: z.string().trim().max(100).default(''),
  contactPhone: z.string().trim().max(40).default(''),
  contactInstagram: z.string().trim().max(100).default(''),
  contactLink: z.string().trim().max(500).refine((v) => !v || /^https?:\/\//i.test(v), 'ลิงก์ต้องขึ้นต้นด้วย https://').default(''),
}).refine((v) => Object.values(v).some(Boolean), 'ใส่ช่องทางติดต่ออย่างน้อยหนึ่งช่อง');

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
const contactsOf = (m: typeof mentors.$inferSelect) => ({
  email: m.contactEmail, line: m.contactLine, phone: m.contactPhone, instagram: m.contactInstagram, link: m.contactLink,
});
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
  let consultation: { id: string; status: string; reviewed: boolean } | null = null;
  let contacts = null;
  if (viewer) {
    const [latest] = await db.select({ id: consultations.id, status: consultations.status }).from(consultations)
      .where(and(eq(consultations.userId, viewer.id), eq(consultations.mentorId, m.id)))
      .orderBy(desc(consultations.createdAt)).limit(1);
    if (latest) {
      const [review] = await db.select({ id: mentorReviews.id }).from(mentorReviews).where(eq(mentorReviews.consultationId, latest.id));
      consultation = { ...latest, reviewed: Boolean(review) };
    }
    // ช่องทางติดต่อเปิดให้เฉพาะคนที่ยืนยันอีเมลแล้วและเคยกด Contact Mentor กับเมนเทอร์คนนี้
    if (viewer.emailVerified && latest && latest.status !== 'cancelled') contacts = contactsOf(m);
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
    consultation,
    contacts,
  });
});

consult.post('/mentors/:id/contact', requireUser, async (c) => {
  const user = c.get('user')!;
  if (!user.emailVerified) return fail('ยืนยันอีเมลก่อนจึงจะเห็นช่องทางติดต่อ', 403);
  const [row] = await approvedMentors([c.req.param('id')]);
  if (!row) return fail('ไม่พบเมนเทอร์', 404);
  if (row.userId === user.id) return fail('ติดต่อตัวเองไม่ได้');
  const body = await parse(c, z.object({ competition: z.string().max(200).nullish() }).nullable()) ?? {};
  let competitionId: string | null = null;
  if (body.competition) {
    const [event] = await db.select({ id: competitions.id }).from(competitions).where(eq(competitions.slug, body.competition)).limit(1);
    competitionId = event?.id ?? null;
  }
  // เปิดค้างได้รายการเดียวต่อคู่ (unique index) กดซ้ำได้รายการเดิมกลับมา
  const [created] = await db.insert(consultations)
    .values({ id: newId('cns'), userId: user.id, mentorId: row.mentor.id, competitionId })
    .onConflictDoNothing().returning({ id: consultations.id, status: consultations.status });
  const open = created ?? (await db.select({ id: consultations.id, status: consultations.status }).from(consultations)
    .where(and(eq(consultations.userId, user.id), eq(consultations.mentorId, row.mentor.id), inArray(consultations.status, ['active', 'claimed'])))
    .limit(1))[0];
  return c.json({ consultation: open, contacts: contactsOf(row.mentor) }, created ? 201 : 200);
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
  return c.json({
    emailVerified: user.emailVerified,
    items: rows.map((r) => ({
      id: r.consultation.id, status: r.consultation.status, createdAt: r.consultation.createdAt,
      claimedAt: r.consultation.claimedAt, confirmedAt: r.consultation.confirmedAt,
      mentor: card(r.mentor), competition: r.competitionSlug ? { slug: r.competitionSlug, name: r.competitionName } : null,
      review: r.reviewId ? { stars: r.stars } : null,
    })),
  });
});

/** เปลี่ยนสถานะเฉพาะเมื่อสถานะเดิมตรง กดซ้ำหรือพร้อมกันได้ผลครั้งเดียว */
async function transition(id: string, where: ReturnType<typeof and>, set: Partial<typeof consultations.$inferInsert>) {
  const [row] = await db.update(consultations).set(set).where(and(eq(consultations.id, id), where)).returning();
  return row ?? null;
}

consult.post('/:id/claim', requireUser, async (c) => {
  const user = c.get('user')!;
  const row = await transition(c.req.param('id'), and(eq(consultations.userId, user.id), eq(consultations.status, 'active')), { status: 'claimed', claimedAt: new Date() });
  if (!row) return fail('รายการนี้ส่งไปแล้วหรือปิดไปแล้ว', 409);
  const [owner] = await db.select({ email: users.email, name: mentors.name }).from(mentors)
    .innerJoin(mentorSubmissions, and(eq(mentorSubmissions.publishedMentorId, mentors.id), eq(mentorSubmissions.status, 'published')))
    .innerJoin(users, eq(users.id, mentorSubmissions.userId))
    .where(eq(mentors.id, row.mentorId)).limit(1);
  if (owner) {
    await notify(owner.email, `${user.name} ขอให้ยืนยันการปรึกษา / Please confirm a consultation`,
      `${user.name} บอกว่าได้รับคำแนะนำจากคุณแล้ว กดยืนยันได้ที่ Mentor zone\n${user.name} says you gave them guidance. Confirm it in your Mentor zone:\n\n${env.appOrigin}/mentor-zone#confirm-${row.id}`);
  }
  return c.json({ ok: true, status: row.status });
});

consult.post('/:id/cancel', requireUser, async (c) => {
  const user = c.get('user')!;
  const row = await transition(c.req.param('id'), and(eq(consultations.userId, user.id), inArray(consultations.status, ['active', 'claimed'])), { status: 'cancelled', cancelledAt: new Date() });
  if (!row) return fail('ยกเลิกไม่ได้ เมนเทอร์ยืนยันแล้วหรือรายการปิดไปแล้ว', 409);
  return c.json({ ok: true, status: row.status });
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
  if (row.status !== 'confirmed') return fail('รีวิวได้หลังเมนเทอร์ยืนยันการปรึกษาแล้ว', 409);
  const owner = await ownMentor(user.id);
  if (owner?.id === row.mentorId) return fail('รีวิวตัวเองไม่ได้', 403);
  const [created] = await db.insert(mentorReviews)
    .values({ id: newId('rvw'), consultationId: row.id, userId: user.id, mentorId: row.mentorId, stars: body.stars, comment: body.comment })
    .onConflictDoNothing().returning({ id: mentorReviews.id });
  if (!created) return fail('รีวิวการปรึกษานี้ไปแล้ว', 409);
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
    db.select({ id: consultations.id, status: consultations.status, claimedAt: consultations.claimedAt, createdAt: consultations.createdAt, student: users.name })
      .from(consultations).innerJoin(users, eq(users.id, consultations.userId))
      .where(and(eq(consultations.mentorId, mentor.id), inArray(consultations.status, ['active', 'claimed'])))
      .orderBy(desc(consultations.createdAt)),
    ratingsBetween(month.start, month.end),
    activeMemberIds(now),
  ]);
  return c.json({
    mentor: { ...card(mentor), risingStar: members.has(mentor.id), rating: ratingJson(monthly.get(mentor.id)), contacts: contactsOf(mentor), price: mentor.price, minutes: mentor.minutes },
    competitions: chosen,
    available: open,
    requests: requests.map((r) => ({ id: r.id, name: r.name, url: r.url, details: r.details, price: r.price, minutes: r.minutes, status: r.status, reason: r.reason, createdAt: r.createdAt })),
    consultations: pending.map((p) => ({ ...p, student: p.student.split(/\s+/)[0] })),
  });
});

async function requireOwnMentor(userId: string) {
  return await ownMentor(userId) ?? fail('ต้องเป็นเมนเทอร์ที่ผ่านอนุมัติ', 403);
}

consult.patch('/zone/contacts', requireUser, async (c) => {
  const mentor = await requireOwnMentor(c.get('user')!.id);
  const body = await parse(c, contactBody);
  await db.update(mentors).set(body).where(eq(mentors.id, mentor.id));
  return c.json({ ok: true });
});

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
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(competitionRequests)
    .where(and(eq(competitionRequests.mentorId, mentor.id), eq(competitionRequests.status, 'pending')));
  if (count >= 10) return fail('มีคำขอรอตรวจอยู่ 10 รายการแล้ว รอทีมงานตรวจก่อน', 409);
  const id = newId('creq');
  await db.insert(competitionRequests).values({ id, mentorId: mentor.id, userId: user.id, ...body });
  return c.json({ id }, 201);
});

consult.post('/:id/confirm', requireUser, async (c) => {
  const mentor = await requireOwnMentor(c.get('user')!.id);
  const row = await transition(c.req.param('id'), and(eq(consultations.mentorId, mentor.id), eq(consultations.status, 'claimed')), { status: 'confirmed', confirmedAt: new Date() });
  if (!row) return fail('ยืนยันไม่ได้ นักเรียนยังไม่ได้กดว่าได้รับคำแนะนำ หรือรายการปิดไปแล้ว', 409);
  return c.json({ ok: true, status: row.status });
});
