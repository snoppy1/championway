import { and, eq, inArray, or } from 'drizzle-orm';
import { competitions as fixtures } from '../../src/data/competitions.js';
import { mentors as mentorFixtures } from '../../src/data/mentors.js';
import { competitionSubmissions as csFixtures, mentorSubmissions as msFixtures } from '../../src/data/submissions.js';
import { db } from './client.js';
import {
  bookingEvents, bookings, competitionCategories, competitionLevels, competitionRewards, competitions,
  competitionSubmissions, consultations, mentorAwards, mentorCompetitionChoices, mentorReviews, mentorSubmissions,
  mentors, reviewEvents, risingStarPeriods, submissionCategories, submissionLevels, submissionRewards, users,
} from './schema.js';
import { newId } from '../lib/id.js';

/* ข้อมูลตัวอย่าง (เวที เมนเทอร์ และใบสมัครสมมติ) ใช้สองที่:
   - seed() ของเทส ล้างทั้งตารางก่อนแล้วใส่ชุดนี้
   - ปุ่มในหน้าจัดการบน dev ใส่เฉพาะรายการที่ยังไม่มี และลบเฉพาะรายการตัวอย่าง
     ไม่แตะบัญชีหรือเวทีที่ทีมกรอกเอง
   รายการตัวอย่างระบุด้วย slug และ id ที่ตายตัวในไฟล์ src/data จึงแยกออกจากข้อมูลจริงได้เสมอ */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/* ---------- Rising Star ตัวอย่าง ----------
   ช่วงสมาชิก การปรึกษาที่เมนเทอร์ยืนยันแล้ว และรีวิวย้อนหลังสามเดือน ให้ Hall of Fame มีของโชว์
   ใส่เป็นรีวิวจริงผูกกับการปรึกษาที่ยืนยันแล้ว API จึงคำนวณด้วยกติกาเดียวกับของจริง
   ครอบคลุมกรณีที่ต้องเห็น: สมาชิกนาน สมาชิกใหม่เดือนนี้ คนที่เคยติดอันดับแต่ตอนนี้หมดสมาชิก
   และคนที่ไม่เคยสมัคร
   เมนเทอร์ตัวอย่างทุกคนได้บัญชีสมมติ ใบสมัครที่ผ่านแล้ว ช่องทางติดต่อ และงานที่รับปรึกษาพร้อมราคา
   หน้า Available Mentors กับหน้าเมนเทอร์จึงเปิดได้ครบ */
const DEMO_STUDENT = 'demo-student';
const demoMentorUser = (mentorId: string) => `demo-user-${mentorId}`;
const demoMentorSubmission = (mentorId: string) => `demo-ms-${mentorId}`;

/** member: เดือนที่เป็นสมาชิก (0 = เดือนนี้, -1 = เดือนที่แล้ว, -2 = สองเดือนก่อน)
    stars: ดาวของรีวิวในเดือนนี้ เดือนที่แล้ว และสองเดือนก่อน ตามลำดับ */
const risingStarPlan: Record<string, { member: number[]; stars: [number[], number[], number[]] }> = {
  'mentor-mind': { member: [-2, -1, 0], stars: [[5, 5, 4, 5], [4, 4, 5], [5, 4]] },
  'mentor-jay': { member: [-2, -1, 0], stars: [[5, 4, 4], [5, 5, 5, 4], [4, 4]] },
  'mentor-nut': { member: [-1, 0], stars: [[4, 4], [4, 4, 4], []] },
  'mentor-tae': { member: [0], stars: [[4, 3], [], []] },
  'mentor-pim': { member: [-2], stars: [[5], [4], [5, 5, 5]] },
  'mentor-aom': { member: [], stars: [[4], [], []] },
};

/** ช่องทางติดต่อตัวอย่าง บางคนเว้นบางช่องไว้ให้เห็นว่าหน้าเว็บแสดง "-" */
function demoContacts(mentorId: string, index: number) {
  const handle = mentorId.replace('mentor-', '');
  return {
    contactEmail: `${mentorId}@championways.test`,
    contactLine: index % 2 === 0 ? `${handle}.line` : '',
    contactPhone: index % 3 === 0 ? `080-000-00${index}` : '',
    contactInstagram: index % 2 === 1 ? `${handle}.mentor` : '',
    contactLink: index === 0 ? 'https://example.com/portfolio' : '',
  };
}
/** ราคาตัวอย่าง [บาท, นาที] มีอัตราเล็กอย่าง 10 บาท / 1 นาที ด้วย */
const demoPrices: [number, number][] = [[500, 60], [300, 30], [10, 1], [800, 90], [450, 45], [1000, 120]];

