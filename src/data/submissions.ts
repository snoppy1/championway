import { competitions, daysLeft, inDays } from './competitions';
import type { Competition } from './competitions';
import type { CategoryId, Level, OpportunityType, Region, Reward } from './competitions';

/* ใบที่ส่งเข้ามาเป็นคนละเรื่องกับรายการที่เผยแพร่แล้ว จึงแยก type ออกจาก Competition
   ตาม organiser-submission.md ข้อ 4 ใบทั้งหมดด้านล่างเป็นข้อมูลตัวอย่างสำหรับต้นแบบ
   ไม่ใช่ข้อมูลของบุคคลหรือหน่วยงานจริง */

export type SubmissionStatus = 'pending' | 'info' | 'published' | 'rejected';
export const statusLabels: Record<SubmissionStatus, string> = {
  pending: 'รอตรวจ', info: 'ขอข้อมูลเพิ่ม', published: 'เผยแพร่แล้ว', rejected: 'ไม่ผ่าน',
};

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

export const competitionSubmissions: CompetitionSubmission[] = [
  {
    id: 'cs-104', status: 'pending', submittedAt: inDays(-4),
    organizerName: 'ชมรมภาพยนตร์นักศึกษา', contactName: 'ปรียา ส.', contactRole: 'ประธานชมรม',
    contactEmail: 'preeya@example.ac.th', contactPhone: '08x-xxx-1240',
    organizerUrl: 'https://example.ac.th/filmclub',
    name: 'Short Film Lab: หนังสั้นสามนาที',
    categories: ['film', 'society'], type: 'contest',
    description: 'ส่งหนังสั้นไม่เกิน 3 นาที หัวข้อ “เมืองที่ฉันอยากอยู่” รอบชิงฉายในโรงจริง',
    levels: ['secondary', 'university'], teamMin: 1, teamMax: 4,
    closesAt: inDays(24), eventDate: inDays(38), region: 'bangkok', venue: 'หอศิลป์กรุงเทพฯ',
    prizeValue: 60000, rewards: ['certificate', 'trophy', 'publish'],
    sourceUrl: 'https://example.ac.th/filmclub/shortfilmlab',
    registerUrl: 'https://example.ac.th/filmclub/shortfilmlab/register',
  },
  {
    id: 'cs-103', status: 'pending', submittedAt: inDays(-2),
    organizerName: 'สหกรณ์ผู้ปลูกกาแฟภาคเหนือ', contactName: 'วรุณ ท.', contactRole: 'ฝ่ายประชาสัมพันธ์',
    contactEmail: 'warun@example.co.th', contactPhone: '08x-xxx-7781',
    organizerUrl: 'https://example.co.th/northcoffee',
    name: 'Bean to Cup Challenge 2569',
    categories: ['food', 'business'], type: 'contest',
    description: 'แข่งคั่วและออกแบบเมนูกาแฟจากเมล็ดในพื้นที่ พร้อมแผนขายจริงหนึ่งหน้า',
    levels: ['university', 'open'], teamMin: 2, teamMax: 3,
    opensAt: inDays(6), closesAt: inDays(40), region: 'north', venue: 'เชียงใหม่',
    prizeValue: 80000, rewards: ['certificate', 'partnership'], fee: 200,
    sourceUrl: 'https://example.co.th/northcoffee/beantocup',
  },
  {
    id: 'cs-102', status: 'info', submittedAt: inDays(-9),
    reviewedAt: inDays(-7), reviewedBy: 'ทีมตรวจ A',
    reviewNote: 'ลิงก์ประกาศต้นทางเปิดไม่ได้ และเงินรางวัลในฟอร์มไม่ตรงกับที่โพสต์ไว้ รบกวนส่งลิงก์ประกาศที่เปิดได้และยืนยันยอดรางวัลอีกครั้ง',
    organizerName: 'บริษัทตัวอย่างเทคโนโลยี', contactName: 'ธนกร ล.', contactRole: 'HR',
    contactEmail: 'thanakorn@example.com', contactPhone: '08x-xxx-3355',
    organizerUrl: 'https://example.com',
    name: 'Code Sprint ชิงทุนฝึกงาน',
    categories: ['technology'], type: 'contest',
    description: 'แข่งเขียนโปรแกรมแก้โจทย์ 5 ข้อใน 4 ชั่วโมง ผู้ชนะได้สิทธิ์สัมภาษณ์ฝึกงาน',
    levels: ['university'], teamMin: 1, teamMax: 1,
    closesAt: inDays(18), region: 'online',
    prizeValue: 0, prizeNote: 'สิทธิ์สัมภาษณ์ฝึกงาน', rewards: ['certificate', 'internship'],
    sourceUrl: 'https://example.com/careers/codesprint',
  },
  {
    id: 'cs-101', status: 'published', submittedAt: inDays(-16),
    reviewedAt: inDays(-15), reviewedBy: 'ทีมตรวจ A', reviewNote: 'ตรวจครบทุกข้อ เผยแพร่แล้ว',
    organizerName: 'มูลนิธิดนตรีเยาวชน', contactName: 'อารยา พ.', contactRole: 'ผู้ประสานงาน',
    contactEmail: 'araya@example.org', contactPhone: '08x-xxx-9012',
    organizerUrl: 'https://example.org/youthmusic',
    name: 'Youth Ensemble Contest',
    categories: ['performing'], type: 'contest',
    description: 'วงดนตรีเยาวชนบรรเลงเพลงบังคับหนึ่งเพลงและเพลงเลือกหนึ่งเพลง',
    levels: ['primary', 'secondary'], teamMin: 4, teamMax: 12,
    closesAt: inDays(27), eventDate: inDays(45), region: 'central', venue: 'หอประชุมจังหวัดนนทบุรี',
    prizeValue: 50000, rewards: ['certificate', 'trophy'],
    sourceUrl: 'https://example.org/youthmusic/ensemble',
  },
];

