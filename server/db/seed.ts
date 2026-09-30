import { client, db } from './client.js';
import {
  competitionCategories, competitionLevels, competitionRewards, competitions, mentorAwards,
  mentorSubmissions, mentors, reviewEvents, submissionCategories, submissionLevels,
  submissionRewards, competitionSubmissions,
} from './schema.js';
import { pathToFileURL } from 'node:url';
import { demoTotals, insertDemoData } from './demo-data.js';
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

    await insertDemoData(tx);
  });

  console.log(`seeded: ${demoTotals.competitions} competitions, ${demoTotals.mentors} mentors, `
    + `${demoTotals.competitionSubmissions} competition submissions, ${demoTotals.mentorSubmissions} mentor applications`);
}

// รันตรงจากบรรทัดคำสั่งเท่านั้น ตอนถูก import จากเทสจะเรียก seed() เอง
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await seed();
  await client.end();
}
