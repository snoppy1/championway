import { ApiError } from '../lib/api';
import type { Messages } from '../i18n/en';

/* ชนิดข้อมูลที่ /api/consult/* ตอบกลับ ใช้ร่วมกันทุกหน้าที่เกี่ยวกับการติดต่อเมนเทอร์ */

export type Rating = { average: number | null; reviews: number };
export type MentorCard = { id: string; name: string; initial: string; specialty: string; verified: boolean };
/** เมนเทอร์ในรายชื่อ พร้อมราคาและคะแนนเดือนนี้ ราคาเป็น null ได้ถ้าเมนเทอร์ยังไม่ตั้ง */
export type ListedMentor = MentorCard & { price: number | null; minutes: number | null; rating: Rating };
export type RankedMentor = ListedMentor & { rank: number };

export type ConsultStatus = 'active' | 'claimed' | 'confirmed' | 'cancelled';
export type Contacts = { email: string; line: string; phone: string; instagram: string; link: string };
export type ContactKey = keyof Contacts;
export const contactKeys: ContactKey[] = ['email', 'line', 'phone', 'instagram', 'link'];

/** ช่องทางติดต่อต้องมีอย่างน้อยหนึ่งช่อง และลิงก์ต้องขึ้นต้นด้วย http(s):// เหมือนที่เซิร์ฟเวอร์ตรวจ */
export const isWebLink = (value: string) => /^https?:\/\//i.test(value.trim());
/** ราคาบาท 0–100,000 และนาที 1–600 เป็นจำนวนเต็ม ตรงกับ priceBody ของเซิร์ฟเวอร์ */
export function parsePrice(price: string, minutes: string) {
  const p = price.trim() === '' ? NaN : Number(price);
  const m = minutes.trim() === '' ? NaN : Number(minutes);
  if (!Number.isInteger(p) || !Number.isInteger(m) || p < 0 || p > 100_000 || m < 1 || m > 600) return null;
  return { price: p, minutes: m };
}

/** เซิร์ฟเวอร์ตอบ error เป็นภาษาไทยเสมอ (ยังไม่แปลตาม x-lang) หน้าชุดนี้จึงเลือกข้อความจากรหัสสถานะแทน
    เพื่อให้ผู้ใช้ภาษาอังกฤษไม่เจอภาษาไทย ส่วน 403 ของ Mentor zone แปลว่าไม่ใช่เมนเทอร์ ไม่ใช่ยังไม่ยืนยันอีเมล */
export function consultError(failure: unknown, t: Messages, scope: 'student' | 'mentor' = 'student') {
  if (!(failure instanceof ApiError)) return t.errors.unreachable;
  const e = t.consult.errors;
  switch (failure.status) {
    case 401: return e.signIn;
    case 403: return scope === 'student' ? e.verify : e.generic;
    case 404: return e.notFound;
    case 409: return e.changed;
    case 429: return e.wait;
    case 400: return e.invalid;
    default: return e.generic;
  }
}
