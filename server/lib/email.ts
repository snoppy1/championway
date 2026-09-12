import { db } from '../db/client';
import { emailLog } from '../db/schema';
import { newId } from './id';

/* ตอนนี้ยังไม่ส่งอีเมลจริง บันทึกลงตาราง email_log แทน เพื่อให้ตรวจได้ว่าระบบ
   จะส่งอะไรออกไปบ้าง และเทสยืนยันได้ว่าอีเมลถูกสั่งส่งจริง
   ตอนต่อ Resend หรือ SES ให้แก้ที่ฟังก์ชันนี้ที่เดียว ที่เรียกใช้ไม่ต้องแก้ */

export async function notify(to: string, subject: string, body: string) {
  await db.insert(emailLog).values({ id: newId('eml'), to, subject, body, provider: 'log' });
}
