import { createHash } from 'node:crypto';
import type { Context } from 'hono';
import { and, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { authAttempts } from '../db/schema.js';
import { env } from './env.js';
import { newId } from './id.js';

/* จำกัดความถี่ของการเข้าสู่ระบบที่ผิดและการสมัครสมาชิก (5 ต.ค. 2569) กันการไล่เดารหัสผ่านและการสร้างบัญชีรัว ๆ
   เว็บรันแบบ serverless ไม่มีหน่วยความจำร่วมกันระหว่างคำขอ จึงนับในฐานข้อมูล
   คีย์คืออีเมลหรือ IP ที่แฮชแล้ว ไม่เก็บค่าจริง (นโยบายความเป็นส่วนตัวข้อ 2) */

export type AttemptKind = 'login_fail' | 'signup';
type Rule = { scope: 'email' | 'ip'; max: number; windowMs: number };

const MINUTE = 60_000;
export const rules: Record<AttemptKind, Rule[]> = {
  // ผิด 5 ครั้งใน 15 นาทีต่ออีเมล หรือ 30 ครั้งต่อ IP (หลายคนอาจใช้ IP เดียวกัน เช่น Wi-Fi โรงเรียน)
  login_fail: [{ scope: 'email', max: 5, windowMs: 15 * MINUTE }, { scope: 'ip', max: 30, windowMs: 15 * MINUTE }],
  signup: [{ scope: 'ip', max: 10, windowMs: 60 * MINUTE }],
};

/** IP ของผู้ใช้จริงที่ Vercel ใส่ให้ (ผู้ใช้ปลอม header นี้ไม่ได้ Vercel เขียนทับเสมอ)
    นอก Vercel (เครื่องนักพัฒนาและเทส) ไม่มีค่า จึงไม่จำกัดต่อ IP */
export function clientIp(c: Context) {
  if (!process.env.VERCEL) return null;
  const forwarded = c.req.header('x-vercel-forwarded-for') ?? c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip');
  return forwarded?.split(',')[0]?.trim() || null;
}

const hash = (scope: string, value: string) =>
  createHash('sha256').update(`${env.appOrigin}|${scope}|${value.toLowerCase()}`).digest('hex');

function keysOf(kind: AttemptKind, who: { email?: string; ip: string | null }) {
  return rules[kind].flatMap((rule) => {
    const value = rule.scope === 'email' ? who.email : who.ip;
    return value ? [{ rule, key: hash(rule.scope, value) }] : [];
  });
}

/** เกินเพดานแล้วหรือยัง ตรวจก่อนทำงานหนัก (ตรวจรหัสผ่าน หรือสร้างบัญชี) */
export async function limited(kind: AttemptKind, who: { email?: string; ip: string | null }) {
  const now = Date.now();
  for (const { rule, key } of keysOf(kind, who)) {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(authAttempts)
      .where(and(eq(authAttempts.kind, kind), eq(authAttempts.keyHash, key), gt(authAttempts.createdAt, new Date(now - rule.windowMs))));
    if (row.count >= rule.max) return true;
  }
  return false;
}

export async function record(kind: AttemptKind, who: { email?: string; ip: string | null }) {
  const keys = keysOf(kind, who);
  if (!keys.length) return;
  await db.insert(authAttempts).values(keys.map(({ key }) => ({ id: newId('att'), kind, keyHash: key })));
  // เก็บไว้ไม่เกินหนึ่งวัน เพดานยาวสุดคือหนึ่งชั่วโมง
  await db.delete(authAttempts).where(lt(authAttempts.createdAt, new Date(Date.now() - 24 * 60 * MINUTE)));
}

/** เข้าสู่ระบบสำเร็จแล้ว ล้างตัวนับของอีเมลนี้ ไม่ให้คนที่พิมพ์ผิดไม่กี่ครั้งโดนล็อกทีหลัง */
export async function clearEmail(kind: AttemptKind, email: string) {
  const keys = keysOf(kind, { email, ip: null }).map(({ key }) => key);
  if (keys.length) await db.delete(authAttempts).where(and(eq(authAttempts.kind, kind), inArray(authAttempts.keyHash, keys)));
}