/** บัญชีสมมติของข้อมูลตัวอย่าง seed ต้องลบทิ้งก่อนใส่ใหม่ ไม่อย่างนั้นการใส่จะข้ามเพราะเห็นว่ามีอยู่แล้ว */
export const demoUserIds = [DEMO_STUDENT, ...Object.keys(risingStarPlan).map(demoMentorUser)];

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
  if (already) {
    // ข้อมูลตัวอย่างรุ่นเก่านับจากการจอง ไม่มีรีวิว ถ้าเจอให้ล้างบัญชีตัวอย่างแล้วใส่รุ่นใหม่แทน
    const [review] = await tx.select({ id: mentorReviews.id }).from(mentorReviews).where(eq(mentorReviews.userId, DEMO_STUDENT)).limit(1);
    if (review) return;
    await removeDemoAccounts(tx);
  }
  const events = await tx.select({ id: competitions.id, slug: competitions.slug }).from(competitions)
    .where(inArray(competitions.slug, demoIds.slugs));
  events.sort((a, b) => demoIds.slugs.indexOf(a.slug) - demoIds.slugs.indexOf(b.slug));
  const present = new Set((await tx.select({ id: mentors.id }).from(mentors)
    .where(inArray(mentors.id, Object.keys(risingStarPlan)))).map((row) => row.id));
  if (!events.length || !present.size) return;
  const mentorIds = Object.keys(risingStarPlan).filter((id) => present.has(id));

  const now = new Date();
  // บัญชีตัวอย่างยืนยันอีเมลแล้ว ใช้ทดลองกด Contact Mentor และรีวิวได้ทันที
  await tx.insert(users).values([
    { id: DEMO_STUDENT, email: 'demo-student@championways.test', name: 'ทีมตัวอย่าง', role: 'member', emailVerifiedAt: now },
    ...mentorIds.map((id) => ({
      id: demoMentorUser(id), email: `${demoMentorUser(id)}@championways.test`, name: id, role: 'member' as const, emailVerifiedAt: now,
    })),
  ]);

  const fixtureOf = new Map(mentorFixtures.map((mentor) => [mentor.id, mentor]));
  await tx.insert(mentorSubmissions).values(mentorIds.map((id) => {
    const fixture = fixtureOf.get(id)!;
    return {
      id: demoMentorSubmission(id), status: 'published' as const, userId: demoMentorUser(id), publishedMentorId: id,
      firstName: fixture.name, lastName: '-', nickname: fixture.avatar, email: `${demoMentorUser(id)}@championways.test`,
      phone: '', occupation: 'working', organization: 'ตัวอย่าง', role: 'เมนเทอร์ตัวอย่าง',
      experience: fixture.bio, best: fixture.best, cannot: fixture.cannot, topics: [],
    };
  }));
  for (const [index, id] of mentorIds.entries()) {
    const [price, minutes] = demoPrices[index % demoPrices.length];
    await tx.update(mentors).set({ ...demoContacts(id, index), price, minutes }).where(eq(mentors.id, id));
  }
  // ทุกคนรับปรึกษางานแรก หน้า Available Mentors ของงานแรกจึงเห็นครบทั้งสองส่วน และอีกหนึ่งงานเวียนกันไป
  await tx.insert(mentorCompetitionChoices).values(mentorIds.flatMap((id, index) => {
    const [price, minutes] = demoPrices[index % demoPrices.length];
    const picks = [...new Set([0, 1 + (index % Math.max(1, events.length - 1))])].filter((n) => n < events.length);
    return picks.map((n) => ({ mentorId: id, competitionId: events[n].id, choice: 'help', price, minutes }));
  }));

  /* รวบใส่ทีเดียวต่อตาราง ไม่ใส่ทีละแถว เดิมใช้เวลาเกือบนาทีกับฐานข้อมูลบนคลาวด์
     ซึ่งทำให้ปุ่มในหน้าจัดการดูเหมือนค้าง */
  const periodRows: (typeof risingStarPeriods.$inferInsert)[] = [];
  const consultationRows: (typeof consultations.$inferInsert)[] = [];
  const reviewRows: (typeof mentorReviews.$inferInsert)[] = [];
  for (const mentorId of mentorIds) {
    const plan = risingStarPlan[mentorId];
    for (const offset of plan.member) {
      const { start, end } = monthRange(now, offset);
      // ช่วงของเดือนนี้ยาวเลยสิ้นเดือนไปอีก 30 วัน เหมือนรอบบิลที่ยังไม่หมด
      periodRows.push({
        id: newId('rsp'), mentorId, source: 'demo', startsAt: start,
        endsAt: offset === 0 ? new Date(end.getTime() + 30 * 86400000) : end,
      });
    }
    for (const [index, stars] of plan.stars.entries()) {
      const { start, end } = monthRange(now, -index);
      /* กระจายรีวิวให้อยู่ก่อนเวลาปัจจุบันเสมอ ต้นเดือนที่เพิ่งผ่านมาไม่กี่ชั่วโมงก็ยังใส่ครบได้
         เพราะระยะห่างคำนวณจากเวลาที่ผ่านไปจริงของเดือนนั้น */
      const until = end < now ? end : now;
      const step = (until.getTime() - start.getTime()) / (stars.length + 1);
      for (const [n, value] of stars.entries()) {
        const at = new Date(start.getTime() + step * (n + 1));
        const consultationId = newId('cns');
        consultationRows.push({
          id: consultationId, userId: DEMO_STUDENT, mentorId, competitionId: events[0].id, status: 'confirmed',
          createdAt: new Date(at.getTime() - 2000), claimedAt: new Date(at.getTime() - 1000), confirmedAt: at,
        });
        reviewRows.push({ id: newId('rvw'), consultationId, userId: DEMO_STUDENT, mentorId, stars: value, comment: 'รีวิวตัวอย่าง', createdAt: at });
      }
    }
  }
  if (periodRows.length) await tx.insert(risingStarPeriods).values(periodRows);
  if (consultationRows.length) await tx.insert(consultations).values(consultationRows);
  if (reviewRows.length) await tx.insert(mentorReviews).values(reviewRows);
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
  await removeDemoAccounts(tx);
}

