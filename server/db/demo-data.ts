import { inArray, or } from 'drizzle-orm';
import { competitions as fixtures } from '../../src/data/competitions.js';
import { mentors as mentorFixtures } from '../../src/data/mentors.js';
import { competitionSubmissions as csFixtures, mentorSubmissions as msFixtures } from '../../src/data/submissions.js';
import { db } from './client.js';
import {
  bookingEvents, bookings, competitionCategories, competitionLevels, competitionRewards, competitions,
  competitionSubmissions, mentorAwards, mentorSlots, mentorSubmissions, mentors, reviewEvents,
  risingStarPeriods, submissionCategories, submissionLevels, submissionRewards, users,
} from './schema.js';
import { newId } from '../lib/id.js';

/* ข้อมูลตัวอย่าง (เวที เมนเทอร์ และใบสมัครสมมติ) ใช้สองที่:
   - seed() ของเทส ล้างทั้งตารางก่อนแล้วใส่ชุดนี้
   - ปุ่มในหน้าจัดการบน dev ใส่เฉพาะรายการที่ยังไม่มี และลบเฉพาะรายการตัวอย่าง
     ไม่แตะบัญชีหรือเวทีที่ทีมกรอกเอง
   รายการตัวอย่างระบุด้วย slug และ id ที่ตายตัวในไฟล์ src/data จึงแยกออกจากข้อมูลจริงได้เสมอ */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/* ---------- Rising Star ตัวอย่าง ----------
   ช่วงสมาชิกและการปรึกษาที่จบแล้วย้อนหลังสามเดือน ให้ Hall of Fame มีของโชว์
   ใส่เป็นการจองจริงที่ยืนยันแล้วและพ้นเวลานัด API จึงนับออกมาเองด้วยกติกาเดียวกับของจริง
   ครอบคลุมกรณีที่ต้องเห็น: สมาชิกนาน สมาชิกใหม่เดือนนี้ คนที่เคยติดอันดับแต่ตอนนี้หมดสมาชิก
   และคนที่ไม่เคยสมัคร */
const DEMO_STUDENT = 'demo-student';
const demoMentorUser = (mentorId: string) => `demo-user-${mentorId}`;

/** เดือนที่เป็นสมาชิก (0 = เดือนนี้, -1 = เดือนที่แล้ว, -2 = สองเดือนก่อน) */
const risingStarPlan: Record<string, { member: number[]; sessions: [number, number, number] }> = {
  // sessions คือจำนวนการปรึกษาในเดือนนี้ เดือนที่แล้ว และสองเดือนก่อน ตามลำดับ
  'mentor-mind': { member: [-2, -1, 0], sessions: [14, 12, 9] },
  'mentor-jay': { member: [-2, -1, 0], sessions: [11, 17, 8] },
  'mentor-nut': { member: [-1, 0], sessions: [9, 10, 0] },
  'mentor-tae': { member: [0], sessions: [5, 0, 0] },
  'mentor-pim': { member: [-2], sessions: [3, 4, 12] },
  'mentor-aom': { member: [], sessions: [2, 0, 0] },
};

const BANGKOK = 7 * 3600_000;
function monthRange(now: Date, offset: number) {
  const local = new Date(now.getTime() + BANGKOK);
  return {
    start: new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + offset, 1) - BANGKOK),
    end: new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + offset + 1, 1) - BANGKOK),
  };
}

