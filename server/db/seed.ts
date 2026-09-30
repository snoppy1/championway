import { client, db } from './client.js';
import {
  bookingEvents, bookings, competitionCategories, competitionLevels, competitionRewards, competitions, mentorAwards,
  mentorSubmissions, mentors, reviewEvents, users, submissionCategories, submissionLevels,
  submissionRewards, competitionSubmissions,
} from './schema.js';
import { pathToFileURL } from 'node:url';
import { inArray } from 'drizzle-orm';
import { demoTotals, demoUserIds, insertDemoData } from './demo-data.js';
import { testDatabase } from '../lib/database-safety.js';

/* ย้ายข้อมูลตัวอย่างที่เคยอยู่ในไฟล์ TypeScript เข้าฐานข้อมูล รันซ้ำได้เพราะล้างของเดิมก่อน
   สั่งด้วย npm run db:seed ข้อมูลทั้งหมดยังเป็นเวที ผู้จัด และบุคคลสมมติเหมือนเดิม
   ไม่แตะตาราง users และ sessions เพื่อไม่ให้บัญชีจริงหายตอนรันซ้ำ */

export async function seed() {
  testDatabase(process.env);
  await db.transaction(async (tx) => {
    // การจองอ้างถึงเวทีและเมนเทอร์แบบไม่ลบตาม ต้องลบก่อน ข้อมูล Rising Star ตัวอย่างก็เป็นการจอง
    await tx.delete(bookingEvents);
    await tx.delete(bookings);
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
    // บัญชีสมมติของ Rising Star ต้องหายไปด้วย ไม่อย่างนั้น insertDemoData เห็นว่ามีแล้วและข้ามการใส่การปรึกษา
    await tx.delete(users).where(inArray(users.id, demoUserIds));

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
