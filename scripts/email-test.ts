import { client } from '../server/db/client.js';
import { notify } from '../server/lib/email.js';
import { env, emailConfigured } from '../server/lib/env.js';

/* ส่งอีเมลทดสอบหนึ่งฉบับ แล้วบอกว่าผลเป็นอย่างไร
   รันด้วย: npm run email:test -- someone@example.com

   ใช้เส้นทางเดียวกับที่ระบบใช้จริง จึงบอกได้จริงว่าตั้งค่าถูกหรือยัง
   ไม่ใช่แค่เช็กว่ามีตัวแปรอยู่ */

const to = process.argv[2]?.trim();
if (!to || !to.includes('@')) {
  console.error('ใส่อีเมลปลายทางด้วย เช่น  npm run email:test -- you@example.com');
  process.exit(1);
}

console.log('ผู้ส่งที่ตั้งไว้ :', env.emailFrom);
console.log('มี API key      :', emailConfigured ? 'มี' : 'ไม่มี (จะบันทึกลงตารางอย่างเดียว ไม่ส่งจริง)');
console.log('ส่งไปที่        :', to, '\n');

const result = await notify(
  to,
  'ทดสอบการส่งอีเมลจาก ChampionWays',
  'ถ้าคุณได้รับฉบับนี้ แปลว่าการตั้งค่าอีเมลใช้งานได้แล้ว',
);

if (result.sent) {
  console.log('ส่งสำเร็จ ✓ ตรวจกล่องจดหมาย (ดูโฟลเดอร์สแปมด้วย)');
} else if (result.error) {
  console.error('ส่งไม่สำเร็จ:', result.error);
  if (result.error.includes('403') || result.error.includes('domain')) {
    console.error('\nมักเกิดจากโดเมนของผู้ส่งยังไม่ได้ยืนยัน');
    console.error('ถ้าใช้ onboarding@resend.dev จะส่งได้เฉพาะอีเมลของเจ้าของบัญชี Resend เท่านั้น');
  }
} else {
  console.log('บันทึกลงตาราง email_log แล้ว แต่ยังไม่ส่งจริงเพราะไม่มี RESEND_API_KEY');
}

await client.end();
