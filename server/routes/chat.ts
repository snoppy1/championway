import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { bodyLimit } from 'hono/body-limit';
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { chatMembers, chatMessages, chatRooms, competitions, consultations, mentors, users } from '../db/schema.js';
import { requireUser, type AppEnv } from '../lib/guards.js';
import { newId } from '../lib/id.js';
import { env } from '../lib/env.js';

/* แชตระหว่างนักเรียนกับเมนเทอร์ (กลับมาใช้ 1 ต.ค. 2569 พร้อมการจ้างผ่านเว็บ)

   - ห้องเกิดตอนเมนเทอร์กดรับงานใน routes/consult.ts เท่านั้น หนึ่งห้องต่อคู่นักเรียนกับเมนเทอร์
   - อ่านและส่งได้เฉพาะสมาชิกของห้อง ตรวจทุกคำขอ
   - ไฟล์เก็บในฐานข้อมูล ไม่เกิน 4 MB (Vercel รับ body ได้ราว 4.5 MB)
     ตรวจชนิดจากเนื้อไฟล์จริง ไม่เชื่อนามสกุลหรือ content-type ที่ส่งมา
     และส่งกลับแบบดาวน์โหลดเสมอ (attachment + nosniff) เปิดเป็นหน้าเว็บในโดเมนเราไม่ได้ */

const MAX_FILE = 4 * 1024 * 1024;

export const chat = new Hono<AppEnv>();
chat.use('*', async (c, next) => { c.header('Cache-Control', 'private, no-store'); await next(); });
chat.use('*', requireUser);
chat.use('*', bodyLimit({ maxSize: MAX_FILE + 300_000, onError: (c) => c.json({ error: 'ไฟล์ต้องไม่เกิน 4 MB' }, 413) }));
chat.use('*', async (c, next) => {
  const origin = c.req.header('origin');
  if (!['GET', 'HEAD'].includes(c.req.method) && origin && origin !== env.appOrigin) return c.json({ error: 'คำขอต้องมาจากเว็บนี้' }, 403);
  await next();
});
const bad = (message: string, status: 400 | 403 | 404 | 409 = 400): never => { throw new HTTPException(status, { message }); };

async function roomFor(id: string, userId: string) {
  const [row] = await db.select({ room: chatRooms }).from(chatRooms)
    .innerJoin(chatMembers, eq(chatMembers.roomId, chatRooms.id))
    .where(and(eq(chatRooms.id, id), eq(chatMembers.userId, userId)));
  return row?.room ?? bad('ไม่พบห้องแชตนี้ หรือคุณไม่ได้อยู่ในห้องนี้', 404);
}

/** จำนวนข้อความที่ยังไม่ได้อ่านต่อห้อง นับเฉพาะข้อความจากอีกฝั่ง */
export async function unreadByRoom(userId: string) {
  const rows = await db.select({ roomId: chatMembers.roomId, count: sql<number>`count(${chatMessages.id})::int` })
    .from(chatMembers)
    .innerJoin(chatMessages, and(eq(chatMessages.roomId, chatMembers.roomId), ne(chatMessages.senderId, userId),
      sql`(${chatMembers.readAt} is null or ${chatMessages.createdAt} > ${chatMembers.readAt})`))
    .where(eq(chatMembers.userId, userId))
    .groupBy(chatMembers.roomId);
  return new Map(rows.map((row) => [row.roomId, row.count]));
}

/** ไฟล์ที่รับ: รูป PDF และไฟล์ Office ที่ใช้ทำสไลด์หรือเอกสาร ตรวจจากหัวไฟล์จริง */
const officeTypes: Record<string, string> = {
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
};
function validFile(type: string, name: string, data: Buffer) {
  const hex = (n: number) => data.subarray(0, n).toString('hex');
  if (type === 'application/pdf') return data.subarray(0, 5).toString() === '%PDF-';
  if (type === 'image/png') return hex(8) === '89504e470d0a1a0a';
  if (type === 'image/jpeg') return hex(3) === 'ffd8ff';
  if (type === 'image/webp') return data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP';
  // ไฟล์ Office รุ่นใหม่เป็น zip ขึ้นต้นด้วย PK และนามสกุลต้องตรงกับชนิด
  if (officeTypes[type]) return hex(4) === '504b0304' && name.toLowerCase().endsWith(officeTypes[type]);
  return false;
}

