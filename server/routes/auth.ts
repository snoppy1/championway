import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { env, googleConfigured } from '../lib/env.js';
import { authorizeUrl, exchangeCode, fetchProfile, newPkcePair } from '../lib/google.js';
import type { AppEnv } from '../lib/guards.js';
import { requireUser } from '../lib/guards.js';
import { firstIssue } from './public.js';
import { newId, newToken } from '../lib/id.js';
import { safeNext } from '../../src/lib/safe-next.js';
import { hashPassword, passwordProblem, verifyPassword, wasteTime } from '../lib/password.js';
import {
  clearSessionCookie, createSession, destroyAllSessions, destroySession, pruneSessions,
  sessionIdFrom, setSessionCookie,
} from '../lib/session.js';
import { files as filesTable } from '../db/schema.js';
import { fileUrl } from '../lib/files.js';
import { occupations, personLevelKeys } from '../../src/data/profile.js';
import type { Occupation, PersonLevel } from '../../src/data/profile.js';

export const auth = new Hono<AppEnv>();

/* คำขอที่เปลี่ยนข้อมูลต้องมาจากเว็บของเราเอง กันเว็บอื่นยิงคำขอข้ามโดเมนด้วยคุกกี้ของผู้ใช้
   คำขอจากสคริปต์และเทสไม่มี header origin ติดมา จึงผ่านตามปกติ เหมือนที่ /api/chats กับ /api/journey ทำ */
auth.use('*', async (c, next) => {
  const origin = c.req.header('origin');
  if (!['GET', 'HEAD'].includes(c.req.method) && origin && origin !== env.appOrigin) {
    return c.json({ error: 'คำขอต้องมาจากเว็บนี้' }, 403);
  }
  await next();
});

const credentials = z.object({
  email: z.string().trim().toLowerCase().email('อีเมลไม่ถูกต้อง').max(200),
  password: z.string().min(1, 'กรอกรหัสผ่าน').max(200),
});

const signupBody = credentials.extend({
  name: z.string().trim().min(1, 'กรอกชื่อที่ใช้แสดง').max(80),
});

/** รูปบัญชีที่ส่งออกไปหน้าเว็บ ไม่มีแฮชรหัสผ่านและรหัส Google ปนไปด้วย */
function publicUser(row: typeof users.$inferSelect) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    avatarUrl: row.avatarUrl,
    bio: row.bio,
    occupation: row.occupation,
    organization: row.organization,
    position: row.position,
    educationLevel: row.educationLevel,
    hasPassword: Boolean(row.passwordHash),
    googleLinked: Boolean(row.googleId),
  };
}

auth.get('/providers', (c) => c.json({ google: googleConfigured }));

auth.get('/me', (c) => c.json({ user: c.get('user') }));

auth.post('/signup', async (c) => {
  const parsed = signupBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: firstIssue(parsed.error) });
  const { email, password, name } = parsed.data;

  const problem = passwordProblem(password);
  if (problem) throw new HTTPException(400, { message: problem });

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) {
    // บอกตรง ๆ ว่าอีเมลนี้ถูกใช้แล้ว เพราะหน้าสมัครบอกอยู่แล้วว่าใครสมัครได้บ้าง
    // การปิดบังตรงนี้ไม่ได้เพิ่มความปลอดภัยแต่ทำให้คนสมัครงง
    throw new HTTPException(409, { message: 'อีเมลนี้มีบัญชีอยู่แล้ว ลองเข้าสู่ระบบแทน' });
  }

  const [created] = await db.insert(users).values({
    id: newId('usr'),
    email,
    name,
    passwordHash: await hashPassword(password),
  }).returning();

  const session = await createSession(created.id);
  setSessionCookie(c, session.id, session.expiresAt);
  return c.json({ user: publicUser(created) }, 201);
});

