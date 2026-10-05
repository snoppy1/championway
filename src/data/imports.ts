import type { CategoryId, Level, OpportunityType, Region, Reward } from './competitions';
import type { Kind, Theme } from './focus';

/* ร่างเวทีที่ระบบดึงมาให้แอดมินตรวจ (5 ต.ค. 2569) ใช้ร่วมกันระหว่างเซิร์ฟเวอร์กับหน้าแอดมิน
   ทุกช่องว่างได้ ช่องที่ประกาศไม่ได้บอกต้องเป็น null ไม่ใช่ค่าที่เดาเอา */

export const importSourceIds = ['ysc', 'contest_thailand'] as const;
export type ImportSourceId = typeof importSourceIds[number];
/** แหล่งอัตโนมัติ + การวางลิงก์หรือข้อความเอง */
export type ImportOrigin = ImportSourceId | 'link' | 'text';
export type ImportStatus = 'processing' | 'pending' | 'skipped' | 'accepted' | 'rejected' | 'failed';
/** AI แยกว่าเป็นประกาศรับสมัคร หรือข่าวอื่น */
export type ImportItemKind = 'call' | 'result' | 'news' | 'unsure';

export type ImportDraft = {
  name: string | null;
  org: string | null;
  description: string | null;
  type: OpportunityType | null;
  kind: Kind | null;
  themes: Theme[];
  categories: CategoryId[];
  levels: Level[];
  rewards: Reward[];
  teamMin: number | null;
  teamMax: number | null;
  opensAt: string | null;
  closesAt: string | null;
  eventDate: string | null;
  region: Region | null;
  venue: string | null;
  prizeValue: number | null;
  prizeNote: string | null;
  fee: number | null;
  registerUrl: string | null;
  keywords: string[];
};

export type ImportRow = {
  id: string; origin: ImportOrigin; url: string | null; title: string; status: ImportStatus;
  itemKind: ImportItemKind | null; draft: ImportDraft | null; uncertain: string[]; note: string | null;
  error: string | null; duplicateOf: { id: string; name: string; slug: string } | null;
  competitionId: string | null; rejectReason: string | null; createdAt: string; decidedAt: string | null;
};

export type ImportSource = {
  id: ImportSourceId; enabled: boolean; lastRunAt: string | null; lastError: string | null; lastFound: number;
};
