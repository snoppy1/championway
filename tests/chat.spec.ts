import { test, expect, request as playwrightRequest } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../server/db/client';
import {
  users, mentors, mentorSubmissions, chatInvites, chatMessages, chatRooms,
  bookings, bookingEvents, mentorSlots,
} from '../server/db/schema';
import { createAccount, removeAccount, signIn } from './helpers';

async function setup(baseURL: string) {
  const accounts = await Promise.all(Array.from({ length: 4 }, () => createAccount('member')));
  const clients: APIRequestContext[] = [];
  const mentorId = `chat-test-${randomUUID()}`;
  const mentorName = `พี่เมนเทอร์ทดสอบ ${mentorId.slice(-6)}`;
  const submissionId = `chat-sub-${randomUUID()}`;
  for (const a of accounts) {
    await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, a.id));
    const client = await playwrightRequest.newContext({ baseURL });
    expect((await client.post('/api/auth/login', { data: { email: a.email, password: a.password } })).status()).toBe(200);
    clients.push(client);
  }
  await db.insert(mentors).values({ id: mentorId, name: mentorName, avatar: 'ม', bio: 'ช่วยทีมพัฒนาไอเดีย', replyTime: 'ภายในวันเดียว', price: 800, best: 'วิเคราะห์โจทย์', cannot: 'ไม่ทำงานแทน' });
  const [sample] = await db.select().from(mentorSubmissions).limit(1);
  await db.insert(mentorSubmissions).values({ ...sample, id: submissionId, userId: accounts[1].id, publishedMentorId: mentorId, status: 'published' });
  // เมนเทอร์เลือกช่วยเวทีนี้โดยตรง จึงจับคู่ได้โดยไม่ต้องพึ่งคะแนนจากข้อความในใบสมัคร
  expect((await clients[1].post('/api/journey/profile/choices', { data: { slug: EVENT, choice: 'help' } })).status()).toBe(200);
  return {
    accounts, clients, mentorId, mentorName,
    async close() {
      // bookings อ้างถึง users แบบไม่ cascade ต้องลบก่อนลบบัญชี
      const rows = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.mentorId, mentorId));
      for (const row of rows) {
        await db.delete(bookingEvents).where(eq(bookingEvents.bookingId, row.id));
        await db.delete(bookings).where(eq(bookings.id, row.id));
      }
      await db.delete(mentorSlots).where(eq(mentorSlots.mentorId, mentorId));
      await db.delete(mentorSubmissions).where(eq(mentorSubmissions.id, submissionId));
      await db.delete(mentors).where(eq(mentors.id, mentorId));
      for (const a of accounts) await removeAccount(a);
      await Promise.all(clients.map(c => c.dispose()));
    },
  };
}

/* กลุ่มแชตเกิดจากนัดที่เมนเทอร์รับแล้วเท่านั้น เทสจึงต้องเดินเส้นทางจริง:
   เมนเทอร์เปิดช่องเวลา → เจ้าของทีมขอจอง → เมนเทอร์รับ → ได้ห้องแชต */
const EVENT = 'venture-ignite';
async function openSlot(mentor: APIRequestContext, hoursAhead: number) {
  const startsAt = new Date(Date.now() + hoursAhead * 3600000).toISOString();
  expect((await mentor.post('/api/journey/profile/slots', { data: { startsAt } })).status()).toBe(201);
  const profile = await (await mentor.get('/api/journey/profile')).json();
  return profile.slots.at(-1).id as string;
}
async function bookRoom(owner: APIRequestContext, mentor: APIRequestContext, mentorId: string) {
  const slotId = await openSlot(mentor, 24);
  const asked = await owner.post('/api/journey/bookings', {
    data: { mentorId, competition: EVENT, slotId, title: 'ทีม Next Step', context: 'เตรียมแผนธุรกิจเพื่อสังคม อยากฝึก Pitch ให้ชัดเจน' },
  });
  expect(asked.status()).toBe(201);
  const { id } = await asked.json();
  // ต้องติ๊กยืนยันว่าไม่ได้เป็นกรรมการตัดสินก่อน จึงจะรับคำขอได้
  expect((await mentor.post(`/api/journey/bookings/${id}/respond`, { data: { action: 'accept' } })).status()).toBe(400);
  const accepted = await mentor.post(`/api/journey/bookings/${id}/respond`, { data: { action: 'accept', noConflict: true } });
  expect(accepted.status()).toBe(200);
  return { bookingId: id as string, roomId: (await accepted.json()).roomId as string };
}

