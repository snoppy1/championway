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
  return { ...body, photoFileId, awards: body.awards.map((award, index) => ({ evidenceFileId: evidence[index], ...award })) };
}
