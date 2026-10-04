import { ApiError } from '../lib/api';
import type { Messages } from '../i18n/en';

/* ชนิดข้อมูลที่ /api/consult/* ตอบกลับ ใช้ร่วมกันทุกหน้าที่เกี่ยวกับการติดต่อเมนเทอร์ */

export type Rating = { average: number | null; reviews: number };
export type MentorCard = { id: string; name: string; initial: string; specialty: string; verified: boolean };
/** เมนเทอร์ในรายชื่อ พร้อมราคาและคะแนนเดือนนี้ ราคาเป็น null ได้ถ้าเมนเทอร์ยังไม่ตั้ง */
export type ListedMentor = MentorCard & { price: number | null; minutes: number | null; unit?: string; rating: Rating };
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

/* ---------- โหมดตัวกลาง (ตอนนี้ใช้อยู่): ติดต่อกันนอกเว็บ ---------- */

/** สถานะฝั่งนักเรียนของการติดต่อ: contacted คุยกับเมนเทอร์ → claimed แจ้งว่าได้รับคำแนะนำแล้ว รอเมนเทอร์ยืนยัน
    → completed เมนเทอร์ยืนยัน รีวิวได้ หรือ denied (เมนเทอร์ตอบว่าไม่ใช่) / cancelled (นักเรียนยกเลิก) */
export type ContactStatus = 'contacted' | 'claimed' | 'completed' | 'denied' | 'cancelled';
export type Contacts = { email: string; line: string; phone: string; instagram: string; link: string };
export type ContactKey = keyof Contacts;
export const contactKeys: ContactKey[] = ['email', 'line', 'phone', 'instagram', 'link'];

/** ลิงก์กดได้ของช่องทางติดต่อ สร้างจากค่าที่เมนเทอร์พิมพ์เอง จึงประกอบให้ปลอดภัยทุกแบบ
    อีเมล → mailto: เบอร์ → tel: (เหลือเฉพาะตัวเลขกับ +) LINE และ Instagram → ลิงก์โปรไฟล์ที่ encode แล้ว
    ลิงก์อื่น → เฉพาะ http(s):// ที่อ่านเป็น URL ได้ ไม่เข้าเงื่อนไขก็คืน null แล้วแสดงเป็นข้อความเฉย ๆ */
export function contactHref(key: ContactKey, raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  switch (key) {
    case 'email': return /^[^\s@]+@[^\s@]+$/.test(value) ? `mailto:${value}` : null;
    case 'phone': {
      const digits = value.replace(/[^\d+]/g, '');
      return digits.replace(/\D/g, '').length >= 5 ? `tel:${digits}` : null;
    }
    case 'line': return `https://line.me/ti/p/~${encodeURIComponent(value)}`;
    case 'instagram': {
      const handle = value.replace(/^@+/, '');
      return handle ? `https://www.instagram.com/${encodeURIComponent(handle)}/` : null;
    }
    case 'link': {
      if (!isWebLink(value)) return null;
      try { return new URL(value).href; } catch { return null; }
    }
  }
}

/** ขั้นปัจจุบันในบรรทัดขั้นตอนของโหมดตัวกลาง (ดัชนีใน t.contact.steps) ไม่เคยติดต่อ ยกเลิก หรือถูกปฏิเสธ = ขั้นแรก */
export function contactStep(status: ContactStatus | null, reviewed = false): number {
  switch (status) {
    case 'contacted': return 1;
    case 'claimed': return 2;
    case 'completed': return reviewed ? 4 : 3;
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
/* ราคาแบบใหม่ (ผู้ใช้ตัดสิน 4 ต.ค. 2569): ฟรี หรือบาทต่อหน่วยที่เมนเทอร์พิมพ์เอง ตรงกับ priceBody ของเซิร์ฟเวอร์ */
export type Price = { mode: '' | 'free' | 'paid'; price: string; unit: string };
const wholeIn = (text: string, min: number, max: number) => /^\d+$/.test(text) && Number(text) >= min && Number(text) <= max;
/** อะไรยังขาด: ยังไม่เลือกแบบ · ราคา · หน่วย · ทั้งสอง · null = ครบแล้ว */
export function priceProblem(price: Price | undefined): 'mode' | 'price' | 'unit' | 'both' | null {
  if (!price || !price.mode) return 'mode';
  if (price.mode === 'free') return null;
  const okPrice = wholeIn(price.price, 1, 100000);
  const okUnit = price.unit.trim().length > 0;
  return okPrice && okUnit ? null : !okPrice && !okUnit ? 'both' : !okPrice ? 'price' : 'unit';
}
/** ค่าจากเซิร์ฟเวอร์เป็นฟอร์ม แถวเก่าที่คิดเป็นนาทีจะไม่มีหน่วย เมนเทอร์ต้องใส่หน่วยตอนบันทึกครั้งถัดไป */
export const priceDraft = (price: number | null, unit = ''): Price => (price === null ? { mode: '', price: '', unit: '' }
  : price === 0 ? { mode: 'free', price: '', unit: '' } : { mode: 'paid', price: String(price), unit });
export const pricePayload = (price: Price) => (price.mode === 'free' ? { price: 0, unit: '' } : { price: Number(price.price), unit: price.unit.trim() });

/** ราคาบาท 0–100,000 และนาที 1–600 เป็นจำนวนเต็ม ใช้กับการจ้างแบบเก่าที่พักไว้ */
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
