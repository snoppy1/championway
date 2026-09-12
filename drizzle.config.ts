import { defineConfig } from 'drizzle-kit';
import { env } from './server/lib/env';

export default defineConfig({
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: env.databaseUrl },
  casing: 'snake_case',
});
