import { occupationIds, occupationValues } from './stored-values.js';
import type { Messages } from '../i18n/en.js';

/* ตัวเลือกของโปรไฟล์สมาชิก ใช้ร่วมกันทั้งหน้าเว็บและเซิร์ฟเวอร์
   (server/routes/auth.ts นำเข้าไฟล์นี้) จึงต้องไม่ผูกกับ React หรือ API ของเบราว์เซอร์

   คำในนี้ตรงกับใบสมัครเมนเทอร์ เพื่อให้วันหลังเอาโปรไฟล์ไปเติมใบสมัครได้โดยไม่ต้องแปลงคำ
   ค่าที่บันทึกเป็นข้อความไทยอยู่ใน stored-values.ts ส่วนป้ายที่ผู้ใช้เห็นอยู่ใน src/i18n (t.taxonomy) */

export const occupations = occupationIds.map((id) => occupationValues[id]);
export type Occupation = (typeof occupationValues)[keyof typeof occupationValues];

/** ป้ายของสถานะที่บันทึกไว้ ตามภาษาที่เลือก ค่าที่ไม่รู้จักแสดงตามที่เก็บไว้ ไม่ทิ้งเงียบ ๆ */
export function occupationLabel(value: string | null, t: Messages) {
  const id = occupationIds.find((key) => occupationValues[key] === value);
  return id ? t.taxonomy.occupations[id] : value ?? '';
}

/* รหัสตรงกับ levelEnum ที่เวทีใช้ระบุระดับผู้เข้าแข่ง จะได้เทียบกันตรง ๆ ได้ในอนาคต
   ไม่มี open เพราะนั่นคือเวทีที่รับทุกระดับ ไม่ใช่ระดับของคน */
export type PersonLevel = 'primary' | 'secondary' | 'university';
export const personLevelKeys: PersonLevel[] = ['primary', 'secondary', 'university'];

/** บรรทัดเดียวที่สรุปว่ากำลังเรียนหรือทำงานอะไรอยู่ ข้ามช่องที่ยังไม่ได้กรอก */
export function currentRoleLine(profile: {
  occupation: string | null;
  organization: string | null;
  position: string | null;
}, t?: Messages) {
  const occupation = t ? occupationLabel(profile.occupation, t) : profile.occupation;
  return [occupation, profile.organization, profile.position].filter(Boolean).join(' · ');
}
