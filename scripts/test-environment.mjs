import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const webPort = process.env.TEST_WEB_PORT ?? '5174';
const apiPort = process.env.TEST_API_PORT ?? '8788';
if ([webPort, apiPort].some(p => !/^\d+$/.test(p) || Number(p) < 1024 || Number(p) > 65535) || webPort === apiPort || [webPort, apiPort].some(p => ['5173', '8787'].includes(p))) throw new Error('Use separate test ports from 1024 to 65535, excluding dev ports.');
const [task = 'test', ...args] = process.argv.slice(2);
const commands = {
  test: ['node_modules/@playwright/test/cli.js', 'test'],
  migrate: ['node_modules/drizzle-kit/bin.cjs', 'migrate'],
  seed: ['--import', 'tsx', 'server/db/seed.ts'],
  auth: ['--import', 'tsx', '--test', 'scripts/auth-google.test.ts', 'scripts/profile-api.test.ts'],
};
if (!commands[task]) throw new Error('Unknown test environment command');
const child = spawn(process.execPath, [...commands[task], ...args], {
  stdio: 'inherit',
  env: { ...process.env, APP_ENV: 'test', RESEND_API_KEY: '', BLOB_READ_WRITE_TOKEN: '', TEST_WEB_PORT: webPort, TEST_API_PORT: apiPort, PORT: apiPort, APP_ORIGIN: `http://127.0.0.1:${webPort}`, GOOGLE_CLIENT_ID: task === 'auth' ? 'test-client.apps.googleusercontent.com' : '', GOOGLE_CLIENT_SECRET: task === 'auth' ? 'test-only-secret' : '' },
});
child.on('exit', (code) => { process.exitCode = code ?? 1; });
child.on('error', () => { console.error('Could not start test process'); process.exitCode = 1; });