auth.post('/login', async (c) => {
  const parsed = credentials.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: firstIssue(parsed.error) });
  const { email, password } = parsed.data;

  const [found] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!found) {
    // ใช้เวลาเท่ากับกรณีรหัสผ่านผิด ไม่ให้เวลาที่ใช้ตอบบอกว่าอีเมลนี้มีบัญชีหรือไม่
    await wasteTime();
    throw new HTTPException(401, { message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
  }
  if (!found.passwordHash) {
    throw new HTTPException(401, { message: 'บัญชีนี้สมัครด้วย Google ให้เข้าสู่ระบบด้วย Google' });
  }
  if (!await verifyPassword(password, found.passwordHash)) {
    throw new HTTPException(401, { message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
  }

  await pruneSessions();
  const session = await createSession(found.id);
  setSessionCookie(c, session.id, session.expiresAt);
  return c.json({ user: publicUser(found) });
});

auth.post('/logout', requireUser, async (c) => {
  const sessionId = sessionIdFrom(c);
  if (sessionId) await destroySession(sessionId);
  clearSessionCookie(c);
  return c.json({ ok: true });
});

/* ---------- โปรไฟล์ของตัวเอง ---------- */

/** ช่องที่เว้นว่างเก็บเป็น null ไม่ใช่สตริงว่าง จะได้แยก "ไม่ได้กรอก" ออกจาก "กรอกเป็นค่าว่าง" */
const optionalText = (max: number) => z.string().trim().max(max).nullish()
  .transform((value) => (value?.trim() ? value.trim() : null));

const profileBody = z.object({
  name: z.string().trim().min(1, 'กรอกชื่อที่ใช้แสดง').max(80),
  bio: optionalText(300),
  occupation: z.enum(occupations as unknown as [Occupation, ...Occupation[]]).nullish(),
  organization: optionalText(100),
  position: optionalText(100),
  educationLevel: z.enum(personLevelKeys as [PersonLevel, ...PersonLevel[]]).nullish(),
  /** id ของไฟล์ที่อัปโหลดไว้ก่อนด้วย POST /api/files ส่ง null เพื่อเอารูปเดิมออก */
  avatarFileId: z.string().max(60).nullish(),
});

/* เขียนทับทั้งบล็อกโปรไฟล์ ฟอร์มแก้ไขจึงต้องส่งทุกช่องมาเสมอ ช่องที่ไม่ส่งถือว่าผู้ใช้ล้างค่าทิ้ง
   ยกเว้น avatarFileId ที่แยก "ไม่ส่ง" (ไม่แตะรูปเดิม) ออกจาก "ส่ง null" (เอารูปออก) */
auth.patch('/profile', requireUser, async (c) => {
  const raw: unknown = await c.req.json().catch(() => ({}));
  const parsed = profileBody.safeParse(raw);
  if (!parsed.success) throw new HTTPException(400, { message: firstIssue(parsed.error) });
  const body = parsed.data;
  const user = c.get('user')!;

  // ดูจาก JSON ที่ส่งมาจริง ไม่ดูจากผลของ zod เพราะ zod เติม key ที่ไม่ได้ส่งมาให้เป็น undefined
  const touchesAvatar = typeof raw === 'object' && raw !== null && 'avatarFileId' in raw;
  let avatarUrl: string | null | undefined;
  if (touchesAvatar) {
    if (!body.avatarFileId) {
      avatarUrl = null;
    } else {
      const [file] = await db.select().from(filesTable)
        .where(eq(filesTable.id, body.avatarFileId)).limit(1);
      // รับเฉพาะไฟล์ที่ผู้ใช้คนนี้อัปโหลดเอง กันไม่ให้เอา id ของไฟล์คนอื่นมาใส่
      if (!file || file.ownerType !== 'user' || file.ownerId !== user.id) {
        throw new HTTPException(400, { message: 'ไม่พบรูปที่อัปโหลดไว้ ลองเลือกรูปใหม่อีกครั้ง' });
      }
      if (!file.mime.startsWith('image/')) {
        throw new HTTPException(400, { message: 'รูปโปรไฟล์ต้องเป็นไฟล์รูปภาพ' });
      }
      avatarUrl = fileUrl(file);
    }
  }

  const [updated] = await db.update(users).set({
    name: body.name,
    bio: body.bio,
    occupation: body.occupation ?? null,
    organization: body.organization,
    position: body.position,
    educationLevel: body.educationLevel ?? null,
    ...(avatarUrl === undefined ? {} : { avatarUrl }),
  }).where(eq(users.id, user.id)).returning();

  return c.json({ user: publicUser(updated) });
});

const emailBody = z.object({
  email: z.string().trim().toLowerCase().email('อีเมลไม่ถูกต้อง').max(200),
  password: z.string().max(200).default(''),
});

auth.post('/email', requireUser, async (c) => {
  const parsed = emailBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: firstIssue(parsed.error) });
  const { email, password } = parsed.data;
  const user = c.get('user')!;

  const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  /* บัญชีที่ผูก Google ใช้อีเมลของ Google เป็นตัวยืนยันตัวตน ถ้าให้เปลี่ยนตรงนี้
     อีเมลจะไม่ตรงกับที่ Google ยืนยันไว้ แต่ระบบยังนับว่ายืนยันแล้วอยู่ */
  if (row.googleId) {
    throw new HTTPException(400, {
      message: 'บัญชีนี้ผูกกับ Google อยู่ อีเมลจึงเปลี่ยนที่นี่ไม่ได้ ต้องเปลี่ยนที่บัญชี Google',
    });
  }
  if (!await verifyPassword(password, row.passwordHash)) {
    throw new HTTPException(401, { message: 'รหัสผ่านไม่ถูกต้อง' });
  }
  if (email === row.email) return c.json({ user: publicUser(row) });

  const taken = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (taken.length) throw new HTTPException(409, { message: 'อีเมลนี้มีบัญชีอยู่แล้ว' });

  const [updated] = await db.update(users)
    // อีเมลใหม่ยังไม่ผ่านการยืนยัน ต้องล้างสถานะเดิม ไม่อย่างนั้นจะได้สิทธิ์ของอีเมลที่ยืนยันแล้วไปฟรี ๆ
    .set({ email, emailVerifiedAt: null })
    .where(eq(users.id, user.id))
    .returning();
  return c.json({ user: publicUser(updated) });
});

