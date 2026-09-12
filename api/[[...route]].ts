import { Hono } from 'hono';
import { handle } from 'hono/vercel';

/* ทางเข้าเดียวของ API บน Vercel ทุกคำขอที่ขึ้นต้นด้วย /api เข้ามาที่นี่

   ชื่อไฟล์ต้องเป็น catch-all แบบ [[...route]] ไม่ใช่ index
   เพราะ Vercel จับคู่ไฟล์กับเส้นทางตามชื่อไฟล์ api/index.ts จะรับแค่ /api พอดี ๆ
   ส่วน /api/health และเส้นทางอื่นจะกลายเป็น 404 ของ Vercel ก่อนถึงโค้ดเรา

   ต้องใช้ Node runtime ไม่ใช่ Edge เพราะไดรเวอร์ Postgres ต่อผ่าน TCP */
export const config = { runtime: 'nodejs' };

/* ต้อง export ผลของ handle() ตรง ๆ เท่านั้น ถ้าห่อด้วยฟังก์ชันของตัวเอง
   Vercel จะแยกไม่ออกว่าเป็น handler แบบ Web แล้วคำขอจะค้างจนหมดเวลา
   จึงใช้ Hono อีกชั้นเป็นตัวโหลดแอปจริงตอนมีคำขอเข้ามาแทน */
const entry = new Hono();

/** ตัดชื่อผู้ใช้และรหัสผ่านออกจากข้อความ เผื่อ error พ่วง connection string มาด้วย */
function redact(message: string) {
  return message.replace(/\/\/[^@\s/]*:[^@\s/]*@/g, '//***:***@').slice(0, 500);
}

entry.all('*', async (c) => {
  try {
    // โหลดตอนมีคำขอ ไม่ใช่ตอน import เพื่อให้ดักความผิดพลาดตอนบูตได้
    // ไม่อย่างนั้นโฮสต์จะตอบแค่ FUNCTION_INVOCATION_FAILED ซึ่งไม่บอกอะไรเลย
    const { app } = await import('../server/app');
    return await app.fetch(c.req.raw);
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error('[api] boot failed', error);
    return c.json({ error: 'เซิร์ฟเวอร์เริ่มทำงานไม่สำเร็จ', detail: redact(message) }, 500);
  }
});

export default handle(entry);
