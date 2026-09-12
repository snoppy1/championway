import { handle } from 'hono/vercel';
import { app } from '../server/app';

/* ทางเข้าเดียวของ API บน Vercel ทุกคำขอที่ขึ้นต้นด้วย /api เข้ามาที่นี่

   ชื่อไฟล์ต้องเป็น catch-all แบบ [[...route]] ไม่ใช่ index
   เพราะ Vercel จับคู่ไฟล์กับเส้นทางตามชื่อไฟล์ api/index.ts จะรับแค่ /api พอดี ๆ
   ส่วน /api/health และเส้นทางอื่นจะกลายเป็น 404 ของ Vercel ก่อนถึงโค้ดเรา

   ต้องใช้ Node runtime ไม่ใช่ Edge เพราะไดรเวอร์ Postgres ต่อผ่าน TCP */
export const config = { runtime: 'nodejs' };

export default handle(app);