chat.get('/', async (c) => {
  const user = c.get('user')!;
  const rows = await db.select({
    id: chatRooms.id, ownerId: chatRooms.ownerId, mentorUserId: chatRooms.mentorUserId, mentorId: chatRooms.mentorId,
    mentorName: mentors.name, memberName: users.name, createdAt: chatRooms.createdAt,
    lastAt: sql<string | null>`(select max(created_at) from chat_messages m where m.room_id = ${chatRooms.id})`,
  }).from(chatRooms)
    .innerJoin(chatMembers, and(eq(chatMembers.roomId, chatRooms.id), eq(chatMembers.userId, user.id)))
    .innerJoin(mentors, eq(mentors.id, chatRooms.mentorId))
    .innerJoin(users, eq(users.id, chatRooms.ownerId))
    .orderBy(desc(chatRooms.createdAt));
  const unread = await unreadByRoom(user.id);
  const rooms = rows.map((r) => ({
    id: r.id, mentorId: r.mentorId, lastAt: r.lastAt ?? r.createdAt,
    role: r.ownerId === user.id ? 'member' as const : 'mentor' as const,
    // ชื่ออีกฝั่ง: นักเรียนเห็นชื่อเมนเทอร์ เมนเทอร์เห็นชื่อแรกของนักเรียน
    counterpart: r.ownerId === user.id ? r.mentorName : r.memberName.split(/\s+/)[0],
    unread: unread.get(r.id) ?? 0,
  })).sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
  return c.json({ rooms });
});

chat.get('/:id', async (c) => {
  const user = c.get('user')!;
  const room = await roomFor(c.req.param('id'), user.id);
  const [mentor] = await db.select({ name: mentors.name }).from(mentors).where(eq(mentors.id, room.mentorId));
  const [member] = await db.select({ name: users.name }).from(users).where(eq(users.id, room.ownerId));
  // งานจ้างในห้องนี้ ให้ทั้งสองฝั่งเห็นว่าตกลงอะไรกันไว้ (ชั่วโมง ราคา เวลาที่อยากนัด)
  const hires = await db.select({
    id: consultations.id, status: consultations.status, minutes: consultations.minutes, price: consultations.price,
    preferredAt: consultations.preferredAt, note: consultations.note, createdAt: consultations.createdAt,
    competitionName: competitions.name, competitionSlug: competitions.slug,
  }).from(consultations).leftJoin(competitions, eq(competitions.id, consultations.competitionId))
    .where(eq(consultations.roomId, room.id)).orderBy(desc(consultations.createdAt));
  return c.json({
    room: { id: room.id, mentorId: room.mentorId, role: room.ownerId === user.id ? 'member' : 'mentor' },
    mentorName: mentor?.name ?? '', memberName: (member?.name ?? '').split(/\s+/)[0],
    hires,
  });
});

chat.get('/:id/messages', async (c) => {
  const room = await roomFor(c.req.param('id'), c.get('user')!.id);
  const before = c.req.query('before');
  const after = c.req.query('after');
  if (before && after) return bad('จุดเริ่มต้นข้อความไม่ถูกต้อง');
  const cursorId = before || after;
  if (cursorId) {
    const [cursor] = await db.select({ id: chatMessages.id }).from(chatMessages).where(and(eq(chatMessages.id, cursorId), eq(chatMessages.roomId, room.id)));
    if (!cursor) return bad('จุดเริ่มต้นข้อความไม่ถูกต้อง');
  }
  // เทียบใน Postgres เพื่อคงความละเอียดระดับไมโครวินาที (Date ของ JS เก็บแค่มิลลิวินาที)
  const cursorCondition = before
    ? sql`(${chatMessages.createdAt}, ${chatMessages.id}) < (select created_at, id from chat_messages where id = ${before} and room_id = ${room.id})`
    : after ? sql`(${chatMessages.createdAt}, ${chatMessages.id}) > (select created_at, id from chat_messages where id = ${after} and room_id = ${room.id})` : undefined;
  const rows = await db.select({
    id: chatMessages.id, senderId: chatMessages.senderId, name: users.name, body: chatMessages.body,
    fileName: chatMessages.fileName, fileMime: chatMessages.fileMime, createdAt: chatMessages.createdAt,
  }).from(chatMessages).innerJoin(users, eq(users.id, chatMessages.senderId))
    .where(and(eq(chatMessages.roomId, room.id), cursorCondition))
    .orderBy(after ? asc(chatMessages.createdAt) : desc(chatMessages.createdAt), after ? asc(chatMessages.id) : desc(chatMessages.id))
    .limit(51);
  const messages = (after ? rows.slice(0, 50) : rows.slice(0, 50).reverse())
    .map((m) => ({ ...m, name: m.name.split(/\s+/)[0], mine: m.senderId === c.get('user')!.id }));
  return c.json({ messages, hasMore: rows.length > 50 });
});

