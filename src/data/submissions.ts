import { competitions, daysLeft } from './competitions.js';
import {
  competitionChecks, competitionSubmissions, mentorChecks, mentorSubmissions, statusLabels,
} from './sample-submissions.js';
import type { Competition } from './competitions.js';
import type { CategoryId, Level, OpportunityType, Region, Reward } from './competitions.js';

/* ใบที่ส่งเข้ามาเป็นคนละเรื่องกับรายการที่เผยแพร่แล้ว จึงแยก type ออกจาก Competition
   ตาม organiser-submission.md ข้อ 4 ใบทั้งหมดด้านล่างเป็นข้อมูลตัวอย่างสำหรับต้นแบบ
   ไม่ใช่ข้อมูลของบุคคลหรือหน่วยงานจริง */

/* ใบตัวอย่างสำหรับต้นแบบ (ข้อมูลสมมติ) ย้ายไปอยู่ใน sample-submissions.ts แล้ว นำกลับออกไปให้ที่เดิมใช้ได้ต่อ */
export { competitionChecks, competitionSubmissions, mentorChecks, mentorSubmissions, statusLabels };

export type SubmissionStatus = 'pending' | 'info' | 'published' | 'rejected';

interface Reviewed {
  id: string;
  status: SubmissionStatus;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
}

export interface CompetitionSubmission extends Reviewed {
  /** ติดต่อกลับเท่านั้น ไม่แสดงบนหน้าบ้าน */
  organizerName: string;
  contactName: string;
  contactRole: string;
  contactEmail: string;
  contactPhone: string;
  organizerUrl: string;
  name: string;
  categories: [CategoryId, ...CategoryId[]];
  type: OpportunityType;
  description: string;
  levels: Level[];
  teamMin: number;
  teamMax: number;
  opensAt?: string;
  closesAt: string;
  eventDate?: string;
  region: Region;
  venue?: string;
  prizeValue: number;
  prizeNote?: string;
  rewards: Reward[];
  fee?: number;
  sourceUrl: string;
  registerUrl?: string;
}

export interface MentorSubmission extends Reviewed {
  firstName: string;
  lastName: string;
  nickname: string;
  /** ใช้ตรวจสอบเท่านั้น ฟอร์มสมัครสัญญากับผู้สมัครไว้ว่าจะไม่แสดงสาธารณะ */
  email: string;
  phone: string;
  occupation: string;
  organization: string;
  role: string;
  experience: string;
  awards: { title: string; competitionSlug: string | null; year: string; evidence: string }[];
  portfolio: string;
  best: string;
  cannot: string;
  topics: string[];
  price: number;
  paidSlot: string;
  freeSlot: string;
}


/** จำนวนวันที่ใบนี้รออยู่ นับจากวันที่ส่ง */
export function waitingDays(submission: Reviewed) {
  const sent = new Date(`${submission.submittedAt}T12:00:00`).getTime();
  return Math.max(0, Math.floor((Date.now() - sent) / 86400000));
}

/** เป้าหมายคือตรวจภายใน 2 วันทำการ ใบที่เกินต้องเห็นได้ทันทีในคิว */
export const REVIEW_TARGET_DAYS = 2;
export function isOverdue(submission: Reviewed) {
  return submission.status === 'pending' && waitingDays(submission) > REVIEW_TARGET_DAYS;
}

/** รอนานสุดก่อน ไม่ใช่ใหม่สุดก่อน ไม่อย่างนั้นใบที่ตรวจยากจะถูกดองไปเรื่อย ๆ */
export function byWaiting<T extends Reviewed>(list: T[]) {
  return list.slice().sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
}

export function pendingOf<T extends Reviewed>(list: T[]) {
  return list.filter((item) => item.status === 'pending');
}

export function findCompetitionSubmission(id: string | undefined) {
  return competitionSubmissions.find((item) => item.id === id);
}

export function findMentorSubmission(id: string | undefined) {
  return mentorSubmissions.find((item) => item.id === id);
}

/** เวทีที่ต้องยืนยันกับผู้จัดก่อนถึงกำหนด */
export function closingSoon() {
  return competitions.filter((item) => { const left = daysLeft(item); return left >= 0 && left <= 7; });
}

export function alreadyClosed() {
  return competitions.filter((item) => daysLeft(item) < 0);
}

/** รายการที่ทีมงานคัดมาเองและปล่อยไว้นานเกินไป ข้อมูลค้างแย่กว่าข้อมูลน้อย */
export const STALE_AFTER_DAYS = 30;
export function staleListings() {
  return competitions.filter((item) => {
    if (item.source !== 'editorial') return false;
    const checked = new Date(`${item.lastVerifiedAt}T12:00:00`).getTime();
    return (Date.now() - checked) / 86400000 > STALE_AFTER_DAYS;
  });
}

/** ใบที่ผ่านการตรวจจะกลายเป็น Competition หน้าตรวจใช้ฟังก์ชันนี้ทำพรีวิวการ์ดด้วย
    เพื่อให้คนตรวจเห็นสิ่งเดียวกับที่ผู้ใช้จะเห็น ไม่ใช่เห็นแค่ค่าในฟอร์ม */
export function toCompetition(submission: CompetitionSubmission): Competition {
  return {
    slug: submission.id,
    name: submission.name,
    categories: submission.categories,
    type: submission.type,
    org: submission.organizerName,
    closesAt: submission.closesAt,
    opensAt: submission.opensAt,
    eventDate: submission.eventDate,
    region: submission.region,
    venue: submission.venue,
    prizeValue: submission.prizeValue,
    prizeNote: submission.prizeNote,
    rewards: submission.rewards,
    fee: submission.fee,
    levels: submission.levels,
    teamMin: submission.teamMin,
    teamMax: submission.teamMax,
    description: submission.description,
    keywords: [],
    sourceUrl: submission.sourceUrl,
    source: 'organiser',
    lastVerifiedAt: submission.reviewedAt ?? submission.submittedAt,
    registerUrl: submission.registerUrl,
  };
}
