import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { app } from '../server/app';
import { db, client } from '../server/db/client';
import { emailLog, files, mentorAwards, mentorSubmissions, reviewEvents, sessions, staffAlerts, users } from '../server/db/schema';
import { testDatabase } from '../server/lib/database-safety';
import { createSession } from '../server/lib/session';
import { applicationAward, applicationPrice, applicationProfile, fakeUploads } from './fake-files';

/* ผู้ใช้ขอ 7 ต.ค. 2569: แนบหลักฐานได้หลายไฟล์ และแก้ใบสมัครได้หลังทีมงานขอข้อมูลเพิ่ม
   (เฉพาะเจ้าของใบ และเฉพาะตอนสถานะ "ขอข้อมูลเพิ่ม") ใบแบบใหม่ 21 ต.ค. 2569 ไม่มีความถนัดแบบเดิมแล้ว ใช้โปรไฟล์หมวด D แทน */

testDatabase(process.env);
const prefix = `edit-${randomUUID().slice(0, 8)}`;
const userIds: string[] = [];

async function account(role: 'member' | 'admin' = 'member') {
  const id = `${prefix}-u${userIds.length}`;
  await db.insert(users).values({ id, email: `${id}@championways.test`, name: `ผู้ใช้${userIds.length}`, role, emailVerifiedAt: new Date() });
  userIds.push(id);
  return { id, cookie: `cw_session=${(await createSession(id)).id}` };
}
const send = (method: string, path: string, cookie: string, body?: unknown) => app.request(`/api${path}`, {
  method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
});
const base = {
  firstName: 'ทดสอบ', lastName: 'แก้ใบ', nickname: 'แก้', email: `${prefix}@championways.test`, occupation: 'ทำงานแล้ว',
  organization: 'ทีมทดสอบ', role: 'วิศวกร', experience: 'เคยแข่ง', best: 'ช่วยตีโจทย์', cannot: 'ไม่ทำงานแทน', contactLine: 'mentor.line',
};
const award = (evidenceFileIds: string[]) => applicationAward({ title: `${prefix} เวทีที่เคยแข่ง`, evidence: '', evidenceFileIds });

