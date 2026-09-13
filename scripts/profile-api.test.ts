import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { app } from '../server/app';
import { db, client } from '../server/db/client';
import { users, sessions, files } from '../server/db/schema';
import { testDatabase } from '../server/lib/database-safety';
import { createSession } from '../server/lib/session';
import { hashPassword, verifyPassword } from '../server/lib/password';

/* เทสฝั่งเซิร์ฟเวอร์ของหน้าแก้ไขโปรไฟล์ ยิงผ่าน app.request จริง ไม่เปิดเบราว์เซอร์
   เรื่องที่ต้องถูกคือสิทธิ์และผลข้างเคียง ไม่ใช่หน้าตา จึงคุมที่ชั้นนี้ */

testDatabase(process.env);

const prefix = `profile-${randomUUID()}`;
const created: string[] = [];

async function makeUser(extra: Partial<typeof users.$inferInsert> = {}) {
  const id = `${prefix}-${created.length}`;
  const [row] = await db.insert(users).values({
    id,
    email: `${id}@championways.test`,
    name: 'ผู้ใช้ทดสอบ',
    passwordHash: await hashPassword('start-password-1'),
    role: 'member',
    ...extra,
  }).returning();
  created.push(id);
  const session = await createSession(id);
  return { row, cookie: `cw_session=${session.id}` };
}

