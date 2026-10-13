import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { consultations, mentorExperiences, mentorSubmissions, users } from '../db/schema.js';

/* หมวด F ความน่าเชื่อถือ (spec 2026-10-13) คำนวณจากข้อมูลจริง เมนเทอร์กรอกเองไม่ได้
   อัตราตอบรับ = งานที่เมนเทอร์ตอบแล้ว (ยืนยันหรือปฏิเสธ) ÷ งานที่ผู้ใช้กดว่าได้รับคำปรึกษาแล้ว ยังไม่มีงาน = null */
export async function mentorStats(mentorId: string) {
  const [[owner], [counts], [{ links }]] = await Promise.all([
    db.select({ verifiedAt: users.emailVerifiedAt }).from(mentorSubmissions)
      .innerJoin(users, eq(users.id, mentorSubmissions.userId))
      .where(and(eq(mentorSubmissions.publishedMentorId, mentorId), eq(mentorSubmissions.status, 'published'))).limit(1),
    db.select({
      completed: sql<number>`count(*) filter (where ${consultations.status} = 'completed')::int`,
      answered: sql<number>`count(*) filter (where ${consultations.status} in ('completed', 'denied'))::int`,
      asked: sql<number>`count(*)::int`,
    }).from(consultations).where(and(eq(consultations.mentorId, mentorId), inArray(consultations.status, ['claimed', 'completed', 'denied']))),
    db.select({ links: sql<number>`count(*)::int` }).from(mentorExperiences)
      .where(and(eq(mentorExperiences.mentorId, mentorId), eq(mentorExperiences.status, 'verified'), sql`${mentorExperiences.evidenceUrl} <> ''`)),
  ]);
  return {
    emailVerified: Boolean(owner?.verifiedAt),
    completedSessions: counts?.completed ?? 0,
    responseRate: counts && counts.asked > 0 ? Math.round((counts.answered / counts.asked) * 100) : null,
    evidenceLinks: links,
  };
}
