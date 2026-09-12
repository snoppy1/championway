import type { CategoryId } from './competitions';
import { findCompetition } from './competitions';

/** Proposed six-topic taxonomy. Replace with the owner's final vocabulary. */
export const topics = [
  'ตีโจทย์และหาไอเดีย',
  'วางแผนและแบ่งงาน',
  'พัฒนาต้นแบบ',
  'ออกแบบสไลด์',
  'Pitching และตอบคำถาม',
  'วิเคราะห์ผลงานหลังแข่ง',
];

export const problems = [
  'ยังไม่มี idea หรือไม่แน่ใจว่าตรงโจทย์',
  'มี idea แล้วแต่ไม่รู้จะทำทัน',
  'ทำเสร็จแล้วแต่พรีเซนต์ไม่เป็น',
  'แพ้มาแล้วอยากรู้ว่าพลาดตรงไหน',
];

/** Which topics answer each problem, by index into `topics`. */
const problemTopics = [[0], [1, 2], [3, 4], [5]];

export interface Mentor {
  id: string;
  name: string;
  avatar: string;
  bio: string;
  replyTime: string;
  /** Competition this mentor won, when the result has been verified. */
  wonSlug: string | null;
  category: CategoryId | null;
  topics: number[];
  price: number;
  best: string;
  cannot: string;
  /** First bookable day, counted from today. */
  firstSlotInDays: number;
  verified: boolean;
  /** ชื่อเวทีที่ชนะ API ส่งมาให้ ไฟล์ตัวอย่างไม่ได้ตั้งไว้เพราะค้นจาก wonSlug ได้เอง */
  wonName?: string | null;
  /** Position on this week's podium; absent when not in the top three. */
  weeklyRank?: 1 | 2 | 3;
  weeklyFocus?: string;
}

// Every mentor, award and price below is a fictional prototype fixture.
export const mentors: Mentor[] = [
  {
    id: 'mentor-mind', name: 'พี่มายด์ ก.', avatar: 'มายด์',
    bio: 'บริหารธุรกิจ ปี 4 · มหาวิทยาลัยตัวอย่าง', replyTime: '2 ชั่วโมง',
    wonSlug: 'venture-ignite', category: 'business', topics: [0, 4], price: 800,
    best: 'ช่วยเปลี่ยนโจทย์กว้างให้เป็นไอเดียที่อธิบายได้ใน 1 นาที',
    cannot: 'ไม่รับทำแผนธุรกิจหรือเขียนสไลด์แทนทีม',
    firstSlotInDays: 1, verified: true, weeklyRank: 1, weeklyFocus: 'วิเคราะห์โจทย์และฝึก Pitching',
  },
  {
    id: 'mentor-jay', name: 'พี่เจ ธ.', avatar: 'เจ',
    bio: 'วิศวกรรมคอมพิวเตอร์ ปี 4 · มหาวิทยาลัยตัวอย่าง', replyTime: '2 ชั่วโมง',
    wonSlug: 'bangkok-hack-48', category: 'technology', topics: [1, 2], price: 900,
    best: 'ช่วยวางแผน MVP และเลือกสิ่งที่ควรทำก่อน',
    cannot: 'ไม่รับพัฒนาระบบจริงแทนทั้งทีม',
    firstSlotInDays: 2, verified: true, weeklyRank: 2, weeklyFocus: 'พัฒนาต้นแบบและเทคโนโลยี',
  },
  {
    id: 'mentor-nut', name: 'พี่นัท ว.', avatar: 'นัท',
    bio: 'Product Designer · Design Studio ตัวอย่าง', replyTime: '6 ชั่วโมง',
    wonSlug: 'poster-unbound', category: 'design', topics: [0, 5], price: 700,
    best: 'ช่วยวิเคราะห์ฟีดแบ็กและหาจุดที่งานยังไม่ตอบโจทย์',
    cannot: 'ไม่รับออกแบบชิ้นงานส่งประกวดแทน',
    firstSlotInDays: 3, verified: true, weeklyRank: 3, weeklyFocus: 'ออกแบบแนวคิดและผลงาน',
  },
  {
    id: 'mentor-tae', name: 'พี่เต้ ส.', avatar: 'เต้',
    bio: 'Business Analyst · Studio ตัวอย่าง', replyTime: '4 ชั่วโมง',
    wonSlug: 'retail-growth-case-challenge', category: 'business', topics: [0, 1], price: 600,
    best: 'ช่วยตัดขอบเขตงานและแบ่งหน้าที่ให้ทีมทำทัน',
    cannot: 'ไม่ช่วยเขียนโค้ดหรือทำโมเดลการเงินเชิงลึก',
    firstSlotInDays: 2, verified: true,
  },
  {
    id: 'mentor-pim', name: 'พี่พิม พ.', avatar: 'พิม',
    bio: 'นิเทศศาสตร์ ปี 4 · มหาวิทยาลัยตัวอย่าง', replyTime: '3 ชั่วโมง',
    wonSlug: null, category: null, topics: [3, 4], price: 500,
    best: 'ช่วยเรียงเรื่องและซ้อมตอบคำถามให้กรรมการเข้าใจ',
    cannot: 'ไม่รับตรวจความถูกต้องเชิงวิศวกรรม',
    firstSlotInDays: 1, verified: false,
  },
  {
    id: 'mentor-aom', name: 'พี่ออม ร.', avatar: 'ออม',
    bio: 'ที่ปรึกษาโครงการ · Innovation Lab ตัวอย่าง', replyTime: '5 ชั่วโมง',
    wonSlug: 'venture-ignite', category: 'business', topics: [0, 5], price: 1000,
    best: 'ช่วยทบทวนจุดอ่อนของไอเดียและหลักฐานที่ยังขาด',
    cannot: 'ไม่รับประกันรางวัลหรือผลการเข้ารอบ',
    firstSlotInDays: 25, verified: true,
  },
];

