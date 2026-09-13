import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { bodyLimit } from 'hono/body-limit';
import { and, eq, gt, desc, asc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { chatRooms, chatMembers, chatInvites, chatMessages, users } from '../db/schema.js';
import { requireUser, type AppEnv } from '../lib/guards.js';
import { newId } from '../lib/id.js';
import { env } from '../lib/env.js';

export const chat = new Hono<AppEnv>();
chat.use('*', async (c, next) => { c.header('Cache-Control', 'private, no-store'); await next(); });
chat.use('*', requireUser);
chat.use('*', bodyLimit({ maxSize: 2300000, onError: c => c.json({ error: 'ไฟล์ต้องไม่เกิน 2 MB' }, 413) }));
chat.use('*', async (c, next) => {
  const origin = c.req.header('origin');
  if (!['GET', 'HEAD'].includes(c.req.method) && origin && origin !== env.appOrigin) return c.json({ error: 'คำขอต้องมาจากเว็บนี้' }, 403);
  await next();
});
const bad = (message: string, status: 400 | 403 | 404 | 409 = 400): never => { throw new HTTPException(status, { message }); };
async function roomFor(id: string, userId: string) {
  const [row] = await db.select().from(chatRooms).innerJoin(chatMembers, eq(chatMembers.roomId, chatRooms.id)).where(and(eq(chatRooms.id, id), eq(chatMembers.userId, userId)));
  if (!row) return bad('ไม่พบกลุ่มหรือคุณไม่ได้เป็นสมาชิก', 404);
  return row.chat_rooms;
}
// Serialize membership changes and writes per room, so removal cannot race a send.
async function mutate<T>(id: string, userId: string, action: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0], room: typeof chatRooms.$inferSelect) => Promise<T>, owner = false) {
  return db.transaction(async tx => {
    const [room] = await tx.select().from(chatRooms).where(eq(chatRooms.id, id)).for('update');
    if (!room) return bad('ไม่พบกลุ่ม', 404);
    const [member] = await tx.select().from(chatMembers).where(and(eq(chatMembers.roomId, id), eq(chatMembers.userId, userId)));
    if (!member) return bad('คุณไม่ได้เป็นสมาชิกกลุ่ม', 403);
    if (owner && room.ownerId !== userId) return bad('เฉพาะเจ้าของกลุ่มเท่านั้น', 403);
    return action(tx, room);
  });
}
chat.get('/', async c => {
  const user = c.get('user')!;
  const rooms = await db.select({ id: chatRooms.id, title: chatRooms.title, status: chatRooms.status, ownerId: chatRooms.ownerId }).from(chatRooms).innerJoin(chatMembers, eq(chatMembers.roomId, chatRooms.id)).where(eq(chatMembers.userId, user.id)).orderBy(desc(chatRooms.createdAt));
  const invites = await db.select({ id: chatInvites.id, title: chatRooms.title, expiresAt: chatInvites.expiresAt }).from(chatInvites).innerJoin(chatRooms, eq(chatRooms.id, chatInvites.roomId)).where(and(eq(chatInvites.email, user.email), gt(chatInvites.expiresAt, new Date())));
  return c.json({ rooms, invites });
});
/* ไม่มีการสร้างกลุ่มโดยตรงอีกแล้ว กลุ่มเกิดจากคำขอจองที่เมนเทอร์กดรับใน /api/journey/bookings
   เท่านั้น เพื่อให้ทุกห้องผูกกับเวทีและช่วงเวลาที่ตกลงกันไว้จริง ๆ */

