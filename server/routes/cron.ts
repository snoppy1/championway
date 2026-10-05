import { Hono } from 'hono';
import { timingSafeEqual } from 'node:crypto';
import type { AppEnv } from '../lib/guards.js';
import { releaseOverdue } from '../lib/hire-money.js';
import { hiringEnabled } from '../lib/flow.js';
import { remindUnconfirmed } from './consult.js';
import { remindExpiring } from '../lib/billing.js';
import { runSources } from '../lib/import/run.js';
import { aiConfigured } from '../lib/import/extract.js';

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

/** เตือนเมนเทอร์ที่ยังไม่ยืนยันการปรึกษาเกิน 3 วัน (routes/consult.ts)
    และเตือนสมาชิก Rising Star ที่จ่ายด้วย PromptPay ว่าใกล้หมด (lib/billing.ts)
    และดึงงานแข่งอัตโนมัติ (lib/import/run.ts) รวมไว้ใน cron เดียวเพราะแผนฟรีของ Vercel จำกัดจำนวน cron */
cron.get('/remind-confirmations', async (c) => {
  if (!authorized(c.req.header('authorization'))) return c.json({ error: 'unauthorized' }, 401);
  const reminded = await remindUnconfirmed();
  const risingStarReminded = await remindExpiring();
  // ดึงงานแข่งจากแหล่งที่แอดมินเปิดไว้ (ทุกแหล่งปิดเป็นค่าเริ่มต้น) ยังไม่ตั้งคีย์ AI = ข้าม ไม่ให้ cron ทั้งตัวล้ม
  const imports = aiConfigured() ? await runSources().catch((error) => String(error)) : 'ai not configured';
  return c.json({ reminded, risingStarReminded, imports });
});

/** ปล่อยเงินงานที่นักเรียนเงียบเกิน 3 วันหลังนัด (lib/hire-money.ts) */
cron.get('/release-payments', async (c) => {
  if (!authorized(c.req.header('authorization'))) return c.json({ error: 'unauthorized' }, 401);
  // การจ้างพักไว้ (lib/flow.ts) ไม่มีเงินให้ปล่อย ไม่ทำอะไร (Astra รีวิว 3 ต.ค. 2569)
  if (!hiringEnabled()) return c.json({ released: 0, skipped: 'hiring paused' });
  return c.json({ released: await releaseOverdue() });
});