const passwordBody = z.object({
  current: z.string().max(200).default(''),
  next: z.string().max(200),
});

auth.post('/password', requireUser, async (c) => {
  const parsed = passwordBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: firstIssue(parsed.error) });
  const body = parsed.data;
  const user = c.get('user')!;

  const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  /* คนที่สมัครด้วย Google ยังไม่มีรหัสผ่านในระบบเรา จึงเป็นการ "ตั้ง" ครั้งแรก ไม่ใช่ "เปลี่ยน"
     ไม่ต้องถามรหัสเดิมที่ไม่มีอยู่จริง เพราะเขาพิสูจน์ตัวตนด้วย session ที่ล็อกอินอยู่แล้ว */
  if (row.passwordHash && !await verifyPassword(body.current, row.passwordHash)) {
    throw new HTTPException(401, { message: 'รหัสผ่านเดิมไม่ถูกต้อง' });
  }
  const problem = passwordProblem(body.next);
  if (problem) throw new HTTPException(400, { message: problem });

  const [updated] = await db.update(users)
    .set({ passwordHash: await hashPassword(body.next) })
    .where(eq(users.id, user.id))
    .returning();

  /* เปลี่ยนรหัสผ่านแล้วต้องเตะอุปกรณ์อื่นออก ไม่อย่างนั้นคนที่แอบใช้บัญชีอยู่จะยังอยู่ต่อได้
     แล้วออกคุกกี้ใหม่ให้เครื่องที่เพิ่งเปลี่ยน จะได้ไม่ต้องล็อกอินซ้ำทันที */
  await destroyAllSessions(user.id);
  const session = await createSession(user.id);
  setSessionCookie(c, session.id, session.expiresAt);

  return c.json({ user: publicUser(updated) });
});

/* ---------- Google ---------- */

