import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { desc, eq, inArray, like } from 'drizzle-orm';
import { app } from '../server/app';
import { db, client } from '../server/db/client';
import { authAttempts, emailLog, passwordResets, sessions, users } from '../server/db/schema';
import { testDatabase } from '../server/lib/database-safety';
import { hashPassword } from '../server/lib/password';

/* ลืมรหัสผ่าน (10 ต.ค. 2569): ขอลิงก์ทางอีเมล ตอบเหมือนกันว่ามีบัญชีหรือไม่ ลิงก์ใช้ได้ครั้งเดียว
   ตั้งรหัสใหม่แล้วรหัสเก่าใช้ไม่ได้ ทุกอุปกรณ์ออกจากระบบ และลิงก์อื่นที่ค้างอยู่ใช้ไม่ได้ */

testDatabase(process.env);
const prefix = `pr-${randomUUID().slice(0, 8)}`;
const oldPassword = 'correct horse battery';
const newPassword = 'a brand new passphrase';
const post = (path: string, body: unknown, cookie?: string) => app.request(`/api/auth${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body),
});
const login = (email: string, password: string) => post('/login', { email, password });
/** ลิงก์ล่าสุดที่ส่งถึงอีเมลนี้ ตอนเทสไม่ได้ส่งจริง email_log จึงเก็บลิงก์เต็ม */
async function latestToken(email: string) {
  const [mail] = await db.select({ body: emailLog.body }).from(emailLog).where(eq(emailLog.to, email)).orderBy(desc(emailLog.sentAt)).limit(1);
  return mail?.body.match(/reset-password\?token=([\w-]+)/)?.[1];
}

test('forgot password', async (t) => {
  const email = `${prefix}-owner@championways.test`;
  await db.insert(users).values({ id: `${prefix}-u0`, email, name: 'ทดสอบ', passwordHash: await hashPassword(oldPassword) });
  try {
    await t.test('asking for a link answers the same whether or not the account exists', async () => {
      const real = await post('/password/forgot', { email });
      const ghost = await post('/password/forgot', { email: `${prefix}-ghost@championways.test` });
      assert.equal(real.status, 200);
      assert.equal(ghost.status, 200);
      assert.deepEqual(await real.json(), await ghost.json());
      assert.ok(await latestToken(email));
      assert.equal(await latestToken(`${prefix}-ghost@championways.test`), undefined);
    });

    await t.test('a second request within a minute does not send another email', async () => {
      const before = await db.select().from(passwordResets).where(eq(passwordResets.email, email));
      assert.equal((await post('/password/forgot', { email })).status, 200);
      const after = await db.select().from(passwordResets).where(eq(passwordResets.email, email));
      assert.equal(after.length, before.length);
    });

    await t.test('a weak new password is refused and the link still works', async () => {
      const token = (await latestToken(email))!;
      const weak = await post('/password/reset', { token, password: 'short' });
      assert.equal(weak.status, 400);
      const [row] = await db.select().from(passwordResets).where(eq(passwordResets.email, email));
      assert.equal(row.usedAt, null);
    });

    await t.test('the link sets a new password, signs every device out, and works only once', async () => {
      const signedIn = await login(email, oldPassword);
      assert.equal(signedIn.status, 200);
      const token = (await latestToken(email))!;
      assert.equal((await post('/password/reset', { token, password: newPassword })).status, 200);

      assert.equal((await db.select().from(sessions).where(eq(sessions.userId, `${prefix}-u0`))).length, 0);
      assert.equal((await login(email, oldPassword)).status, 401);
      assert.equal((await login(email, newPassword)).status, 200);
      const [user] = await db.select().from(users).where(eq(users.id, `${prefix}-u0`));
      assert.ok(user.emailVerifiedAt, 'opening the emailed link proves the inbox');

      const again = await post('/password/reset', { token, password: 'yet another passphrase' });
      assert.equal(again.status, 400);
    });

    await t.test('a link stops working once the account email changes, or once it expires', async () => {
      // ขอไปแล้ว 3 ครั้ง ครบเพดานต่ออีเมล ล้างตัวนับก่อน (เทสนี้เป็นที่เดียวที่ใช้ตัวนับประเภทนี้)
      await db.delete(authAttempts).where(eq(authAttempts.kind, 'password_reset'));
      await db.delete(passwordResets).where(eq(passwordResets.userId, `${prefix}-u0`));
      await post('/password/forgot', { email });
      const token = (await latestToken(email))!;
      await db.update(users).set({ email: `${prefix}-moved@championways.test` }).where(eq(users.id, `${prefix}-u0`));
      assert.equal((await post('/password/reset', { token, password: 'changed after move!' })).status, 400);
      await db.update(users).set({ email }).where(eq(users.id, `${prefix}-u0`));

      await db.delete(passwordResets).where(eq(passwordResets.userId, `${prefix}-u0`));
      await post('/password/forgot', { email });
      const late = (await latestToken(email))!;
      await db.update(passwordResets).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(passwordResets.userId, `${prefix}-u0`));
      assert.equal((await post('/password/reset', { token: late, password: 'too late passphrase' })).status, 400);
      assert.equal((await login(email, newPassword)).status, 200);
    });

    await t.test('an email can ask for at most three links an hour', async () => {
      const target = `${prefix}-flood@championways.test`;
      const statuses = [];
      for (let i = 0; i < 4; i++) statuses.push((await post('/password/forgot', { email: target })).status);
      assert.deepEqual(statuses, [200, 200, 200, 429]);
    });
  } finally {
    const ids = (await db.select({ id: users.id }).from(users).where(like(users.email, `${prefix}%`))).map((row) => row.id);
    if (ids.length) {
      await db.delete(sessions).where(inArray(sessions.userId, ids));
      await db.delete(users).where(inArray(users.id, ids));
    }
    await db.delete(emailLog).where(like(emailLog.to, `${prefix}%`));
    await client.end();
  }
});
