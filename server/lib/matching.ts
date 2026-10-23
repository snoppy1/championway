import type {
  CompetitionKind, Format, HelpArea, HelpsWith, Language, LearnerLevel, ProjectStage, ProjectStart, RequestFormat, RequestGender,
  RequestLanguage, RequestStyle, SkillLevel, SkillTag, TeachingStyle, TeamRole, Urgency, Gender,
} from '../../src/data/matching.js';
import { skillGroups } from '../../src/data/matching.js';

/* สูตรจับคู่ v1 (spec docs/superpowers/specs/2026-10-13-mentor-matching-design.md ข้อ 5) ฟังก์ชันล้วน ไม่แตะฐานข้อมูล
   Score = 0.30·S + 0.25·H + 0.20·G + 0.15·T + 0.10·A แต่ละส่วน 0–1 แสดงเป็นเปอร์เซ็นต์เต็ม
   AI ไม่เคยให้คะแนน ข้อความในหมายเหตุนับเฉพาะแท็กที่ผู้ใช้ยืนยันแล้ว (noteTags)
   Rising Star ไม่อยู่ในสูตรรุ่นนี้ (เจ้าของตัดสิน 23 ต.ค. 2569: พักช่องแนะนำและการดันขึ้นในคะแนนใกล้กันไว้ก่อน) */

export const MATCHING_VERSION = 'v1';
export const WEIGHTS = { S: 0.3, H: 0.25, G: 0.2, T: 0.15, A: 0.1 } as const;
/** คะแนนห่างกันไม่เกินเท่านี้นับว่าใกล้กัน ใช้ตัวตัดสินอื่นเรียงแทน */
export const NEAR_TIE = 5;
export const MAX_RESULTS = 10;

export type MatchExperience = {
  competitionId: string | null; hackathonNameId: string | null; normalizedName: string;
  kind: 'hackathon' | 'case' | 'innovation' | 'software' | 'other';
  result: 'winner' | 'finalist' | 'participant' | 'other'; role: TeamRole; year: string;
};
export type MatchMentor = {
  id: string; complete: boolean; verified: boolean; acceptingRequests: boolean;
  languages: Language[]; gender: Gender | null; sessionsPerWeek: number | null; openThisWeek: number;
  skills: { tag: SkillTag; level: SkillLevel }[];
  helpsWith: HelpsWith[]; learnerLevels: LearnerLevel[]; teachingStyles: TeachingStyle[]; formats: Format[];
  replyHours: number | null; acceptsUrgent: boolean;
  /** เฉพาะที่ทีมงานตรวจแล้ว */
  experiences: MatchExperience[];
  reviews: number; average: number | null; completedSessions: number;
};
export type MatchRequest = {
  start: ProjectStart; competitionKind: CompetitionKind | null; stage: ProjectStage;
  competitionId: string | null; hackathonNameId: string | null; competitionName: string;
  helpAreas: HelpArea[]; skillLevel: LearnerLevel; style: RequestStyle; format: RequestFormat;
  urgency: Urgency; language: RequestLanguage; gender: RequestGender;
};
export type Parts = { S: number; H: number; G: number; T: number; A: number };
export type Reason =
  | { code: 'event' }
  | { code: 'experience'; result: MatchExperience['result']; kind: MatchExperience['kind'] }
  | { code: 'skill'; tag: SkillTag; level: SkillLevel }
  | { code: 'helps'; id: HelpsWith }
  | { code: 'stage' }
  | { code: 'style' }
  | { code: 'team' }
  | { code: 'reply'; hours: number }
  | { code: 'language'; lang: Language };
export type MatchResult = { mentorId: string; score: number; parts: Parts; reasons: Reason[]; isNew: boolean };

const SKILL_VALUE: Record<SkillLevel, number> = { expert: 1, advanced: 0.85, intermediate: 0.6 };
const CAPABILITY_ONLY = 0.7;
const codingSkills: readonly SkillTag[] = [...skillGroups.programming, ...skillGroups.webApp];

/** เรื่องที่ขอ → ทักษะและความสามารถที่ครอบคลุม (spec 5.2) */
const COVERS: Record<HelpArea, { skills: SkillTag[]; caps: HelpsWith[] }> = {
  ai_ml: { skills: ['ml', 'llm', 'cv', 'data_science'], caps: [] },
  web_app: { skills: ['react', 'nextjs', 'mobile', 'javascript'], caps: [] },
  hardware: { skills: ['hardware_iot_robotics'], caps: [] },
  uiux: { skills: ['uiux', 'product_design'], caps: [] },
  business: { skills: ['business_model', 'startup', 'marketing'], caps: [] },
  idea_validation: { skills: [], caps: ['idea_validation'] },
  debugging: { skills: [], caps: ['debugging'] },
  pitch: { skills: ['pitching', 'presentation', 'storytelling'], caps: ['pitch_deck', 'presentation'] },
  teamwork: { skills: [], caps: ['architecture', 'mvp'] },
  case_analysis: { skills: ['strategy'], caps: ['case_analysis'] },
  financial_modeling: { skills: ['finance'], caps: [] },
};

