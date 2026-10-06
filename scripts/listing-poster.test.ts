import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { inArray, like } from 'drizzle-orm';
import { app } from '../server/app';
import { db, client } from '../server/db/client';
import { competitions, files, sessions, users } from '../server/db/schema';
import { testDatabase } from '../server/lib/database-safety';
import { createSession } from '../server/lib/session';

/* โปสเตอร์ของเวที และรูปแบบงาน "ทั่วประเทศ" (ผู้ใช้ขอ 6 ต.ค. 2569)
   ทีมงานอัปโหลดโปสเตอร์จากฟอร์มเพิ่มเวที ทุกคนเปิดดูได้โดยไม่ต้องเข้าสู่ระบบ ไฟล์อื่นยังต้องมีสิทธิ์เหมือนเดิม */

testDatabase(process.env);
const prefix = `poster-${randomUUID().slice(0, 8)}`;
const userIds: string[] = [];
async function account(role: 'admin' | 'member') {
  const id = `${prefix}-${role}`;
  await db.insert(users).values({ id, email: `${id}@championways.test`, name: role, role, emailVerifiedAt: new Date() });
  userIds.push(id);
  return `cw_session=${(await createSession(id)).id}`;
}
const png = () => new File([Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')], 'poster.png', { type: 'image/png' });

test('admins upload a poster that anyone can see, and listings only accept our own poster links', async () => {
  const admin = await account('admin');
  const member = await account('member');
  try {
    const form = () => { const body = new FormData(); body.append('file', png()); return body; };
    assert.equal((await app.request('/api/admin/listings/poster', { method: 'POST', headers: { cookie: member }, body: form() })).status, 403);
    const pdf = new FormData();
    pdf.append('file', new File([Buffer.from('%PDF-1.4')], 'a.pdf', { type: 'application/pdf' }));
    assert.equal((await app.request('/api/admin/listings/poster', { method: 'POST', headers: { cookie: admin }, body: pdf })).status, 400);
    const uploaded = await app.request('/api/admin/listings/poster', { method: 'POST', headers: { cookie: admin }, body: form() });
    assert.equal(uploaded.status, 201, await uploaded.clone().text());
    const { url } = await uploaded.json() as { url: string };
    assert.match(url, /^\/api\/files\/fil_/);
    // โปสเตอร์เปิดได้โดยไม่ต้องเข้าสู่ระบบ
    assert.equal((await app.request(url)).status, 200);

    const listing = {
      kind: 'hackathon', themes: ['innovation'], name: `${prefix} งานทั่วประเทศ`, description: 'สรุป', type: 'contest', org: 'ผู้จัด',
      categories: ['technology'], levels: ['university'], teamMin: 1, teamMax: 3, closesAt: '2099-02-01', region: 'nationwide',
      prizeValue: 1000, sourceUrl: 'https://example.test/a',
    };
    const post = (body: unknown) => app.request('/api/admin/listings', {
      method: 'POST', headers: { cookie: admin, 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal((await post({ ...listing, posterUrl: 'https://evil.example/x.png' })).status, 400);
    const created = await post({ ...listing, posterUrl: url });
    assert.equal(created.status, 201, await created.clone().text());
    const { slug } = await created.json() as { slug: string };
    const page = await (await app.request(`/api/competitions/${slug}`)).json();
    assert.deepEqual([page.competition.posterUrl, page.competition.region], [url, 'nationwide']);

    // ไฟล์อื่นยังต้องมีสิทธิ์ (ไฟล์ส่วนตัวของสมาชิก)
    const own = new FormData();
    own.append('file', png());
    const mine = await (await app.request('/api/files', { method: 'POST', headers: { cookie: member }, body: own })).json() as { file: { id: string } };
    assert.equal((await app.request(`/api/files/${mine.file.id}`)).status, 401);
    assert.equal((await app.request(`/api/files/${mine.file.id}`, { headers: { cookie: member } })).status, 200);
  } finally {
    await db.delete(competitions).where(like(competitions.name, `${prefix}%`));
    await db.delete(files).where(inArray(files.ownerId, userIds));
    await db.delete(sessions).where(inArray(sessions.userId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
    await client.end();
  }
});
