import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/* ใช้ scrypt ที่มากับ Node ไม่ใช่ bcrypt หรือ argon2 เพราะสองตัวนั้นต้องคอมไพล์
   native module ซึ่งพังบ่อยบน Windows scrypt ทนการเดารหัสผ่านได้ดีพอ ๆ กัน
   เมื่อตั้งค่าถูก และไม่เพิ่ม dependency ให้ต้องดูแล */

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;
const KEY_LENGTH = 64;

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password.normalize('NFKC'), salt, KEY_LENGTH);
  return `scrypt:${salt.toString('hex')}:${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string | null) {
  if (!stored) return false;
  const [scheme, saltHex, keyHex] = stored.split(':');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const key = await scryptAsync(password.normalize('NFKC'), Buffer.from(saltHex, 'hex'), KEY_LENGTH);
  // เทียบแบบเวลาคงที่ ไม่ให้เดารหัสผ่านจากเวลาที่ใช้ตอบ
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/* ใช้ตอนไม่พบอีเมลในระบบ เพื่อให้การตอบช้าเท่ากับกรณีรหัสผ่านผิด
   ไม่อย่างนั้นเวลาที่ใช้ตอบจะบอกได้ว่าอีเมลนี้มีบัญชีอยู่จริงหรือไม่

   สร้างตอนเรียกใช้ครั้งแรก ไม่ใช่ตอน import เพราะ top-level await ใช้ไม่ได้
   เมื่อโฮสต์แปลงโมดูลเป็น CommonJS ซึ่งทำให้ฟังก์ชันทั้งตัวบูตไม่ขึ้น */
let dummyHash: Promise<string> | null = null;
export async function wasteTime() {
  dummyHash ??= hashPassword('cw-dummy-password-for-constant-time');
  await verifyPassword('cw-dummy-password-for-constant-time-x', await dummyHash);
}

/** ข้อกำหนดขั้นต่ำ: ยาวพอที่จะเดาไม่ง่าย ไม่บังคับอักขระพิเศษเพราะทำให้คนตั้ง
    รหัสผ่านที่คาดเดาได้แต่พิมพ์ยาก */
export function passwordProblem(password: string) {
  if (password.length < 10) return 'รหัสผ่านต้องยาวอย่างน้อย 10 ตัวอักษร';
  if (password.length > 200) return 'รหัสผ่านยาวเกินไป';
  return '';
}
