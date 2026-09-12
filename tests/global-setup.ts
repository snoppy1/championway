import { serve } from '@hono/node-server';
import { createServer } from 'vite';
import { app } from '../server/app';
import { seed } from '../server/db/seed';

const API_PORT = Number(process.env.PORT ?? 8787);

async function alive(url: string, contains?: string) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) return false;
    return contains ? (await response.text()).includes(contains) : true;
  } catch {
    return false;
  }
}

// Keep both servers in this process so cleanup doesn't depend on Windows taskkill.
export default async function globalSetup() {
  // ล้างและใส่ข้อมูลตัวอย่างใหม่ทุกครั้ง เพื่อให้ผลการทดสอบไม่ขึ้นกับสิ่งที่ค้างจากรอบก่อน
  await seed();

  const stop: (() => Promise<void>)[] = [];

  if (!await alive(`http://127.0.0.1:${API_PORT}/api/health`)) {
    const api = serve({ fetch: app.fetch, port: API_PORT, hostname: '127.0.0.1' });
    stop.push(() => new Promise<void>((resolve) => { api.close(() => resolve()); }));
  }

  if (!await alive('http://127.0.0.1:5173', 'ChampionWays')) {
    const vite = await createServer({
      server: { host: '127.0.0.1', port: 5173, strictPort: true },
      clearScreen: false,
    });
    await vite.listen();
    stop.push(() => vite.close());
  }

  return async () => { for (const close of stop) await close(); };
}