chat.post('/invites/:id/accept', async c => {
  const user = c.get('user')!;
  const [account] = await db.select({ verified: users.emailVerifiedAt }).from(users).where(eq(users.id, user.id));
  if (!account.verified) return bad('โปรดยืนยันอีเมลด้วยการเข้าสู่ระบบ Google ก่อนรับคำเชิญ', 403);
  await db.transaction(async tx => {
    const [initial] = await tx.select().from(chatInvites).where(eq(chatInvites.id, c.req.param('id')));
    if (!initial) return bad('คำเชิญหมดอายุหรือถูกยกเลิกแล้ว', 404);
    await tx.select().from(chatRooms).where(eq(chatRooms.id, initial.roomId)).for('update');
    const [invite] = await tx.select().from(chatInvites).where(and(eq(chatInvites.id, initial.id), eq(chatInvites.email, user.email), gt(chatInvites.expiresAt, new Date())));
    if (!invite) return bad('คำเชิญนี้ไม่ใช่ของบัญชีนี้ หรือหมดอายุแล้ว', 403);
    await tx.insert(chatMembers).values({ roomId: invite.roomId, userId: user.id }).onConflictDoNothing();
    await tx.delete(chatInvites).where(eq(chatInvites.id, invite.id));
  });
  return c.json({ ok: true });
});
chat.get('/:id', async c => {
  const room = await roomFor(c.req.param('id'), c.get('user')!.id);
  const members = await db.select({ id: users.id, name: users.name, readAt: chatMembers.readAt }).from(chatMembers).innerJoin(users, eq(users.id, chatMembers.userId)).where(eq(chatMembers.roomId, room.id));
  const invites = room.ownerId === c.get('user')!.id ? await db.select({ id: chatInvites.id, email: chatInvites.email, expiresAt: chatInvites.expiresAt }).from(chatInvites).where(eq(chatInvites.roomId, room.id)) : [];
  const { meetingUrl: _url, meetingAt: _at, ...safe } = room;
  return c.json({ room: safe, members, invites });
});
chat.post('/:id/invites', async c => {
  const p = z.object({ email: z.string().trim().toLowerCase().email().max(200) }).safeParse(await c.req.json());
  if (!p.success) return bad('อีเมลไม่ถูกต้อง');
  await mutate(c.req.param('id'), c.get('user')!.id, async (tx, room) => {
    const [mentor] = await tx.select({ email: users.email }).from(users).where(eq(users.id, room.mentorUserId));
    if (p.data.email === c.get('user')!.email || p.data.email === mentor.email) return bad('บัญชีนี้เป็นเจ้าของกลุ่มหรือเมนเทอร์แล้ว');
    await tx.insert(chatInvites).values({ id: newId('inv'), roomId: room.id, email: p.data.email, expiresAt: new Date(Date.now() + 7 * 86400000) }).onConflictDoUpdate({ target: [chatInvites.roomId, chatInvites.email], set: { expiresAt: new Date(Date.now() + 7 * 86400000) } });
  }, true);
  return c.json({ ok: true });
});
chat.delete('/:id/invites/:inviteId', async c => {
  await mutate(c.req.param('id'), c.get('user')!.id, async tx => { await tx.delete(chatInvites).where(and(eq(chatInvites.id, c.req.param('inviteId')), eq(chatInvites.roomId, c.req.param('id')))); }, true);
  return c.json({ ok: true });
});
chat.delete('/:id/members/:userId', async c => {
  await mutate(c.req.param('id'), c.get('user')!.id, async (tx, room) => {
    const target = c.req.param('userId');
    if (target === room.ownerId || target === room.mentorUserId) return bad('ไม่สามารถนำเจ้าของหรือเมนเทอร์ออกด้วยวิธีนี้');
    await tx.delete(chatMembers).where(and(eq(chatMembers.roomId, room.id), eq(chatMembers.userId, target)));
  }, true);
  return c.json({ ok: true });
});
chat.get('/:id/messages', async c => {
  const room = await roomFor(c.req.param('id'), c.get('user')!.id);
  const before = c.req.query('before');
  const after = c.req.query('after');
  const cursorId = before || after;
  if (cursorId) {
    const [cursor] = await db.select({ id: chatMessages.id }).from(chatMessages).where(and(eq(chatMessages.id, cursorId), eq(chatMessages.roomId, room.id)));
    if (!cursor || (before && after)) return bad('จุดเริ่มต้นข้อความไม่ถูกต้อง');
  }
  // Compare in Postgres to retain microsecond precision (JS Date keeps milliseconds).
  const cursorCondition = before ? sql`(${chatMessages.createdAt}, ${chatMessages.id}) < (select created_at, id from chat_messages where id = ${before} and room_id = ${room.id})` : after ? sql`(${chatMessages.createdAt}, ${chatMessages.id}) > (select created_at, id from chat_messages where id = ${after} and room_id = ${room.id})` : undefined;
  const rows = await db.select({ id: chatMessages.id, senderId: chatMessages.senderId, name: users.name, body: chatMessages.body, fileName: chatMessages.fileName, fileMime: chatMessages.fileMime, createdAt: chatMessages.createdAt }).from(chatMessages).innerJoin(users, eq(users.id, chatMessages.senderId)).where(and(eq(chatMessages.roomId, room.id), cursorCondition)).orderBy(after ? asc(chatMessages.createdAt) : desc(chatMessages.createdAt), after ? asc(chatMessages.id) : desc(chatMessages.id)).limit(51);
  return c.json({ messages: after ? rows.slice(0, 50) : rows.slice(0, 50).reverse(), hasMore: rows.length > 50 });
});
chat.post('/:id/read', async c => {
  const { messageId } = await c.req.json();
  await mutate(c.req.param('id'), c.get('user')!.id, async tx => {
    const [message] = await tx.select({ createdAt: chatMessages.createdAt }).from(chatMessages).where(and(eq(chatMessages.id, String(messageId)), eq(chatMessages.roomId, c.req.param('id'))));
    if (message) await tx.update(chatMembers).set({ readAt: sql`greatest(${chatMembers.readAt}, (select created_at from chat_messages where id = ${String(messageId)}))` }).where(and(eq(chatMembers.roomId, c.req.param('id')), eq(chatMembers.userId, c.get('user')!.id)));
  });
  return c.json({ ok: true });
});
chat.post('/:id/messages', async c => {
  if (Number(c.req.header('content-length') ?? 0) > 2300000) return bad('ไฟล์ต้องไม่เกิน 2 MB');
  await roomFor(c.req.param('id'), c.get('user')!.id);
  const body = await c.req.parseBody();
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const clientId = z.string().uuid().safeParse(body.clientId);
  const file = body.file instanceof File ? body.file : undefined;
  if (!clientId.success || text.length > 4000 || (!text && !file)) return bad('ส่งข้อความไม่เกิน 4,000 ตัวอักษรหรือแนบไฟล์');
  let data: Buffer | undefined;
  if (file) {
    if (!file.size || file.size > 2 * 1024 * 1024 || file.name.length > 180) return bad('ไฟล์ต้องไม่เกิน 2 MB และชื่อไม่เกิน 180 ตัวอักษร');
    data = Buffer.from(await file.arrayBuffer());
    const valid = (file.type === 'application/pdf' && data.subarray(0,5).toString() === '%PDF-') || (file.type === 'image/png' && data.subarray(0,8).toString('hex') === '89504e470d0a1a0a') || (file.type === 'image/jpeg' && data.subarray(0,3).toString('hex') === 'ffd8ff') || (file.type === 'image/webp' && data.subarray(0,4).toString() === 'RIFF' && data.subarray(8,12).toString() === 'WEBP');
    if (!valid) return bad('รองรับไฟล์ JPG, PNG, WebP และ PDF ที่ถูกต้องเท่านั้น');
  }
  const id = await mutate(c.req.param('id'), c.get('user')!.id, async (tx, room) => {
    if (room.status === 'declined') return bad('เมนเทอร์ปฏิเสธคำขอแล้ว กลุ่มนี้อ่านได้อย่างเดียว', 409);
    const [existing] = await tx.select({ id: chatMessages.id }).from(chatMessages).where(and(eq(chatMessages.roomId, room.id), eq(chatMessages.senderId, c.get('user')!.id), eq(chatMessages.clientId, clientId.data)));
    if (existing) return existing.id;
    const id = newId('msg');
    await tx.insert(chatMessages).values({ id, roomId: room.id, senderId: c.get('user')!.id, clientId: clientId.data, body: text, fileName: file?.name, fileMime: file?.type, fileData: data?.toString('base64') });
    return id;
  });
  return c.json({ id }, 201);
});
chat.get('/:id/files/:messageId', async c => {
  await roomFor(c.req.param('id'), c.get('user')!.id);
  const [message] = await db.select().from(chatMessages).where(and(eq(chatMessages.id, c.req.param('messageId')), eq(chatMessages.roomId, c.req.param('id'))));
  if (!message?.fileData) return bad('ไม่พบไฟล์', 404);
  return c.body(Buffer.from(message.fileData, 'base64'), 200, { 'content-type': message.fileMime!, 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(message.fileName!)}`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' });
});
