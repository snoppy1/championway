import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { mentorSubmissions } from '../db/schema.js';
import { AlreadySubscribed, billingEnabled, createCheckout, handleWebhook, membershipOf, portalUrl } from '../lib/billing.js';
import { env } from '../lib/env.js';
import type { AppEnv } from '../lib/guards.js';
import { requireUser } from '../lib/guards.js';

/* ค่าสมาชิก Rising Star (lib/billing.ts) */

export const billing = new Hono<AppEnv>();

/* Stripe เรียก webhook จากเซิร์ฟเวอร์ ไม่มี Origin และพิสูจน์ตัวด้วยลายเซ็นแทน จึงประกาศก่อนตัวกันคำขอข้ามเว็บ
   ต้องอ่าน body ดิบ ถ้า parse เป็น JSON ก่อน ลายเซ็นจะไม่ตรง */
billing.post('/stripe-webhook', async (c) => {
  const result = await handleWebhook(await c.req.text(), c.req.header('stripe-signature'));
  if (result === null) return c.json({ error: 'invalid signature' }, 400);
  return c.json({ received: true, result });
});

billing.use('*', async (c, next) => {
  c.header('Cache-Control', 'private, no-store');
  const origin = c.req.header('origin');
  if (c.req.method !== 'GET' && origin !== env.appOrigin) return c.json({ error: 'คำขอต้องมาจากเว็บนี้' }, 403);
  if (!billingEnabled()) return c.json({ error: 'ยังไม่เปิดให้ชำระเงิน' }, 404);
  await next();
});

async function ownMentorId(userId: string) {
  const [row] = await db.select({ mentorId: mentorSubmissions.publishedMentorId }).from(mentorSubmissions)
    .where(and(eq(mentorSubmissions.userId, userId), eq(mentorSubmissions.status, 'published'))).limit(1);
  return row?.mentorId ?? null;
}

const checkoutBody = z.object({ method: z.enum(['card', 'promptpay']) });

billing.post('/rising-star/checkout', requireUser, async (c) => {
  const user = c.get('user')!;
  const parsed = checkoutBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'เลือกวิธีชำระเงิน' }, 400);
  const mentorId = await ownMentorId(user.id);
  if (!mentorId) return c.json({ error: 'สมัคร Rising Star ได้เฉพาะเมนเทอร์ที่ผ่านการอนุมัติแล้ว' }, 403);
  const state = await membershipOf(mentorId);
  if (parsed.data.method === 'card' && !state.canSubscribe) {
    return c.json({ error: 'คุณมีการสมัครแบบตัดบัตรอยู่แล้ว จัดการได้ที่ปุ่ม "จัดการการสมัคร"' }, 409);
  }
  if (parsed.data.method === 'promptpay' && !state.canPrepay) {
    return c.json({ error: 'ต่ออายุด้วย PromptPay ได้เมื่อสมาชิกเหลือไม่เกิน 7 วัน' }, 409);
  }
  try {
    const session = await createCheckout({ method: parsed.data.method, mentorId, user });
    return c.json({ url: session.url });
  } catch (error) {
    if (error instanceof AlreadySubscribed) {
      return c.json({ error: 'คุณมีการสมัครแบบตัดบัตรอยู่แล้ว จัดการได้ที่ปุ่ม "จัดการการสมัคร"' }, 409);
    }
    throw error;
  }
});

billing.post('/rising-star/portal', requireUser, async (c) => {
  const url = await portalUrl(c.get('user')!.id);
  if (!url) return c.json({ error: 'ยังไม่มีข้อมูลการชำระเงิน' }, 404);
  return c.json({ url });
});