async function insertRisingStarDemo(tx: Tx) {
  const [already] = await tx.select({ id: users.id }).from(users).where(inArray(users.id, [DEMO_STUDENT])).limit(1);
  if (already) return;
  const [event] = await tx.select({ id: competitions.id }).from(competitions)
    .where(inArray(competitions.slug, demoIds.slugs)).limit(1);
  const present = new Set((await tx.select({ id: mentors.id }).from(mentors)
    .where(inArray(mentors.id, Object.keys(risingStarPlan)))).map((row) => row.id));
  if (!event || !present.size) return;

  const now = new Date();
  await tx.insert(users).values([
    { id: DEMO_STUDENT, email: 'demo-student@championways.test', name: 'ทีมตัวอย่าง', role: 'member' },
    ...[...present].map((id) => ({ id: demoMentorUser(id), email: `${demoMentorUser(id)}@championways.test`, name: id, role: 'member' as const })),
  ]);

  /* รวบใส่ทีเดียวต่อตาราง ไม่ใส่ทีละแถว เดิมใช้เวลาเกือบนาทีกับฐานข้อมูลบนคลาวด์
     ซึ่งทำให้ปุ่มในหน้าจัดการดูเหมือนค้าง */
  const periodRows: (typeof risingStarPeriods.$inferInsert)[] = [];
  const slotRows: (typeof mentorSlots.$inferInsert)[] = [];
  const bookingRows: (typeof bookings.$inferInsert)[] = [];
  for (const [mentorId, plan] of Object.entries(risingStarPlan)) {
    if (!present.has(mentorId)) continue;
    for (const offset of plan.member) {
      const { start, end } = monthRange(now, offset);
      // ช่วงของเดือนนี้ยาวเลยสิ้นเดือนไปอีก 30 วัน เหมือนรอบบิลที่ยังไม่หมด
      periodRows.push({
        id: newId('rsp'), mentorId, source: 'demo', startsAt: start,
        endsAt: offset === 0 ? new Date(end.getTime() + 30 * 86400000) : end,
      });
    }
    for (const [index, count] of plan.sessions.entries()) {
      const { start, end } = monthRange(now, -index);
      /* กระจายนัดให้จบก่อนเวลาปัจจุบันเสมอ ต้นเดือนที่เพิ่งผ่านมาไม่กี่ชั่วโมงก็ยังใส่ครบได้
         เพราะระยะห่างคำนวณจากเวลาที่ผ่านไปจริงของเดือนนั้น */
      const until = end < now ? end : now;
      const step = (until.getTime() - start.getTime()) / (count + 1);
      for (let n = 1; n <= count; n++) {
        const endsAt = new Date(start.getTime() + step * n);
        const slotId = newId('slot');
        slotRows.push({ id: slotId, mentorId, startsAt: new Date(endsAt.getTime() - 3600_000), endsAt });
        bookingRows.push({
          id: newId('book'), ownerId: DEMO_STUDENT, mentorId, mentorUserId: demoMentorUser(mentorId),
          competitionId: event.id, slotId, title: 'ทีมตัวอย่าง', context: 'การปรึกษาตัวอย่าง',
          status: 'confirmed', expiresAt: endsAt, updatedBy: DEMO_STUDENT,
        });
      }
    }
  }
  if (periodRows.length) await tx.insert(risingStarPeriods).values(periodRows);
  if (slotRows.length) await tx.insert(mentorSlots).values(slotRows);
  if (bookingRows.length) await tx.insert(bookings).values(bookingRows);
}

export const demoIds = {
  slugs: fixtures.map((item) => item.slug),
  mentors: mentorFixtures.map((mentor) => mentor.id),
  competitionSubmissions: csFixtures.map((item) => item.id),
  mentorSubmissions: msFixtures.map((item) => item.id),
};

/** ข้อมูลตัวอย่างที่มีอยู่ในฐานตอนนี้ ใช้ทั้งข้ามรายการซ้ำตอนใส่ และนับแสดงบนหน้าจัดการ */
export async function presentDemo(executor: Tx | typeof db = db) {
  const [c, m, cs, ms, rs] = await Promise.all([
    executor.select({ id: competitions.id, slug: competitions.slug }).from(competitions).where(inArray(competitions.slug, demoIds.slugs)),
    executor.select({ id: mentors.id }).from(mentors).where(inArray(mentors.id, demoIds.mentors)),
    executor.select({ id: competitionSubmissions.id }).from(competitionSubmissions).where(inArray(competitionSubmissions.id, demoIds.competitionSubmissions)),
    executor.select({ id: mentorSubmissions.id }).from(mentorSubmissions).where(inArray(mentorSubmissions.id, demoIds.mentorSubmissions)),
    executor.select({ id: users.id }).from(users).where(inArray(users.id, [DEMO_STUDENT])),
  ]);
  return {
    competitionIds: c.map((row) => row.id),
    slugs: new Set(c.map((row) => row.slug)),
    mentors: new Set(m.map((row) => row.id)),
    competitionSubmissions: new Set(cs.map((row) => row.id)),
    mentorSubmissions: new Set(ms.map((row) => row.id)),
    risingStar: rs.length > 0,
  };
}