test('several evidence files, and editing after the team asks for more information', async () => {
  const applicant = await account();
  const stranger = await account();
  const admin = await account('admin');
  try {
    const [photo, proofA, proofB, ...extra] = await fakeUploads(applicant.id, 9);
    const body = (overrides: object = {}) => ({ ...base, photoFileId: photo, profile: applicationProfile, price: applicationPrice, awards: [award([proofA, proofB])], ...overrides });

    // หลักฐานไม่เกินห้าไฟล์ต่อเวที
    assert.equal((await send('POST', '/submissions/mentor', applicant.cookie, body({ awards: [award(extra.slice(0, 6))] }))).status, 400);

    const created = await send('POST', '/submissions/mentor', applicant.cookie, body());
    assert.equal(created.status, 201, await created.clone().text());
    const { id } = await created.json() as { id: string };
    const [stored] = await db.select().from(mentorAwards).where(eq(mentorAwards.submissionId, id));
    assert.deepEqual(stored.evidenceFileIds, [proofA, proofB]);

    // ยังแก้ไม่ได้ระหว่างรอตรวจ
    assert.equal((await send('GET', `/submissions/mentor/${id}`, applicant.cookie)).status, 409);
    assert.equal((await send('PUT', `/submissions/mentor/${id}`, applicant.cookie, body())).status, 409);

    const asked = await send('POST', `/admin/mentor-submissions/${id}/decision`, admin.cookie, { decision: 'info', note: 'ขอไฟล์เกียรติบัตรที่เห็นชื่อชัด ๆ' });
    assert.equal(asked.status, 200, await asked.clone().text());

    // คนอื่นเปิดหรือแก้ใบนี้ไม่ได้ เปิดไฟล์ในใบก็ไม่ได้
    assert.equal((await send('GET', `/submissions/mentor/${id}`, stranger.cookie)).status, 404);
    assert.equal((await send('PUT', `/submissions/mentor/${id}`, stranger.cookie, body())).status, 404);
    assert.equal((await send('GET', `/files/${proofA}`, stranger.cookie)).status, 403);

    const loaded = await send('GET', `/submissions/mentor/${id}`, applicant.cookie);
    assert.equal(loaded.status, 200);
    const form = await loaded.json() as { note: string; submission: { profile: { headline: string }; price: { amount: number }; photo: { id: string }; awards: { kind: string; responsibility: string; files: { id: string }[] }[] } };
    assert.equal(form.note, 'ขอไฟล์เกียรติบัตรที่เห็นชื่อชัด ๆ');
    assert.equal(form.submission.photo.id, photo);
    assert.deepEqual(form.submission.awards[0].files.map((file) => file.id), [proofA, proofB]);
    // โปรไฟล์ ราคา และช่องประสบการณ์แบบใหม่กลับมาให้แก้ครบ
    assert.equal(form.submission.profile.headline, applicationProfile.headline);
    assert.equal(form.submission.price.amount, 0);
    assert.deepEqual([form.submission.awards[0].kind, form.submission.awards[0].responsibility], ['hackathon', 'ทำต้นแบบ']);
    // เจ้าของใบเปิดไฟล์ที่ผูกกับใบแล้วได้ (ต้องเห็นตอนแก้)
    assert.notEqual((await send('GET', `/files/${proofA}`, applicant.cookie)).status, 403);

    // โปรไฟล์บอกว่าทีมงานขออะไร
    const profile = await (await send('GET', '/journey/profile', applicant.cookie)).json() as { applications: { id: string; note: string }[] };
    assert.equal(profile.applications.find((row) => row.id === id)?.note, 'ขอไฟล์เกียรติบัตรที่เห็นชื่อชัด ๆ');

    // ไฟล์ของคนอื่นใช้ไม่ได้ ไฟล์เดิมในใบกับไฟล์ใหม่ของตัวเองใช้ได้
    const [theirs] = await fakeUploads(stranger.id, 1);
    assert.equal((await send('PUT', `/submissions/mentor/${id}`, applicant.cookie, body({ awards: [award([proofA, theirs])] }))).status, 400);
    const edited = await send('PUT', `/submissions/mentor/${id}`, applicant.cookie,
      body({ nickname: 'แก้แล้ว', awards: [award([proofA, extra[0]])] }));
    assert.equal(edited.status, 200, await edited.clone().text());

    const [row] = await db.select().from(mentorSubmissions).where(eq(mentorSubmissions.id, id));
    assert.deepEqual([row.status, row.nickname], ['pending', 'แก้แล้ว']);
    const awards = await db.select().from(mentorAwards).where(eq(mentorAwards.submissionId, id));
    assert.equal(awards.length, 1);
    assert.deepEqual(awards[0].evidenceFileIds, [proofA, extra[0]]);
    const [moved] = await db.select().from(files).where(eq(files.id, extra[0]));
    assert.deepEqual([moved.ownerType, moved.ownerId], ['mentor_submission', id]);
    // ส่งแล้วกลับเข้าคิว แก้ซ้ำไม่ได้จนกว่าทีมงานจะขออีก
    assert.equal((await send('PUT', `/submissions/mentor/${id}`, applicant.cookie, body())).status, 409);
  } finally {
    const submissions = await db.select({ id: mentorSubmissions.id }).from(mentorSubmissions).where(inArray(mentorSubmissions.userId, userIds));
    const ids = submissions.map((row) => row.id);
    if (ids.length) {
      await db.delete(reviewEvents).where(inArray(reviewEvents.targetId, ids));
      await db.delete(files).where(inArray(files.ownerId, ids));
      await db.delete(mentorSubmissions).where(inArray(mentorSubmissions.id, ids));
    }
    await db.delete(files).where(inArray(files.ownerId, userIds));
    await db.delete(staffAlerts).where(inArray(staffAlerts.actorId, userIds));
    await db.delete(emailLog).where(inArray(emailLog.to, [base.email]));
    await db.delete(sessions).where(inArray(sessions.userId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
    await client.end();
  }
});
