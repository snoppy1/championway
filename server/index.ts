import { serve } from '@hono/node-server';
import { app } from './app';
import { configProblems, env } from './lib/env';

// ตอนรันในเครื่อง หยุดทันทีดีกว่าปล่อยให้เปิดเซิร์ฟเวอร์ที่ตอบ 503 ทุกเส้นทาง
if (configProblems.length) {
  for (const problem of configProblems) console.error('ตั้งค่าผิด:', problem);
  process.exit(1);
}

serve({ fetch: app.fetch, port: env.port, hostname: '127.0.0.1' }, (info) => {
  console.log(`api ready on http://127.0.0.1:${info.port}/api`);
});
