import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { inArray, like } from 'drizzle-orm';
import { app } from '../server/app';
import { db, client } from '../server/db/client';
import { files, sessions, users } from '../server/db/schema';
import { testDatabase } from '../server/lib/database-safety';
import { createSession } from '../server/lib/session';

/* ตรวจความปลอดภัย 31 ต.ค. 2569: ไฟล์ปลอมชนิด, ลิงก์ javascript:, คำขอข้ามเว็บที่ /api/files */

testDatabase(process.env);
const prefix = `sec-${randomUUID().slice(0, 8)}`;
const userIds: string[] = [];
async function account(role: 'admin' | 'member') {
  const id = `${prefix}-${role}`;
  await db.insert(users).values({ id, email: `${id}@championways.test`, name: role, role, emailVerifiedAt: new Date() });
  userIds.push(id);
  return `cw_session=${(await createSession(id)).id}`;
}
const form = (file: File) => { const body = new FormData(); body.append('file', file); return body; };
const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

test('uploads are checked by their real header, named by type, and refused from other sites', async () => {
  const member = await account('member');
  try {
    const fake = new File(['<script>alert(1)</script>'], 'x.png', { type: 'image/png' });
    assert.equal((await app.request('/api/files', { method: 'POST', headers: { cookie: member }, body: form(fake) })).status, 400);

    const crossSite = await app.request('/api/files', {
      method: 'POST', headers: { cookie: member, origin: 'https://evil.example' }, body: form(new File([png], 'a.png', { type: 'image/png' })),
    });
    assert.equal(crossSite.status, 403);

    const ok = await app.request('/api/files', { method: 'POST', headers: { cookie: member }, body: form(new File([png], 'page.html', { type: 'image/png' })) });
    assert.equal(ok.status, 201, await ok.clone().text());
    const { file } = await ok.json() as { file: { id: string } };
    const [row] = await db.select({ path: files.path }).from(files).where(inArray(files.id, [file.id]));
    assert.match(row.path, /\.png$/);
  } finally {
    await db.delete(files).where(inArray(files.ownerId, userIds));
  }
});

test('competition links must be http or https', async () => {
  const admin = await account('admin');
  const listing = {
    kind: 'hackathon', themes: ['innovation'], name: `${prefix} link`, description: 'สรุป', type: 'contest', org: 'ผู้จัด',
    categories: ['technology'], levels: ['university'], teamMin: 1, teamMax: 3, closesAt: '2099-02-01', region: 'nationwide',
    prizeValue: 1000, sourceUrl: 'https://example.test/a',
  };
  const post = (body: unknown) => app.request('/api/admin/listings', {
    method: 'POST', headers: { cookie: admin, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal((await post({ ...listing, sourceUrl: 'javascript:alert(1)' })).status, 400);
  assert.equal((await post({ ...listing, registerUrl: 'data:text/html,x' })).status, 400);
});

test.after(async () => {
  await db.delete(sessions).where(inArray(sessions.userId, userIds));
  await db.delete(users).where(like(users.id, `${prefix}%`));
  await client.end?.();
});
