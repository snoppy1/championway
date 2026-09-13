import { competitions as fixtures } from '../../src/data/competitions.js';
import { mentors as mentorFixtures } from '../../src/data/mentors.js';
import { competitionSubmissions as csFixtures, mentorSubmissions as msFixtures } from '../../src/data/submissions.js';
import { client, db } from './client.js';
import {
  competitionCategories, competitionLevels, competitionRewards, competitions, mentorAwards,
  mentorSubmissions, mentors, reviewEvents, submissionCategories, submissionLevels,
  submissionRewards, competitionSubmissions,
} from './schema.js';
import { pathToFileURL } from 'node:url';
import { newId } from '../lib/id.js';
import { testDatabase } from '../lib/database-safety.js';

/* ย้ายข้อมูลตัวอย่างที่เคยอยู่ในไฟล์ TypeScript เข้าฐานข้อมูล รันซ้ำได้เพราะล้างของเดิมก่อน
   สั่งด้วย npm run db:seed ข้อมูลทั้งหมดยังเป็นเวที ผู้จัด และบุคคลสมมติเหมือนเดิม
   ไม่แตะตาราง users และ sessions เพื่อไม่ให้บัญชีจริงหายตอนรันซ้ำ */

export async function seed() {
  testDatabase(process.env);
  await db.transaction(async (tx) => {
    await tx.delete(reviewEvents);
    await tx.delete(mentorAwards);
    await tx.delete(mentorSubmissions);
    await tx.delete(submissionCategories);
    await tx.delete(submissionLevels);
    await tx.delete(submissionRewards);
    await tx.delete(competitionSubmissions);
    await tx.delete(competitionCategories);
    await tx.delete(competitionLevels);
    await tx.delete(competitionRewards);
    await tx.delete(competitions);
    await tx.delete(mentors);

    for (const item of fixtures) {
      const id = newId('cmp');
      await tx.insert(competitions).values({
        id,
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
  });

  console.log(`seeded: ${fixtures.length} competitions, ${mentorFixtures.length} mentors, `
    + `${csFixtures.length} competition submissions, ${msFixtures.length} mentor applications`);
}

// รันตรงจากบรรทัดคำสั่งเท่านั้น ตอนถูก import จากเทสจะเรียก seed() เอง
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await seed();
  await client.end();
}
