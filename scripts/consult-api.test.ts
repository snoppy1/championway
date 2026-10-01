import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, like } from 'drizzle-orm';
import { app } from '../server/app';
import { db, client } from '../server/db/client';
import {
  chatRooms, competitionRequests, competitions, emailLog, mentorCompetitionChoices, mentorReviews, mentorSubmissions,
  mentors, sessions, users,
} from '../server/db/schema';
import { testDatabase } from '../server/lib/database-safety';
import { createSession } from '../server/lib/session';

/* จ้างเมนเทอร์ → เมนเทอร์รับ → แชต (ส่งไฟล์ได้) → นักเรียนกดเสร็จงาน → รีวิว
   เรื่องที่ต้องถูกคือสิทธิ์และลำดับขั้น: ใครเห็นห้องไหน ใครกดอะไรได้ และรีวิวต้องมาหลังงานเสร็จเท่านั้น
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
function sendMessage(roomId: string, cookie: string, parts: { text?: string; file?: File; clientId?: string }) {
  const form = new FormData();
  form.set('clientId', parts.clientId ?? randomUUID());
  if (parts.text) form.set('text', parts.text);
  if (parts.file) form.set('file', parts.file);
  return app.request(`/api/chats/${roomId}/messages`, { method: 'POST', headers: { cookie }, body: form });
}

test('hire a mentor, chat, finish and review', async (t) => {
  const mentorId = `${prefix}-mentor`;
  const slug = `${prefix}-event`;
  const otherSlug = `${prefix}-event-2`;
  const mentorUser = await account('member', true);
  const student = await account();
  const outsider = await account('member', true);
  const reviewer = await account('reviewer', true);
  const future = new Date(Date.now() + 3 * 86400000).toISOString();

  for (const [id, s] of [[`${prefix}-cmp`, slug], [`${prefix}-cmp2`, otherSlug]]) {
    await db.insert(competitions).values({
      id, slug: s, name: `เวทีทดสอบ ${s}`, description: 'ทดสอบ', type: 'contest', org: 'ทีมทดสอบ', closesAt: '2099-01-01',
      region: 'online', prizeValue: 0, prizeNote: 'ใบประกาศ', teamMin: 1, teamMax: 3, keywords: [],
      sourceUrl: 'https://example.test', source: 'editorial', lastVerifiedAt: '2026-09-30',
    });
  }
  await db.insert(mentors).values({
    id: mentorId, name: 'พี่ทดสอบ ท.', avatar: 'ท', bio: 'ทดสอบ', replyTime: '1 วัน', topics: [], best: 'ทดสอบ', cannot: 'ทดสอบ',
    contactLine: 'secret.line', price: 500, minutes: 60,
  });
  await db.insert(mentorSubmissions).values({
    id: `${prefix}-ms`, status: 'published', userId: mentorUser.id, publishedMentorId: mentorId,
    firstName: 'ทดสอบ', lastName: 'ท', nickname: 'ท', email: mentorUser.email, phone: '', occupation: 'working',
    organization: 'ทดสอบ', role: 'ทดสอบ', experience: 'ทดสอบ', best: 'ทดสอบ', cannot: 'ทดสอบ', topics: [],
  });
  // 10 บาท / 1 นาที: จ้าง 2 ชั่วโมงต้องได้ 1,200 บาท ราคาจากหน้าเว็บไม่นับ
  await db.insert(mentorCompetitionChoices).values({ mentorId, competitionId: `${prefix}-cmp`, choice: 'help', price: 10, minutes: 1 });

  try {
    let hireId = '';
    let roomId = '';
    const hireBody = { competition: slug, hours: 2, preferredAt: future, note: 'ช่วยดูสไลด์พิตช์', price: 1 };

    await t.test('off-platform contacts are never sent', async () => {
      const page = await (await call(`/consult/mentors/${mentorId}`, student.cookie)).json();
      assert.ok(!JSON.stringify(page).includes('secret.line'));
      assert.equal('contacts' in page, false);
    });

    await t.test('an unverified account must verify its email before hiring', async () => {
      assert.equal((await call(`/consult/mentors/${mentorId}/hire`, student.cookie, 'POST', hireBody)).status, 403);
      assert.equal((await call('/auth/email/verify/send', student.cookie, 'POST', {})).status, 200);
      assert.equal((await call('/auth/email/verify/send', student.cookie, 'POST', {})).status, 429);
      const [mail] = await db.select().from(emailLog).where(eq(emailLog.to, student.email)).orderBy(desc(emailLog.sentAt)).limit(1);
      const token = mail.body.match(/token=([\w-]+)/)![1];
      assert.equal((await call('/auth/email/verify', '', 'POST', { token })).status, 200);
      assert.equal((await call('/auth/email/verify', '', 'POST', { token })).status, 400);
      assert.equal((await (await call('/auth/me', student.cookie)).json()).user.emailVerified, true);
    });

    await t.test('a hire uses the mentor\'s own price and only competitions they offer', async () => {
      assert.equal((await call(`/consult/mentors/${mentorId}/hire`, student.cookie, 'POST', { ...hireBody, competition: otherSlug })).status, 409);
      assert.equal((await call(`/consult/mentors/${mentorId}/hire`, student.cookie, 'POST', { ...hireBody, hours: 0 })).status, 400);
      assert.equal((await call(`/consult/mentors/${mentorId}/hire`, student.cookie, 'POST', { ...hireBody, preferredAt: '2020-01-01T00:00:00Z' })).status, 400);
      assert.equal((await call(`/consult/mentors/${mentorId}/hire`, mentorUser.cookie, 'POST', hireBody)).status, 400);
      const made = await call(`/consult/mentors/${mentorId}/hire`, student.cookie, 'POST', hireBody);
      assert.equal(made.status, 201);
      hireId = (await made.json()).hire.id;
      assert.equal((await call(`/consult/mentors/${mentorId}/hire`, student.cookie, 'POST', hireBody)).status, 409);
      const mine = await (await call('/consult/mine', student.cookie)).json();
      assert.deepEqual([mine.items[0].status, mine.items[0].minutes, mine.items[0].price], ['requested', 120, 1200]);
      const [mail] = await db.select().from(emailLog).where(eq(emailLog.to, mentorUser.email)).orderBy(desc(emailLog.sentAt)).limit(1);
      assert.match(mail.body, /mentor-zone#hire-/);
    });

    await t.test('only the mentor answers, and the chat opens on accept', async () => {
      assert.equal((await call(`/consult/${hireId}/complete`, student.cookie, 'POST', {})).status, 409);
      assert.equal((await call(`/consult/${hireId}/accept`, student.cookie, 'POST', {})).status, 403);
      assert.equal((await call(`/consult/${hireId}/accept`, outsider.cookie, 'POST', {})).status, 403);
      const accepted = await call(`/consult/${hireId}/accept`, mentorUser.cookie, 'POST', {});
      assert.equal(accepted.status, 200);
      roomId = (await accepted.json()).roomId;
      assert.equal((await call(`/consult/${hireId}/accept`, mentorUser.cookie, 'POST', {})).status, 409);
      assert.equal((await call(`/consult/${hireId}/decline`, mentorUser.cookie, 'POST', { reason: 'x' })).status, 409);
      const zone = await (await call('/consult/zone', mentorUser.cookie)).json();
      assert.equal(zone.hires[0].status, 'accepted');
      assert.equal(zone.hires[0].roomId, roomId);
    });

    await t.test('the chat is private to the two of them, and files are checked by content', async () => {
      assert.equal((await call(`/chats/${roomId}`, outsider.cookie)).status, 404);
      assert.equal((await sendMessage(roomId, outsider.cookie, { text: 'แอบเข้ามา' })).status, 404);
      const clientId = randomUUID();
      assert.equal((await sendMessage(roomId, student.cookie, { text: 'สวัสดีครับ', clientId })).status, 201);
      // ส่งซ้ำด้วย clientId เดิมได้ข้อความเดิม
      assert.equal((await sendMessage(roomId, student.cookie, { text: 'สวัสดีครับ', clientId })).status, 200);
      const pdf = new File([Buffer.from('%PDF-1.4 test')], 'slides.pdf', { type: 'application/pdf' });
      const sent = await sendMessage(roomId, mentorUser.cookie, { file: pdf });
      assert.equal(sent.status, 201);
      const fakePptx = new File([Buffer.from('not a zip')], 'deck.pptx', { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
      assert.equal((await sendMessage(roomId, mentorUser.cookie, { file: fakePptx })).status, 400);
      const pptx = new File([Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])], 'deck.pptx', { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
      assert.equal((await sendMessage(roomId, mentorUser.cookie, { file: pptx })).status, 201);
      const html = new File([Buffer.from('<script>alert(1)</script>')], 'x.html', { type: 'text/html' });
      assert.equal((await sendMessage(roomId, student.cookie, { file: html })).status, 400);

      const list = await (await call(`/chats/${roomId}/messages`, student.cookie)).json();
      assert.equal(list.messages.length, 3);
      assert.equal(list.messages[0].mine, true);
      const fileMessage = list.messages.find((m: { fileName: string | null }) => m.fileName === 'slides.pdf');
      const download = await call(`/chats/${roomId}/files/${fileMessage.id}`, student.cookie);
      assert.equal(download.status, 200);
      assert.match(download.headers.get('content-disposition') ?? '', /^attachment/);
      assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
      assert.equal((await call(`/chats/${roomId}/files/${fileMessage.id}`, outsider.cookie)).status, 404);

      // ข้อความจากเมนเทอร์ 2 อันยังไม่ได้อ่าน อ่านแล้วต้องเป็นศูนย์
      const before = await (await call('/consult/mine', student.cookie)).json();
      assert.equal(before.items[0].unread, 2);
      const last = list.messages[list.messages.length - 1];
      assert.equal((await call(`/chats/${roomId}/read`, student.cookie, 'POST', { messageId: last.id })).status, 200);
      const after = await (await call('/consult/mine', student.cookie)).json();
      assert.equal(after.items[0].unread, 0);
      const rooms = await (await call('/chats', mentorUser.cookie)).json();
      assert.equal(rooms.rooms[0].counterpart, 'ทดสอบ1');
    });

    await t.test('reviews wait for the student to mark the work done, once, 1 to 5 stars', async () => {
      assert.equal((await call(`/consult/${hireId}/review`, student.cookie, 'POST', { stars: 5 })).status, 409);
      assert.equal((await call(`/consult/${hireId}/complete`, mentorUser.cookie, 'POST', {})).status, 409);
      assert.equal((await call(`/consult/${hireId}/complete`, student.cookie, 'POST', {})).status, 200);
      assert.equal((await call(`/consult/${hireId}/cancel`, student.cookie, 'POST', {})).status, 409);
      assert.equal((await call(`/consult/${hireId}/review`, student.cookie, 'POST', { stars: 6 })).status, 400);
      assert.equal((await call(`/consult/${hireId}/review`, outsider.cookie, 'POST', { stars: 5 })).status, 404);
      assert.equal((await call(`/consult/${hireId}/review`, student.cookie, 'POST', { stars: 4, comment: 'ดีมาก' })).status, 201);
      assert.equal((await call(`/consult/${hireId}/review`, student.cookie, 'POST', { stars: 5 })).status, 409);
      const page = await (await call(`/consult/mentors/${mentorId}`, student.cookie)).json();
      assert.deepEqual(page.mentor.rating, { average: 4, reviews: 1 });
      assert.equal(page.reviews[0].name, 'ทดสอบ1');
    });

    await t.test('a hidden review stops counting', async () => {
      const [review] = await db.select().from(mentorReviews).where(eq(mentorReviews.mentorId, mentorId));
      assert.equal((await call(`/admin/reviews/${review.id}/visibility`, reviewer.cookie, 'POST', { hidden: true })).status, 200);
      const page = await (await call(`/consult/mentors/${mentorId}`)).json();
      assert.deepEqual(page.mentor.rating, { average: null, reviews: 0 });
      await call(`/admin/reviews/${review.id}/visibility`, reviewer.cookie, 'POST', { hidden: false });
    });

    await t.test('a second hire reuses the same chat room; decline needs a reason', async () => {
      const again = await (await call(`/consult/mentors/${mentorId}/hire`, student.cookie, 'POST', { ...hireBody, hours: 1 })).json();
      assert.equal((await call(`/consult/${again.hire.id}/decline`, mentorUser.cookie, 'POST', { reason: '' })).status, 400);
      assert.equal((await call(`/consult/${again.hire.id}/decline`, mentorUser.cookie, 'POST', { reason: 'ช่วงนี้ไม่ว่าง' })).status, 200);
      const third = await (await call(`/consult/mentors/${mentorId}/hire`, student.cookie, 'POST', { ...hireBody, hours: 1 })).json();
      const accepted = await (await call(`/consult/${third.hire.id}/accept`, mentorUser.cookie, 'POST', {})).json();
      assert.equal(accepted.roomId, roomId);
      assert.equal((await db.select().from(chatRooms).where(eq(chatRooms.mentorId, mentorId))).length, 1);
      assert.equal((await call(`/consult/${third.hire.id}/cancel`, student.cookie, 'POST', {})).status, 200);
    });

    await t.test('mentor zone: price per competition shows on the competition page', async () => {
      assert.equal((await (await call('/consult/zone', student.cookie)).json()).mentor, null);
      assert.equal((await call(`/consult/zone/competitions/${otherSlug}`, student.cookie, 'PUT', { price: 10, minutes: 1 })).status, 403);
      assert.equal((await call(`/consult/zone/competitions/${otherSlug}`, mentorUser.cookie, 'PUT', { price: 10, minutes: 0 })).status, 400);
      assert.equal((await call(`/consult/zone/competitions/${otherSlug}`, mentorUser.cookie, 'PUT', { price: 300, minutes: 30 })).status, 200);
      const listed = await (await call(`/consult/competitions/${otherSlug}/mentors`)).json();
      const entry = [...listed.risingStar, ...listed.others].find((m: { id: string }) => m.id === mentorId);
      assert.deepEqual([entry.price, entry.minutes], [300, 30]);
      assert.equal((await call(`/consult/zone/competitions/${otherSlug}`, mentorUser.cookie, 'DELETE')).status, 200);
    });

    await t.test('parallel requests cannot slip past the cooldown or the request cap', async () => {
      // Astra รีวิว 2 ต.ค. 2569: ยิงพร้อมกันเคยผ่านการเช็กได้หลายครั้ง ตอนนี้ล็อกแถวก่อนเช็ก
      const fresh = await account();
      const sends = await Promise.all(Array.from({ length: 6 }, () => call('/auth/email/verify/send', fresh.cookie, 'POST', {})));
      assert.deepEqual(sends.map((r) => r.status).sort(), [200, 429, 429, 429, 429, 429]);
      const made = await Promise.all(Array.from({ length: 14 }, (_, n) => call('/consult/zone/requests', mentorUser.cookie, 'POST',
        { name: `งานพร้อมกัน ${n}`, url: 'https://example.test/parallel', price: 100, minutes: 30 })));
      assert.equal(made.filter((r) => r.status === 201).length, 10);
      assert.equal(made.filter((r) => r.status === 409).length, 4);
      await db.delete(competitionRequests).where(eq(competitionRequests.mentorId, mentorId));
    });

    await t.test('a competition request becomes a listing only after the team approves it', async () => {
      assert.equal((await call('/consult/zone/requests', mentorUser.cookie, 'POST', { name: 'งานใหม่', url: 'javascript:alert(1)', price: 300, minutes: 30 })).status, 400);
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
    await db.delete(chatRooms).where(eq(chatRooms.mentorId, mentorId));
    await db.delete(mentorSubmissions).where(eq(mentorSubmissions.id, `${prefix}-ms`));
    await db.delete(mentors).where(eq(mentors.id, mentorId));
    await db.delete(competitions).where(like(competitions.id, `${prefix}-%`));
    await db.delete(emailLog).where(inArray(emailLog.to, userIds.map((id) => `${id}@championways.test`)));
    await db.delete(sessions).where(inArray(sessions.userId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
    await client.end();
  }
});
