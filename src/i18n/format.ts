/* จัดรูปแบบวันที่ เวลา และตัวเลขตามภาษาที่เลือก ไม่ผูกกับ React เพื่อให้ไฟล์ข้อมูลที่เซิร์ฟเวอร์ใช้ร่วมกันนำเข้าได้
   ตัวเลขและวันที่ต้องผ่าน Intl เสมอ ไม่เขียนรูปแบบเอง ภาษาไทยจึงได้ปี พ.ศ. และชื่อเดือนไทยตามที่ผู้ใช้คุ้น */

export type Lang = 'en' | 'th';

export const locales: Record<Lang, string> = { en: 'en-US', th: 'th-TH' };

/** เวลาของนัดและคิวเป็นเวลาไทยเสมอ ไม่ว่าผู้ใช้อยู่เขตเวลาไหน */
const TIME_ZONE = 'Asia/Bangkok';

export function formatNumber(value: number, lang: Lang) {
  return new Intl.NumberFormat(locales[lang]).format(value);
}

/** วันที่แบบสั้น เช่น 30 ก.ย. 2569 หรือ Sep 30, 2026 */
export function formatDate(value: string | Date, lang: Lang) {
  return new Intl.DateTimeFormat(locales[lang], { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

/** วันที่จากช่องกรอกวันที่ (YYYY-MM-DD) ใช้เที่ยงวันเพื่อไม่ให้เขตเวลาเลื่อนไปเป็นวันอื่น */
export function formatInputDate(value: string, lang: Lang) {
  return value ? new Intl.DateTimeFormat(locales[lang], { dateStyle: 'medium' }).format(new Date(`${value}T12:00:00`)) : '';
}

/** วันและเวลาของนัด เป็นเวลาไทยเสมอ */
export function formatDateTime(value: string, lang: Lang) {
  return new Date(value).toLocaleString(locales[lang], { timeZone: TIME_ZONE, dateStyle: 'medium', timeStyle: 'short' });
}

/** วันและเวลาตามเขตเวลาของเครื่อง ใช้กับเวลาที่ส่งข้อความและวันหมดอายุคำเชิญ */
export function formatLocalDateTime(value: string, lang: Lang) {
  return new Date(value).toLocaleString(locales[lang], { dateStyle: 'medium', timeStyle: 'short' });
}

/** เวลาอย่างเดียว เป็นเวลาไทย ใช้ต่อท้ายช่วงเวลานัด */
export function formatTime(value: string, lang: Lang) {
  return new Date(value).toLocaleTimeString(locales[lang], { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' });
}
