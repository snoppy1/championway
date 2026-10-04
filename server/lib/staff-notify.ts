import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { staffAlerts, staffNotifications, users } from '../db/schema.js';
import { newId } from './id.js';
import { notify } from './email.js';

/* แจ้งทีมงานทางอีเมลเมื่อมีเรื่องใหม่รอตรวจ (ผู้ใช้ขอ 5 ต.ค. 2569)
   admin ตั้งได้ในหน้าจัดการ แต่ละเรื่องเปิด/ปิดได้ และเลือกว่าส่งถึง admin ทุกคน หรือเฉพาะคนที่เลือก (admin หรือผู้ตรวจ)
   ยังไม่เคยตั้ง = เปิดและส่งถึง admin ทุกคน
   อีเมลมีแค่ชื่อเรื่องกับลิงก์ไปหน้าตรวจ ไม่ใส่อีเมลหรือเบอร์ของผู้สมัคร
   ส่งไม่ผ่านไม่ทำให้คำขอของผู้ใช้ล้มเหลว */

export const staffNotificationKinds = ['mentor_application', 'competition_request', 'competition_submission'] as const;
export type StaffNotificationKind = typeof staffNotificationKinds[number];
export type StaffNotificationSetting = { kind: StaffNotificationKind; enabled: boolean; audience: 'all' | 'selected'; recipientIds: string[] };

const STAFF_ROLES = ['admin', 'reviewer'] as const;

export async function staffNotificationSettings(): Promise<StaffNotificationSetting[]> {
  const rows = await db.select().from(staffNotifications);
  return staffNotificationKinds.map((kind) => {
    const row = rows.find((item) => item.kind === kind);
    return row
      ? { kind, enabled: row.enabled, audience: row.audience, recipientIds: row.recipientIds }
      : { kind, enabled: true, audience: 'all', recipientIds: [] };
  });
}

/** ผู้รับจริงตามที่ตั้งไว้ คนที่ถูกลดสิทธิ์จากทีมงานแล้วถูกตัดออกเอง */
export async function staffRecipients(setting: StaffNotificationSetting) {
  if (!setting.enabled) return [];
  if (setting.audience === 'all') {
    return db.select({ id: users.id, email: users.email }).from(users).where(eq(users.role, 'admin'));
  }
  if (!setting.recipientIds.length) return [];
  return db.select({ id: users.id, email: users.email }).from(users)
    .where(and(inArray(users.id, setting.recipientIds), inArray(users.role, [...STAFF_ROLES])));
}

/* เพดานกันอีเมลถล่ม: คนเดียวกันได้แจ้งเรื่องเดียวกันครั้งเดียวทุก 15 นาที และแต่ละเรื่องไม่เกิน 20 ครั้งต่อชั่วโมง
   ที่เกินไม่ส่งอีเมล แต่รายการยังเข้าคิวตรวจตามปกติ ทีมเห็นได้ในหน้าจัดการ (Astra รีวิว 5 ต.ค. 2569) */
const PER_ACTOR_MS = 15 * 60_000;
const PER_HOUR = 20;

async function allowed(kind: StaffNotificationKind, actorId: string) {
  // นับแล้วบันทึกในธุรกรรมที่ล็อกตามเรื่อง คำขอที่มาพร้อมกันจะผ่านเพดานไปไม่ได้ (Astra รีวิว 5 ต.ค. 2569)
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`staff-alert:${kind}`}))`);
    const now = Date.now();
    const [recent] = await tx.select({ count: sql<number>`count(*)::int` }).from(staffAlerts)
      .where(and(eq(staffAlerts.actorId, actorId), eq(staffAlerts.kind, kind), gt(staffAlerts.createdAt, new Date(now - PER_ACTOR_MS))));
    if (recent.count > 0) return false;
    const [hour] = await tx.select({ count: sql<number>`count(*)::int` }).from(staffAlerts)
      .where(and(eq(staffAlerts.kind, kind), gt(staffAlerts.createdAt, new Date(now - 3600_000))));
    if (hour.count >= PER_HOUR) return false;
    await tx.insert(staffAlerts).values({ id: newId('alert'), kind, actorId });
    return true;
  });
}

export async function notifyStaff(kind: StaffNotificationKind, actorId: string, subject: string, body: string) {
  try {
    const setting = (await staffNotificationSettings()).find((item) => item.kind === kind)!;
    const people = await staffRecipients(setting);
    if (!people.length || !await allowed(kind, actorId)) return;
    // ส่งพร้อมกันทุกคน คำขอของผู้ใช้รอแค่ฉบับที่ช้าที่สุด ไม่ใช่ผลรวมทุกฉบับ
    await Promise.allSettled(people.map((person) => notify(person.email, subject, body)));
  } catch (error) {
    console.error('[staff-notify]', kind, error);
  }
}
