import { handle } from 'hono/vercel';
import { app } from '../server/app';

/* ทางเข้าเดียวของ API บน Vercel ทุกคำขอที่ขึ้นต้นด้วย /api เข้ามาที่นี่
   ต้องใช้ Node runtime ไม่ใช่ Edge เพราะไดรเวอร์ Postgres ต่อผ่าน TCP */
export const config = { runtime: 'nodejs' };

export default handle(app);
