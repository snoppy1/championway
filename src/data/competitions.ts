import type { Kind, Theme } from './focus.js';
import { competitions } from './sample-competitions.js';
import { formatDate as formatDateIn, formatNumber } from '../i18n/format.js';
import type { Lang } from '../i18n/format.js';
import { th } from '../i18n/th.js';
import type { Messages } from '../i18n/en.js';

/* หมวดหมู่ ประเภทโอกาส ภูมิภาค และรางวัล ใช้ชุดเดียวกับเว็บรวมงานแข่งไทยที่ผู้จัดคุ้นเคย
   อยู่แล้ว รายละเอียดการตัดสินใจอยู่ใน competition-model.md

   ไฟล์นี้เก็บเฉพาะรหัสและตรรกะ ป้ายที่ผู้ใช้เห็นอยู่ใน src/i18n (t.taxonomy) หน้าเว็บอ่านจาก useI18n()
   ส่วน export ที่ชื่อลงท้ายว่า Labels และฟังก์ชันจัดรูปแบบด้านล่างมีไว้ให้ผู้ใช้ที่เป็นภาษาไทยอย่างเดียว
   (หน้าจัดการและเซิร์ฟเวอร์) เลยตั้งค่าตั้งต้นเป็นภาษาไทย หน้าสำหรับผู้ใช้ทั่วไปต้องส่ง t และ lang เข้ามาเอง */

export { competitions };

export type CategoryId =
  | 'writing' | 'performing' | 'film' | 'education' | 'academic' | 'marketing' | 'technology'
  | 'design' | 'health' | 'society' | 'environment' | 'food' | 'business';
export const categoryIds: CategoryId[] = [
  'writing', 'performing', 'film', 'education', 'academic', 'marketing', 'technology',
  'design', 'health', 'society', 'environment', 'food', 'business',
];
/** รวมตัวเลือก "ทั้งหมด" ไว้หน้าสุด ป้ายเป็นภาษาไทย ใช้กับหน้าจัดการ */
export const categories = [
  { id: 'all', label: th.taxonomy.categories.all },
  ...categoryIds.map((id) => ({ id, label: th.taxonomy.categories[id] })),
] as const;

export type Level = 'primary' | 'secondary' | 'university' | 'open';
export const levelLabels: Record<Level, string> = th.taxonomy.levels;

export type OpportunityType = 'contest' | 'camp' | 'workshop' | 'scholarship' | 'internship';
export const typeLabels: Record<OpportunityType, string> = th.taxonomy.types;

export type Region = 'online' | 'nationwide' | 'bangkok' | 'central' | 'north' | 'northeast' | 'east' | 'south';
export const regionLabels: Record<Region, string> = th.taxonomy.regions;

export type Reward = 'certificate' | 'trophy' | 'publish' | 'internship' | 'partnership';
export const rewardLabels: Record<Reward, string> = th.taxonomy.rewards;

export type Source = 'editorial' | 'organiser' | 'partner';
export const sourceLabels: Record<Source, string> = th.taxonomy.sources;

/* ประเภทงานและหมวดของเส้นทางใหม่ แยกจาก taxonomy 13 หมวดเดิมโดยตั้งใจ
   หมวดเดิมยังใช้กับสีปก ป้าย และการค้นหา ส่วนสองช่องนี้ใช้กับหน้าสำรวจและการจับคู่เมนเทอร์
   เป็นค่าที่ไม่บังคับ เพราะเวทีที่บันทึกไว้ก่อนหน้านี้ยังไม่ได้จัดประเภท */
export interface Competition {
  /** รหัสในฐานข้อมูล ใช้ตอนขอจองเมนเทอร์ ข้อมูลตัวอย่างในไฟล์นี้ไม่มี */
  id?: string;
  kind?: Kind | null;
  themes?: Theme[];
  slug: string;
  name: string;
  /** หมวดแรกคือหมวดหลัก ใช้กับสีปก ป้ายบนการ์ด และการจับคู่เมนเทอร์ */
  categories: [CategoryId, ...CategoryId[]];
  type: OpportunityType;
  org: string;
  /** วันปิดรับแบบ ISO ข้อมูลตัวอย่างใช้ inDays() เพื่อไม่ให้นับถอยหลังหมดอายุ */
  closesAt: string;
  opensAt?: string;
  /** 'month' = ผู้จัดยังไม่ประกาศวันแน่นอน รู้แค่เดือน closesAt เป็นวันสุดท้ายของเดือน (6 ต.ค. 2569) */
  closesPrecision?: 'day' | 'month';
  opensPrecision?: 'day' | 'month';
  eventDate?: string;
  region: Region;
  /** ชื่อสถานที่ ไม่ใส่เมื่อ region เป็น online */
  venue?: string;
  /** 0 คือไม่มีเงินรางวัล ป้ายที่แสดงคำนวณจากค่านี้ ไม่เก็บข้อความซ้ำ */
  prizeValue: number;
  /** รางวัลที่ไม่ใช่เงิน ใช้แทนป้ายเมื่อ prizeValue เป็น 0 */
  prizeNote?: string;
  rewards: Reward[];
  /** ค่าสมัคร ไม่ใส่คือสมัครฟรี */
  fee?: number;
  levels: Level[];
  /** ขนาดทีมเก็บเป็นตัวเลขเพื่อให้กรองได้ ป้ายคำนวณจากคู่นี้ด้วย teamLabel */
  teamMin: number;
  teamMax: number;
  description: string;
  keywords: string[];
  featured?: boolean;
  /** ลิงก์ประกาศต้นทาง ข้อมูลตัวอย่างเว้นว่างไว้เพราะงานเหล่านี้ไม่มีอยู่จริง */
  sourceUrl: string;
  source: Source;
  lastVerifiedAt: string;
  registerUrl?: string;
  /** โปสเตอร์ที่ทีมงานอัปโหลด ไม่มี = ใช้ภาพปกที่วาดจากหมวด */
  posterUrl?: string;
  /** ห้าส่วนนี้ทีมงานเขียนเอง ผู้จัดไม่ได้กรอกมา จึงไม่บังคับ */
  overview?: string;
  audience?: string;
  format?: string[];
  deliverables?: string[];
  preparation?: string[];
}