chat.post('/:id/read', async (c) => {
  const user = c.get('user')!;
  const room = await roomFor(c.req.param('id'), user.id);
  const parsed = z.object({ messageId: z.string().max(60) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return bad('ข้อมูลไม่ถูกต้อง');
  await db.update(chatMembers)
    .set({ readAt: sql`greatest(coalesce(${chatMembers.readAt}, 'epoch'::timestamptz), (select created_at from chat_messages where id = ${parsed.data.messageId} and room_id = ${room.id}))` })
    .where(and(eq(chatMembers.roomId, room.id), eq(chatMembers.userId, user.id),
      sql`exists (select 1 from chat_messages where id = ${parsed.data.messageId} and room_id = ${room.id})`));
  return c.json({ ok: true });
});

chat.post('/:id/messages', async (c) => {
  const user = c.get('user')!;
  const room = await roomFor(c.req.param('id'), user.id);
  // ส่งข้อความได้เมื่อมีงานในห้องที่จ่ายเงินแล้ว ห้องที่เคยคุยแต่งานถูกยกเลิก/คืนเงินหมดแล้ว อ่านย้อนหลังได้อย่างเดียว
  const [open] = await db.select({ id: consultations.id }).from(consultations)
    .where(and(eq(consultations.roomId, room.id), inArray(consultations.status, ['paid', 'completed']))).limit(1);
  if (!open) return bad('แชตนี้อ่านได้อย่างเดียว งานในห้องนี้ยังไม่ได้ชำระเงินหรือถูกยกเลิกแล้ว', 409);
  const body = await c.req.parseBody();
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const clientId = z.string().uuid().safeParse(body.clientId);
  const file = body.file instanceof File ? body.file : undefined;
  if (!clientId.success || text.length > 4000 || (!text && !file)) return bad('ส่งข้อความไม่เกิน 4,000 ตัวอักษร หรือแนบไฟล์');
  let data: Buffer | undefined;
  if (file) {
    if (!file.size || file.size > MAX_FILE || file.name.length > 180) return bad('ไฟล์ต้องไม่เกิน 4 MB และชื่อไม่เกิน 180 ตัวอักษร');
    data = Buffer.from(await file.arrayBuffer());
    if (!validFile(file.type, file.name, data)) return bad('รองรับไฟล์ JPG, PNG, WebP, PDF, PPTX, DOCX และ XLSX เท่านั้น');
  }
  // ส่งซ้ำด้วย clientId เดิม (เน็ตหลุดแล้วกดใหม่) ได้ข้อความเดิม ไม่ซ้ำสองอัน
  const id = newId('msg');
  const [created] = await db.insert(chatMessages).values({
    id, roomId: room.id, senderId: user.id, clientId: clientId.data, body: text,
    fileName: file?.name, fileMime: file?.type, fileData: data?.toString('base64'),
  }).onConflictDoNothing().returning({ id: chatMessages.id });
  if (created) return c.json({ id: created.id }, 201);
  const [existing] = await db.select({ id: chatMessages.id }).from(chatMessages)
    .where(and(eq(chatMessages.roomId, room.id), eq(chatMessages.senderId, user.id), eq(chatMessages.clientId, clientId.data)));
  return c.json({ id: existing.id }, 200);
});

chat.get('/:id/files/:messageId', async (c) => {
  const room = await roomFor(c.req.param('id'), c.get('user')!.id);
  const [message] = await db.select().from(chatMessages)
    .where(and(eq(chatMessages.id, c.req.param('messageId')), eq(chatMessages.roomId, room.id)));
  if (!message?.fileData) return bad('ไม่พบไฟล์', 404);
  return c.body(Buffer.from(message.fileData, 'base64'), 200, {
    'content-type': message.fileMime ?? 'application/octet-stream',
    'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(message.fileName ?? 'file')}`,
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
  });
});
