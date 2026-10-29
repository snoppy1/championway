import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { app } from '../server/app';
import { db, client } from '../server/db/client';
import { mentorSubmissions, mentors, risingStarPeriods, users } from '../server/db/schema';
import { testDatabase } from '../server/lib/database-safety';
import { createSession } from '../server/lib/session';

/* หน้าใบสมัครเมนเทอร์ของ admin: ให้ Rising Star เอง ลบเมนเทอร์ ลบใบสมัคร (ผู้ใช้ขอ 29 ต.ค. 2569) */

testDatabase(process.env);

const prefix = `manage-${randomUUID().slice(0, 8)}`;
const userIds: string[] = [];

async function account(role: 'member' | 'reviewer' | 'admin') {
  const id = `${prefix}-${role}`;
  await db.insert(users).values({ id, email: `${id}@championways.test`, name: role, role, emailVerifiedAt: new Date() });
  userIds.push(id);
  return `cw_session=${(await createSession(id)).id}`;
}
const call = (path: string, cookie: string, method = 'GET', body?: unknown) => app.request(`/api${path}`, {
  method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
});
const submission = (id: string, publishedMentorId: string | null) => ({
  id, status: publishedMentorId ? 'published' as const : 'pending' as const, publishedMentorId, firstName: 'ทดสอบ', lastName: 'ท', nickname: 'ท',
  email: `${id}@championways.test`, phone: '', occupation: 'working', organization: 'ทดสอบ', role: 'ทดสอบ', experience: 'ทดสอบ', best: 'ทดสอบ', cannot: 'ทดสอบ', topics: [],
});

test('admin grants Rising Star, deletes a mentor and a submission', async (t) => {
  const admin = await account('admin');
  const reviewer = await account('reviewer');
  const mentorId = `${prefix}-mentor`;
  await db.insert(mentors).values({ id: mentorId, name: 'พี่ทดสอบ ท.', avatar: 'ท', bio: 'ทดสอบ', replyTime: '1 วัน', topics: [], best: 'ทดสอบ', cannot: 'ทดสอบ' });
  await db.insert(mentorSubmissions).values([submission(`${prefix}-pub`, mentorId), submission(`${prefix}-new`, null)]);

  try {
    await t.test('reviewers cannot use these actions', async () => {
      assert.equal((await call(`/admin/mentors/${mentorId}/rising-star`, reviewer, 'POST', { months: 1 })).status, 403);
      assert.equal((await call(`/admin/mentors/${mentorId}`, reviewer, 'DELETE')).status, 403);
      assert.equal((await call(`/admin/mentor-submissions/${prefix}-new`, reviewer, 'DELETE')).status, 403);
    });

    await t.test('grant, extend and stop Rising Star', async () => {
      assert.equal((await call(`/admin/mentors/${mentorId}/rising-star`, admin, 'POST', { months: 1 })).status, 200);
      let detail = await (await call(`/admin/mentor-submissions/${prefix}-pub`, admin)).json();
      assert.equal(detail.submission.risingStar.source, 'manual');
      const first = new Date(detail.submission.risingStar.endsAt).getTime();
      assert.equal((await call(`/admin/mentors/${mentorId}/rising-star`, admin, 'POST', { months: 2 })).status, 200);
      detail = await (await call(`/admin/mentor-submissions/${prefix}-pub`, admin)).json();
      assert.ok(new Date(detail.submission.risingStar.endsAt).getTime() > first + 50 * 86400000, 'extends from the current end');
      assert.equal((await call(`/admin/mentors/${mentorId}/rising-star`, admin, 'DELETE')).status, 200);
      detail = await (await call(`/admin/mentor-submissions/${prefix}-pub`, admin)).json();
      assert.equal(detail.submission.risingStar, null);
    });

    await t.test('a published submission keeps until its mentor is deleted', async () => {
      assert.equal((await call(`/admin/mentor-submissions/${prefix}-pub`, admin, 'DELETE')).status, 409);
      assert.equal((await call(`/admin/mentors/${mentorId}`, admin, 'DELETE')).status, 200);
      assert.equal((await db.select().from(mentors).where(eq(mentors.id, mentorId))).length, 0);
      assert.equal((await db.select().from(risingStarPeriods).where(eq(risingStarPeriods.mentorId, mentorId))).length, 0);
      const [row] = await db.select().from(mentorSubmissions).where(eq(mentorSubmissions.id, `${prefix}-pub`));
      assert.equal(row.status, 'rejected');
      assert.equal(row.publishedMentorId, null);
      assert.equal((await call(`/admin/mentor-submissions/${prefix}-pub`, admin, 'DELETE')).status, 200);
    });

    await t.test('delete a pending submission', async () => {
      assert.equal((await call(`/admin/mentor-submissions/${prefix}-new`, admin, 'DELETE')).status, 200);
      assert.equal((await call(`/admin/mentor-submissions/${prefix}-new`, admin)).status, 404);
    });
  } finally {
    await db.delete(mentorSubmissions).where(inArray(mentorSubmissions.id, [`${prefix}-pub`, `${prefix}-new`]));
    await db.delete(mentors).where(eq(mentors.id, mentorId));
    await db.delete(users).where(inArray(users.id, userIds));
    await client.end?.();
  }
});
