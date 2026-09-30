import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, like } from 'drizzle-orm';
import { app } from '../server/app';
import { db, client } from '../server/db/client';
import {
  competitionRequests, competitions, emailLog, mentorCompetitionChoices, mentorReviews, mentorSubmissions,
  mentors, sessions, users,
} from '../server/db/schema';
import { testDatabase } from '../server/lib/database-safety';
import { createSession } from '../server/lib/session';

/* ติดต่อเมนเทอร์ → นักเรียนกดได้รับคำแนะนำ → เมนเทอร์ยืนยัน → รีวิว
   เรื่องที่ต้องถูกคือสิทธิ์และลำดับขั้น เพราะเป็นสิ่งที่กันการปั๊มคะแนน Rising Star
   เทสนี้สร้างเมนเทอร์ เวที และบัญชีของตัวเองทั้งหมด ไม่พึ่งข้อมูลตัวอย่างที่เทสอื่นล้างทิ้งได้ */

testDatabase(process.env);

const prefix = `consult-${randomUUID().slice(0, 8)}`;
const userIds: string[] = [];

async function account(role: 'member' | 'reviewer' = 'member', verified = false) {
  const id = `${prefix}-u${userIds.length}`;
  await db.insert(users).values({
    id, email: `${id}@championways.test`, name: `ทดสอบ${userIds.length} นามสกุล`, role,
    emailVerifiedAt: verified ? new Date() : null,
  });
  userIds.push(id);
  return { id, email: `${id}@championways.test`, cookie: `cw_session=${(await createSession(id)).id}` };
}

