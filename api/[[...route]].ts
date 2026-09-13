import { getRequestListener } from '@hono/node-server';
import { app } from '../server/app.js';

/* ทางเข้าเดียวของ API บน Vercel ทุกคำขอที่ขึ้นต้นด้วย /api เข้ามาที่นี่

   ชื่อไฟล์ต้องเป็น catch-all แบบ [[...route]] ไม่ใช่ index
   เพราะ Vercel จับคู่ไฟล์กับเส้นทางตามชื่อไฟล์ api/index.ts จะรับแค่ /api พอดี ๆ
   ส่วน /api/health และเส้นทางอื่นจะกลายเป็น 404 ของ Vercel ก่อนถึงโค้ดเรา

   ต้อง export handler แบบ Node คือรับ (req, res) ไม่ใช่แบบ Web ที่คืน Response
   เพราะ Node runtime ของ Vercel ส่ง req/res ของ node:http มาให้ ถ้าเราคืน Response
   มันจะไม่มีใครปิด response แล้วคำขอจะค้างจนครบ 300 วินาทีแล้วได้ 504
   getRequestListener แปลง app.fetch ให้เป็น listener แบบ Node ให้เรียบร้อย

   ต้อง import แอปแบบปกติ ห้ามใช้ import() ตอนรัน เพราะตัว build ของ Vercel
   ตาม dependency จาก import ที่เขียนไว้ตรง ๆ เท่านั้น

   ไม่ประกาศ runtime เอง ไฟล์ .ts ใน api/ ใช้ Node runtime เป็นค่าเริ่มต้นอยู่แล้ว
   ซึ่งเป็นสิ่งที่ต้องการ เพราะไดรเวอร์ Postgres ต่อผ่าน TCP ใช้ Edge ไม่ได้ */

export default getRequestListener(app.fetch);
