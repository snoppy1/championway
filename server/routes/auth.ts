import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import { users } from '../db/schema';
import { env, googleConfigured } from '../lib/env';
import { authorizeUrl, exchangeCode, fetchProfile, newPkcePair } from '../lib/google';
import type { AppEnv } from '../lib/guards';
import { requireUser } from '../lib/guards';
import { firstIssue } from './public';
import { newId, newToken } from '../lib/id';
import { safeNext } from '../../src/lib/safe-next';
import { hashPassword, passwordProblem, verifyPassword, wasteTime } from '../lib/password';
import {
  clearSessionCookie, createSession, destroySession, pruneSessions, sessionIdFrom, setSessionCookie,
} from '../lib/session';

export const auth = new Hono<AppEnv>();

const credentials = z.object({
  email: z.string().trim().toLowerCase().email('อีเมลไม่ถูกต้อง').max(200),
  password: z.string().min(1, 'กรอกรหัสผ่าน').max(200),
});

const signupBody = credentials.extend({
  name: z.string().trim().min(1, 'กรอกชื่อที่ใช้แสดง').max(80),
});

function publicUser(row: { id: string; email: string; name: string; role: string; avatarUrl: string | null }) {
  return { id: row.id, email: row.email, name: row.name, role: row.role, avatarUrl: row.avatarUrl };
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
