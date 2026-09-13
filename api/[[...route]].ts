import { handle } from 'hono/vercel';
import { app } from '../server/app';

/* ทางเข้าเดียวของ API บน Vercel ทุกคำขอที่ขึ้นต้นด้วย /api เข้ามาที่นี่

   ชื่อไฟล์ต้องเป็น catch-all แบบ [[...route]] ไม่ใช่ index
   เพราะ Vercel จับคู่ไฟล์กับเส้นทางตามชื่อไฟล์ api/index.ts จะรับแค่ /api พอดี ๆ
   ส่วน /api/health และเส้นทางอื่นจะกลายเป็น 404 ของ Vercel ก่อนถึงโค้ดเรา

   ต้อง import แอปแบบปกติเท่านั้น ห้ามใช้ import() ตอนรัน เพราะตัว build ของ Vercel
   ตาม dependency จาก import ที่เขียนไว้ตรง ๆ เท่านั้น โมดูลที่เรียกแบบ dynamic
   จะไม่ถูกรวมเข้าไปในฟังก์ชัน แล้วพังตอนรันด้วย ERR_MODULE_NOT_FOUND

   และต้อง export ผลของ handle() ตรง ๆ ห้ามห่อด้วยฟังก์ชันของตัวเอง
   ไม่อย่างนั้น Vercel จะแยกไม่ออกว่าเป็น handler แบบ Web แล้วคำขอจะค้าง

   ไม่ประกาศ runtime เอง ไฟล์ .ts ใน api/ ใช้ Node runtime เป็นค่าเริ่มต้นอยู่แล้ว
   ซึ่งเป็นสิ่งที่ต้องการ เพราะไดรเวอร์ Postgres ต่อผ่าน TCP ใช้ Edge ไม่ได้ */

export default handle(app);
