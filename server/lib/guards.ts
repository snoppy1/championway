import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import type { SessionUser } from './session';
import { readSession, sessionIdFrom } from './session';

export type AppEnv = { Variables: { user: SessionUser | null } };

/** อ่านผู้ใช้จากคุกกี้ให้ทุก request โดยไม่บังคับว่าต้องล็อกอิน */
export const withUser = createMiddleware<AppEnv>(async (c, next) => {
  const sessionId = sessionIdFrom(c);
  c.set('user', sessionId ? await readSession(sessionId) : null);
  await next();
});

export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get('user')) throw new HTTPException(401, { message: 'ต้องเข้าสู่ระบบก่อน' });
  await next();
});

/* ทีมตรวจกับผู้ดูแลเท่านั้นที่เข้าหน้าจัดการได้ บทบาทนี้ตั้งด้วยมือในฐานข้อมูล
   ไม่มีทางสมัครเอาเองได้ */
export const requireReviewer = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get('user');
  if (!user) throw new HTTPException(401, { message: 'ต้องเข้าสู่ระบบก่อน' });
  if (user.role !== 'reviewer' && user.role !== 'admin') {
    throw new HTTPException(403, { message: 'บัญชีนี้ไม่มีสิทธิ์เข้าหน้าจัดการ' });
  }
  await next();
});
