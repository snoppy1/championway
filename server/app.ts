import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { configProblems } from './lib/env.js';
import type { AppEnv } from './lib/guards.js';
import { withUser } from './lib/guards.js';
import { auth } from './routes/auth.js';
import { admin } from './routes/admin.js';
import { publicApi } from './routes/public.js';
import { chat } from './routes/chat.js';

export const app = new Hono<AppEnv>().basePath('/api');

/* ตั้งค่าไม่ครบต้องตอบว่าตัวแปรไหนผิด ไม่ใช่ปล่อยให้ฟังก์ชันพังเป็น 500 เปล่า ๆ
   ซึ่งบนโฮสต์แบบ serverless จะตามหาสาเหตุแทบไม่ได้เลย
   ตอบเฉพาะ "ชื่อ" ตัวแปรและสิ่งที่ผิด ไม่เคยตอบค่าที่ตั้งไว้ */
app.use('*', async (c, next) => {
  if (configProblems.length) {
    return c.json({
      error: 'เซิร์ฟเวอร์ยังตั้งค่าไม่ครบ จึงยังทำงานไม่ได้',
      problems: configProblems,
    }, 503);
  }
  await next();
});

app.use('*', withUser);

app.get('/health', (c) => c.json({ ok: true }));

app.route('/auth', auth);
app.route('/admin', admin);
app.route('/chats', chat);
app.route('/', publicApi);

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    return c.json({ error: error.message }, error.status);
  }
  // ข้อความจริงไปที่ log ของเซิร์ฟเวอร์ ผู้ใช้ได้แค่ข้อความกลาง ๆ
  // เพื่อไม่ให้รายละเอียดภายในหลุดออกไป
  console.error('[api]', error);
  return c.json({ error: 'เกิดข้อผิดพลาดในระบบ ลองใหม่อีกครั้ง' }, 500);
});

app.notFound((c) => c.json({ error: 'ไม่พบปลายทางนี้' }, 404));
