import { inArray, or } from 'drizzle-orm';
import { competitions as fixtures } from '../../src/data/competitions.js';
import { mentors as mentorFixtures } from '../../src/data/mentors.js';
import { competitionSubmissions as csFixtures, mentorSubmissions as msFixtures } from '../../src/data/submissions.js';
import { db } from './client.js';
import {
  bookingEvents, bookings, competitionCategories, competitionLevels, competitionRewards, competitions,
  competitionSubmissions, mentorAwards, mentorSubmissions, mentors, reviewEvents, submissionCategories,
  submissionLevels, submissionRewards,
} from './schema.js';
import { newId } from '../lib/id.js';

/* ข้อมูลตัวอย่าง (เวที เมนเทอร์ และใบสมัครสมมติ) ใช้สองที่:
   - seed() ของเทส ล้างทั้งตารางก่อนแล้วใส่ชุดนี้
   - ปุ่มในหน้าจัดการบน dev ใส่เฉพาะรายการที่ยังไม่มี และลบเฉพาะรายการตัวอย่าง
     ไม่แตะบัญชีหรือเวทีที่ทีมกรอกเอง
   รายการตัวอย่างระบุด้วย slug และ id ที่ตายตัวในไฟล์ src/data จึงแยกออกจากข้อมูลจริงได้เสมอ */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const demoIds = {
  slugs: fixtures.map((item) => item.slug),
  mentors: mentorFixtures.map((mentor) => mentor.id),
  competitionSubmissions: csFixtures.map((item) => item.id),
  mentorSubmissions: msFixtures.map((item) => item.id),
};

/** ข้อมูลตัวอย่างที่มีอยู่ในฐานตอนนี้ ใช้ทั้งข้ามรายการซ้ำตอนใส่ และนับแสดงบนหน้าจัดการ */
export async function presentDemo(executor: Tx | typeof db = db) {
  const [c, m, cs, ms] = await Promise.all([
    executor.select({ id: competitions.id, slug: competitions.slug }).from(competitions).where(inArray(competitions.slug, demoIds.slugs)),
    executor.select({ id: mentors.id }).from(mentors).where(inArray(mentors.id, demoIds.mentors)),
    executor.select({ id: competitionSubmissions.id }).from(competitionSubmissions).where(inArray(competitionSubmissions.id, demoIds.competitionSubmissions)),
    executor.select({ id: mentorSubmissions.id }).from(mentorSubmissions).where(inArray(mentorSubmissions.id, demoIds.mentorSubmissions)),
  ]);
  return {
    competitionIds: c.map((row) => row.id),
    slugs: new Set(c.map((row) => row.slug)),
    mentors: new Set(m.map((row) => row.id)),
    competitionSubmissions: new Set(cs.map((row) => row.id)),
    mentorSubmissions: new Set(ms.map((row) => row.id)),
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
}

export const demoTotals = {
  competitions: fixtures.length,
  mentors: mentorFixtures.length,
  competitionSubmissions: csFixtures.length,
  mentorSubmissions: msFixtures.length,
};
