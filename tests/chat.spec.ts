import { test, expect, request as playwrightRequest } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../server/db/client';
import { users, mentors, mentorSubmissions, chatInvites, chatMessages, chatRooms } from '../server/db/schema';
import { createAccount, removeAccount, signIn } from './helpers';

async function setup(baseURL: string) {
  const accounts = await Promise.all(Array.from({ length: 4 }, () => createAccount('member')));
  const clients: APIRequestContext[] = [];
  const mentorId = `chat-test-${randomUUID()}`;
  const submissionId = `chat-sub-${randomUUID()}`;
  for (const a of accounts) {
    await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, a.id));
    const client = await playwrightRequest.newContext({ baseURL });
    expect((await client.post('/api/auth/login', { data: { email: a.email, password: a.password } })).status()).toBe(200);
    clients.push(client);
  }
  await db.insert(mentors).values({ id: mentorId, name: 'พี่เมนเทอร์ทดสอบ', avatar: 'ม', bio: 'ช่วยทีมพัฒนาไอเดีย', replyTime: 'ภายในวันเดียว', price: 800, best: 'วิเคราะห์โจทย์', cannot: 'ไม่ทำงานแทน' });
  const [sample] = await db.select().from(mentorSubmissions).limit(1);
  await db.insert(mentorSubmissions).values({ ...sample, id: submissionId, userId: accounts[1].id, publishedMentorId: mentorId, status: 'published' });
  return { accounts, clients, mentorId, async close() { await db.delete(mentorSubmissions).where(eq(mentorSubmissions.id, submissionId)); await db.delete(mentors).where(eq(mentors.id, mentorId)); for (const a of accounts) await removeAccount(a); await Promise.all(clients.map(c => c.dispose())); } };
}
async function createRoom(owner: APIRequestContext, mentorId: string) {
  const response = await owner.post('/api/chats', { data: { mentorId, title: 'ทีม Next Step', context: 'เตรียมแผนธุรกิจเพื่อสังคม อยากฝึก Pitch ให้ชัดเจน' } });
  expect(response.status()).toBe(201);
  return (await response.json()).id as string;
}

