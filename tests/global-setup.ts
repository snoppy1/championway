import { createServer } from 'vite';

// Keep Vite in this process so cleanup doesn't depend on Windows taskkill.
export default async function globalSetup() {
  try {
    const response = await fetch('http://127.0.0.1:5173', { signal: AbortSignal.timeout(1000) });
    if (response.ok && (await response.text()).includes('ChampionWays')) return;
  } catch {
    // No running development server: start one just for this test run.
  }

  const server = await createServer({
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
    clearScreen: false,
  });
  await server.listen();
  return async () => { await server.close(); };
}
