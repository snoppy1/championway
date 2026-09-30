import type { CategoryId } from './competitions.js';
import { findCompetition } from './competitions.js';
import { mentors } from './sample-mentors.js';
import { topicIds, topicValues } from './stored-values.js';
import { th } from '../i18n/th.js';
import { locales } from '../i18n/format.js';
import type { Lang } from '../i18n/format.js';
import type { Messages } from '../i18n/en.js';

export { mentors };

/** Proposed six-topic taxonomy. Replace with the owner's final vocabulary. Stored as Thai text; see stored-values.ts. */
export const topics: string[] = topicIds.map((id) => topicValues[id]);

/** Thai wording of the four team problems for Thai-only consumers. The web pages read t.taxonomy.problems. */
export const problems: string[] = th.taxonomy.problems;

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

export function formatSlot(slot: Date, t: Messages = th, lang: Lang = 'th') {
  const text = new Intl.DateTimeFormat(locales[lang], {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(slot);
  return t.competition.slotTime(text);
}
