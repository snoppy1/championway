import { and, eq, gt, lt } from 'drizzle-orm';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Context } from 'hono';
import { db } from '../db/client.js';
import { sessions, users } from '../db/schema.js';
import { env } from './env.js';
import { newToken } from './id.js';

export const SESSION_COOKIE = 'cw_session';
const TTL_DAYS = 30;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: 'member' | 'reviewer' | 'admin';
  avatarUrl: string | null;
};

export async function createSession(userId: string) {
  const id = newToken();
  const expiresAt = new Date(Date.now() + TTL_DAYS * 86400000);
  await db.insert(sessions).values({ id, userId, expiresAt });
  return { id, expiresAt };
}

/** อ่าน session พร้อมข้อมูลผู้ใช้ในคิวรีเดียว และถือว่า session ที่หมดอายุแล้วคือไม่มี */
export async function readSession(sessionId: string): Promise<SessionUser | null> {
  const rows = await db
    .select({
      id: users.id, email: users.email, name: users.name, role: users.role, avatarUrl: users.avatarUrl,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0] ?? null;
}

export async function destroySession(sessionId: string) {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function destroyAllSessions(userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/** เก็บกวาด session ที่หมดอายุ เรียกตอนล็อกอินสำเร็จก็พอ ไม่ต้องมี cron */
export async function pruneSessions() {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

/* คุกกี้เป็น httpOnly เพื่อไม่ให้ JavaScript ในหน้าอ่านได้ และ sameSite=Lax
   เพื่อกัน CSRF แบบข้ามเว็บ แต่ยังให้ลิงก์ที่คลิกจากที่อื่นพาเข้าระบบได้ */
const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'Lax' as const,
  secure: env.isProduction,
  path: '/',
});

export function setSessionCookie(c: Context, id: string, expiresAt: Date) {
  setCookie(c, SESSION_COOKIE, id, { ...cookieOptions(), expires: expiresAt });
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE, cookieOptions());
}

export function sessionIdFrom(c: Context) {
  return getCookie(c, SESSION_COOKIE) ?? '';
}
