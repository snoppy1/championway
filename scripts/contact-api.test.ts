import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, like, sql } from 'drizzle-orm';
import { app } from '../server/app';
import { db, client } from '../server/db/client';
import {
  competitions, consultationConfirmTokens, consultations, emailLog, mentorSubmissions, mentors, sessions, users,
} from '../server/db/schema';
import { testDatabase } from '../server/lib/database-safety';
import { createSession } from '../server/lib/session';

/* โหมดที่ใช้อยู่ตอนนี้ (ผู้ใช้ตัดสิน 2 ต.ค. 2569): เว็บเป็นตัวกลาง ไม่จ้าง ไม่แชต ไม่รับเงิน
   Contact Mentor → เห็นช่องทางติดต่อ → I received guidance → อีเมลถึงเมนเทอร์ (ลิงก์ยืนยันไม่ต้องล็อกอิน)
   → เมนเทอร์ยืนยัน → นักเรียนรีวิวได้ · เมนเทอร์ตอบว่าไม่ใช่ได้ · ไม่ยืนยันเกิน 3 วันได้อีเมลเตือนครั้งเดียว */

testDatabase(process.env);
delete process.env.HIRING_ENABLED;

const prefix = `contact-${randomUUID().slice(0, 8)}`;
const userIds: string[] = [];

async function account(verified = false) {
  const id = `${prefix}-u${userIds.length}`;
  await db.insert(users).values({ id, email: `${id}@championways.test`, name: `ผู้ใช้${userIds.length} นามสกุล`, role: 'member', emailVerifiedAt: verified ? new Date() : null });
  userIds.push(id);
  return { id, email: `${id}@championways.test`, cookie: `cw_session=${(await createSession(id)).id}` };
}
const call = (path: string, cookie = '', method = 'GET', body?: unknown) => app.request(`/api${path}`, {
  method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
});
async function lastMail(to: string) {
  const [mail] = await db.select().from(emailLog).where(eq(emailLog.to, to)).orderBy(desc(emailLog.sentAt)).limit(1);
  return mail;
}
const tokenFrom = (body: string) => body.match(/\/confirm\?token=([\w-]+)/)![1];
/** ย้ายเวลากดแจ้งของรายการก่อนหน้าให้เก่ากว่า 24 ชั่วโมง เทสถัดไปจะได้อีเมลฉบับใหม่ (มีช่วงพักอีเมลวันละฉบับต่อคู่) */
const ageClaims = (userId: string) => db.update(consultations).set({ claimedAt: new Date(Date.now() - 2 * 86400000) })
  .where(and(eq(consultations.userId, userId), sql`${consultations.claimedAt} is not null`));