test('group owner permissions, invitations, mentor acceptance, private files and removal', async ({ baseURL }) => {
  const s = await setup(baseURL!);
  const [owner, mentor, member, outsider] = s.clients;
  try {
    const { bookingId, roomId: id } = await bookRoom(owner, mentor, s.mentorId);
    expect((await outsider.get(`/api/chats/${id}`)).status()).toBe(404);
    // รับคำขอซ้ำต้องได้ห้องเดิม ไม่สร้างห้องใหม่
    const again = await mentor.post(`/api/journey/bookings/${bookingId}/respond`, { data: { action: 'accept', noConflict: true } });
    expect((await again.json()).roomId).toBe(id);
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
    // ปิดทางตั้งนัดภายนอกแล้ว ทุกการปรึกษาอยู่ในแชตของเว็บ
    expect((await owner.post(`/api/chats/${id}/meeting`, { data: { url: 'https://meet.google.com/abc-defg-hij', at: new Date(Date.now() + 86400000).toISOString() } })).status()).toBe(404);
    // สร้างกลุ่มข้ามขั้นตอนไม่ได้อีกแล้ว
    expect((await owner.post('/api/chats', { data: { mentorId: s.mentorId, title: 'ข้าม', context: 'ข้ามขั้นตอน' } })).status()).toBe(404);
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
    const { roomId: id } = await bookRoom(owner, mentor, s.mentorId);
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
    // ห้องที่เปิดจากนัดเป็น active ตั้งแต่แรก จึงส่งข้อความได้ทันที
    expect((await owner.post(`/api/chats/${id}/messages`, { multipart: { text: 'พร้อมคุยแล้ว', clientId: randomUUID() } })).status()).toBe(201);
  } finally { await s.close(); }
});

test('event to mentor to booking to chat, end to end; responsive visual QA', async ({ page, baseURL }, info) => {
  const s = await setup(baseURL!); const mentor = s.clients[1];
  let roomId: string | undefined;
  try {
    const slotId = await openSlot(mentor, 30);

    // เส้นทางจริงเริ่มจากเวที ไม่ใช่จากหน้าเลือกเมนเทอร์
    await signIn(page, s.accounts[0], `/competitions/${EVENT}`);
    const card = page.locator('.mentor-match').filter({ hasText: s.mentorName });
    await card.getByRole('link', { name: 'ดูโปรไฟล์และขอจอง' }).click();
    await expect(page.getByRole('heading', { level: 1, name: s.mentorName })).toBeVisible();
    await expect(page.getByText('เลือกช่วยงานนี้')).toBeVisible();

    await page.locator(`input[name="slot"]`).first().check();
    await page.getByLabel('ชื่อทีม *').fill('ทีม Next Step · เตรียม Pitch');
    await page.getByLabel('อยากให้ช่วยเรื่องอะไร *').fill('เรากำลังเตรียมแผนธุรกิจเพื่อสังคม อยากฝึกนำเสนอไอเดียและวิเคราะห์โจทย์ร่วมกับเมนเทอร์');
    await page.getByRole('button', { name: 'ส่งคำขอจอง' }).click();

    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByText('รอเมนเทอร์ยืนยัน')).toBeVisible();

    const profile = await (await s.clients[0].get('/api/journey/profile')).json();
    const bookingId = profile.bookings[0].id;
    expect(profile.bookings[0].slotId).toBe(slotId);
    const accepted = await mentor.post(`/api/journey/bookings/${bookingId}/respond`, { data: { action: 'accept', noConflict: true } });
    roomId = (await accepted.json()).roomId;

    await page.reload();
    await expect(page.getByText('ยืนยันแล้ว')).toBeVisible();
    await page.getByRole('link', { name: 'เปิดแชตของนัดนี้' }).click();
    await expect(page).toHaveURL(new RegExp(`/chats/${roomId}$`));

    await page.getByLabel('ข้อความ', { exact: true }).fill('สวัสดีครับ ฝากช่วยดูโจทย์ของทีมหน่อยครับ');
    await page.getByRole('button', { name: 'ส่ง', exact: true }).click();
    await expect(page.locator('.chat-bubble')).toContainText('สวัสดีครับ');
    await mentor.post(`/api/chats/${roomId}/messages`, { multipart: { text: 'ยินดีครับ ส่งโจทย์และสิ่งที่ทีมลองทำมาแล้วได้เลย', clientId: randomUUID() } });
    await expect(page.locator('.chat-bubble').last()).toContainText('ยินดีครับ', { timeout: 10000 });

    await page.getByLabel('อีเมลสมาชิกที่ต้องการเชิญ').fill(s.accounts[2].email);
    await page.getByRole('button', { name: 'เชิญสมาชิก', exact: true }).click();
    await expect(page.getByText('สร้างคำเชิญแล้ว', { exact: false })).toBeVisible();

    // ไม่มีฟอร์มนัดคอลภายนอกอีกแล้ว
    await expect(page.getByLabel('ลิงก์ Google Meet / Zoom')).toHaveCount(0);

    await page.reload();
    await expect(page.locator('.chat-bubble').first()).toContainText('สวัสดีครับ');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include('main').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `artifacts/chat-${info.project.name}.png`, fullPage: true });
    await page.getByRole('link', { name: 'กลุ่มทั้งหมด', exact: false }).click();
    await expect(page.getByRole('link', { name: /ทีม Next Step/ })).toBeVisible();
  } finally { if (roomId) await db.delete(chatRooms).where(eq(chatRooms.id, roomId)); await s.close(); }
});