const send = (path: string, cookie: string, method: string, body: unknown) =>
  app.request(path, {
    method,
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

test('editing your own profile, email and password', async (t) => {
  try {
    await t.test('saves the profile block and hands back the updated account', async () => {
      const me = await makeUser();
      const response = await send('/api/auth/profile', me.cookie, 'PATCH', {
        name: 'ชื่อใหม่',
        bio: '  สนใจเวทีนวัตกรรม  ',
        occupation: 'นักเรียน',
        organization: 'โรงเรียนทดสอบ',
        position: 'มัธยมศึกษาปีที่ 5',
        educationLevel: 'secondary',
      });
      assert.equal(response.status, 200);
      const { user } = await response.json();
      assert.equal(user.name, 'ชื่อใหม่');
      // ช่องข้อความต้องถูกตัดช่องว่างหัวท้ายก่อนเก็บ
      assert.equal(user.bio, 'สนใจเวทีนวัตกรรม');
      assert.equal(user.educationLevel, 'secondary');
      // ต้องไม่มีแฮชรหัสผ่านหรือรหัส Google หลุดออกไปกับคำตอบ
      assert.equal(user.hasPassword, true);
      assert.equal('passwordHash' in user, false);
      assert.equal('googleId' in user, false);
    });

    await t.test('refuses values outside the agreed lists', async () => {
      const me = await makeUser();
      const base = { name: 'ชื่อ', bio: '', organization: '', position: '' };
      assert.equal((await send('/api/auth/profile', me.cookie, 'PATCH', { ...base, occupation: 'นายกรัฐมนตรี' })).status, 400);
      // open เป็นระดับที่เวทีเปิดรับ ไม่ใช่ระดับของคน จึงต้องถูกปฏิเสธ
      assert.equal((await send('/api/auth/profile', me.cookie, 'PATCH', { ...base, educationLevel: 'open' })).status, 400);
      assert.equal((await send('/api/auth/profile', me.cookie, 'PATCH', { ...base, name: '' })).status, 400);
      assert.equal((await app.request('/api/auth/profile', { method: 'PATCH', body: '{}' })).status, 401);
    });

    await t.test('an avatar must be a picture this user uploaded', async () => {
      const me = await makeUser();
      const other = await makeUser();
      const base = { name: 'ชื่อ', bio: '', organization: '', position: '' };

      const stranger = `${prefix}-file-other`;
      const document = `${prefix}-file-pdf`;
      await db.insert(files).values([
        { id: stranger, ownerType: 'user', ownerId: other.row.id, path: 'x.png', originalName: 'x.png', mime: 'image/png', size: 10 },
        { id: document, ownerType: 'user', ownerId: me.row.id, path: 'x.pdf', originalName: 'x.pdf', mime: 'application/pdf', size: 10 },
      ]);

      assert.equal((await send('/api/auth/profile', me.cookie, 'PATCH', { ...base, avatarFileId: stranger })).status, 400);
      assert.equal((await send('/api/auth/profile', me.cookie, 'PATCH', { ...base, avatarFileId: document })).status, 400);
      assert.equal((await send('/api/auth/profile', me.cookie, 'PATCH', { ...base, avatarFileId: 'ไม่มีอยู่' })).status, 400);

      const mine = `${prefix}-file-mine`;
      await db.insert(files).values({ id: mine, ownerType: 'user', ownerId: me.row.id, path: 'me.png', originalName: 'me.png', mime: 'image/png', size: 10 });
      const set = await send('/api/auth/profile', me.cookie, 'PATCH', { ...base, avatarFileId: mine });
      assert.equal((await set.json()).user.avatarUrl, `/api/files/${mine}`);

      // ไม่ส่ง avatarFileId มาเลย ต้องไม่ทำให้รูปเดิมหาย
      const kept = await send('/api/auth/profile', me.cookie, 'PATCH', base);
      assert.equal((await kept.json()).user.avatarUrl, `/api/files/${mine}`);

      const cleared = await send('/api/auth/profile', me.cookie, 'PATCH', { ...base, avatarFileId: null });
      assert.equal((await cleared.json()).user.avatarUrl, null);

      await db.delete(files).where(inArray(files.id, [stranger, document, mine]));
    });

    await t.test('changing the email needs the current password and clears the verified mark', async () => {
      const me = await makeUser({ emailVerifiedAt: new Date() });
      const taken = await makeUser();
      const fresh = `${prefix}-moved@championways.test`;

      assert.equal((await send('/api/auth/email', me.cookie, 'POST', { email: fresh, password: 'wrong-password' })).status, 401);
      assert.equal((await send('/api/auth/email', me.cookie, 'POST', { email: taken.row.email, password: 'start-password-1' })).status, 409);

      // ส่งมาเป็นตัวพิมพ์ใหญ่และมีช่องว่าง ต้องถูกทำให้เป็นรูปแบบเดียวกับตอนสมัคร
      const moved = await send('/api/auth/email', me.cookie, 'POST', {
        email: `  ${prefix.toUpperCase()}-MOVED@championways.test  `,
        password: 'start-password-1',
      });
      assert.equal(moved.status, 200);
      assert.equal((await moved.json()).user.email, fresh);
      const [row] = await db.select().from(users).where(eq(users.id, me.row.id));
      // อีเมลใหม่ยังไม่ผ่านการยืนยัน ห้ามสืบทอดสถานะยืนยันของอีเมลเดิม
      assert.equal(row.emailVerifiedAt, null);
    });

    await t.test('a Google account keeps the Google address and can set a first password', async () => {
      const me = await makeUser({ googleId: `${prefix}-sub`, passwordHash: null });
      const refused = await send('/api/auth/email', me.cookie, 'POST', { email: `${prefix}-nope@championways.test`, password: '' });
      assert.equal(refused.status, 400);
      assert.match((await refused.json()).error, /Google/);

      // ไม่มีรหัสเดิมให้ถาม จึงตั้งได้เลยด้วย session ที่ล็อกอินอยู่
      const set = await send('/api/auth/password', me.cookie, 'POST', { current: '', next: 'first-password-1' });
      assert.equal(set.status, 200);
      assert.equal((await set.json()).user.hasPassword, true);
      const [row] = await db.select().from(users).where(eq(users.id, me.row.id));
      assert.equal(await verifyPassword('first-password-1', row.passwordHash), true);
    });

    await t.test('changing the password signs other devices out but keeps this one', async () => {
      const me = await makeUser();
      const otherDevice = await createSession(me.row.id);

      assert.equal((await send('/api/auth/password', me.cookie, 'POST', { current: 'nope', next: 'brand-new-password' })).status, 401);
      assert.equal((await send('/api/auth/password', me.cookie, 'POST', { current: 'start-password-1', next: 'short' })).status, 400);

      const changed = await send('/api/auth/password', me.cookie, 'POST', { current: 'start-password-1', next: 'brand-new-password' });
      assert.equal(changed.status, 200);

      const renewed = changed.headers.getSetCookie().find((value) => value.startsWith('cw_session='));
      assert.ok(renewed, 'ต้องออกคุกกี้ใหม่ให้เครื่องที่เพิ่งเปลี่ยนรหัส');
      const stillMine = await app.request('/api/auth/me', { headers: { cookie: renewed!.split(';')[0] } });
      assert.equal((await stillMine.json()).user.id, me.row.id);

      const kicked = await app.request('/api/auth/me', { headers: { cookie: `cw_session=${otherDevice.id}` } });
      assert.equal((await kicked.json()).user, null);
    });

    await t.test('rejects state-changing requests that come from another site', async () => {
      const me = await makeUser();
      const response = await app.request('/api/auth/profile', {
        method: 'PATCH',
        headers: { cookie: me.cookie, 'content-type': 'application/json', origin: 'https://evil.example' },
        body: JSON.stringify({ name: 'ถูกยึด', bio: '', organization: '', position: '' }),
      });
      assert.equal(response.status, 403);
    });
  } finally {
    await db.delete(files).where(inArray(files.ownerId, created));
    await db.delete(sessions).where(inArray(sessions.userId, created));
    await db.delete(users).where(inArray(users.id, created));
    await client.end();
  }
});
