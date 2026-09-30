import { themeKeywords } from './focus-keywords.js';
import { th } from '../i18n/th.js';

/* ประเภทงานและหมวดของเส้นทาง "อยากแข่งงานไหน" พร้อมกฎให้คะแนนจับคู่เมนเทอร์

   ไฟล์นี้ใช้ร่วมกันทั้งหน้าเว็บและเซิร์ฟเวอร์ (server/routes/journey.ts นำเข้าไฟล์นี้)
   จึงต้องไม่ผูกกับ React หรือ API ของเบราว์เซอร์ เพื่อให้คะแนนที่คำนวณสองฝั่งตรงกันเสมอ

   ป้ายที่ผู้ใช้เห็นอยู่ใน src/i18n (t.taxonomy.kinds และ t.taxonomy.themes) ที่นี่เก็บเฉพาะรหัส
   kinds และ themes ด้านล่างเป็นป้ายภาษาไทยไว้ให้หน้าจัดการกับเซิร์ฟเวอร์ซึ่งใช้ภาษาไทยอย่างเดียว */

export type Kind = 'hackathon' | 'case_competition';
export type Theme = 'innovation' | 'business' | 'education' | 'medical';
export const kinds: Record<Kind, string> = th.taxonomy.kinds;
export const themes: Record<Theme, string> = th.taxonomy.themes;
export const themeKeys = Object.keys(themes) as Theme[];
export const kindKeys = Object.keys(kinds) as Kind[];
export const RULE_VERSION = '1';

/* เหตุผลที่ได้คะแนน เก็บเป็นรหัสกับคะแนน ไม่เก็บเป็นประโยค เพราะผลนี้ถูกบันทึกลงฐานข้อมูลและส่งไปหน้าเว็บ
   ประโยคจริงประกอบที่หน้าเว็บตามภาษาที่ผู้ใช้เลือก (t.journey.scoreReason) */
export type ScoreReasonCode = 'verified' | 'confirmed' | 'experience' | 'scope';
export type ScoreReason = { code: ScoreReasonCode; points: number };
const VERIFIED_POINTS = 6;
const CONFIRMED_POINTS = 3;

export function scoreThemes(input: { experience: string; best: string; confirmed: string[]; disabled: string[]; verified: string[] }) {
  const hits = (text: string, words: string[]) => {
    const normalized = text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ');
    return Math.min(2, words.filter(w => /[a-z]/.test(w) ? new RegExp(`\\b${w}\\b`).test(normalized) : normalized.includes(w)).length);
  };
  return themeKeys.map(theme => {
    const evidence = input.verified.includes(theme) ? VERIFIED_POINTS : 0;
    const confirmation = input.confirmed.includes(theme) ? CONFIRMED_POINTS : 0;
    const experience = hits(input.experience, themeKeywords[theme]);
    const best = hits(input.best, themeKeywords[theme]);
    const score = evidence + confirmation + experience + best;
    const reasons: ScoreReason[] = [];
    if (evidence) reasons.push({ code: 'verified', points: evidence });
    if (confirmation) reasons.push({ code: 'confirmed', points: confirmation });
    if (experience) reasons.push({ code: 'experience', points: experience });
    if (best) reasons.push({ code: 'scope', points: best });
    return { theme, score, active: score >= 3 && !input.disabled.includes(theme), disabled: input.disabled.includes(theme), version: RULE_VERSION, reasons };
  });
}

/** เหตุผลที่แนะนำเมนเทอร์ให้เวทีหนึ่ง server ส่งเป็นรหัส หน้าเว็บประกอบประโยคตามภาษา */
export type MatchReason = { code: 'chose' } | { code: 'verified' | 'aptitude'; theme: Theme };