export const podium = mentors
  .filter((mentor): mentor is Mentor & { weeklyRank: 1 | 2 | 3 } => mentor.weeklyRank !== undefined)
  .sort((a, b) => a.weeklyRank - b.weeklyRank);

/** Ordered slugs behind the weekly marquee; a manual editorial pick, not a measured ranking. */
export const trendingSlugs = [
  'venture-ignite',
  'data-story-awards',
  'poster-unbound',
  'young-innovator-prize',
  'fintech-sandbox-cup',
];

export function mentorAward(mentor: Mentor) {
  return mentor.wonSlug ? findCompetition(mentor.wonSlug) : undefined;
}

/** Five consultation slots, alternating between 18:00 and 19:00 Thai time. */
export function mentorSlots(mentor: Mentor) {
  return [0, 1, 2, 3, 4].map((offset) => {
    const slot = new Date();
    slot.setHours(18 + (offset % 2), 0, 0, 0);
    slot.setDate(slot.getDate() + mentor.firstSlotInDays + offset);
    return slot;
  });
}

/** Slots that finish before the team's deadline; a 60 minute consultation. */
export function availableSlots(mentor: Mentor, deadline: Date) {
  return mentorSlots(mentor).filter((slot) => slot.getTime() + 3600000 <= deadline.getTime());
}

export type Tier = 1 | 2 | 3 | null;

/**
 * Manual tier placement for the prototype, not a learned ranking.
 * 1 won this competition · 2 won one of the same kind · 3 topics match the team's problem.
 */
export function mentorTier(mentor: Mentor, competitionSlug: string, problem: number): Tier {
  return tierAgainst(mentor, findCompetition(competitionSlug), competitionSlug, problem);
}

/** รุ่นที่รับตัวเวทีเข้ามาตรง ๆ ใช้เมื่อข้อมูลเวทีมาจาก API ไม่ใช่จากไฟล์ในเครื่อง */
export function tierAgainst(
  mentor: Mentor,
  competition: { slug: string; categories: CategoryId[] } | undefined,
  competitionSlug: string,
  problem: number,
): Tier {
  if (mentor.verified && mentor.wonSlug === competitionSlug) return 1;
  if (mentor.verified && competition && mentor.category && competition.categories.includes(mentor.category)) return 2;
  if (mentor.topics.some((topic) => problemTopics[problem].includes(topic))) return 3;
  return null;
}

const thaiSlot = new Intl.DateTimeFormat('th-TH', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
});
export function formatSlot(slot: Date) {
  return thaiSlot.format(slot) + ' น.';
}