export { inDays } from './dates.js';

/** ป้ายภาษาไทย สำหรับหน้าจัดการที่ส่งฟังก์ชันนี้เข้า .map() ตรง ๆ หน้าทั่วไปใช้ t.taxonomy.categories[id] */
export function categoryLabel(id: CategoryId) {
  return th.taxonomy.categories[id] ?? '';
}

/** หมวดแรกคือหมวดหลัก ใช้กับสีปก ป้ายบนการ์ด และการจับคู่เมนเทอร์ */
export function primaryCategory(competition: Competition) {
  return competition.categories[0];
}

export function deadlineOf(competition: Competition) {
  const date = new Date(`${competition.closesAt}T23:59:00`);
  return date;
}

/** จำนวนวันที่เหลือ ปัดขึ้นเพื่อให้ "อีก 1 วัน" หมายถึงยังส่งทันวันนี้ */
export function daysLeft(competition: Competition) {
  const diff = deadlineOf(competition).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

export function formatDate(iso: string, lang: Lang = 'th') {
  return formatDateIn(`${iso}T12:00:00`, lang);
}

/** "ตุลาคม 2569" / "October 2026" สำหรับวันที่ที่รู้แค่เดือน */
export function formatMonth(iso: string, lang: Lang = 'th') {
  return new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${iso.slice(0, 7)}-15T00:00:00Z`));
}

/** วันปิดรับที่แสดง: รู้แค่เดือนแสดงเป็น "ประมาณตุลาคม 2569" */
export function formatDeadline(competition: Competition, lang: Lang = 'th', t: Messages = th) {
  return competition.closesPrecision === 'month'
    ? t.competition.aroundMonth(formatMonth(competition.closesAt, lang))
    : formatDate(competition.closesAt, lang);
}

/** นับถอยหลังได้เฉพาะวันปิดที่แน่นอน วันที่รู้แค่เดือนไม่บอก "อีก X วัน" และไม่ติดป้ายใกล้ปิด */
export const exactDeadline = (competition: Competition) => competition.closesPrecision !== 'month';

/** ป้ายขนาดทีมคำนวณจาก teamMin และ teamMax เพื่อไม่ให้มีข้อความซ้ำกับตัวเลข */
export function teamLabel(competition: Competition, t: Messages = th) {
  const { teamMin, teamMax } = competition;
  const s = t.competition;
  if (teamMin === 1 && teamMax === 1) return s.teamSolo;
  if (teamMin === 1 && teamMax === 2) return s.teamSoloOrPair;
  if (teamMin === teamMax) return s.teamExact(teamMin);
  return s.teamRange(teamMin, teamMax);
}

/** เงินรางวัล 0 ต้องอ่านว่าไม่มีเงินรางวัล ไม่ใช่ "0 บาท" */
export function prizeLabel(competition: Competition, t: Messages = th, lang: Lang = 'th') {
  if (competition.prizeValue > 0) return t.competition.prizeTotal(formatNumber(competition.prizeValue, lang));
  return competition.prizeNote ?? t.competition.noPrize;
}

export function feeLabel(competition: Competition, t: Messages = th, lang: Lang = 'th') {
  return competition.fee ? t.competition.feeAmount(formatNumber(competition.fee, lang)) : t.competition.free;
}

export function placeLabel(competition: Competition, t: Messages = th) {
  const region = t.taxonomy.regions[competition.region];
  if (competition.region === 'online') return region;
  return competition.venue ? `${competition.venue} · ${region}` : region;
}

export function findCompetition(slug: string | undefined) {
  return competitions.find((competition) => competition.slug === slug);
}

export type TeamSizeId = 'solo' | 'small' | 'mid' | 'large';
export const teamSizeOptions: { id: TeamSizeId; min: number; max: number }[] = [
  { id: 'solo', min: 1, max: 1 },
  { id: 'small', min: 2, max: 3 },
  { id: 'mid', min: 4, max: 6 },
  { id: 'large', min: 7, max: Infinity },
];

export type TimingId = 'd7' | 'd30' | 'upcoming';
export const timingOptions: { id: TimingId }[] = [{ id: 'd7' }, { id: 'd30' }, { id: 'upcoming' }];

/** เพดานของแถบเลือกช่วง ค่าสูงสุดหมายถึงไม่จำกัด ไม่ใช่ 500,000 พอดี */
export const PRIZE_CEILING = 500000;

export interface Filters {
  query: string;
  categories: CategoryId[];
  types: OpportunityType[];
  levels: Level[];
  regions: Region[];
  teamSizes: TeamSizeId[];
  rewards: Reward[];
  prizeMin: number;
  prizeMax: number;
  freeOnly: boolean;
  timing: TimingId | '';
}

export const emptyFilters: Filters = {
  query: '', categories: [], types: [], levels: [], regions: [], teamSizes: [], rewards: [],
  prizeMin: 0, prizeMax: PRIZE_CEILING, freeOnly: false, timing: '',
};

/** นับเฉพาะตัวกรองในแผง ชิปหมวดกับช่องค้นหาอยู่นอกแผงจึงไม่นับ */
export function activeFilterCount(filters: Filters) {
  return filters.types.length + filters.levels.length + filters.regions.length
    + filters.teamSizes.length + filters.rewards.length
    + (filters.prizeMin > 0 || filters.prizeMax < PRIZE_CEILING ? 1 : 0)
    + (filters.freeOnly ? 1 : 0) + (filters.timing ? 1 : 0);
}

function matchesTiming(competition: Competition, timing: TimingId) {
  if (timing === 'upcoming') return Boolean(competition.opensAt) && new Date(`${competition.opensAt}T00:00:00`).getTime() > Date.now();
  const left = daysLeft(competition);
  return left >= 0 && left <= (timing === 'd7' ? 7 : 30);
}

function matchesTeam(competition: Competition, sizes: TeamSizeId[]) {
  return sizes.some((id) => {
    const bucket = teamSizeOptions.find((option) => option.id === id)!;
    // ทีม 2–5 คน ตรงกับทั้งช่วง 2–3 และ 4–6 เพราะขนาดทีมที่รับคาบเกี่ยวกัน
    return competition.teamMin <= bucket.max && competition.teamMax >= bucket.min;
  });
}

/* ภายในกลุ่มเดียวกันเป็น "หรือ" ระหว่างกลุ่มเป็น "และ" กลุ่มที่ไม่ได้เลือกอะไร
   แปลว่าไม่กรองด้วยกลุ่มนั้น */
export function filterCompetitions(filters: Filters) {
  const terms = filters.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return competitions.filter((competition) => {
    const text = [
      competition.name, competition.description, competition.org, typeLabels[competition.type],
      ...competition.categories.map(categoryLabel), ...competition.keywords,
    ].join(' ').toLocaleLowerCase();
    if (!terms.every((term) => text.includes(term))) return false;
    if (filters.categories.length && !filters.categories.some((id) => competition.categories.includes(id))) return false;
    if (filters.types.length && !filters.types.includes(competition.type)) return false;
    if (filters.levels.length && !filters.levels.some((level) => competition.levels.includes(level))) return false;
    if (filters.regions.length && !filters.regions.includes(competition.region)) return false;
    if (filters.teamSizes.length && !matchesTeam(competition, filters.teamSizes)) return false;
    if (filters.rewards.length && !filters.rewards.some((reward) => competition.rewards.includes(reward))) return false;
    if (competition.prizeValue < filters.prizeMin) return false;
    if (filters.prizeMax < PRIZE_CEILING && competition.prizeValue > filters.prizeMax) return false;
    if (filters.freeOnly && competition.fee) return false;
    if (filters.timing && !matchesTiming(competition, filters.timing)) return false;
    return true;
  });
}

export type SortId = 'deadline' | 'new' | 'prize' | 'name';
export const sortOptions: { id: SortId }[] = [
  { id: 'deadline' }, { id: 'new' }, { id: 'prize' }, { id: 'name' },
];

export function sortCompetitions(list: Competition[], sort: SortId) {
  const listedOrder = new Map(competitions.map((competition, index) => [competition.slug, index]));
  return list.slice().sort((a, b) => {
    if (sort === 'prize') return b.prizeValue - a.prizeValue;
    if (sort === 'new') return listedOrder.get(b.slug)! - listedOrder.get(a.slug)!;
    if (sort === 'name') return a.name.localeCompare(b.name, 'th');
    return a.closesAt.localeCompare(b.closesAt);
  });
}
