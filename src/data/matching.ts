/* ตัวเลือกโปรไฟล์เมนเทอร์แบบใหม่ (หมวด A–F) และตัวช่วยที่ทั้งหน้าเว็บและเซิร์ฟเวอร์ใช้ร่วมกัน
   (spec docs/superpowers/specs/2026-10-13-mentor-matching-design.md) เก็บเป็น id ภาษาอังกฤษ ป้ายอยู่ใน i18n */

export const skillGroups = {
  programming: ['python', 'javascript', 'cpp', 'java'],
  webApp: ['react', 'nextjs', 'mobile'],
  aiMl: ['ml', 'llm', 'cv'],
  hardware: ['hardware_iot_robotics'],
  dataCloud: ['data_science', 'cybersecurity', 'cloud'],
  design: ['uiux', 'product_design'],
  business: ['business_model', 'startup', 'marketing', 'strategy', 'finance'],
  pitch: ['pitching', 'presentation', 'storytelling'],
} as const;
export type SkillGroup = keyof typeof skillGroups;
export type SkillTag = (typeof skillGroups)[SkillGroup][number];
export const skillTags = Object.values(skillGroups).flat() as SkillTag[];
export const skillLevels = ['intermediate', 'advanced', 'expert'] as const;
export type SkillLevel = (typeof skillLevels)[number];

export const languages = ['th', 'en'] as const;
export type Language = (typeof languages)[number];
export const genders = ['male', 'female'] as const;
export type Gender = (typeof genders)[number];

export const experienceKinds = ['hackathon', 'case', 'innovation', 'software', 'other'] as const;
export type ExperienceKind = (typeof experienceKinds)[number];
export const experienceResults = ['participant', 'finalist', 'winner', 'other'] as const;
export type ExperienceResult = (typeof experienceResults)[number];
export const teamRoles = ['developer', 'designer', 'leader', 'business', 'other'] as const;
export type TeamRole = (typeof teamRoles)[number];

export const helpsWith = ['idea_validation', 'coding', 'debugging', 'architecture', 'mvp', 'pitch_deck', 'presentation', 'case_analysis'] as const;
export type HelpsWith = (typeof helpsWith)[number];
export const learnerLevels = ['beginner', 'intermediate', 'advanced'] as const;
export type LearnerLevel = (typeof learnerLevels)[number];
export const teachingStyles = ['step_by_step', 'guided_questions', 'review', 'direct_feedback'] as const;
export type TeachingStyle = (typeof teachingStyles)[number];
export const formats = ['one_on_one', 'team', 'code_review'] as const;
export type Format = (typeof formats)[number];

export const sessionLengths = [30, 60, 90] as const;
export const replyHoursOptions = [6, 24, 72, 168] as const;
export const modes = ['online', 'onsite', 'both'] as const;
export type Mode = (typeof modes)[number];
/** ประเทศที่เลือกได้ ZZ = อื่น ๆ */
export const countries = ['TH', 'SG', 'MY', 'VN', 'ID', 'PH', 'JP', 'US', 'GB', 'ZZ'] as const;

export type Slot = { day: number; from: string; to: string };
export type MentorProfileV2 = {
  headline: string; country: string; timeZone: string; languages: Language[]; background: string; gender: Gender | null;
  skills: { tag: SkillTag; level: SkillLevel }[];
  helpsWith: HelpsWith[]; learnerLevels: LearnerLevel[]; teachingStyles: TeachingStyle[]; formats: Format[]; deliverables: string;
  availability: Slot[]; sessionsPerWeek: number | null; sessionMinutes: number[]; acceptingRequests: boolean;
  replyHours: number | null; acceptsUrgent: boolean; mode: Mode | null;
};
export type Section = 'A' | 'B' | 'C' | 'D' | 'E';

