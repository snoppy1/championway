/* โครงสร้างของหน้าเอกสาร (นโยบายความเป็นส่วนตัว ข้อกำหนด นโยบายคืนเงิน)
   เนื้อหาแยกไฟล์ละเอกสาร มีไทยและอังกฤษคู่กัน หน้า pages/Legal.tsx แค่จัดรูปแบบ */

/** ย่อหน้าธรรมดา · รายการ (ข้อที่เป็น [หัวข้อ, ข้อความ] จะเน้นหัวข้อ) · ตารางสองคอลัมน์ */
export type LegalBlock =
  | string
  | { list: Array<string | [string, string]> }
  | { table: { head: [string, string]; rows: Array<[string, string]> } };

export type LegalSection = { id: string; heading: string; blocks: LegalBlock[] };

export type LegalDoc = {
  title: string;
  /** ข้อความใต้หัวเรื่อง เช่น "มีผลตั้งแต่…" */
  updated: string;
  intro: string;
  sections: LegalSection[];
};

export type LegalPair = { th: LegalDoc; en: LegalDoc };

/** ผู้ให้บริการและช่องทางติดต่อ ใช้ร่วมกันทุกเอกสาร (เจ้าของตัดสิน 5 ต.ค. 2569) */
export const OPERATOR = 'Nathapat Chanin';
export const CONTACT_EMAIL = 'support@championways.space';
export const EFFECTIVE = { th: '5 ตุลาคม 2569', en: 'October 5, 2026' };