type Best = { value: number; reason: Reason | null };
function coverage(area: HelpArea, m: MatchMentor, learner: LearnerLevel): Best {
  let best: Best = { value: 0, reason: null };
  const take = (value: number, reason: Reason) => { if (value > best.value) best = { value, reason }; };
  for (const skill of m.skills) {
    if (!COVERS[area].skills.includes(skill.tag)) continue;
    const value = learner === 'advanced' && skill.level === 'intermediate' ? 0.4 : SKILL_VALUE[skill.level];
    take(value, { code: 'skill', tag: skill.tag, level: skill.level });
  }
  for (const cap of COVERS[area].caps) if (m.helpsWith.includes(cap)) take(CAPABILITY_ONLY, { code: 'helps', id: cap });
  if (area === 'debugging' && m.formats.includes('code_review') && m.skills.some((s) => codingSkills.includes(s.tag))) take(CAPABILITY_ONLY, { code: 'helps', id: 'debugging' });
  if (area === 'teamwork' && m.experiences.some((e) => e.role === 'leader')) take(CAPABILITY_ONLY, { code: 'team' });
  return best;
}

function skillFit(m: MatchMentor, r: MatchRequest): Best {
  if (!r.helpAreas.length) return { value: 0, reason: null };
  const each = r.helpAreas.map((area) => coverage(area, m, r.skillLevel));
  const top = each.reduce((a, b) => (b.value > a.value ? b : a));
  return { value: each.reduce((sum, b) => sum + b.value, 0) / each.length, reason: top.reason };
}

const ROLE_FITS: Record<TeamRole, HelpArea[]> = {
  developer: ['web_app', 'ai_ml', 'debugging'], designer: ['uiux'], business: ['business', 'pitch'], leader: ['teamwork'], other: [],
};
const sameEvent = (e: MatchExperience, r: MatchRequest) =>
  Boolean((r.competitionId && e.competitionId === r.competitionId)
    || (r.hackathonNameId && e.hackathonNameId === r.hackathonNameId)
    || (r.competitionName && e.normalizedName === r.competitionName));

function competitionFit(m: MatchMentor, r: MatchRequest): Best {
  if (!m.experiences.length) return { value: 0, reason: null };
  const hasCompetition = r.start === 'has_competition';
  if (hasCompetition && m.experiences.some((e) => sameEvent(e, r))) return { value: 1, reason: { code: 'event' } };
  const kind = (hasCompetition && r.competitionKind) || 'hackathon';
  const cap = hasCompetition ? 0.8 : 1;
  let best: Best = { value: 0, reason: null };
  for (const e of m.experiences) {
    let value = e.kind === kind ? (hasCompetition ? 0.5 : 0.6) : 0.3;
    if (e.result === 'winner') value += 0.2;
    else if (e.result === 'finalist') value += 0.1;
    if (ROLE_FITS[e.role].some((area) => r.helpAreas.includes(area))) value += 0.1;
    value = Math.min(cap, value);
    if (value > best.value) best = { value, reason: { code: 'experience', result: e.result, kind: e.kind } };
  }
  return best;
}

/** ความสามารถที่ขั้นของโปรเจกต์ต้องการ (spec 5.4) แต่ละข้อผ่านได้หลายทาง */
type Want = (m: MatchMentor) => boolean;
const cap = (id: HelpsWith): Want => (m) => m.helpsWith.includes(id);
function wantsFor(stage: ProjectStage, kind: CompetitionKind | null): Want[] {
  const isCase = kind === 'case';
  switch (stage) {
    case 'idea': return [cap('idea_validation')];
    case 'planning': return [cap('idea_validation'), (m) => m.helpsWith.includes('architecture') || m.skills.some((s) => s.tag === 'uiux')];
    case 'prototype': return isCase ? [cap('case_analysis')] : [cap('coding'), cap('mvp'), cap('architecture'), cap('debugging')];
    case 'improving': return isCase
      ? [cap('case_analysis'), cap('pitch_deck')]
      : [cap('debugging'), (m) => m.helpsWith.includes('architecture') || m.formats.includes('code_review')];
    case 'pitching': return [cap('pitch_deck'), cap('presentation')];
  }
}
function goalFit(m: MatchMentor, r: MatchRequest): Best {
  const stage = r.start === 'build_skills' ? 'prototype' : r.stage;
  const wants = wantsFor(stage, r.start === 'has_competition' ? r.competitionKind : null);
  const matched = wants.filter((want) => want(m)).length;
  return matched ? { value: 0.5 + 0.5 * (matched / wants.length), reason: { code: 'stage' } } : { value: 0, reason: null };
}

