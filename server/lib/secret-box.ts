import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/* เข้ารหัสข้อมูลอ่อนไหวก่อนเก็บลงฐานข้อมูล (ตอนนี้ใช้กับเลขบัญชีธนาคารของเมนเทอร์)
   AES-256-GCM คีย์มาจาก PAYOUT_ENCRYPTION_KEY (32 ไบต์ เข้ารหัส base64) ไม่อยู่ในฐานข้อมูล
   ฐานข้อมูลหลุดอย่างเดียวจึงอ่านเลขบัญชีไม่ได้ รูปแบบที่เก็บ: v1.<iv>.<tag>.<ciphertext> */

function key() {
  const raw = process.env.PAYOUT_ENCRYPTION_KEY ?? '';
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('PAYOUT_ENCRYPTION_KEY ต้องเป็นคีย์ 32 ไบต์แบบ base64');
  return buf;
}

/** สถานะคีย์สำหรับ /api/health บอกแค่ว่ามี/ไม่มี/ผิดรูปแบบ ไม่บอกค่า ใช้ไล่ปัญหาตอนตั้งค่าบน Vercel */
export function secretBoxStatus(): 'ready' | 'missing' | 'invalid' {
  const raw = process.env.PAYOUT_ENCRYPTION_KEY;
  if (!raw) return 'missing';
  return Buffer.from(raw, 'base64').length === 32 ? 'ready' : 'invalid';
}

export const secretBoxReady = () => {
  try { key(); return true; } catch { return false; }
};

export function seal(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

export function open(sealed: string) {
  const [version, iv, tag, data] = sealed.split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('ข้อมูลที่เข้ารหัสไว้ผิดรูปแบบ');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
