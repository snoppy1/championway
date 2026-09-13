/* ประเภทงานและหมวดของเส้นทาง "อยากแข่งงานไหน" พร้อมกฎให้คะแนนจับคู่เมนเทอร์

   ไฟล์นี้ใช้ร่วมกันทั้งหน้าเว็บและเซิร์ฟเวอร์ (server/routes/journey.ts นำเข้าไฟล์นี้)
   จึงต้องไม่ผูกกับ React หรือ API ของเบราว์เซอร์ เพื่อให้คะแนนที่คำนวณสองฝั่งตรงกันเสมอ */

export const kinds = { hackathon: 'Hackathon', case_competition: 'แข่งเคส' } as const;
export const themes = { innovation: 'นวัตกรรม', business: 'ธุรกิจ', education: 'การศึกษา', medical: 'การแพทย์' } as const;
export type Kind = keyof typeof kinds;
export type Theme = keyof typeof themes;
export const themeKeys = Object.keys(themes) as Theme[];
export const kindKeys = Object.keys(kinds) as Kind[];
export const RULE_VERSION = '1';
const dictionary: Record<Theme, string[]> = {
  innovation: ['innovation', 'prototype', 'นวัตกรรม', 'ต้นแบบ'],
  business: ['business', 'marketing', 'แผนธุรกิจ', 'การตลาด'],
  education: ['education', 'learning', 'การศึกษา', 'การเรียนรู้'],
  medical: ['medical', 'clinical', 'การแพทย์', 'คลินิก'],
};
export function scoreThemes(input: { experience: string; best: string; confirmed: string[]; disabled: string[]; verified: string[] }) {
  const hits = (text: string, words: string[]) => {
    const normalized = text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ');
    return Math.min(2, words.filter(w => /[a-z]/.test(w) ? new RegExp(`\\b${w}\\b`).test(normalized) : normalized.includes(w)).length);
  };
  return themeKeys.map(theme => {
    const evidence = input.verified.includes(theme) ? 6 : 0;
    const confirmation = input.confirmed.includes(theme) ? 3 : 0;
    const experience = hits(input.experience, dictionary[theme]);
    const best = hits(input.best, dictionary[theme]);
    const score = evidence + confirmation + experience + best;
    return { theme, score, active: score >= 3 && !input.disabled.includes(theme), disabled: input.disabled.includes(theme), version: RULE_VERSION,
      reasons: [evidence ? 'ผลงานที่ผู้ตรวจยืนยัน +6' : '', confirmation ? 'ยืนยันความถนัด +3' : '', experience ? `ประสบการณ์ +${experience}` : '', best ? `ขอบเขตที่ช่วยได้ +${best}` : ''].filter(Boolean) };
  });
}
export const thaiTime = (value: string) => new Date(value).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' });
