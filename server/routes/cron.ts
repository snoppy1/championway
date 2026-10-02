import { Hono } from 'hono';
import { timingSafeEqual } from 'node:crypto';
import type { AppEnv } from '../lib/guards.js';
import { releaseOverdue } from '../lib/hire-money.js';
import { remindUnconfirmed } from './consult.js';

/* งานที่ Vercel Cron เรียกตามเวลา (vercel.json) Vercel แนบ Authorization: Bearer <CRON_SECRET> มาเอง
   ไม่ตั้ง CRON_SECRET = ปิดไว้ทั้งหมด ไม่มีใครเรียกได้
   หมายเหตุ: Vercel รัน cron เฉพาะ Production ส่วน dev ให้ admin กดปุ่มในหน้าจัดการแทน */

export const cron = new Hono<AppEnv>();

function authorized(header: string | undefined) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** เตือนเมนเทอร์ที่ยังไม่ยืนยันการปรึกษาเกิน 3 วัน (routes/consult.ts) */
cron.get('/remind-confirmations', async (c) => {
  if (!authorized(c.req.header('authorization'))) return c.json({ error: 'unauthorized' }, 401);
  return c.json({ reminded: await remindUnconfirmed() });
});

/** ปล่อยเงินงานที่นักเรียนเงียบเกิน 3 วันหลังนัด (lib/hire-money.ts) */
cron.get('/release-payments', async (c) => {
  if (!authorized(c.req.header('authorization'))) return c.json({ error: 'unauthorized' }, 401);
  return c.json({ released: await releaseOverdue() });
});
