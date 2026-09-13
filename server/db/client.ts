import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../lib/env.js';
import * as schema from './schema.js';

// Neon free tier หลับเมื่อไม่มีคนใช้ query แรกหลังตื่นจึงช้าได้ถึงราวครึ่งวินาที
// ตั้ง connect_timeout ให้เผื่อไว้ และเปิด connection ไม่มากเพราะงานเขียนน้อย
/* ถ้ายังไม่ได้ตั้ง DATABASE_URL ให้สร้าง client ด้วยที่อยู่หลอกซึ่งไม่มีวันต่อติด
   postgres-js ต่อเมื่อมีคิวรีจริงเท่านั้น และ middleware ใน app.ts จะตอบกลับ
   เรื่องการตั้งค่าผิดไปก่อนที่จะมีคิวรีใด ๆ เกิดขึ้น */
const client = postgres(env.databaseUrl || 'postgresql://unset:unset@127.0.0.1:1/unset', {
  max: 5,
  idle_timeout: 20,
  connect_timeout: 30,
  prepare: false,
});

export const db = drizzle(client, { schema });
export { client, schema };
