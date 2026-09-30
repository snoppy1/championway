import { and, gte, isNull, lt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { mentorReviews } from '../db/schema.js';

/* คะแนนที่ใช้จัดอันดับ Rising Star และแสดงบนการ์ดเมนเทอร์

   กติกา (ผู้ใช้ตัดสิน 30 ก.ย. 2569)
   - ค่าเฉลี่ยดาวของรีวิวที่เขียนในเดือนนั้น ตามเวลาไทย เริ่มนับใหม่ทุกวันที่ 1
   - ไม่มีขั้นต่ำจำนวนรีวิว ค่าเฉลี่ยเท่ากันให้คนที่มีรีวิวมากกว่าขึ้นก่อน
   - รีวิวที่แอดมินซ่อนไม่นับ
   รีวิวเกิดได้เฉพาะหลังเมนเทอร์ยืนยันการปรึกษา และผู้รีวิวยืนยันอีเมลแล้ว (ดู routes/consult.ts) */

const BANGKOK = 7 * 3600_000;

/** ช่วงเดือนตามเวลาไทย offset 0 = เดือนนี้, -1 = เดือนที่แล้ว ไทยไม่มีเวลาออมแสงจึงบวกลบ 7 ชั่วโมงได้ตรง ๆ */
export function bangkokMonth(now: Date, offset: number) {
  const local = new Date(now.getTime() + BANGKOK);
  const start = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + offset, 1) - BANGKOK);
  const end = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + offset + 1, 1) - BANGKOK);
  const key = new Date(start.getTime() + BANGKOK).toISOString().slice(0, 7);
  return { key, start, end };
}

export type Rating = { average: number; reviews: number };

/** ค่าเฉลี่ยดาวต่อเมนเทอร์ในช่วงเวลาหนึ่ง ปัดทศนิยมหนึ่งตำแหน่งตอนแสดงเท่านั้น ใช้ค่าจริงเรียงอันดับ */
export async function ratingsBetween(start: Date, end: Date) {
  const rows = await db.select({ mentorId: mentorReviews.mentorId, stars: mentorReviews.stars }).from(mentorReviews)
    .where(and(gte(mentorReviews.createdAt, start), lt(mentorReviews.createdAt, end), isNull(mentorReviews.hiddenAt)));
  const sums = new Map<string, { total: number; reviews: number }>();
  for (const row of rows) {
    const current = sums.get(row.mentorId) ?? { total: 0, reviews: 0 };
    current.total += row.stars;
    current.reviews += 1;
    sums.set(row.mentorId, current);
  }
  return new Map<string, Rating>([...sums].map(([id, s]) => [id, { average: s.total / s.reviews, reviews: s.reviews }]));
}

/** เรียงมากไปน้อยตามค่าเฉลี่ย เท่ากันดูจำนวนรีวิว ยังไม่มีรีวิวอยู่ท้ายสุด สุดท้ายเรียงตามชื่อให้ลำดับคงที่ */
export function byRating(ratings: Map<string, Rating>, nameOf: (id: string) => string) {
  return (a: string, b: string) => {
    const ra = ratings.get(a), rb = ratings.get(b);
    return (rb?.average ?? -1) - (ra?.average ?? -1)
      || (rb?.reviews ?? 0) - (ra?.reviews ?? 0)
      || nameOf(a).localeCompare(nameOf(b), 'th');
  };
}

/** ค่าที่ส่งให้หน้าเว็บ ค่าเฉลี่ยปัดหนึ่งตำแหน่ง */
export const ratingJson = (rating: Rating | undefined) =>
  rating ? { average: Math.round(rating.average * 10) / 10, reviews: rating.reviews } : { average: null, reviews: 0 };
