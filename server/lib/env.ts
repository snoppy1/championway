import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { testDatabase } from './database-safety.js';

// โหลดด้วย loader ที่มากับ Node เอง ไม่ต้องพึ่ง dotenv
// .env.local อยู่ใน .gitignore ค่าลับจึงไม่หลุดเข้า repo
const envFile = resolve(process.cwd(), '.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);

/* ตั้งค่าผิดต้องรู้ทันทีและรู้ว่าผิดตรงไหน เดิมโยน error ตั้งแต่ตอน import
   ซึ่งบนโฮสต์แบบ serverless จะกลายเป็น 500 เปล่า ๆ ที่ไม่บอกอะไรเลย
   ตอนนี้เก็บปัญหาไว้เป็นรายการแทน แล้วให้ app.ts ตอบกลับว่าค่าไหนผิด
   ส่วนตอนรันในเครื่อง index.ts ยังหยุดทันทีเหมือนเดิม
   ข้อความบอกแค่ "ชื่อ" ตัวแปร ไม่เคยบอกค่า */

export const configProblems: string[] = [];

function required(name: string) {
  const value = process.env[name];
  if (!value) configProblems.push(`ยังไม่ได้ตั้งค่า ${name}`);
  return value ?? '';
}

const rawOrigin = process.env.APP_ORIGIN ?? 'http://127.0.0.1:5173';
let originUrl: URL | null = null;
try {
  originUrl = new URL(rawOrigin);
} catch {
  configProblems.push('APP_ORIGIN ไม่ใช่ URL ที่ถูกต้อง ต้องขึ้นต้นด้วย https:// หรือ http://');
}
if (originUrl) {
  if (!['http:', 'https:'].includes(originUrl.protocol) || originUrl.username || originUrl.password
    || originUrl.pathname !== '/' || originUrl.search || originUrl.hash) {
    configProblems.push('APP_ORIGIN ต้องเป็นที่อยู่เว็บล้วน ๆ ห้ามมี path, query หรือ hash ต่อท้าย');
  }
  if (process.env.VERCEL && (!process.env.APP_ORIGIN || originUrl.protocol !== 'https:')) {
    configProblems.push('บน Vercel ต้องตั้ง APP_ORIGIN เป็น URL แบบ https ของสภาพแวดล้อมนั้น');
  }
}

function databaseUrl() {
  if (process.env.APP_ENV === 'test') return testDatabase(process.env);
  return required('DATABASE_URL');
}

export const env = {
  databaseUrl: databaseUrl(),
  port: Number(process.env.PORT ?? 8787),
  isProduction: process.env.NODE_ENV === 'production',
  /** ที่เก็บไฟล์ตอนนี้เป็นโฟลเดอร์ในเครื่อง ย้ายไป S3 ได้โดยเปลี่ยนแค่ adapter */
  uploadDir: process.env.UPLOAD_DIR ?? resolve(process.cwd(), 'server/uploads'),
  /** ที่อยู่ของหน้าเว็บ ใช้ประกอบ redirect URI ของ Google และกันการ redirect ออกนอกเว็บ */
  appOrigin: originUrl?.origin ?? rawOrigin,
  /** ว่างได้ ถ้ายังไม่ตั้งค่า ปุ่มเข้าสู่ระบบด้วย Google จะไม่ขึ้นแทนที่จะขึ้นแล้วพัง */
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  /** ว่างได้ ไม่มีคีย์ก็ยังบันทึกอีเมลลงตาราง แค่ไม่ส่งออกจริง */
  resendApiKey: process.env.RESEND_API_KEY ?? '',
  emailFrom: process.env.EMAIL_FROM ?? 'ChampionWays <onboarding@resend.dev>',
  /** ว่างได้ ไม่มี token ก็เก็บไฟล์ลงดิสก์ ซึ่งใช้ได้เฉพาะตอนพัฒนาในเครื่อง */
  blobToken: process.env.BLOB_READ_WRITE_TOKEN ?? '',
};

export const emailConfigured = Boolean(env.resendApiKey);
/* ดิสก์ของ serverless หายทุกครั้งที่ instance ถูกรีไซเคิล ไฟล์ที่อัปโหลดจึงอยู่ไม่ได้จริง
   ถ้าอยู่บน Vercel แล้วไม่มี blob token ให้ถือว่ายังรับไฟล์ไม่ได้ ดีกว่ารับแล้วหาย */
export const blobConfigured = Boolean(env.blobToken);
export const uploadsUsable = blobConfigured || !process.env.VERCEL;

export const googleConfigured = Boolean(env.googleClientId && env.googleClientSecret);