export const mentorSubmissions: MentorSubmission[] = [
  {
    id: 'ms-057', status: 'pending', submittedAt: inDays(-5),
    firstName: 'ณิชา', lastName: 'ภัทรวงศ์', nickname: 'นิช',
    email: 'nicha@example.com', phone: '08x-xxx-4410',
    occupation: 'นักศึกษา', organization: 'มหาวิทยาลัยตัวอย่าง', role: 'ปี 4 คณะวิศวกรรมศาสตร์',
    experience: 'ลงแข่งแฮกกาธอนมา 6 รายการใน 2 ปี เป็นคนคุมสโคปและตัดฟีเจอร์ให้ทีมส่งทัน',
    awards: [
      { title: 'ชนะเลิศ Bangkok Hack 48', competitionSlug: 'bangkok-hack-48', year: '2568', evidence: 'ประกาศผลบนเว็บผู้จัด + ภาพถ่ายรับรางวัล' },
      { title: 'รองชนะเลิศ Data Story Awards', competitionSlug: 'data-story-awards', year: '2567', evidence: 'เกียรติบัตร' },
    ],
    portfolio: 'https://example.com/nicha',
    best: 'ช่วยตัดขอบเขตงานให้ทีมส่งทันเวลา และซ้อมเดโมที่ไม่พังหน้างาน',
    cannot: 'ไม่เขียนโค้ดให้ ไม่ทำสไลด์ให้ และไม่รับงานที่ตัวเองเป็นกรรมการ',
    topics: ['วางแผนและแบ่งงาน', 'พัฒนาต้นแบบ'],
    price: 900, paidSlot: inDays(3), freeSlot: inDays(2),
  },
  {
    id: 'ms-056', status: 'pending', submittedAt: inDays(-1),
    firstName: 'กันตพงศ์', lastName: 'ศรีสุวรรณ', nickname: 'กันต์',
    email: 'kantapong@example.com', phone: '08x-xxx-2266',
    occupation: 'พนักงานบริษัท', organization: 'บริษัทตัวอย่างการตลาด', role: 'Marketing Associate',
    experience: 'เคยเข้ารอบชิงเคสแข่งการตลาด 3 เวที และเป็นพี่เลี้ยงชมรมมา 1 ปี',
    awards: [
      { title: 'ชนะเลิศ Marketing Case Cup ระดับภูมิภาค', competitionSlug: null, year: '2568', evidence: 'ยังไม่แนบหลักฐาน' },
    ],
    portfolio: '',
    best: 'ช่วยจัดโครงเรื่องการพรีเซนต์และซ้อมตอบคำถามกรรมการ',
    cannot: 'ไม่ทำสไลด์ให้ และไม่รับปรึกษาทีมที่แข่งเวทีเดียวกับที่ตัวเองเป็นกรรมการ',
    topics: ['ออกแบบสไลด์', 'Pitching และตอบคำถาม'],
    price: 700, paidSlot: inDays(4), freeSlot: inDays(3),
  },
  {
    id: 'ms-055', status: 'rejected', submittedAt: inDays(-12),
    reviewedAt: inDays(-11), reviewedBy: 'ทีมตรวจ B',
    reviewNote: 'ข้อความในช่อง “ช่วยไม่ได้” ระบุว่ารับทำสไลด์ให้ ซึ่งขัดกับเงื่อนไขที่ยอมรับไว้ว่าจะให้คำแนะนำเท่านั้น หากแก้ขอบเขตแล้วส่งใหม่ได้',
    firstName: 'ภูริ', lastName: 'ตันติวงศ์', nickname: 'ภู',
    email: 'phuri@example.com', phone: '08x-xxx-8899',
    occupation: 'ฟรีแลนซ์', organization: '-', role: 'กราฟิกดีไซเนอร์',
    experience: 'รับออกแบบสไลด์ให้ทีมแข่งมาแล้วหลายทีม',
    awards: [],
    portfolio: 'https://example.com/phuri',
    best: 'ทำสไลด์และอาร์ตเวิร์กให้ทีมจนจบงาน',
    cannot: '-',
    topics: ['ออกแบบสไลด์'],
    price: 1500, paidSlot: inDays(6), freeSlot: inDays(5),
  },
];

export const competitionChecks = [
  'ลิงก์ประกาศต้นทางเปิดได้จริง และเป็นประกาศของงานนี้',
  'ชื่อหน่วยงานตรงกับที่ปรากฏในประกาศ',
  'วันปิดรับยังไม่ผ่าน และตรงกับต้นทาง',
  'เงินรางวัลและค่าสมัครตรงกับต้นทาง',
  'คำบรรยายไม่ใช่ข้อความคัดลอกมาทั้งก้อนจากเว็บอื่น',
  'ไม่ใช่การขายของหรือรับสมัครงานที่แฝงมาเป็นการแข่งขัน',
];

export const mentorChecks = [
  'ตัวตนและที่ทำงานตรวจสอบได้จากข้อมูลที่ให้มา',
  'หลักฐานรางวัลเป็นของผู้สมัครจริง และตรงกับเวทีที่อ้าง',
  'ขอบเขตช่วยได้และช่วยไม่ได้เขียนชัด และไม่ขัดกับกติกาของเวที',
  'ราคาและคิวสมเหตุสมผล ไม่มีการชวนไปคุยนอกระบบ',
];

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
