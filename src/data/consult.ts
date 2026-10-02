import { ApiError } from '../lib/api';
import type { Messages } from '../i18n/en';

/* ชนิดข้อมูลที่ /api/consult/* ตอบกลับ ใช้ร่วมกันทุกหน้าที่เกี่ยวกับการติดต่อเมนเทอร์ */

export type Rating = { average: number | null; reviews: number };
export type MentorCard = { id: string; name: string; initial: string; specialty: string; verified: boolean };
/** เมนเทอร์ในรายชื่อ พร้อมราคาและคะแนนเดือนนี้ ราคาเป็น null ได้ถ้าเมนเทอร์ยังไม่ตั้ง */
export type ListedMentor = MentorCard & { price: number | null; minutes: number | null; rating: Rating };
export type RankedMentor = ListedMentor & { rank: number };

/* การจ้างเมนเทอร์ผ่านเว็บ (1 ต.ค. 2569) สถานะเดินตามลำดับ
   requested → accepted → completed (นักเรียนกดเสร็จงาน) แล้วรีวิวได้ หรือจบที่ declined / cancelled */
export type HireStatus = 'requested' | 'accepted' | 'paid' | 'declined' | 'cancelled' | 'completed';
export type HireBase = {
  id: string; status: HireStatus; createdAt: string; acceptedAt: string | null; completedAt: string | null;
  minutes: number; price: number; preferredAt: string | null; note: string; reason: string;
  roomId: string | null; unread: number; competition: { slug: string; name: string } | null;
  /** จ่ายเงินแล้วเมื่อไร และนักเรียนแจ้งปัญหาไว้หรือไม่ (งานที่แจ้งปัญหายังเป็น paid จนกว่าทีมงานตัดสิน) */
  paidAt: string | null; disputedAt: string | null;
};
/** ฝั่งนักเรียน: GET /consult/mine */
export type MemberHire = HireBase & { mentor: MentorCard; review: { stars: number } | null };
/** ฝั่งเมนเทอร์: GET /consult/zone (ชื่อนักเรียนเป็นชื่อแรกเท่านั้น) */
export type MentorHire = HireBase & {
  student: string;
  payout: null | { status: 'due' | 'held' | 'paid' | 'cancelled'; amount: number; paidAt: string | null; reference: string };
};

export type PayoutAccount = { accountName: string; bankCode: string; last4: string; status: 'pending' | 'verified' | 'failed' };
export const bankCodes = ['bbl', 'kbank', 'ktb', 'scb', 'bay', 'ttb', 'gsb', 'baac', 'uob', 'cimb', 'kk', 'tisco', 'lhb', 'ghb', 'icbc'] as const;

/** ราคารวมของการจ้าง = ราคาต่องาน × เวลาที่จ้าง ÷ นาทีของราคานั้น ปัดขึ้น ตรงกับที่เซิร์ฟเวอร์คิดตอนส่งคำขอ
    หน้าเว็บคำนวณไว้แค่แสดงให้เห็นสด เซิร์ฟเวอร์คิดเองใหม่เสมอ */
export function hireTotal(price: number, minutes: number, hours: number) {
  return Math.ceil((price * hours * 60) / minutes);
}

/** ขั้นปัจจุบันของงานจ้างในบรรทัดขั้นตอน (ดัชนีใน t.consult.steps) ยังไม่เคยจ้างหรือจบแบบไม่สำเร็จคือขั้นแรก
    ถ้าจะเพิ่มขั้นจ่ายเงินหรือห้องวิดีโอ เพิ่มรายการใน steps แล้วปรับตารางนี้ที่เดียว */
export function hireStep(status: HireStatus | null): number {
  switch (status) {
    case 'requested': return 1;
    case 'accepted': return 2;
    case 'paid': return 3;
    case 'completed': return 5;
    default: return 0;
  }
}

/** ห้องแชต (GET /chats/:id/messages) */
export type ChatMessage = {
  id: string; senderId: string; name: string; body: string; fileName: string | null; fileMime: string | null;
  createdAt: string; mine: boolean;
};

/** ลิงก์ต้องขึ้นต้นด้วย http(s):// เหมือนที่เซิร์ฟเวอร์ตรวจ */
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
export function consultError(failure: unknown, t: Messages, scope: 'student' | 'mentor' | 'hire' = 'student') {
  if (!(failure instanceof ApiError)) return t.errors.unreachable;
  const e = t.consult.errors;
  switch (failure.status) {
    case 401: return e.signIn;
    case 403: return scope === 'mentor' ? e.generic : e.verify;
    case 404: return e.notFound;
    case 409: return scope === 'hire' ? e.hireConflict : e.changed;
    case 429: return e.wait;
    case 400: return scope === 'hire' ? e.hireInvalid : e.invalid;
    default: return e.generic;
  }
}
