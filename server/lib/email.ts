import { db } from '../db/client.js';
import { emailLog } from '../db/schema.js';
import { env } from './env.js';
import { newId } from './id.js';

/* ส่งอีเมลผ่าน Resend เมื่อมี RESEND_API_KEY และบันทึกทุกฉบับลงตาราง email_log เสมอ
   ไม่ว่าจะส่งจริงหรือไม่ เพื่อให้ย้อนดูได้ว่าระบบส่งอะไรออกไปบ้าง และเพื่อให้เทส
   ตรวจได้โดยไม่ต้องยิงออกอินเทอร์เน็ต

   ไม่มีคีย์ = ไม่ส่งจริง แต่ยังบันทึก ซึ่งเป็นพฤติกรรมเดิมของระบบ
   จึงพัฒนาและทดสอบต่อได้โดยไม่ต้องสมัครบริการก่อน */

const ENDPOINT = 'https://api.resend.com/emails';

export type SendResult = { logged: true; sent: boolean; error?: string };

/** ล้มเหลวในการส่งอีเมลต้องไม่ทำให้คำขอที่กำลังทำอยู่พังตามไปด้วย
    ผู้ใช้ส่งใบสมัครสำเร็จแล้ว การแจ้งเตือนเป็นผลพลอยได้ */
export async function notify(to: string, subject: string, body: string): Promise<SendResult> {
  let sent = false;
  let error: string | undefined;

  if (env.resendApiKey) {
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.resendApiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: env.emailFrom, to: [to], subject, text: body, html: renderEmailHtml(body),
          ...(env.emailReplyTo ? { reply_to: env.emailReplyTo } : {}),
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok) {
        sent = true;
      } else {
        // ข้อความจากผู้ให้บริการมีประโยชน์ตอนตั้งค่า เช่นโดเมนยังไม่ได้ยืนยัน
        error = `resend ${response.status}: ${(await response.text()).slice(0, 200)}`;
      }
    } catch (failure) {
      error = failure instanceof Error ? `${failure.name}: ${failure.message}` : String(failure);
    }
    if (error) console.error('[email]', error);
  }

  /* ส่งออกจริงแล้ว ปิด token ในลิงก์ก่อนเก็บ เพราะ token ในฐานข้อมูลเก็บแบบ hash ถ้าเก็บลิงก์เต็มไว้ใน log
     คนที่เข้าถึงฐานข้อมูลได้จะเอาลิงก์ไปยืนยันอีเมลหรือยืนยันการปรึกษาแทนเจ้าของได้
     บน Production ซ่อนเสมอแม้ส่งไม่สำเร็จ (Astra รีวิว 3 ต.ค. 2569) ผู้ใช้ขอลิงก์ใหม่ได้ เมนเทอร์ยืนยันใน Mentor zone ได้
     เครื่องพัฒนา/เทส/dev ที่ส่งไม่ออก เก็บลิงก์ไว้ให้ทดสอบได้ */
  const stored = sent || process.env.VERCEL_ENV === 'production' ? redactTokens(body) : body;
  await db.insert(emailLog).values({
    id: newId('eml'),
    to,
    subject,
    body: error ? `${stored}\n\n[ส่งไม่สำเร็จ] ${error}` : stored,
    provider: sent ? 'resend' : 'log',
  });

  return { logged: true, sent, error };
}

/** แทนค่า token=… ในลิงก์ด้วย [ซ่อน] */
export const redactTokens = (text: string) => text.replace(/([?&]token=)[\w-]+/g, '$1[ซ่อน]');

/* อีเมลข้อความล้วนที่มีแค่ลิงก์ยาว ๆ Gmail มักจัดเข้า Spam (เจอจริงวันแรกที่ขึ้น Production)
   จึงส่ง HTML คู่กับข้อความเดิมเสมอ สร้างจากข้อความเดิมโดยตรง ทุกจุดที่เรียก notify ไม่ต้องแก้
   บรรทัดที่เป็นลิงก์ล้วนกลายเป็นปุ่ม ลิงก์กลางประโยคกลายเป็นลิงก์ธรรมดา ข้อความอื่น escape ทั้งหมด
   เพราะบางส่วนมาจากผู้ใช้ เช่นชื่อนักเรียน */
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));

const URL_RE = /https?:\/\/[^\s<>"']+/g;

/* ลิงก์และปุ่มทำเฉพาะ URL ของเว็บเราเอง (APP_ORIGIN) ข้อความจากผู้ใช้ที่มี URL อื่น เช่นชื่อที่แอบใส่ลิงก์
   จะเป็นตัวหนังสือธรรมดา ไม่กลายเป็นปุ่มที่ดูเป็นทางการในอีเมลของเรา (Astra รีวิว 3 ต.ค. 2569) */
function ownUrl(raw: string, origin: string) {
  try {
    const url = new URL(raw);
    return url.origin === origin ? url : null;
  } catch {
    return null;
  }
}

function buttonLabel(url: URL) {
  if (url.pathname === '/verify-email') return 'ยืนยันอีเมล · Verify email';
  if (url.pathname === '/confirm') return 'ตอบคำขอยืนยัน · Respond';
  return 'เปิดลิงก์ · Open link';
}

function linkify(line: string, origin: string) {
  let out = '';
  let last = 0;
  for (const match of line.matchAll(URL_RE)) {
    if (!ownUrl(match[0], origin)) continue;
    const url = escapeHtml(match[0]);
    out += escapeHtml(line.slice(last, match.index)) + `<a href="${url}" style="color:#6d28d9">${url}</a>`;
    last = match.index! + match[0].length;
  }
  return out + escapeHtml(line.slice(last));
}

export function renderEmailHtml(body: string, origin = env.appOrigin) {
  const blocks = body.split(/\n{2,}/).map((block) => {
    const trimmed = block.trim();
    const own = /^https?:\/\/\S+$/.test(trimmed) ? ownUrl(trimmed, origin) : null;
    if (own) {
      const url = escapeHtml(trimmed);
      return `<p style="margin:24px 0"><a href="${url}" style="display:inline-block;background:#6d28d9;color:#ffffff;`
        + `text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px">${buttonLabel(own)}</a></p>`
        + `<p style="margin:0 0 16px;font-size:13px;color:#6b6475;word-break:break-all">${url}</p>`;
    }
    return `<p style="margin:0 0 16px">${block.split('\n').map((line) => linkify(line, origin)).join('<br>')}</p>`;
  });
  return '<!doctype html><html><body style="margin:0;background:#f6f4fa">'
    + '<div style="max-width:560px;margin:0 auto;padding:32px 20px;font-family:-apple-system,Segoe UI,Roboto,Noto Sans Thai,sans-serif;'
    + 'font-size:15px;line-height:1.6;color:#1c1917">'
    + '<p style="margin:0 0 24px;font-size:18px;font-weight:700;color:#2e1065">ChampionWays</p>'
    + `<div style="background:#ffffff;border-radius:14px;padding:24px">${blocks.join('')}</div>`
    + '<p style="margin:20px 0 0;font-size:12px;color:#6b6475">อีเมลนี้ส่งจากระบบ ChampionWays · Sent by ChampionWays</p>'
    + '</div></body></html>';
}
