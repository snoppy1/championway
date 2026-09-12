import { hashPassword, passwordProblem } from '../server/lib/password';
import { newId } from '../server/lib/id';

/* พิมพ์คำสั่ง SQL สำหรับสร้างหรืออัปเกรดบัญชีทีมตรวจ โดย "ไม่ต่อฐานข้อมูลเลย"
   ใช้เมื่อไม่อยากเอา connection string ของ production ลงมาไว้ในเครื่อง
   เอาผลลัพธ์ไปวางใน SQL Editor ของ Neon แทน

   รันด้วย: npm run db:admin:sql
   อ่านค่าจาก ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME และ ADMIN_ROLE
   สิ่งที่พิมพ์ออกมาเป็น "แฮช" ของรหัสผ่าน ไม่ใช่ตัวรหัสผ่าน */

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? '';
const name = process.env.ADMIN_NAME?.trim() || 'ทีมตรวจ';
const role = process.env.ADMIN_ROLE === 'reviewer' ? 'reviewer' : 'admin';

if (!email || !password) {
  console.error('ต้องตั้ง ADMIN_EMAIL และ ADMIN_PASSWORD ก่อน แนะนำให้ตั้งใน shell ด้วย Read-Host');
  console.error('ไม่ควรเก็บรหัสผ่านของ production ไว้ใน .env.local');
  process.exit(1);
}

const problem = passwordProblem(password);
if (problem) {
  console.error(problem);
  process.exit(1);
}

// อัญประกาศเดี่ยวใน SQL หนีด้วยการซ้ำตัวเอง กันค่าที่มี ' อยู่ทำให้คำสั่งเพี้ยน
const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;
const hash = await hashPassword(password);

console.log(`
-- วางคำสั่งนี้ใน SQL Editor ของฐานข้อมูล production
-- ถ้ามีบัญชีอีเมลนี้อยู่แล้ว จะอัปเดตรหัสผ่านและบทบาทให้แทนการสร้างซ้ำ
insert into users (id, email, password_hash, name, role)
values (${quote(newId('usr'))}, ${quote(email)}, ${quote(hash)}, ${quote(name)}, ${quote(role)})
on conflict (email) do update
  set password_hash = excluded.password_hash,
      name = excluded.name,
      role = excluded.role;
`.trim());