/** หมวดที่ยังกรอกไม่ครบ ว่าง = พร้อมถูกจับคู่ (หมวด F คำนวณเอง ไม่ต้องกรอก) */
export function missingSections(p: MentorProfileV2, experienceCount: number) {
  const missing: Section[] = [];
  if (!p.headline.trim() || !p.country || !p.background.trim() || p.languages.length === 0) missing.push('A');
  if (p.skills.length === 0) missing.push('B');
  if (experienceCount === 0) missing.push('C');
  if (!p.helpsWith.length || !p.learnerLevels.length || !p.teachingStyles.length || !p.formats.length) missing.push('D');
  if (!p.availability.length || !p.sessionsPerWeek || !p.sessionMinutes.length || !p.replyHours || !p.mode) missing.push('E');
  return missing;
}
export const profileComplete = (p: MentorProfileV2, experienceCount: number) => missingSections(p, experienceCount).length === 0;

/** ชื่องานแข่งสำหรับเทียบซ้ำ: ตัวเล็ก ช่องว่างเดียว เลขไทย (U+0E50–U+0E59) เป็นเลขอารบิก */
export function normalizeName(name: string) {
  return name.replace(/[\u0E50-\u0E59]/g, (d) => String(d.charCodeAt(0) - 0x0e50)).toLowerCase().replace(/\s+/g, ' ').trim();
}

/* ---------- ฝั่งผู้เรียน: โปรไฟล์ โปรเจกต์ และคำถามจับคู่ (spec 4.2) ---------- */

export const interestFields = ['ai', 'web', 'hardware', 'design', 'data', 'security', 'business', 'other'] as const;
export type InterestField = (typeof interestFields)[number];
export const projectStarts = ['has_competition', 'has_idea', 'build_skills'] as const;
export type ProjectStart = (typeof projectStarts)[number];
export const competitionKinds = ['hackathon', 'case'] as const;
export type CompetitionKind = (typeof competitionKinds)[number];
export const projectStages = ['idea', 'planning', 'prototype', 'improving', 'pitching'] as const;
export type ProjectStage = (typeof projectStages)[number];
export const helpAreas = ['ai_ml', 'web_app', 'hardware', 'uiux', 'business', 'idea_validation', 'debugging', 'pitch', 'teamwork', 'case_analysis', 'financial_modeling'] as const;
export type HelpArea = (typeof helpAreas)[number];
/** งานแข่งแบบ Case เรียงเรื่องเหล่านี้ขึ้นก่อน */
export const caseFirstAreas: readonly HelpArea[] = ['case_analysis', 'financial_modeling', 'business', 'pitch'];
export const requestStyles = [...teachingStyles, 'mixed'] as const;
export type RequestStyle = (typeof requestStyles)[number];
export const requestFormats = ['one_on_one', 'team', 'either'] as const;
export type RequestFormat = (typeof requestFormats)[number];
export const urgencies = ['48h', 'week', 'month', 'flexible'] as const;
export type Urgency = (typeof urgencies)[number];
export const requestLanguages = ['th', 'en', 'either'] as const;
export type RequestLanguage = (typeof requestLanguages)[number];
export const requestGenders = ['any', 'male', 'female'] as const;
export type RequestGender = (typeof requestGenders)[number];

export type LearnerProfile = {
  level: LearnerLevel; interestsFields: InterestField[]; skills: SkillTag[]; languages: Language[]; country: string; interests: string;
};
export type MatchAnswers = {
  helpAreas: HelpArea[]; skillLevel: LearnerLevel; style: RequestStyle; format: RequestFormat; urgency: Urgency;
  language: RequestLanguage; gender: RequestGender; note: string;
  /** เรื่องที่แนะนำจากหมายเหตุและผู้ใช้ยืนยันแล้ว (ไม่ใช่ AI: เทียบคำตายตัว) นับรวมกับ helpAreas */
  noteTags: HelpArea[];
};


const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
/** ช่วงเวลาว่างหนึ่งช่วง ตอบชื่อปัญหาหรือ null */
export function slotProblem(slot: Slot): 'day' | 'time' | 'order' | null {
  if (!Number.isInteger(slot.day) || slot.day < 0 || slot.day > 6) return 'day';
  if (!hhmm.test(slot.from) || !hhmm.test(slot.to)) return 'time';
  if (slot.to <= slot.from) return 'order';
  return null;
}
