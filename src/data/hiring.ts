import { useEffect, useState } from 'react';
import { api } from '../lib/api';

/* สวิตช์ "จ้างเมนเทอร์ แชต และจ่ายเงิน" (server/lib/flow.ts, HIRING_ENABLED)
   ตอนนี้ปิดไว้ เว็บเป็นตัวกลางให้นักเรียนกับเมนเทอร์ติดต่อกันนอกเว็บ หน้าเว็บถามเซิร์ฟเวอร์ครั้งเดียวต่อการเปิดหน้า
   (/api/consult/me ตอบได้แม้ยังไม่เข้าสู่ระบบ) แล้วจำค่าไว้ ทุกหน้าที่เกี่ยวกับการจ้างแตกแขนงตามค่านี้
   null = ยังไม่รู้ ให้หน้าที่เรียกรอก่อน อย่าเดาว่าเปิดหรือปิด ไม่งั้นแฟลชหน้าผิดโหมดให้ผู้ใช้เห็น */
let known: boolean | null = null;
let pending: Promise<boolean> | null = null;

function load() {
  pending ??= api<{ hiring: boolean }>('/consult/me')
    .then((result) => { known = Boolean(result.hiring); return known; })
    // ถามไม่ได้ (เซิร์ฟเวอร์ล่ม) ใช้โหมดที่ใช้อยู่ตอนนี้ แต่ไม่จำค่านี้ ครั้งหน้าถามใหม่
    .catch(() => false)
    .finally(() => { pending = null; });
  return pending;
}

export function useHiring(): boolean | null {
  const [hiring, setHiring] = useState<boolean | null>(known);
  useEffect(() => {
    if (known !== null) { setHiring(known); return; }
    let alive = true;
    void load().then((value) => { if (alive) setHiring(value); });
    return () => { alive = false; };
  }, []);
  return hiring;
}
