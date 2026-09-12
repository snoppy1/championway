import { eq } from 'drizzle-orm';
import { client, db } from './client';
import { users } from './schema';
import { hashPassword, passwordProblem } from '../lib/password';
import { newId } from '../lib/id';

/* สร้างหรืออัปเกรดบัญชีทีมตรวจ บทบาท reviewer กับ admin ตั้งได้ทางนี้เท่านั้น
   ไม่มีทางสมัครเอาเองจากหน้าเว็บ

   รันด้วย: npm run db:admin
   ต้องตั้ง ADMIN_EMAIL, ADMIN_PASSWORD และ ADMIN_NAME ใน .env.local ก่อน
   สคริปต์นี้ไม่มีรหัสผ่านตั้งต้นให้ เพราะรหัสผ่านตั้งต้นคือช่องโหว่ทันทีที่ deploy */

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? '';
const name = process.env.ADMIN_NAME?.trim() || 'ทีมตรวจ';
const role = process.env.ADMIN_ROLE === 'reviewer' ? 'reviewer' : 'admin';

if (!email || !password) {
  console.error('ต้องตั้ง ADMIN_EMAIL และ ADMIN_PASSWORD ใน .env.local ก่อน แล้วรัน npm run db:admin อีกครั้ง');
  process.exit(1);
}

const problem = passwordProblem(password);
if (problem) {
  console.error(problem);
  process.exit(1);
}

const passwordHash = await hashPassword(password);
const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);

if (existing) {
  await db.update(users).set({ passwordHash, role, name }).where(eq(users.id, existing.id));
  console.log(`อัปเดตบัญชี ${email} เป็นบทบาท ${role} แล้ว`);
} else {
  await db.insert(users).values({ id: newId('usr'), email, name, passwordHash, role });
  console.log(`สร้างบัญชี ${email} บทบาท ${role} แล้ว`);
}

await client.end();
