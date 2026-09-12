import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../lib/env';
import * as schema from './schema';

// Neon free tier หลับเมื่อไม่มีคนใช้ query แรกหลังตื่นจึงช้าได้ถึงราวครึ่งวินาที
// ตั้ง connect_timeout ให้เผื่อไว้ และเปิด connection ไม่มากเพราะงานเขียนน้อย
const client = postgres(env.databaseUrl, {
  max: 5,
  idle_timeout: 20,
  connect_timeout: 30,
  prepare: false,
});

export const db = drizzle(client, { schema });
export { client, schema };