const STATE_COOKIE = 'cw_oauth_state';
const VERIFIER_COOKIE = 'cw_oauth_verifier';
const NEXT_COOKIE = 'cw_oauth_next';
const shortCookie = () => ({
  httpOnly: true, sameSite: 'Lax' as const, secure: env.isProduction, path: '/', maxAge: 600,
});


auth.get('/google', (c) => {
  if (!googleConfigured) {
    throw new HTTPException(503, { message: 'ยังไม่ได้ตั้งค่า Google login บนเซิร์ฟเวอร์นี้' });
  }
  const state = newToken();
  const { verifier, challenge } = newPkcePair();
  setCookie(c, STATE_COOKIE, state, shortCookie());
  setCookie(c, VERIFIER_COOKIE, verifier, shortCookie());
  setCookie(c, NEXT_COOKIE, safeNext(c.req.query('next')), shortCookie());
  return c.redirect(authorizeUrl(state, challenge));
});

auth.get('/google/callback', async (c) => {
  const next = safeNext(getCookie(c, NEXT_COOKIE));
  const fail = (reason: string) => c.redirect(`${env.appOrigin}/signin?${new URLSearchParams({ error: reason, next })}`);

  const state = getCookie(c, STATE_COOKIE);
  const verifier = getCookie(c, VERIFIER_COOKIE);
  for (const name of [STATE_COOKIE, VERIFIER_COOKIE, NEXT_COOKIE]) deleteCookie(c, name, shortCookie());

  if (c.req.query('error')) return fail('ยกเลิกการเข้าสู่ระบบด้วย Google');
  // state ที่ไม่ตรงแปลว่าคำขอนี้ไม่ได้เริ่มจากเว็บเรา
  if (!state || !verifier || c.req.query('state') !== state) return fail('คำขอไม่ถูกต้อง ลองใหม่อีกครั้ง');

  const code = c.req.query('code');
  if (!code) return fail('ไม่ได้รับรหัสจาก Google');

  let profile;
  try {
    const token = await exchangeCode(code, verifier);
    profile = await fetchProfile(token.access_token);
  } catch {
    return fail('ต่อกับ Google ไม่สำเร็จ ลองใหม่อีกครั้ง');
  }

  const email = profile.email?.trim().toLowerCase();
  if (!email) return fail('บัญชี Google นี้ไม่มีอีเมล');
  // อีเมลที่ Google ยังไม่ยืนยันใช้ผูกบัญชีไม่ได้ เพราะจะสวมรอยบัญชีเดิมที่ใช้อีเมลเดียวกันได้
  if (profile.email_verified !== true) return fail('บัญชี Google นี้ยังไม่ได้ยืนยันอีเมล');

  const [byGoogle] = await db.select().from(users).where(eq(users.googleId, profile.sub)).limit(1);
  let account = byGoogle;

  if (!account) {
    const [byEmail] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (byEmail) {
      if (byEmail.googleId || !(email.endsWith('@gmail.com') || profile.hd)) {
        return fail('อีเมลนี้มีบัญชีอยู่แล้ว กรุณาใช้วิธีเข้าสู่ระบบเดิม');
      }
      // ผูกบัญชี Google เข้ากับบัญชีอีเมลเดิม ทำได้เพราะ Google ยืนยันอีเมลนั้นแล้ว
      [account] = await db.update(users)
        .set({ googleId: profile.sub, emailVerifiedAt: new Date(), avatarUrl: byEmail.avatarUrl ?? profile.picture ?? null })
        .where(eq(users.id, byEmail.id)).returning();
    } else {
      [account] = await db.insert(users).values({
        id: newId('usr'),
        email,
        googleId: profile.sub,
        name: profile.name?.trim() || email.split('@')[0],
        avatarUrl: profile.picture ?? null,
        emailVerifiedAt: new Date(),
      }).returning();
    }
  }

  await pruneSessions();
  const session = await createSession(account.id);
  setSessionCookie(c, session.id, session.expiresAt);
  return c.redirect(`${env.appOrigin}${next}`);
});