const call = (path: string, cookie = '', method = 'GET', body?: unknown) => app.request(`/api${path}`, {
  method,
  headers: { cookie, 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

test('contact, confirm and review a mentor', async (t) => {
  const mentorId = `${prefix}-mentor`;
  const slug = `${prefix}-event`;
  const otherSlug = `${prefix}-event-2`;
  const mentorUser = await account('member', true);
  const student = await account();
  const reviewer = await account('reviewer', true);

  for (const [id, s] of [[`${prefix}-cmp`, slug], [`${prefix}-cmp2`, otherSlug]]) {
    await db.insert(competitions).values({
      id, slug: s, name: `เวทีทดสอบ ${s}`, description: 'ทดสอบ', type: 'contest', org: 'ทีมทดสอบ', closesAt: '2099-01-01',
      region: 'online', prizeValue: 0, prizeNote: 'ใบประกาศ', teamMin: 1, teamMax: 3, keywords: [],
      sourceUrl: 'https://example.test', source: 'editorial', lastVerifiedAt: '2026-09-30',
    });
  }
  await db.insert(mentors).values({
    id: mentorId, name: 'พี่ทดสอบ ท.', avatar: 'ท', bio: 'ทดสอบ', replyTime: '1 วัน', topics: [], best: 'ทดสอบ', cannot: 'ทดสอบ',
    contactLine: 'test.line', price: 500, minutes: 60,
  });
  await db.insert(mentorSubmissions).values({
    id: `${prefix}-ms`, status: 'published', userId: mentorUser.id, publishedMentorId: mentorId,
    firstName: 'ทดสอบ', lastName: 'ท', nickname: 'ท', email: mentorUser.email, phone: '', occupation: 'working',
    organization: 'ทดสอบ', role: 'ทดสอบ', experience: 'ทดสอบ', best: 'ทดสอบ', cannot: 'ทดสอบ', topics: [],
  });

  try {
    let consultationId = '';

    await t.test('an unverified account cannot see contacts until it verifies its email', async () => {
      assert.equal((await call(`/consult/mentors/${mentorId}/contact`, student.cookie, 'POST', {})).status, 403);
      const mentorPage = await (await call(`/consult/mentors/${mentorId}`, student.cookie)).json();
      assert.equal(mentorPage.contacts, null);

      assert.equal((await call('/auth/email/verify/send', student.cookie, 'POST', {})).status, 200);
      // ขอซ้ำทันทีโดนหน่วงเวลา กันยิงอีเมลรัว ๆ
      assert.equal((await call('/auth/email/verify/send', student.cookie, 'POST', {})).status, 429);
      const [mail] = await db.select().from(emailLog).where(eq(emailLog.to, student.email)).orderBy(desc(emailLog.sentAt)).limit(1);
      const token = mail.body.match(/token=([\w-]+)/)![1];
      assert.equal((await call('/auth/email/verify', '', 'POST', { token })).status, 200);
      // ใช้ลิงก์เดิมซ้ำไม่ได้
      assert.equal((await call('/auth/email/verify', '', 'POST', { token })).status, 400);
      const me = await (await call('/auth/me', student.cookie)).json();
      assert.equal(me.user.emailVerified, true);
    });

    await t.test('contact opens one consultation and shows the channels, with "-" left to the page', async () => {
      const first = await call(`/consult/mentors/${mentorId}/contact`, student.cookie, 'POST', { competition: slug });
      assert.equal(first.status, 201);
      const body = await first.json();
      consultationId = body.consultation.id;
      assert.deepEqual(body.contacts, { email: '', line: 'test.line', phone: '', instagram: '', link: '' });
      const again = await call(`/consult/mentors/${mentorId}/contact`, student.cookie, 'POST', {});
      assert.equal(again.status, 200);
      assert.equal((await again.json()).consultation.id, consultationId);
      // เมนเทอร์ติดต่อตัวเองไม่ได้
      assert.equal((await call(`/consult/mentors/${mentorId}/contact`, mentorUser.cookie, 'POST', {})).status, 400);
    });

    await t.test('reviews wait for the mentor to confirm, and only the mentor can confirm', async () => {
      assert.equal((await call(`/consult/${consultationId}/review`, student.cookie, 'POST', { stars: 5 })).status, 409);
      // ยังไม่ได้กดได้รับคำแนะนำ เมนเทอร์ยืนยันไม่ได้
      assert.equal((await call(`/consult/${consultationId}/confirm`, mentorUser.cookie, 'POST', {})).status, 409);
      assert.equal((await call(`/consult/${consultationId}/claim`, student.cookie, 'POST', {})).status, 200);
      assert.equal((await call(`/consult/${consultationId}/claim`, student.cookie, 'POST', {})).status, 409);
      const [mail] = await db.select().from(emailLog).where(eq(emailLog.to, mentorUser.email)).orderBy(desc(emailLog.sentAt)).limit(1);
      assert.match(mail.body, /mentor-zone/);
      // นักเรียนยืนยันเองไม่ได้ และคนอื่นก็ไม่ได้
      assert.equal((await call(`/consult/${consultationId}/confirm`, student.cookie, 'POST', {})).status, 403);
      assert.equal((await call(`/consult/${consultationId}/confirm`, reviewer.cookie, 'POST', {})).status, 403);
      assert.equal((await call(`/consult/${consultationId}/confirm`, mentorUser.cookie, 'POST', {})).status, 200);
      assert.equal((await call(`/consult/${consultationId}/cancel`, student.cookie, 'POST', {})).status, 409);
    });

    await t.test('one review per confirmed consultation, stars 1 to 5, by the student only', async () => {
      assert.equal((await call(`/consult/${consultationId}/review`, student.cookie, 'POST', { stars: 6 })).status, 400);
      assert.equal((await call(`/consult/${consultationId}/review`, reviewer.cookie, 'POST', { stars: 5 })).status, 404);
      assert.equal((await call(`/consult/${consultationId}/review`, student.cookie, 'POST', { stars: 4, comment: 'ดีมาก' })).status, 201);
      assert.equal((await call(`/consult/${consultationId}/review`, student.cookie, 'POST', { stars: 5 })).status, 409);
      const mine = await (await call('/consult/mine', student.cookie)).json();
      assert.deepEqual(mine.items.map((i: { status: string; review: unknown }) => [i.status, i.review]), [['confirmed', { stars: 4 }]]);
      const page = await (await call(`/consult/mentors/${mentorId}`, student.cookie)).json();
      assert.deepEqual(page.mentor.rating, { average: 4, reviews: 1 });
      assert.equal(page.reviews[0].name, 'ทดสอบ1');
    });

    await t.test('a hidden review stops counting', async () => {
      const [review] = await db.select().from(mentorReviews).where(eq(mentorReviews.mentorId, mentorId));
      assert.equal((await call(`/admin/reviews/${review.id}/visibility`, reviewer.cookie, 'POST', { hidden: true })).status, 200);
      const page = await (await call(`/consult/mentors/${mentorId}`)).json();
      assert.deepEqual(page.mentor.rating, { average: null, reviews: 0 });
      assert.equal(page.reviews.length, 0);
      await call(`/admin/reviews/${review.id}/visibility`, reviewer.cookie, 'POST', { hidden: false });
    });

    await t.test('the student can cancel an open consultation, then contact again', async () => {
      const again = await (await call(`/consult/mentors/${mentorId}/contact`, student.cookie, 'POST', {})).json();
      assert.notEqual(again.consultation.id, consultationId);
      assert.equal((await call(`/consult/${again.consultation.id}/cancel`, student.cookie, 'POST', {})).status, 200);
      assert.equal((await call(`/consult/${again.consultation.id}/claim`, student.cookie, 'POST', {})).status, 409);
    });

    await t.test('mentor zone: price per competition shows on the competition page', async () => {
      assert.equal((await call('/consult/zone', student.cookie)).status, 200);
      assert.equal((await (await call('/consult/zone', student.cookie)).json()).mentor, null);
      assert.equal((await call(`/consult/zone/competitions/${slug}`, student.cookie, 'PUT', { price: 10, minutes: 1 })).status, 403);
      assert.equal((await call(`/consult/zone/competitions/${slug}`, mentorUser.cookie, 'PUT', { price: 10, minutes: 0 })).status, 400);
      assert.equal((await call(`/consult/zone/competitions/${slug}`, mentorUser.cookie, 'PUT', { price: 10, minutes: 1 })).status, 200);
      const listed = await (await call(`/consult/competitions/${slug}/mentors`)).json();
      const entry = [...listed.risingStar, ...listed.others].find((m: { id: string }) => m.id === mentorId);
      assert.equal(entry.price, 10);
      assert.equal(entry.minutes, 1);
      assert.equal((await call(`/consult/zone/competitions/${slug}`, mentorUser.cookie, 'DELETE')).status, 200);
      const after = await (await call(`/consult/competitions/${slug}/mentors`)).json();
      assert.ok(![...after.risingStar, ...after.others].some((m: { id: string }) => m.id === mentorId));
    });

    await t.test('contacts need at least one channel', async () => {
      const empty = { contactEmail: '', contactLine: '', contactPhone: '', contactInstagram: '', contactLink: '' };
      assert.equal((await call('/consult/zone/contacts', mentorUser.cookie, 'PATCH', empty)).status, 400);
      assert.equal((await call('/consult/zone/contacts', mentorUser.cookie, 'PATCH', { ...empty, contactLink: 'javascript:alert(1)' })).status, 400);
      assert.equal((await call('/consult/zone/contacts', mentorUser.cookie, 'PATCH', { ...empty, contactInstagram: 'mentor.ig' })).status, 200);
    });

    await t.test('a competition request becomes a listing only after the team approves it', async () => {
      const bad = await call('/consult/zone/requests', mentorUser.cookie, 'POST', { name: 'งานใหม่', url: 'javascript:alert(1)', price: 300, minutes: 30 });
      assert.equal(bad.status, 400);
      const made = await call('/consult/zone/requests', mentorUser.cookie, 'POST', { name: 'งานใหม่', url: 'https://example.test/new', details: 'รายละเอียด', price: 300, minutes: 30 });
      assert.equal(made.status, 201);
      const { id } = await made.json();
      assert.equal((await call(`/admin/competition-requests/${id}/decision`, student.cookie, 'POST', { decision: 'reject', reason: 'x' })).status, 403);
      assert.equal((await call(`/admin/competition-requests/${id}/decision`, reviewer.cookie, 'POST', { decision: 'reject', reason: '' })).status, 400);
      assert.equal((await call(`/admin/competition-requests/${id}/decision`, reviewer.cookie, 'POST', { decision: 'approve', competitionSlug: otherSlug })).status, 200);
      assert.equal((await call(`/admin/competition-requests/${id}/decision`, reviewer.cookie, 'POST', { decision: 'approve', competitionSlug: otherSlug })).status, 409);
      const [choice] = await db.select().from(mentorCompetitionChoices)
        .where(and(eq(mentorCompetitionChoices.mentorId, mentorId), eq(mentorCompetitionChoices.competitionId, `${prefix}-cmp2`)));
      assert.deepEqual([choice.choice, choice.price, choice.minutes], ['help', 300, 30]);
    });
  } finally {
    await db.delete(competitionRequests).where(eq(competitionRequests.mentorId, mentorId));
    await db.delete(mentorSubmissions).where(eq(mentorSubmissions.id, `${prefix}-ms`));
    await db.delete(mentors).where(eq(mentors.id, mentorId));
    await db.delete(competitions).where(like(competitions.id, `${prefix}-%`));
    await db.delete(emailLog).where(inArray(emailLog.to, userIds.map((id) => `${id}@championways.test`)));
    await db.delete(sessions).where(inArray(sessions.userId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
    await client.end();
  }
});
