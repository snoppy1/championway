import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, like } from 'drizzle-orm';
import { app } from '../server/app';
import { db, client } from '../server/db/client';
import { emailLog, mentorAwards, mentorSubmissions, sessions, staffAlerts, staffNotifications, users } from '../server/db/schema';
import { testDatabase } from '../server/lib/database-safety';
import { createSession } from '../server/lib/session';
import { env } from '../server/lib/env';
import { withUploads } from './fake-files';

/* แจ้งทีมงานทางอีเมลเมื่อมีเรื่องใหม่รอตรวจ: เปิด/ปิดได้ ส่งถึง admin ทุกคน หรือเลือกเฉพาะบางคน (ตั้งได้เฉพาะ admin) */

testDatabase(process.env);
const prefix = `notify-${randomUUID().slice(0, 8)}`;
const userIds: string[] = [];

async function account(role: 'member' | 'reviewer' | 'admin') {
  const id = `${prefix}-${role}-${userIds.length}`;
  await db.insert(users).values({ id, email: `${id}@championways.test`, name: `${role} ${userIds.length}`, role, emailVerifiedAt: new Date() });
  userIds.push(id);
  return { id, email: `${id}@championways.test`, cookie: `cw_session=${(await createSession(id)).id}` };
}
const call = (path: string, cookie: string, method = 'GET', body?: unknown) => app.request(`/api${path}`, {
  method, headers: { cookie, 'content-type': 'application/json', origin: env.appOrigin }, body: body === undefined ? undefined : JSON.stringify(body),
});
// เทสไฟล์อื่นส่งใบสมัครพร้อมกันได้ (admin ทุกคนได้อีเมล) จึงนับเฉพาะอีเมลที่ชี้ไปใบของเทสนี้
const mailTo = (email: string, submissionId: string) => db.select().from(emailLog)
  .where(and(eq(emailLog.to, email), like(emailLog.subject, 'ใบสมัครเมนเทอร์ใหม่%'), like(emailLog.body, `%/admin/mentors/${submissionId}`)));
let seq = 0;
async function apply(cookie: string) {
  const response = await call('/submissions/mentor', cookie, 'POST', await withUploads(cookie, {
    firstName: `ผู้สมัคร${seq++}`, lastName: 'ทดสอบ', nickname: 'ทด', email: `${prefix}-applicant@championways.test`, occupation: 'ทำงานแล้ว',
    organization: 'ทีม', role: 'วิศวกร', experience: 'เคยแข่ง', best: 'ช่วยได้', cannot: 'ช่วยไม่ได้',
    topics: ['ตีโจทย์และหาไอเดีย', 'Pitching และตอบคำถาม'], contactLine: 'line',
    awards: [{ title: 'เวทีนอกระบบ', competitionSlug: null, result: 'participant', year: '2567', evidence: 'https://example.test/x' }],
  }));
  assert.equal(response.status, 201, await response.clone().text());
  return (await response.json()).id as string;
}

