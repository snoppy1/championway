import type { Theme } from './focus.js';

/* คำที่ใช้จับหมวดจากข้อความที่เมนเทอร์เขียนเอง (ประสบการณ์และขอบเขตที่ช่วยได้) ทั้งไทยและอังกฤษ
   เป็นคลังคำสำหรับเทียบข้อความ ไม่ได้แสดงให้ผู้ใช้เห็น จึงไม่ผ่านพจนานุกรม i18n
   (check-i18n ยกเว้นไฟล์นี้ไว้) ต้องมีคำภาษาไทยอยู่เพราะเมนเทอร์เขียนเป็นภาษาไทย */
export const themeKeywords: Record<Theme, string[]> = {
  innovation: ['innovation', 'prototype', 'นวัตกรรม', 'ต้นแบบ'],
  business: ['business', 'marketing', 'แผนธุรกิจ', 'การตลาด'],
  education: ['education', 'learning', 'การศึกษา', 'การเรียนรู้'],
  medical: ['medical', 'clinical', 'การแพทย์', 'คลินิก'],
};
