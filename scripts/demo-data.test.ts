import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { app } from '../server/app';
import { db, client } from '../server/db/client';
import { competitions, sessions, users } from '../server/db/schema';
import { testDatabase } from '../server/lib/database-safety';
import { createSession } from '../server/lib/session';
import { demoTotals } from '../server/db/demo-data';

/* ปุ่มข้อมูลตัวอย่างในหน้าจัดการ ต้องใส่ซ้ำได้โดยไม่ซ้ำ ลบเฉพาะของตัวอย่าง
   ใช้ได้เฉพาะ admin และปิดตายบน Production
   จบเทสต้องใส่ข้อมูลตัวอย่างกลับให้ครบ เพราะเทสหน้าเว็บชุดอื่นใช้ข้อมูลชุดนี้ */

testDatabase(process.env);
const prefix = `demo-${randomUUID()}`;
const made: string[] = [];

async function account(role: 'member' | 'reviewer' | 'admin') {
  const id = `${prefix}-${role}`;
  await db.insert(users).values({ id, email: `${id}@championways.test`, name: role, role });
  made.push(id);
  return `cw_session=${(await createSession(id)).id}`;
}

const call = (path: string, cookie: string, method = 'GET') =>
  app.request(`/api/admin${path}`, { method, headers: { cookie, 'content-type': 'application/json' }, body: method === 'POST' ? '{}' : undefined });

test('demo data tools on the dev site', async (t) => {
  const admin = await account('admin');
  const reviewer = await account('reviewer');
  const realSlug = `${prefix}-real`;
  try {
    await t.test('load twice fills every demo row once, with no duplicates', async () => {
      assert.equal((await call('/demo/load', admin, 'POST')).status, 200);
      const again = await call('/demo/load', admin, 'POST');
      const status = await again.json();
      assert.deepEqual(status.present, demoTotals);
      assert.equal(status.enabled, true);
    });

    await t.test('clear removes demo rows only and leaves the team\'s own data alone', async () => {
      await db.insert(competitions).values({
        id: realSlug, slug: realSlug, name: 'เวทีจริงของทีม', description: 'ห้ามหาย', type: 'contest',
        org: 'ทีมงาน', closesAt: '2099-01-01', region: 'online', prizeValue: 0, prizeNote: 'ใบประกาศ',
        teamMin: 1, teamMax: 3, keywords: [], sourceUrl: 'https://example.test', source: 'editorial',
        lastVerifiedAt: '2026-09-30',
      });
      const cleared = await (await call('/demo/clear', admin, 'POST')).json();
      assert.deepEqual(cleared.present, { competitions: 0, mentors: 0, competitionSubmissions: 0, mentorSubmissions: 0 });
      assert.equal((await db.select().from(competitions).where(eq(competitions.slug, realSlug))).length, 1);
    });

    await t.test('reviewers can see the status but only an admin can change it', async () => {
      assert.equal((await call('/demo', reviewer)).status, 200);
      assert.equal((await call('/demo/load', reviewer, 'POST')).status, 403);
      assert.equal((await call('/demo/clear', reviewer, 'POST')).status, 403);
      assert.equal((await call('/demo', await account('member'))).status, 403);
    });

    await t.test('production hides the panel and refuses both actions', async () => {
      const before = process.env.VERCEL_ENV;
      process.env.VERCEL_ENV = 'production';
      try {
        assert.deepEqual(await (await call('/demo', admin)).json(), { enabled: false });
        assert.equal((await call('/demo/load', admin, 'POST')).status, 404);
        assert.equal((await call('/demo/clear', admin, 'POST')).status, 404);
      } finally {
        if (before === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = before;
      }
    });
  } finally {
    // คืนข้อมูลตัวอย่างให้ครบ เทสหน้าเว็บชุดอื่นใช้ข้อมูลชุดนี้
    await call('/demo/load', admin, 'POST');
    await db.delete(competitions).where(eq(competitions.slug, realSlug));
    await db.delete(sessions).where(inArray(sessions.userId, made));
    await db.delete(users).where(inArray(users.id, made));
    await client.end();
  }
});
