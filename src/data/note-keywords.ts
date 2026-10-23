import { helpAreas } from './matching';
import type { HelpArea } from './matching';

/* แนะนำเรื่องที่อยากให้ช่วยจากหมายเหตุ ด้วยคำค้นตายตัว (เจ้าของตัดสิน 23 ต.ค. 2569: ยังไม่ใช้ AI)
   ผู้ใช้เห็นและลบหรือเพิ่มเองได้ก่อนส่ง สูตรอ่านเฉพาะแท็กที่ยืนยันแล้ว */
export const noteKeywords: Record<HelpArea, RegExp> = {
  ai_ml: /\b(ai|ml)\b|machine|llm|model|เอไอ|ปัญญาประดิษฐ์/i,
  web_app: /web|app|website|เว็บ|แอป/i,
  hardware: /hardware|iot|sensor|arduino|robot|เซนเซอร์|ฮาร์ดแวร์/i,
  uiux: /\bui\b|\bux\b|design|figma|ดีไซน์|ออกแบบ/i,
  business: /business|market|startup|ธุรกิจ|การตลาด/i,
  idea_validation: /idea|validat|ไอเดีย/i,
  debugging: /bug|debug|error|บั๊ก/i,
  pitch: /pitch|present|deck|slide|นำเสนอ|พิตช์/i,
  teamwork: /team|plan|deadline|ทีม|วางแผน/i,
  case_analysis: /case|เคส/i,
  financial_modeling: /financ|budget|revenue|cost|การเงิน|งบ/i,
};
export const suggestTags = (note: string): HelpArea[] => (note.trim() ? helpAreas.filter((area) => noteKeywords[area].test(note)) : []);