test('group owner permissions, invitations, mentor acceptance, private files and removal', async ({ baseURL }) => {
  const s = await setup(baseURL!);
  const [owner, mentor, member, outsider] = s.clients;
  try {
    const id = await createRoom(owner, s.mentorId);
    expect((await outsider.get(`/api/chats/${id}`)).status()).toBe(404);
    expect((await mentor.get(`/api/chats/${id}/messages`)).status()).toBe(404);
    expect((await mentor.post(`/api/chats/requests/${id}`, { data: { accept: true } })).status()).toBe(400);
    expect((await mentor.post(`/api/chats/requests/${id}`, { data: { accept: true, noConflict: true } })).status()).toBe(200);
    expect((await mentor.post(`/api/chats/${id}/invites`, { data: { email: s.accounts[2].email } })).status()).toBe(403);
    expect((await owner.post(`/api/chats/${id}/invites`, { data: { email: s.accounts[2].email } })).status()).toBe(200);
    const [invite] = (await (await member.get('/api/chats')).json()).invites;
    expect((await outsider.post(`/api/chats/invites/${invite.id}/accept`, { data: {} })).status()).toBe(403);
    await db.update(users).set({ emailVerifiedAt: null }).where(eq(users.id, s.accounts[2].id));
    expect((await member.post(`/api/chats/invites/${invite.id}/accept`, { data: {} })).status()).toBe(403);
    await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, s.accounts[2].id));
    expect((await member.post(`/api/chats/invites/${invite.id}/accept`, { data: {} })).status()).toBe(200);
    expect((await member.post(`/api/chats/${id}/invites`, { data: { email: s.accounts[3].email } })).status()).toBe(403);
    expect((await member.delete(`/api/chats/${id}/members/${s.accounts[0].id}`)).status()).toBe(403);
    const key = randomUUID();
    const sent = await member.post(`/api/chats/${id}/messages`, { multipart: { text: 'โจทย์ของทีม', clientId: key, file: { name: 'brief.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test brief') } } });
    expect(sent.status()).toBe(201);
    const messageId = (await sent.json()).id;
    const duplicate = await member.post(`/api/chats/${id}/messages`, { multipart: { text: 'โจทย์ของทีม', clientId: key } });
    expect((await duplicate.json()).id).toBe(messageId);
    expect((await (await owner.get(`/api/chats/${id}/messages`)).json()).messages).toHaveLength(1);
    const file = await owner.get(`/api/chats/${id}/files/${messageId}`);
    expect(file.status()).toBe(200); expect(file.headers()['cache-control']).toBe('private, no-store');
    expect((await outsider.get(`/api/chats/${id}/files/${messageId}`)).status()).toBe(404);
    expect((await owner.post(`/api/chats/${id}/read`, { data: { messageId } })).status()).toBe(200);
    expect((await (await member.get(`/api/chats/${id}`)).json()).members.find((m: { id: string }) => m.id === s.accounts[0].id).readAt).toBeTruthy();
    const at = new Date(Date.now() + 86400000).toISOString();
    expect((await member.post(`/api/chats/${id}/meeting`, { data: { url: 'https://meet.google.com/abc-defg-hij', at } })).status()).toBe(403);
    expect((await owner.post(`/api/chats/${id}/meeting`, { data: { url: 'https://zoom.us.evil.example/x', at } })).status()).toBe(400);
    expect((await mentor.post(`/api/chats/${id}/meeting`, { data: { url: 'https://meet.google.com/abc-defg-hij', at } })).status()).toBe(200);
    expect((await owner.delete(`/api/chats/${id}/members/${s.accounts[2].id}`)).status()).toBe(200);
    expect((await member.get(`/api/chats/${id}/messages`)).status()).toBe(404);
    expect((await member.get(`/api/chats/${id}/files/${messageId}`)).status()).toBe(404);
    expect((await member.post(`/api/chats/${id}/messages`, { multipart: { text: 'removed', clientId: randomUUID() } })).status()).toBe(404);
    expect((await owner.post(`/api/chats/${id}/messages`, { headers: { origin: 'https://outside.example' }, multipart: { text: 'forged', clientId: randomUUID() } })).status()).toBe(403);
  } finally { await s.close(); }
});