/** ใส่ข้อมูลตัวอย่างที่ยังไม่มี รันซ้ำได้ ไม่สร้างรายการซ้ำ */
export async function insertDemoData(tx: Tx) {
  const existing = await presentDemo(tx);
  for (const item of fixtures) {
    if (existing.slugs.has(item.slug)) continue;
    const id = newId('cmp');
    await tx.insert(competitions).values({
      id,
      kind: item.kind ?? null,
      themes: item.themes ?? [],
      slug: item.slug,
      name: item.name,
      description: item.description,
      type: item.type,
      org: item.org,
      closesAt: item.closesAt,
      opensAt: item.opensAt ?? null,
      eventDate: item.eventDate ?? null,
      region: item.region,
      venue: item.venue ?? null,
      prizeValue: item.prizeValue,
      prizeNote: item.prizeNote ?? null,
      fee: item.fee ?? null,
      teamMin: item.teamMin,
      teamMax: item.teamMax,
      featured: Boolean(item.featured),
      keywords: item.keywords,
      sourceUrl: item.sourceUrl,
      source: item.source,
      lastVerifiedAt: item.lastVerifiedAt,
      registerUrl: item.registerUrl ?? null,
      overview: item.overview ?? null,
      audience: item.audience ?? null,
      format: item.format ?? [],
      deliverables: item.deliverables ?? [],
      preparation: item.preparation ?? [],
    });
    await tx.insert(competitionCategories).values(
      item.categories.map((category, position) => ({ competitionId: id, category, position })),
    );
    await tx.insert(competitionLevels).values(item.levels.map((level) => ({ competitionId: id, level })));
    if (item.rewards.length) {
      await tx.insert(competitionRewards).values(item.rewards.map((reward) => ({ competitionId: id, reward })));
    }
  }

  for (const mentor of mentorFixtures) {
    if (existing.mentors.has(mentor.id)) continue;
    await tx.insert(mentors).values({
      id: mentor.id,
      name: mentor.name,
      avatar: mentor.avatar,
      bio: mentor.bio,
      replyTime: mentor.replyTime,
      wonSlug: mentor.wonSlug,
      category: mentor.category,
      topics: mentor.topics,
      price: mentor.price,
      best: mentor.best,
      cannot: mentor.cannot,
      firstSlotInDays: mentor.firstSlotInDays,
      verified: mentor.verified,
      weeklyRank: mentor.weeklyRank ?? null,
      weeklyFocus: mentor.weeklyFocus ?? null,
    });
  }

  for (const item of csFixtures) {
    if (existing.competitionSubmissions.has(item.id)) continue;
    await tx.insert(competitionSubmissions).values({
      id: item.id,
      status: item.status,
      submittedAt: new Date(`${item.submittedAt}T09:00:00Z`),
      organizerName: item.organizerName,
      contactName: item.contactName,
      contactRole: item.contactRole,
      contactEmail: item.contactEmail,
      contactPhone: item.contactPhone,
      organizerUrl: item.organizerUrl,
      name: item.name,
      description: item.description,
      type: item.type,
      teamMin: item.teamMin,
      teamMax: item.teamMax,
      opensAt: item.opensAt ?? null,
      closesAt: item.closesAt,
      eventDate: item.eventDate ?? null,
      region: item.region,
      venue: item.venue ?? null,
      prizeValue: item.prizeValue,
      prizeNote: item.prizeNote ?? null,
      fee: item.fee ?? null,
      sourceUrl: item.sourceUrl,
      registerUrl: item.registerUrl ?? null,
    });
    await tx.insert(submissionCategories).values(
      item.categories.map((category, position) => ({ submissionId: item.id, category, position })),
    );
    await tx.insert(submissionLevels).values(item.levels.map((level) => ({ submissionId: item.id, level })));
    if (item.rewards.length) {
      await tx.insert(submissionRewards).values(item.rewards.map((reward) => ({ submissionId: item.id, reward })));
    }
  }

  for (const item of msFixtures) {
    if (existing.mentorSubmissions.has(item.id)) continue;
    await tx.insert(mentorSubmissions).values({
      id: item.id,
      status: item.status,
      submittedAt: new Date(`${item.submittedAt}T09:00:00Z`),
      firstName: item.firstName,
      lastName: item.lastName,
      nickname: item.nickname,
      email: item.email,
      phone: item.phone,
      occupation: item.occupation,
      organization: item.organization,
      role: item.role,
      experience: item.experience,
      portfolio: item.portfolio,
      best: item.best,
      cannot: item.cannot,
      topics: item.topics,
      price: item.price,
      paidSlot: new Date(`${item.paidSlot}T10:00:00Z`),
      freeSlot: new Date(`${item.freeSlot}T10:00:00Z`),
    });
    if (item.awards.length) {
      await tx.insert(mentorAwards).values(item.awards.map((award) => ({
        id: newId('aw'),
        submissionId: item.id,
        title: award.title,
        competitionSlug: award.competitionSlug,
        year: award.year,
        evidence: award.evidence,
      })));
    }
  }
  await insertRisingStarDemo(tx);
}

