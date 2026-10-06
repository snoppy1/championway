/* ค่าที่ถูกบันทึกลงฐานข้อมูลเป็นข้อความภาษาไทย ป้ายที่ผู้ใช้เห็นอยู่ใน src/i18n (t.taxonomy)
   ค่าเหล่านี้ต้องไม่เปลี่ยนตามภาษาของหน้าเว็บ ไม่อย่างนั้นแถวเดิมในฐานข้อมูลจะไม่ตรงกับตัวเลือกอีกต่อไป
   และหน้าจัดการ (ภาษาไทยอย่างเดียว) จะอ่านค่าที่เมนเทอร์เลือกไม่ออก
   จึงเก็บไว้ที่เดียวตรงนี้ด้วยรหัสคงที่ (check-i18n ยกเว้นไฟล์นี้ไว้) หน้าเว็บอ้างด้วยรหัสแล้วแสดงป้ายจากพจนานุกรม
   ถ้าจะเปลี่ยนเป็นรหัสล้วนในอนาคต ต้องย้ายแถวเดิมในฐานข้อมูลก่อน */

/** ความถนัดของเมนเทอร์ในใบสมัคร (ข้อเสนอชุดหกหัวข้อ รอคำสุดท้ายจากเจ้าของ) */
export const topicValues = {
  framing: 'ตีโจทย์และหาไอเดีย',
  planning: 'วางแผนและแบ่งงาน',
  prototype: 'พัฒนาต้นแบบ',
  slides: 'ออกแบบสไลด์',
  pitching: 'Pitching และตอบคำถาม',
  review: 'วิเคราะห์ผลงานหลังแข่ง',
} as const;
export type TopicId = keyof typeof topicValues;
export const topicIds = Object.keys(topicValues) as TopicId[];

/** สถานะการเรียนหรือทำงานของสมาชิก ค่าเดียวกับที่ใบสมัครเมนเทอร์ใช้ */
export const occupationValues = {
  student: 'นักเรียน',
  university: 'นักศึกษา',
  working: 'ทำงานแล้ว',
  other: 'อิสระ / อื่น ๆ',
} as const;
export type OccupationId = keyof typeof occupationValues;
export const occupationIds = Object.keys(occupationValues) as OccupationId[];
