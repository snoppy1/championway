import {
  PRIZE_CEILING, categoryIds, emptyFilters, regionLabels, rewardLabels, teamSizeOptions,
  timingOptions, typeLabels, levelLabels,
} from './competitions';
import type {
  CategoryId, Filters, Level, OpportunityType, Region, Reward, TeamSizeId, TimingId,
} from './competitions';

/* ตัวกรองทุกตัวอยู่ใน query string เพื่อให้แชร์ลิงก์และกดย้อนกลับได้ ค่าที่เท่ากับ
   ค่าเริ่มต้นจะไม่ถูกเขียนลง URL เพื่อให้ลิงก์สั้นและอ่านออก */
const keys = {
  query: 'q', categories: 'cat', types: 'type', levels: 'level', regions: 'region',
  teamSizes: 'team', rewards: 'reward', prizeMin: 'pmin', prizeMax: 'pmax',
  freeOnly: 'free', timing: 'when',
} as const;

function readList<T extends string>(params: URLSearchParams, key: string, allowed: readonly T[]) {
  const raw = params.get(key);
  if (!raw) return [] as T[];
  const seen = raw.split(',').filter((value): value is T => (allowed as readonly string[]).includes(value));
  return [...new Set(seen)];
}

function readNumber(params: URLSearchParams, key: string, fallback: number) {
  // Number(null) คือ 0 ไม่ใช่ NaN คีย์ที่ไม่มีใน URL จึงต้องเช็กก่อนแปลง
  const raw = params.get(key);
  if (raw === null || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

const levelIds = Object.keys(levelLabels) as Level[];
const typeIds = Object.keys(typeLabels) as OpportunityType[];
const regionIds = Object.keys(regionLabels) as Region[];
const rewardIds = Object.keys(rewardLabels) as Reward[];
const teamIds = teamSizeOptions.map((option) => option.id);
const timingIds = timingOptions.map((option) => option.id);

export function readFilters(params: URLSearchParams): Filters {
  // `category` เป็นชื่อเดิมของ `cat` ลิงก์เก่าที่แชร์ไว้แล้วจึงยังเปิดได้
  const legacy = params.get('category');
  const fromLegacy = legacy && (categoryIds as string[]).includes(legacy) ? [legacy as CategoryId] : [];
  const prizeMin = readNumber(params, keys.prizeMin, 0);
  const prizeMax = readNumber(params, keys.prizeMax, PRIZE_CEILING);
  return {
    query: params.get(keys.query) ?? '',
    categories: readList<CategoryId>(params, keys.categories, categoryIds).concat(fromLegacy),
    types: readList<OpportunityType>(params, keys.types, typeIds),
    levels: readList<Level>(params, keys.levels, levelIds),
    regions: readList<Region>(params, keys.regions, regionIds),
    teamSizes: readList<TeamSizeId>(params, keys.teamSizes, teamIds),
    rewards: readList<Reward>(params, keys.rewards, rewardIds),
    // ช่วงที่กลับหัวกันแปลว่า URL เพี้ยน ใช้ค่าเริ่มต้นแทนการแสดงผลลัพธ์ว่างเปล่า
    prizeMin: prizeMin <= prizeMax ? prizeMin : 0,
    prizeMax: prizeMin <= prizeMax ? Math.min(prizeMax, PRIZE_CEILING) : PRIZE_CEILING,
    freeOnly: params.get(keys.freeOnly) === '1',
    timing: (timingIds as string[]).includes(params.get(keys.timing) ?? '') ? params.get(keys.timing) as TimingId : '',
  };
}

/** คืน URLSearchParams ชุดใหม่ โดยรักษาค่าที่ไม่ใช่ตัวกรองอย่าง sort และ saved ไว้ */
export function writeFilters(params: URLSearchParams, filters: Filters) {
  const next = new URLSearchParams(params);
  next.delete('category');
  const set = (key: string, value: string) => { if (value) next.set(key, value); else next.delete(key); };
  set(keys.query, filters.query.trim());
  set(keys.categories, filters.categories.join(','));
  set(keys.types, filters.types.join(','));
  set(keys.levels, filters.levels.join(','));
  set(keys.regions, filters.regions.join(','));
  set(keys.teamSizes, filters.teamSizes.join(','));
  set(keys.rewards, filters.rewards.join(','));
  set(keys.prizeMin, filters.prizeMin > 0 ? String(filters.prizeMin) : '');
  set(keys.prizeMax, filters.prizeMax < PRIZE_CEILING ? String(filters.prizeMax) : '');
  set(keys.freeOnly, filters.freeOnly ? '1' : '');
  set(keys.timing, filters.timing);
  next.delete('page');
  return next;
}

/** กดซ้ำเพื่อเอาออก ใช้กับทั้งชิปหมวดและช่องติ๊กในแผง */
export function toggle<T>(list: T[], value: T) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function clearedFilters(filters: Filters): Filters {
  // ล้างเฉพาะตัวกรองในแผง คำค้นกับหมวดที่เลือกไว้เป็นคนละเรื่องและอยู่นอกแผง
  return { ...emptyFilters, query: filters.query, categories: filters.categories };
}