test('admins choose who gets emailed about new items to review', async (t) => {
  // ฐานข้อมูลเทสเท่านั้น: ล้างประวัติการแจ้งเตือนก่อน เพดานต่อชั่วโมงจะได้ไม่ค้างจากรอบก่อน
  await db.delete(staffAlerts);
  const adminA = await account('admin');
  const reviewer = await account('reviewer');
  const member = await account('member');
  // คนเดียวส่งซ้ำภายใน 15 นาทีไม่แจ้งซ้ำ แต่ละขั้นของเทสจึงใช้ผู้สมัครคนใหม่
  const applicant = async () => (await account('member')).cookie;
  const submissions: string[] = [];
  try {
    await t.test('only an admin can see or change the settings', async () => {
      assert.equal((await call('/admin/notifications', reviewer.cookie)).status, 403);
      assert.equal((await call('/admin/notifications/mentor_application', reviewer.cookie, 'PUT', { enabled: false, audience: 'all' })).status, 403);
      assert.equal((await call('/admin/notifications', member.cookie)).status, 403);
      const page = await (await call('/admin/notifications', adminA.cookie)).json();
      assert.deepEqual(page.settings.map((s: { kind: string }) => s.kind), ['mentor_application', 'competition_request', 'competition_submission']);
      const staff = page.staff.map((p: { id: string }) => p.id);
      assert.ok(staff.includes(adminA.id) && staff.includes(reviewer.id) && !staff.includes(member.id));
      assert.equal((await call('/admin/notifications/nope', adminA.cookie, 'PUT', { enabled: true, audience: 'all' })).status, 404);
    });

    await t.test('by default every admin is emailed with a link, and the applicant contact details are not in it', async () => {
      await db.delete(staffNotifications).where(eq(staffNotifications.kind, 'mentor_application'));
      submissions.push(await apply(await applicant()));
      const [mail] = await mailTo(adminA.email, submissions[0]);
      assert.ok(mail, 'admin should get an email');
      assert.ok(!mail.body.includes(`${prefix}-applicant@`));
      assert.equal((await mailTo(reviewer.email, submissions[0])).length, 0);
    });

    await t.test('selected people only; people who are not staff are dropped; an empty list is refused', async () => {
      assert.equal((await call('/admin/notifications/mentor_application', adminA.cookie, 'PUT',
        { enabled: true, audience: 'selected', recipientIds: [member.id] })).status, 400);
      const saved = await call('/admin/notifications/mentor_application', adminA.cookie, 'PUT',
        { enabled: true, audience: 'selected', recipientIds: [reviewer.id, member.id] });
      assert.equal(saved.status, 200);
      const setting = (await saved.json()).settings.find((s: { kind: string }) => s.kind === 'mentor_application');
      assert.deepEqual(setting.recipientIds, [reviewer.id]);
      submissions.push(await apply(await applicant()));
      assert.equal((await mailTo(reviewer.email, submissions[1])).length, 1);
      assert.equal((await mailTo(adminA.email, submissions[1])).length, 0);
    });

    await t.test('turned off sends nothing, and a reviewer who loses the role stops getting mail', async () => {
      await call('/admin/notifications/mentor_application', adminA.cookie, 'PUT', { enabled: false, audience: 'selected', recipientIds: [reviewer.id] });
      submissions.push(await apply(await applicant()));
      assert.equal((await mailTo(reviewer.email, submissions[2])).length, 0);
      await call('/admin/notifications/mentor_application', adminA.cookie, 'PUT', { enabled: true, audience: 'selected', recipientIds: [reviewer.id] });
      await db.update(users).set({ role: 'member' }).where(eq(users.id, reviewer.id));
      submissions.push(await apply(await applicant()));
      assert.equal((await mailTo(reviewer.email, submissions[3])).length, 0);
    });

    await t.test('one person sending again and again only alerts the team once every 15 minutes', async () => {
      await db.delete(staffNotifications).where(eq(staffNotifications.kind, 'mentor_application'));
      const spammer = await applicant();
      const first = await apply(spammer);
      const second = await apply(spammer);
      submissions.push(first, second);
      assert.equal((await mailTo(adminA.email, first)).length, 1);
      assert.equal((await mailTo(adminA.email, second)).length, 0);
    });
  } finally {
    await db.delete(staffNotifications).where(eq(staffNotifications.kind, 'mentor_application'));
    await db.delete(staffAlerts).where(inArray(staffAlerts.actorId, userIds));
    if (submissions.length) {
      await db.delete(mentorAwards).where(inArray(mentorAwards.submissionId, submissions));
      await db.delete(mentorSubmissions).where(inArray(mentorSubmissions.id, submissions));
    }
    await db.delete(emailLog).where(inArray(emailLog.to, [...userIds.map((id) => `${id}@championways.test`), `${prefix}-applicant@championways.test`]));
    await db.delete(sessions).where(inArray(sessions.userId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
    await client.end();
  }
});