/* ลบเฉพาะข้อมูลตัวอย่าง การจองบนเวทีหรือเมนเทอร์ตัวอย่างต้องลบก่อน
   เพราะตาราง bookings อ้างถึงสองตารางนั้นแบบไม่ลบตาม ส่วนที่เหลือ (หมวด ระดับ คิว ห้องแชต) ลบตามเอง */
export async function removeDemoData(tx: Tx) {
  const present = await presentDemo(tx);
  const mentorIds = [...present.mentors];
  if (present.competitionIds.length || mentorIds.length) {
    const scope = or(
      present.competitionIds.length ? inArray(bookings.competitionId, present.competitionIds) : undefined,
      mentorIds.length ? inArray(bookings.mentorId, mentorIds) : undefined,
    );
    const doomed = await tx.select({ id: bookings.id }).from(bookings).where(scope);
    if (doomed.length) {
      const ids = doomed.map((row) => row.id);
      await tx.delete(bookingEvents).where(inArray(bookingEvents.bookingId, ids));
      await tx.delete(bookings).where(inArray(bookings.id, ids));
    }
  }
  const submissionIds = [...present.competitionSubmissions, ...present.mentorSubmissions];
  if (submissionIds.length) await tx.delete(reviewEvents).where(inArray(reviewEvents.targetId, submissionIds));
  if (present.competitionSubmissions.size) {
    await tx.delete(competitionSubmissions).where(inArray(competitionSubmissions.id, [...present.competitionSubmissions]));
  }
  if (present.mentorSubmissions.size) {
    await tx.delete(mentorSubmissions).where(inArray(mentorSubmissions.id, [...present.mentorSubmissions]));
  }
  if (present.competitionIds.length) await tx.delete(competitions).where(inArray(competitions.id, present.competitionIds));
  if (mentorIds.length) await tx.delete(mentors).where(inArray(mentors.id, mentorIds));
  const demoUsers = [DEMO_STUDENT, ...Object.keys(risingStarPlan).map(demoMentorUser)];
  const leftover = await tx.select({ id: bookings.id }).from(bookings).where(inArray(bookings.ownerId, demoUsers));
  if (leftover.length) {
    await tx.delete(bookingEvents).where(inArray(bookingEvents.bookingId, leftover.map((row) => row.id)));
    await tx.delete(bookings).where(inArray(bookings.id, leftover.map((row) => row.id)));
  }
  await tx.delete(users).where(inArray(users.id, demoUsers));
}

export const demoTotals = {
  risingStar: 1,
  competitions: fixtures.length,
  mentors: mentorFixtures.length,
  competitionSubmissions: csFixtures.length,
  mentorSubmissions: msFixtures.length,
};
