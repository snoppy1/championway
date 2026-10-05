import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { inArray, like } from 'drizzle-orm';
import { app } from '../server/app';
import { db, client } from '../server/db/client';
import { authAttempts, sessions, users } from '../server/db/schema';
import { testDatabase } from '../server/lib/database-safety';
import { hashPassword } from '../server/lib/password';

/* กันไล่เดารหัสผ่าน (5 ต.ค. 2569): ผิด 5 ครั้งใน 15 นาทีต่ออีเมลต้องรอ แม้ครั้งต่อไปใส่รหัสถูก
   และสมัครสมาชิกจาก IP เดียวได้ 10 ครั้งต่อชั่วโมง (นับ IP เฉพาะบน Vercel) */

testDatabase(process.env);
const prefix = `rl-${randomUUID().slice(0, 8)}`;
const password = 'correct horse battery';
const post = (path: string, body: unknown, ip?: string) => app.request(`/api/auth${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...(ip ? { 'x-vercel-forwarded-for': ip } : {}) }, body: JSON.stringify(body),
});
const login = (email: string, pass: string) => post('/login', { email, password: pass });

test('failed sign-ins and sign-ups are throttled', async (t) => {
  const victim = `${prefix}-victim@championways.test`;
  const other = `${prefix}-other@championways.test`;
  await db.insert(users).values([victim, other].map((email, i) => ({ id: `${prefix}-u${i}`, email, name: 'ทดสอบ', passwordHash: '' })));
  const hash = await hashPassword(password);
  await db.update(users).set({ passwordHash: hash }).where(inArray(users.email, [victim, other]));
  try {
    await t.test('a correct sign-in clears earlier mistakes', async () => {
      for (let i = 0; i < 4; i++) assert.equal((await login(other, 'wrong password!')).status, 401);
      assert.equal((await login(other, password)).status, 200);
      for (let i = 0; i < 4; i++) assert.equal((await login(other, 'wrong password!')).status, 401);
      assert.equal((await login(other, password)).status, 200);
    });

    await t.test('five wrong passwords lock that email for a while, even with the right password', async () => {
      for (let i = 0; i < 5; i++) assert.equal((await login(victim, 'wrong password!')).status, 401);
      const locked = await login(victim, password);
      assert.equal(locked.status, 429);
      assert.match((await locked.json()).error, /15 นาที/);
      // อีเมลอื่นไม่โดนด้วย
      assert.equal((await login(other, password)).status, 200);
      // บัญชีที่ไม่มีอยู่จริงก็นับเหมือนกัน ไม่บอกใบ้ว่ามีบัญชีหรือไม่
      const ghost = `${prefix}-ghost@championways.test`;
      for (let i = 0; i < 5; i++) assert.equal((await login(ghost, 'wrong password!')).status, 401);
      assert.equal((await login(ghost, 'wrong password!')).status, 429);
    });

    await t.test('the stored keys are hashes, never the email itself', async () => {
      const rows = await db.select().from(authAttempts).where(like(authAttempts.keyHash, `%${prefix}%`));
      assert.equal(rows.length, 0);
    });

    await t.test('one network can only sign up ten times an hour on Vercel', async () => {
      process.env.VERCEL = '1';
      const ip = `203.0.113.${Math.floor(Math.random() * 250) + 1}-${prefix}`;
      try {
        for (let i = 0; i < 10; i++) {
          const response = await post('/signup', { email: `${prefix}-s${i}@championways.test`, password, name: 'ทดสอบ' }, ip);
          assert.equal(response.status, 201, await response.clone().text());
        }
        const blocked = await post('/signup', { email: `${prefix}-s10@championways.test`, password, name: 'ทดสอบ' }, ip);
        assert.equal(blocked.status, 429);
        // เครือข่ายอื่นยังสมัครได้
        const elsewhere = await post('/signup', { email: `${prefix}-s11@championways.test`, password, name: 'ทดสอบ' }, `${ip}-b`);
        assert.equal(elsewhere.status, 201);
      } finally {
        delete process.env.VERCEL;
      }
    });
  } finally {
    const ids = (await db.select({ id: users.id }).from(users).where(like(users.email, `${prefix}%`))).map((row) => row.id);
    if (ids.length) {
      await db.delete(sessions).where(inArray(sessions.userId, ids));
      await db.delete(users).where(inArray(users.id, ids));
    }
    await client.end();
  }
});