function styleFit(m: MatchMentor, r: MatchRequest): Best {
  const style = r.style === 'mixed' ? (m.teachingStyles.length >= 2 ? 1 : m.teachingStyles.length === 1 ? 0.6 : 0) : (m.teachingStyles.includes(r.style) ? 1 : 0);
  const level = m.learnerLevels.includes(r.skillLevel) ? 1 : 0;
  const format = r.format === 'either' || m.formats.includes(r.format) ? 1 : 0;
  const reason: Reason | null = r.format === 'team' && format ? { code: 'team' } : style >= 1 ? { code: 'style' } : null;
  return { value: 0.5 * style + 0.3 * level + 0.2 * format, reason };
}

function availabilityFit(m: MatchMentor, r: MatchRequest): Best {
  const hours = m.replyHours ?? 168;
  let urgency: number;
  if (r.urgency === '48h') urgency = m.acceptsUrgent && hours <= 24 ? 1 : m.acceptsUrgent ? 0.6 : 0.1;
  else if (r.urgency === 'week') urgency = hours <= 72 ? 1 : 0.5;
  else urgency = 1;
  // ผ่านตัวกรองภาษามาแล้ว จึงพูดภาษาที่ขอได้เสมอ
  const language = 1;
  const lang: Language = r.language === 'either' ? (m.languages.includes('th') ? 'th' : 'en') : r.language;
  const reason: Reason = hours <= 24 ? { code: 'reply', hours } : { code: 'language', lang };
  return { value: 0.6 * urgency + 0.4 * language, reason };
}

/** ตัวกรองที่ตัดเมนเทอร์ออกเลย (spec 5.1) */
export function eligible(m: MatchMentor, r: MatchRequest) {
  if (!m.complete || !m.verified || !m.acceptingRequests) return false;
  const speaks = r.language === 'either' ? m.languages.some((l) => l === 'th' || l === 'en') : m.languages.includes(r.language);
  if (!speaks) return false;
  if (r.gender !== 'any' && m.gender !== r.gender) return false;
  if (m.sessionsPerWeek !== null && m.openThisWeek >= m.sessionsPerWeek) return false;
  return true;
}

export function scoreMentor(m: MatchMentor, r: MatchRequest): MatchResult {
  const found = { S: skillFit(m, r), H: competitionFit(m, r), G: goalFit(m, r), T: styleFit(m, r), A: availabilityFit(m, r) };
  const parts = Object.fromEntries(Object.entries(found).map(([k, v]) => [k, Math.round(v.value * 1000) / 1000])) as Parts;
  const score = Math.round(100 * (Object.keys(WEIGHTS) as (keyof Parts)[]).reduce((sum, k) => sum + WEIGHTS[k] * found[k].value, 0));
  // เหตุผลสูงสุด 3 ข้อจากส่วนที่ให้คะแนนมากที่สุด
  const reasons = (Object.keys(WEIGHTS) as (keyof Parts)[])
    .filter((k) => found[k].reason && found[k].value >= 0.5)
    .sort((a, b) => WEIGHTS[b] * found[b].value - WEIGHTS[a] * found[a].value)
    .map((k) => found[k].reason!)
    .slice(0, 3);
  return { mentorId: m.id, score, parts, reasons, isNew: m.reviews === 0 };
}

/* ลำดับ (spec 5.7 ไม่รวม Rising Star): คะแนนมากก่อน คนที่คะแนนห่างกันไม่เกิน 5 อยู่กลุ่มเดียวกัน
   ในกลุ่มเรียงตาม ดาวเฉลี่ย (เมนเทอร์ใหม่นับเท่า 3.5 แต่แพ้คนที่ได้ 3.5 พอดี) → จำนวนครั้งที่ปรึกษาสำเร็จ → ประสบการณ์ที่ใหม่กว่า */
export function rank(mentors: MatchMentor[], r: MatchRequest, limit = MAX_RESULTS): MatchResult[] {
  const byId = new Map(mentors.map((m) => [m.id, m]));
  const scored = mentors.filter((m) => eligible(m, r)).map((m) => scoreMentor(m, r)).sort((a, b) => b.score - a.score || a.mentorId.localeCompare(b.mentorId));
  const stars = (id: string) => { const m = byId.get(id)!; return m.reviews === 0 || m.average === null ? 3.5 - 1e-6 : m.average; };
  const newest = (id: string) => byId.get(id)!.experiences.reduce((max, e) => (e.year > max ? e.year : max), '');
  const tieKey = (a: MatchResult, b: MatchResult) => stars(b.mentorId) - stars(a.mentorId)
    || byId.get(b.mentorId)!.completedSessions - byId.get(a.mentorId)!.completedSessions
    || newest(b.mentorId).localeCompare(newest(a.mentorId))
    || b.score - a.score || a.mentorId.localeCompare(b.mentorId);
  const ordered: MatchResult[] = [];
  for (let i = 0; i < scored.length;) {
    let j = i + 1;
    while (j < scored.length && scored[i].score - scored[j].score <= NEAR_TIE) j++;
    ordered.push(...scored.slice(i, j).sort(tieKey));
    i = j;
  }
  return ordered.slice(0, limit);
}
