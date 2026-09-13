import type { IncomingMessage, ServerResponse } from 'node:http';
import { getRequestListener } from '@hono/node-server';
import { app } from '../server/app.js';

/* ทางเข้าเดียวของ API บน Vercel ทุกคำขอที่ขึ้นต้นด้วย /api เข้ามาที่นี่

   การตั้งชื่อไฟล์แบบ catch-all ใช้ไม่ได้กับโปรเจกต์แบบนี้ ทั้ง [...route] และ
   [[...route]] ถูกจับคู่กับเส้นทางที่มี segment เดียวเท่านั้น /api/health ผ่าน
   แต่ /api/auth/providers กลายเป็น 404 ของ Vercel ก่อนถึงโค้ดเรา
   จึงใช้ rewrite ใน vercel.json ส่งทุกเส้นทางใต้ /api มาที่ไฟล์นี้แทน

   rewrite พาเส้นทางเดิมมาให้ทาง __path เพราะสิ่งที่ฟังก์ชันเห็นคือปลายทางของ
   rewrite ไม่ใช่ URL ที่ผู้ใช้เรียก ถ้าไม่ส่งมาเอง Hono จะ route ไม่ถูก

   ต้อง export handler แบบ Node คือรับ (req, res) ไม่ใช่แบบ Web ที่คืน Response
   เพราะ Node runtime ของ Vercel ส่ง req/res ของ node:http มาให้ ถ้าเราคืน Response
   มันจะไม่มีใครปิด response แล้วคำขอจะค้างจนครบ 300 วินาทีแล้วได้ 504

   ต้อง import แอปแบบปกติ ห้ามใช้ import() ตอนรัน เพราะตัว build ของ Vercel
   ตาม dependency จาก import ที่เขียนไว้ตรง ๆ เท่านั้น */

const listener = getRequestListener(app.fetch);

export default function handler(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const original = url.searchParams.get('__path');
  if (original?.startsWith('/api')) {
    url.searchParams.delete('__path');
    request.url = original + (url.searchParams.size ? `?${url.searchParams}` : '');
  }
  return listener(request, response);
}
