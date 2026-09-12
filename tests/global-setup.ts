import { serve } from '@hono/node-server';
import { createServer } from 'vite';
import { app } from '../server/app';
import { seed } from '../server/db/seed';
import { testDatabase } from '../server/lib/database-safety';

export default async function globalSetup() {
  testDatabase(process.env);
  if (process.env.PORT !== '8788' || process.env.APP_ORIGIN !== 'http://127.0.0.1:5174') {
    throw new Error('Run tests with npm test to use isolated test ports.');
  }
  // Never reuse a server: an existing dev server may use another database.
  const api = serve({ fetch: app.fetch, port: 8788, hostname: '127.0.0.1' });
  let vite: Awaited<ReturnType<typeof createServer>> | undefined;
  const close = async () => {
    await vite?.close();
    await new Promise<void>((resolve) => api.close(() => resolve()));
  };
  try {
    await new Promise<void>((resolve, reject) => {
      api.once('error', reject);
      if (api.listening) resolve(); else api.once('listening', resolve);
    });
    vite = await createServer({ server: { host: '127.0.0.1', port: 5174, strictPort: true }, clearScreen: false });
    await vite.listen();
    await seed();
    return close;
  } catch (error) { await close(); throw error; }
}