/** บัญชีตัวอย่างกับทุกอย่างที่ผูกไว้ การปรึกษาและรีวิวลบตามบัญชีเอง การจองรุ่นเก่าต้องลบก่อน */
async function removeDemoAccounts(tx: Tx) {
  const demoUsers = demoUserIds;
  const leftover = await tx.select({ id: bookings.id }).from(bookings).where(inArray(bookings.ownerId, demoUsers));
  if (leftover.length) {
    await tx.delete(bookingEvents).where(inArray(bookingEvents.bookingId, leftover.map((row) => row.id)));
    await tx.delete(bookings).where(inArray(bookings.id, leftover.map((row) => row.id)));
  }
  // ช่วงสมาชิกกับงานที่รับปรึกษาผูกกับเมนเทอร์ ไม่ใช่บัญชี ต้องลบเองไม่อย่างนั้นใส่ใหม่แล้วซ้ำ
  const planMentors = Object.keys(risingStarPlan);
  await tx.delete(risingStarPeriods).where(and(inArray(risingStarPeriods.mentorId, planMentors), eq(risingStarPeriods.source, 'demo')));
  await tx.delete(mentorCompetitionChoices).where(inArray(mentorCompetitionChoices.mentorId, planMentors));
  // ใบสมัครที่ผูกบัญชีตัวอย่างไว้ ลบตาม id เพราะลบบัญชีแล้วใบจะค้างอยู่แบบไม่มีเจ้าของ
  await tx.delete(mentorSubmissions).where(inArray(mentorSubmissions.id, Object.keys(risingStarPlan).map(demoMentorSubmission)));
  await tx.delete(users).where(inArray(users.id, demoUsers));
}

export const demoTotals = {
  risingStar: 1,
  competitions: fixtures.length,
  mentors: mentorFixtures.length,
  competitionSubmissions: csFixtures.length,
  mentorSubmissions: msFixtures.length,
};
