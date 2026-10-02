import type { ReactNode } from 'react';
import { keepTogether } from '../i18n/th';

/* ภาษาไทยไม่มีช่องว่างระหว่างคำ เบราว์เซอร์จึงตัดบรรทัดเองและบางครั้งตัดกลางชื่อหรือป้ายปุ่มที่อ้างถึง
   ฟังก์ชันนี้ห่อ "เมนเทอร์" กับข้อความในเครื่องหมายคำพูด “…” ให้ไม่ถูกตัดกลาง ข้อความที่เห็นเหมือนเดิมทุกตัวอักษร
   (เทสและโปรแกรมอ่านหน้าจออ่านเหมือนเดิม) */
const PARTS = new RegExp(`(“[^”]*”|${[...keepTogether, 'Mentor zone'].join('|')})`, 'g');

export function nb(text: string): ReactNode {
  return text.split(PARTS).map((part, index) => (index % 2 === 1 ? <span key={index} className="cx-nowrap">{part}</span> : part));
}

/** คำสุดท้ายของประโยค (เช่น "ใช่ไหม") ไม่ตกบรรทัดเดียวโดดเดี่ยว: ห่อคำหลังช่องว่างสุดท้ายให้อยู่ติดกับคำก่อนหน้า */
export function keepEnd(text: string): ReactNode {
  const at = text.lastIndexOf(' ');
  if (at < 0) return text;
  const before = text.slice(0, at);
  const tail = text.slice(at + 1);
  const previous = before.lastIndexOf(' ');
  return <>{nb(before.slice(0, previous + 1))}<span className="cx-nowrap">{before.slice(previous + 1)} {tail}</span></>;
}
