import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// โหลดด้วย loader ที่มากับ Node เอง ไม่ต้องพึ่ง dotenv
// .env.local อยู่ใน .gitignore ค่าลับจึงไม่หลุดเข้า repo
const envFile = resolve(process.cwd(), '.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`ยังไม่ได้ตั้งค่า ${name} ให้ใส่ไว้ใน .env.local ก่อน`);
  return value;
}

export const env = {
  databaseUrl: required('DATABASE_URL'),
  port: Number(process.env.PORT ?? 8787),
  isProduction: process.env.NODE_ENV === 'production',
  /** ที่เก็บไฟล์ตอนนี้เป็นโฟลเดอร์ในเครื่อง ย้ายไป S3 ได้โดยเปลี่ยนแค่ adapter */
  uploadDir: process.env.UPLOAD_DIR ?? resolve(process.cwd(), 'server/uploads'),
  /** ที่อยู่ของหน้าเว็บ ใช้ประกอบ redirect URI ของ Google และกันการ redirect ออกนอกเว็บ */
  appOrigin: process.env.APP_ORIGIN ?? 'http://127.0.0.1:5173',
  /** ว่างได้ ถ้ายังไม่ตั้งค่า ปุ่มเข้าสู่ระบบด้วย Google จะไม่ขึ้นแทนที่จะขึ้นแล้วพัง */
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
};

export const googleConfigured = Boolean(env.googleClientId && env.googleClientSecret);