test('contact a mentor, confirm by email link or in the Mentor zone, then review', async (t) => {
  const mentorId = `${prefix}-mentor`;
  const mentorUser = await account(true);
  const otherMentorUser = await account(true);
  const student = await account();
  const slug = `${prefix}-event`;
  await db.insert(competitions).values({
    id: `${prefix}-cmp`, slug, name: 'เวทีทดสอบ', description: 'ทดสอบ', type: 'contest', org: 'ทีมทดสอบ', closesAt: '2099-01-01',
    region: 'online', prizeValue: 0, prizeNote: 'ใบประกาศ', teamMin: 1, teamMax: 3, keywords: [],
    sourceUrl: 'https://example.test', source: 'editorial', lastVerifiedAt: '2026-09-30',
  });
  for (const [id, owner] of [[mentorId, mentorUser], [`${mentorId}-2`, otherMentorUser]] as const) {
    await db.insert(mentors).values({ id, name: 'พี่ทดสอบ ท.', avatar: 'ท', bio: 'ทดสอบ', replyTime: '1 วัน', topics: [], best: 'ทดสอบ', cannot: 'ทดสอบ', contactLine: 'mentor.line', price: 500, minutes: 60 });
    await db.insert(mentorSubmissions).values({
      id: `${id}-ms`, status: 'published', userId: owner.id, publishedMentorId: id, firstName: 'ทดสอบ', lastName: 'ท', nickname: 'ท',
      email: owner.email, phone: '', occupation: 'working', organization: 'ทดสอบ', role: 'ทดสอบ', experience: 'ทดสอบ', best: 'ทดสอบ', cannot: 'ทดสอบ', topics: [],
    });
  }

  try {
    let first = '';

    await t.test('hiring, payment and chat are closed in this mode', async () => {
      assert.equal((await (await call('/consult/me', student.cookie)).json()).hiring, false);
      assert.equal((await call(`/consult/mentors/${mentorId}/hire`, student.cookie, 'POST', { competition: slug, hours: 1, note: 'x' })).status, 404);
      assert.equal((await call('/consult/anything/pay', student.cookie, 'POST', {})).status, 404);
      assert.equal((await call('/consult/payments/x', student.cookie)).status, 404);
      assert.equal((await call('/chats', student.cookie)).status, 404);
    });

    await t.test('contacts need a verified email; contacting twice returns the same entry', async () => {
      assert.equal((await call(`/consult/mentors/${mentorId}/contact`, student.cookie, 'POST', {})).status, 403);
      assert.equal((await (await call(`/consult/mentors/${mentorId}`, student.cookie)).json()).contacts, null);
      await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, student.id));
      const made = await call(`/consult/mentors/${mentorId}/contact`, student.cookie, 'POST', { competition: slug });
      assert.equal(made.status, 201);
      const body = await made.json();
      first = body.consultation.id;
      assert.deepEqual([body.consultation.status, body.contacts.line, body.contacts.email], ['contacted', 'mentor.line', '']);
      const again = await call(`/consult/mentors/${mentorId}/contact`, student.cookie, 'POST', {});
      assert.equal((await again.json()).consultation.id, first);
      assert.equal((await (await call(`/consult/mentors/${mentorId}`, student.cookie)).json()).contacts.line, 'mentor.line');
      assert.equal((await call(`/consult/mentors/${mentorId}/contact`, mentorUser.cookie, 'POST', {})).status, 400);
    });

    await t.test('I received guidance emails the mentor a one-time link; no review before they answer', async () => {
      assert.equal((await call(`/consult/${first}/review`, student.cookie, 'POST', { stars: 5 })).status, 409);
      assert.equal((await call(`/consult/${first}/claim`, mentorUser.cookie, 'POST', {})).status, 409);
      assert.equal((await call(`/consult/${first}/claim`, student.cookie, 'POST', {})).status, 200);
      assert.equal((await call(`/consult/${first}/claim`, student.cookie, 'POST', {})).status, 409);
      const mail = await lastMail(mentorUser.email);
      assert.match(mail.body, /\/confirm\?token=/);
      const zone = await (await call('/consult/zone', mentorUser.cookie)).json();
      assert.deepEqual(zone.confirmations.map((x: { id: string }) => x.id), [first]);
      assert.equal(zone.contacts.line, 'mentor.line');
    });

    await t.test('the email link shows who is asking, confirms once, and nobody else can confirm', async () => {
      const token = tokenFrom((await lastMail(mentorUser.email)).body);
      const page = await (await call(`/consult/confirm-link?token=${token}`)).json();
      assert.deepEqual([page.usable, page.student, page.status], [true, 'ผู้ใช้2', 'claimed']);
      assert.equal((await call('/consult/confirm-link?token=nope-nope-nope-nope-nope')).status, 404);
      // เมนเทอร์คนอื่นยืนยันแทนไม่ได้
      assert.equal((await call(`/consult/${first}/confirm`, otherMentorUser.cookie, 'POST', {})).status, 409);
      assert.equal((await call(`/consult/${first}/confirm`, student.cookie, 'POST', {})).status, 403);
      const [yes, again] = await Promise.all([
        call('/consult/confirm-link', '', 'POST', { token, answer: 'yes' }),
        // กดสองแท็บพร้อมกัน ได้ผลครั้งเดียว
        call('/consult/confirm-link', '', 'POST', { token, answer: 'yes' }),
      ]);
      assert.deepEqual([yes.status, again.status].sort(), [200, 409]);
      const [row] = await db.select().from(consultations).where(eq(consultations.id, first));
      assert.equal(row.status, 'completed');
      assert.match((await lastMail(student.email)).body, /consulting/);
      assert.equal((await (await call(`/consult/confirm-link?token=${token}`)).json()).usable, false);
      assert.equal((await call(`/consult/${first}/review`, student.cookie, 'POST', { stars: 5, comment: 'ช่วยได้มาก' })).status, 201);
    });

    await t.test('a mentor can say it was not them; contacting again starts a new entry', async () => {
      const second = (await (await call(`/consult/mentors/${mentorId}/contact`, student.cookie, 'POST', {})).json()).consultation.id;
      assert.notEqual(second, first);
      await ageClaims(student.id);
      await call(`/consult/${second}/claim`, student.cookie, 'POST', {});
      assert.equal((await call(`/consult/${second}/deny`, mentorUser.cookie, 'POST', {})).status, 200);
      assert.equal((await db.select().from(consultations).where(eq(consultations.id, second)))[0].status, 'denied');
      assert.equal((await call(`/consult/${second}/review`, student.cookie, 'POST', { stars: 1 })).status, 409);
      // ลิงก์ในอีเมลของรายการที่ตอบไปแล้วใช้ไม่ได้
      const token = tokenFrom((await lastMail(mentorUser.email)).body);
      assert.equal((await call('/consult/confirm-link', '', 'POST', { token, answer: 'yes' })).status, 409);
    });

    await t.test('an expired link does nothing; the Mentor zone button still works', async () => {
      const third = (await (await call(`/consult/mentors/${mentorId}/contact`, student.cookie, 'POST', {})).json()).consultation.id;
      await ageClaims(student.id);
      await call(`/consult/${third}/claim`, student.cookie, 'POST', {});
      const token = tokenFrom((await lastMail(mentorUser.email)).body);
      await db.update(consultationConfirmTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(consultationConfirmTokens.consultationId, third));
      assert.equal((await (await call(`/consult/confirm-link?token=${token}`)).json()).expired, true);
      assert.equal((await call('/consult/confirm-link', '', 'POST', { token, answer: 'yes' })).status, 409);
      assert.equal((await call(`/consult/${third}/confirm`, mentorUser.cookie, 'POST', {})).status, 200);
      // รีวิวเมนเทอร์คนเดิมได้เดือนละครั้ง (Astra รีวิว 2 ต.ค. 2569: กันบัญชีที่สองปั๊มรีวิว)
      const again = await call(`/consult/${third}/review`, student.cookie, 'POST', { stars: 5 });
      assert.equal(again.status, 409);
      assert.match((await again.json()).error, /เดือนนี้/);
    });

    await t.test('the mentor gets at most one confirmation email a day from the same member', async () => {
      const a = (await (await call(`/consult/mentors/${mentorId}/contact`, student.cookie, 'POST', {})).json()).consultation.id;
      await ageClaims(student.id);
      const before = (await db.select().from(emailLog).where(eq(emailLog.to, mentorUser.email))).length;
      await call(`/consult/${a}/claim`, student.cookie, 'POST', {});
      await call(`/consult/${a}/cancel`, student.cookie, 'POST', {});
      const b = (await (await call(`/consult/mentors/${mentorId}/contact`, student.cookie, 'POST', {})).json()).consultation.id;
      await call(`/consult/${b}/claim`, student.cookie, 'POST', {});
      assert.equal((await db.select().from(emailLog).where(eq(emailLog.to, mentorUser.email))).length, before + 1);
      // ไม่ได้อีเมลก็ยังยืนยันใน Mentor zone ได้
      const zone = await (await call('/consult/zone', mentorUser.cookie)).json();
      assert.ok(zone.confirmations.some((x: { id: string }) => x.id === b));
      await call(`/consult/${b}/cancel`, student.cookie, 'POST', {});
    });

    await t.test('a mentor who has not answered in 3 days gets one reminder', async () => {
      const fourth = (await (await call(`/consult/mentors/${mentorId}/contact`, student.cookie, 'POST', {})).json()).consultation.id;
      await ageClaims(student.id);
      await call(`/consult/${fourth}/claim`, student.cookie, 'POST', {});
      const before = (await db.select().from(emailLog).where(eq(emailLog.to, mentorUser.email))).length;
      const cron = () => app.request('/api/cron/remind-confirmations', { headers: { authorization: 'Bearer test-cron-secret' } });
      assert.equal((await app.request('/api/cron/remind-confirmations')).status, 401);
      await cron();
      assert.equal((await db.select().from(emailLog).where(eq(emailLog.to, mentorUser.email))).length, before);
      await db.update(consultations).set({ claimedAt: new Date(Date.now() - 4 * 86400000) }).where(eq(consultations.id, fourth));
      await cron();
      await cron();
      const after = await db.select().from(emailLog).where(eq(emailLog.to, mentorUser.email));
      assert.equal(after.length, before + 1);
      assert.match((await lastMail(mentorUser.email)).subject, /เตือน|Reminder/);
      // ลิงก์ใหม่ในอีเมลเตือนใช้ยืนยันได้
      const token = tokenFrom((await lastMail(mentorUser.email)).body);
      assert.equal((await call('/consult/confirm-link', '', 'POST', { token, answer: 'yes' })).status, 200);
    });

    await t.test('mentor contacts need at least one channel and safe links', async () => {
      const empty = { contactEmail: '', contactLine: '', contactPhone: '', contactInstagram: '', contactLink: '' };
      assert.equal((await call('/consult/zone/contacts', mentorUser.cookie, 'PATCH', empty)).status, 400);
      assert.equal((await call('/consult/zone/contacts', mentorUser.cookie, 'PATCH', { ...empty, contactLink: 'javascript:alert(1)' })).status, 400);
      assert.equal((await call('/consult/zone/contacts', mentorUser.cookie, 'PATCH', { ...empty, contactInstagram: 'mentor.ig' })).status, 200);
      assert.equal((await call('/consult/zone/contacts', student.cookie, 'PATCH', { ...empty, contactInstagram: 'x' })).status, 403);
    });
  } finally {
    await db.delete(mentorSubmissions).where(like(mentorSubmissions.id, `${prefix}-%`));
    await db.delete(mentors).where(like(mentors.id, `${prefix}-%`));
    await db.delete(competitions).where(like(competitions.id, `${prefix}-%`));
    await db.delete(emailLog).where(inArray(emailLog.to, userIds.map((id) => `${id}@championways.test`)));
    await db.delete(sessions).where(inArray(sessions.userId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
    await client.end();
  }
});
