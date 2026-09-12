import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const [task = 'test', ...args] = process.argv.slice(2);
const commands = {
  test: ['node_modules/@playwright/test/cli.js', 'test'],
  migrate: ['node_modules/drizzle-kit/bin.cjs', 'migrate'],
  seed: ['--import', 'tsx', 'server/db/seed.ts'],
};
if (!commands[task]) throw new Error('Unknown test environment command');
const child = spawn(process.execPath, [...commands[task], ...args], {
  stdio: 'inherit',
  env: { ...process.env, APP_ENV: 'test', PORT: '8788', APP_ORIGIN: 'http://127.0.0.1:5174', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' },
});
child.on('exit', (code) => { process.exitCode = code ?? 1; });
child.on('error', () => { console.error('Could not start test process'); process.exitCode = 1; });
