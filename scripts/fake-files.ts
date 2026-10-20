import { eq } from 'drizzle-orm';
import { db } from '../server/db/client';
import { files, sessions } from '../server/db/schema';
import { newId } from '../server/lib/id';

/* เทสที่ส่งใบสมัครเมนเทอร์ต้องแนบรูปโปรไฟล์และไฟล์หลักฐาน (บังคับตั้งแต่ 6 ต.ค. 2569)
   สร้างแถวไฟล์ที่ "อัปโหลดแล้ว" ของผู้ใช้คนนั้นตรง ๆ ไม่ต้องผ่านที่เก็บไฟล์จริง */
export async function fakeUploads(userId: string, count: number, mime = 'image/png') {
  const rows = Array.from({ length: count }, () => ({
    id: newId('fil'), ownerType: 'user', ownerId: userId, path: 'test-fake.png', originalName: 'proof.png', mime, size: 8,
  }));
  if (rows.length) await db.insert(files).values(rows);
  return rows.map((row) => row.id);
}

export async function userOfCookie(cookie: string) {
  const [row] = await db.select({ userId: sessions.userId }).from(sessions).where(eq(sessions.id, cookie.replace(/^cw_session=/, '')));
  return row.userId;
}

/** แนบรูปโปรไฟล์และไฟล์หลักฐานให้ทุกรายการในใบสมัคร */
export async function withUploads<T extends { awards: object[] }>(cookie: string, body: T) {
  const userId = await userOfCookie(cookie);
  const [photoFileId, ...evidence] = await fakeUploads(userId, body.awards.length + 1);
  return { ...body, photoFileId, awards: body.awards.map((award, index) => ({ evidenceFileIds: [evidence[index]], ...award })) };
}

/* ใบสมัครแบบใหม่ (21 ต.ค. 2569) ต้องมีโปรไฟล์หมวด A, B, D, E ครบ ราคาเดียว และประสบการณ์แบบละเอียด */
export const applicationProfile = {
  headline: 'Full-stack developer | Hackathon finalist', country: 'TH', timeZone: 'Asia/Bangkok', languages: ['th', 'en'],
  background: 'วิศวกรรมคอมพิวเตอร์', gender: null,
  skills: [{ tag: 'react', level: 'expert' }, { tag: 'strategy', level: 'advanced' }],
  helpsWith: ['coding', 'case_analysis'], learnerLevels: ['beginner'], teachingStyles: ['review'], formats: ['team'],
  deliverables: 'สรุปสิ่งที่ต้องแก้', availability: [{ day: 6, from: '09:00', to: '12:00' }], sessionsPerWeek: 2, sessionMinutes: [60],
  acceptingRequests: true, replyHours: 24, acceptsUrgent: false, mode: 'online',
};
export const applicationPrice = { amount: 0, unit: '' };
/** ประสบการณ์หนึ่งรายการ ค่าเริ่มต้นเป็นงานนอกระบบที่เข้ารอบสุดท้าย */
export const applicationAward = (overrides: object = {}) => ({
  title: 'เวทีนอกระบบ', competitionSlug: null, kind: 'hackathon', result: 'finalist', detail: '', year: '2567',
  role: 'developer', roleOther: '', responsibility: 'ทำต้นแบบ', lessons: '', evidence: 'https://example.test/proof', ...overrides,
});
