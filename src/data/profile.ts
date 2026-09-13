/* ตัวเลือกของโปรไฟล์สมาชิก ใช้ร่วมกันทั้งหน้าเว็บและเซิร์ฟเวอร์
   (server/routes/auth.ts นำเข้าไฟล์นี้) จึงต้องไม่ผูกกับ React หรือ API ของเบราว์เซอร์

   คำในนี้ตรงกับใบสมัครเมนเทอร์ เพื่อให้วันหลังเอาโปรไฟล์ไปเติมใบสมัครได้โดยไม่ต้องแปลงคำ */

export const occupations = ['นักเรียน', 'นักศึกษา', 'ทำงานแล้ว', 'อิสระ / อื่น ๆ'] as const;
export type Occupation = (typeof occupations)[number];

/* รหัสตรงกับ levelEnum ที่เวทีใช้ระบุระดับผู้เข้าแข่ง จะได้เทียบกันตรง ๆ ได้ในอนาคต
   ไม่มี open เพราะนั่นคือเวทีที่รับทุกระดับ ไม่ใช่ระดับของคน */
export const personLevels = {
  primary: 'ประถมศึกษา',
  secondary: 'มัธยมศึกษา',
  university: 'อุดมศึกษา',
} as const;
export type PersonLevel = keyof typeof personLevels;
export const personLevelKeys = Object.keys(personLevels) as PersonLevel[];

/** ป้ายที่แสดงเมื่อผู้ใช้ยังไม่ได้กรอกช่องนั้น อ่านแล้วรู้ว่าให้ไปเติมได้ ไม่ใช่ช่องว่างเปล่า */
export const notFilled = 'ยังไม่ได้กรอก';

/** บรรทัดเดียวที่สรุปว่ากำลังเรียนหรือทำงานอะไรอยู่ ข้ามช่องที่ยังไม่ได้กรอก */
export function currentRoleLine(profile: {
  occupation: string | null;
  organization: string | null;
  position: string | null;
}) {
  return [profile.occupation, profile.organization, profile.position].filter(Boolean).join(' · ');
}
