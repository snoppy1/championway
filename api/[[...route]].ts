import { handle } from 'hono/vercel';

/* ทางเข้าเดียวของ API บน Vercel ทุกคำขอที่ขึ้นต้นด้วย /api เข้ามาที่นี่

   ชื่อไฟล์ต้องเป็น catch-all แบบ [[...route]] ไม่ใช่ index
   เพราะ Vercel จับคู่ไฟล์กับเส้นทางตามชื่อไฟล์ api/index.ts จะรับแค่ /api พอดี ๆ
   ส่วน /api/health และเส้นทางอื่นจะกลายเป็น 404 ของ Vercel ก่อนถึงโค้ดเรา

   ต้องใช้ Node runtime ไม่ใช่ Edge เพราะไดรเวอร์ Postgres ต่อผ่าน TCP */
export const config = { runtime: 'nodejs' };

/* โหลดแอปตอนมีคำขอเข้ามา ไม่ใช่ตอน import เพื่อให้ดักความผิดพลาดตอนบูตได้
   ถ้าโหลดไม่ขึ้นแล้วปล่อยให้โยนออกไป โฮสต์จะตอบแค่ FUNCTION_INVOCATION_FAILED
   ซึ่งไม่บอกอะไรเลยว่าพังเพราะอะไร */
let handler: ((request: Request) => Response | Promise<Response>) | null = null;

/** ตัดชื่อผู้ใช้และรหัสผ่านออกจากข้อความ เผื่อ error พ่วง connection string มาด้วย */
function redact(message: string) {
  return message.replace(/\/\/[^@\s/]*:[^@\s/]*@/g, '//***:***@').slice(0, 500);
}

export default async function route(request: Request) {
  try {
    if (!handler) {
      const { app } = await import('../server/app');
      handler = handle(app);
    }
    return await handler(request);
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error('[api] boot failed', error);
    return Response.json({ error: 'เซิร์ฟเวอร์เริ่มทำงานไม่สำเร็จ', detail: redact(message) }, { status: 500 });
  }
}