test('expired and cancelled invitations, rejected requests, pagination and file validation', async ({ baseURL }) => {
  const s = await setup(baseURL!); const [owner, mentor, member] = s.clients;
  try {
    const id = await createRoom(owner, s.mentorId);
    await owner.post(`/api/chats/${id}/invites`, { data: { email: s.accounts[2].email } });
    const [invite] = (await (await owner.get(`/api/chats/${id}`)).json()).invites;
    await db.update(chatInvites).set({ expiresAt: new Date(0) }).where(eq(chatInvites.id, invite.id));
    expect((await member.post(`/api/chats/invites/${invite.id}/accept`, { data: {} })).status()).toBe(403);
    await owner.delete(`/api/chats/${id}/invites/${invite.id}`);
    expect((await member.post(`/api/chats/invites/${invite.id}/accept`, { data: {} })).status()).toBe(404);
    expect((await owner.post(`/api/chats/${id}/messages`, { multipart: { text: '', clientId: randomUUID() } })).status()).toBe(400);
    expect((await owner.post(`/api/chats/${id}/messages`, { multipart: { text: '', clientId: randomUUID(), file: { name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not png') } } })).status()).toBe(400);
    expect((await owner.post(`/api/chats/${id}/messages`, { multipart: { text: '', clientId: randomUUID(), file: { name: 'large.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(2 * 1024 * 1024 + 1) } } })).status()).toBe(400);
    await db.insert(chatMessages).values(Array.from({ length: 55 }, (_, i) => ({ id: randomUUID(), clientId: randomUUID(), roomId: id, senderId: s.accounts[0].id, body: `message ${i}` })));
    const latest = await (await owner.get(`/api/chats/${id}/messages`)).json();
    expect(latest.messages).toHaveLength(50); expect(latest.hasMore).toBe(true);
    const older = await (await owner.get(`/api/chats/${id}/messages?before=${latest.messages[0].id}`)).json();
    expect(older.messages).toHaveLength(5);
    const following = await (await owner.get(`/api/chats/${id}/messages?after=${older.messages.at(-1).id}`)).json();
    expect(following.messages.map((m: { id: string }) => m.id)).toEqual(latest.messages.map((m: { id: string }) => m.id));
    await mentor.post(`/api/chats/requests/${id}`, { data: { accept: false } });
    expect((await owner.post(`/api/chats/${id}/messages`, { multipart: { text: 'after decline', clientId: randomUUID() } })).status()).toBe(409);
  } finally { await s.close(); }
});

test('owner creates group, sends chat and invites a teammate; responsive visual QA', async ({ page, baseURL }, info) => {
  const s = await setup(baseURL!); const mentor = s.clients[1];
  let roomId: string | undefined;
  try {
    await signIn(page, s.accounts[0], `/chats/new?mentor=${s.mentorId}`);
    await page.getByLabel('ชื่อกลุ่ม', { exact: true }).fill('ทีม Next Step · เตรียม Pitch');
    await page.getByLabel('เวทีและสิ่งที่อยากให้ช่วย').fill('เรากำลังเตรียมแผนธุรกิจเพื่อสังคม อยากฝึกนำเสนอไอเดียและวิเคราะห์โจทย์ร่วมกับเมนเทอร์');
    await page.getByRole('button', { name: 'สร้างกลุ่มและส่งคำขอ' }).click();
    await expect(page).toHaveURL(/\/chats\/room_/);
    roomId = new URL(page.url()).pathname.split('/').pop()!;
    await expect(page.getByText('รอเมนเทอร์รับคำขอ', { exact: false })).toBeVisible();
    await mentor.post(`/api/chats/requests/${roomId}`, { data: { accept: true, noConflict: true } });
    await expect(page.getByRole('heading', { name: 'นัดหมายวิดีโอคอล' })).toBeVisible({ timeout: 10000 });
    await page.getByLabel('ข้อความ', { exact: true }).fill('สวัสดีครับ ฝากช่วยดูโจทย์ของทีมหน่อยครับ');
    await page.getByRole('button', { name: 'ส่ง', exact: true }).click();
    await expect(page.locator('.chat-bubble')).toContainText('สวัสดีครับ');
    await mentor.post(`/api/chats/${roomId}/messages`, { multipart: { text: 'ยินดีครับ ส่งโจทย์และสิ่งที่ทีมลองทำมาแล้วได้เลย', clientId: randomUUID() } });
    await expect(page.locator('.chat-bubble').last()).toContainText('ยินดีครับ', { timeout: 10000 });
    await page.getByLabel('อีเมลสมาชิกที่ต้องการเชิญ').fill(s.accounts[2].email);
    await page.getByRole('button', { name: 'เชิญสมาชิก', exact: true }).click();
    await expect(page.getByText('สร้างคำเชิญแล้ว', { exact: false })).toBeVisible();
    await page.getByLabel('ลิงก์ Google Meet / Zoom').fill('https://meet.google.com/abc-defg-hij');
    const at = new Date(Date.now() + 86400000); const pad = (n: number) => String(n).padStart(2,'0');
    await page.getByLabel('วันเวลานัด (ตามเวลาในเครื่อง)').fill(`${at.getFullYear()}-${pad(at.getMonth()+1)}-${pad(at.getDate())}T18:00`);
    await page.getByRole('button', { name: 'บันทึกนัดหมาย' }).click();
    await expect(page.getByRole('link', { name: 'เข้าร่วมคอล' })).toHaveAttribute('target', '_blank');
    await page.reload();
    await expect(page.locator('.chat-bubble').first()).toContainText('สวัสดีครับ');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include('main').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `artifacts/chat-${info.project.name}.png`, fullPage: true });
    await page.getByRole('link', { name: 'กลุ่มทั้งหมด', exact: false }).click();
    await expect(page.getByRole('link', { name: /ทีม Next Step/ })).toBeVisible();
  } finally { if (roomId) await db.delete(chatRooms).where(eq(chatRooms.id, roomId)); await s.close(); }
});
