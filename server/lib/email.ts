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
        body: JSON.stringify({ from: env.emailFrom, to: [to], subject, text: body }),
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
