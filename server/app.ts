import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from './lib/guards';
import { withUser } from './lib/guards';
import { auth } from './routes/auth';
import { admin } from './routes/admin';
import { publicApi } from './routes/public';

export const app = new Hono<AppEnv>().basePath('/api');

app.use('*', withUser);

app.get('/health', (c) => c.json({ ok: true }));

app.route('/auth', auth);
app.route('/admin', admin);
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
