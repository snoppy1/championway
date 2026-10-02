import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { chatMembers, chatRooms, consultations, hirePayments, mentorPayouts, mentors, mentorSubmissions } from '../db/schema.js';
import { newId } from './id.js';
import { paymentProvider } from './payments.js';

/* กติกาเงินของการจ้าง อยู่ที่เดียว (routes/consult.ts กับ routes/admin.ts เรียกใช้)

   - จ่ายแล้ว: ผู้ให้บริการยืนยัน → การจ้างเป็น paid → เปิดห้องแชต
   - เสร็จงาน: นักเรียนกด หรือเงียบเกิน RELEASE_DAYS หลังนัด (และไม่ได้แจ้งปัญหา) → completed + ยอดโอนให้เมนเทอร์ (due)
   - แจ้งปัญหา: เงินถูกพัก ระบบไม่ปล่อยเอง จนทีมงานตัดสินโอนให้เมนเทอร์ หรือคืนเงินนักเรียน
   ทุกการเปลี่ยนสถานะล็อกแถวการจ้างก่อน กดซ้ำ กดพร้อมกัน หรือ webhook มาซ้ำจึงได้ผลครั้งเดียว */

export const RELEASE_DAYS = 3;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** ห้องแชตหนึ่งห้องต่อคู่นักเรียนกับเมนเทอร์ จ้างครั้งต่อไปใช้ห้องเดิม */
async function openRoom(tx: Tx, hire: typeof consultations.$inferSelect) {
  // ล็อกแถวเมนเทอร์ก่อนหา/สร้างห้อง กันสองงานของคู่เดียวกันจ่ายพร้อมกันแล้วได้สองห้อง
  await tx.select({ id: mentors.id }).from(mentors).where(eq(mentors.id, hire.mentorId)).for('update');
  const [owner] = await tx.select({ userId: mentorSubmissions.userId, name: mentors.name }).from(mentors)
    .innerJoin(mentorSubmissions, and(eq(mentorSubmissions.publishedMentorId, mentors.id), eq(mentorSubmissions.status, 'published')))
    .where(eq(mentors.id, hire.mentorId)).limit(1);
  if (!owner?.userId) throw new Error('mentor has no account');
  const [existing] = await tx.select({ id: chatRooms.id }).from(chatRooms)
    .where(and(eq(chatRooms.ownerId, hire.userId), eq(chatRooms.mentorId, hire.mentorId))).orderBy(desc(chatRooms.createdAt)).limit(1);
  const room = existing?.id ?? newId('room');
  if (!existing) {
    await tx.insert(chatRooms).values({
      id: room, ownerId: hire.userId, mentorUserId: owner.userId, mentorId: hire.mentorId, competitionId: hire.competitionId,
      title: owner.name, context: hire.note, status: 'active',
    });
  }
  await tx.insert(chatMembers).values([{ roomId: room, userId: hire.userId }, { roomId: room, userId: owner.userId }]).onConflictDoNothing();
  return room;
}

/** บันทึกว่าจ่ายสำเร็จ เรียกจาก webhook หรือหลังถามผู้ให้บริการแล้วว่าจ่ายจริง คืน null ถ้าไม่มีอะไรเปลี่ยน
    เงินที่เข้ามาแต่เปิดงานไม่ได้ (จ่ายซ้ำจากอีกแท็บ งานถูกยกเลิกไปแล้ว หรือยอดไม่ตรง) คืนให้อัตโนมัติ */
export async function markPaid(paymentId: string) {
  const outcome = await db.transaction(async (tx) => {
    const [payment] = await tx.select().from(hirePayments).where(eq(hirePayments.id, paymentId)).for('update');
    if (!payment || payment.status !== 'pending') return null;
    const [hire] = await tx.select().from(consultations).where(eq(consultations.id, payment.hireId)).for('update');
    if (!hire || hire.status !== 'accepted' || hire.price !== payment.amount) {
      await tx.update(hirePayments).set({ status: 'refunded', paidAt: new Date(), refundedAt: new Date() }).where(eq(hirePayments.id, payment.id));
      return { result: { hireId: payment.hireId, roomId: null, opened: false }, refund: payment };
    }
    await tx.update(hirePayments).set({ status: 'paid', paidAt: new Date() }).where(eq(hirePayments.id, payment.id));
    const roomId = await openRoom(tx, hire);
    await tx.update(consultations).set({ status: 'paid', paidAt: new Date(), roomId }).where(eq(consultations.id, hire.id));
    return { result: { hireId: hire.id, roomId, opened: true }, refund: null };
  });
  if (outcome?.refund?.providerRef) await refundAtProvider(outcome.refund);
  return outcome?.result ?? null;
}

async function refundAtProvider(payment: typeof hirePayments.$inferSelect) {
  const provider = paymentProvider();
  if (provider && payment.providerRef && provider.name === payment.provider) await provider.refund(payment.providerRef, payment.amount);
}

/** งานเสร็จ: เปลี่ยนเป็น completed และตั้งยอดโอนให้เมนเทอร์ (ถ้างานนี้มีเงินเข้ามาจริง) */
async function finish(tx: Tx, hire: typeof consultations.$inferSelect) {
  await tx.update(consultations).set({ status: 'completed', completedAt: new Date() }).where(eq(consultations.id, hire.id));
  const [payment] = await tx.select().from(hirePayments)
    .where(and(eq(hirePayments.hireId, hire.id), eq(hirePayments.status, 'paid'))).limit(1);
  if (payment) {
    await tx.insert(mentorPayouts).values({ id: newId('pout'), hireId: hire.id, mentorId: hire.mentorId, amount: payment.amount, status: 'due' })
      .onConflictDoNothing();
  }
}

/** นักเรียนกดเสร็จงาน ได้เฉพาะงานที่จ่ายแล้ว */
export async function completeByMember(hireId: string, userId: string) {
  return db.transaction(async (tx) => {
    const [hire] = await tx.select().from(consultations).where(and(eq(consultations.id, hireId), eq(consultations.userId, userId))).for('update');
    // แจ้งปัญหาแล้วกดเสร็จเองไม่ได้ ต้องรอทีมงานตัดสิน ไม่งั้นเงินที่พักไว้หลุดไปถึงเมนเทอร์ (Astra รีวิว 2 ต.ค. 2569)
    if (!hire || hire.status !== 'paid' || hire.disputedAt) return null;
    await finish(tx, hire);
    return hire;
  });
}

/** นักเรียนแจ้งปัญหา: พักเงินไว้ ระบบจะไม่ปล่อยเองจนทีมงานตัดสิน */
export async function dispute(hireId: string, userId: string, reason: string) {
  const [row] = await db.update(consultations).set({ disputedAt: new Date(), disputeReason: reason })
    .where(and(eq(consultations.id, hireId), eq(consultations.userId, userId), eq(consultations.status, 'paid'), isNull(consultations.disputedAt)))
    .returning();
  return row ?? null;
}

/** ปล่อยเงินงานที่เงียบเกินกำหนด: เวลานัด (หรือเวลาจ่ายถ้าไม่ได้นัด) + ชั่วโมงที่จ้าง + RELEASE_DAYS วัน
    ข้ามงานที่แจ้งปัญหาไว้ เรียกจาก cron วันละครั้ง */
export async function releaseOverdue(now = new Date()) {
  const due = await db.select({ id: consultations.id }).from(consultations).where(and(
    eq(consultations.status, 'paid'), isNull(consultations.disputedAt),
    sql`coalesce(${consultations.preferredAt}, ${consultations.paidAt}) + make_interval(mins => ${consultations.minutes}) + make_interval(days => ${RELEASE_DAYS}) < ${now.toISOString()}::timestamptz`,
  ));
  let released = 0;
  for (const { id } of due) {
    const done = await db.transaction(async (tx) => {
      const [hire] = await tx.select().from(consultations).where(eq(consultations.id, id)).for('update');
      if (!hire || hire.status !== 'paid' || hire.disputedAt) return false;
      await finish(tx, hire);
      return true;
    });
    if (done) released += 1;
  }
  return released;
}

/** ทีมงานตัดสินงานที่แจ้งปัญหา: release = นับว่าเสร็จและโอนให้เมนเทอร์, refund = คืนเงินนักเรียนและยกเลิกงาน */
export async function resolveDispute(hireId: string, decision: 'release' | 'refund', note: string, adminId: string) {
  const outcome = await db.transaction(async (tx) => {
    const [hire] = await tx.select().from(consultations).where(eq(consultations.id, hireId)).for('update');
    if (!hire || hire.status !== 'paid' || !hire.disputedAt) return null;
    if (decision === 'release') {
      await finish(tx, hire);
      await tx.update(mentorPayouts).set({ note, decidedBy: adminId }).where(eq(mentorPayouts.hireId, hire.id));
      return { hire, refund: null };
    }
    const [payment] = await tx.select().from(hirePayments)
      .where(and(eq(hirePayments.hireId, hire.id), eq(hirePayments.status, 'paid'))).for('update');
    await tx.update(consultations).set({ status: 'cancelled', cancelledAt: new Date(), reason: note }).where(eq(consultations.id, hire.id));
    if (payment) await tx.update(hirePayments).set({ status: 'refunded', refundedAt: new Date() }).where(eq(hirePayments.id, payment.id));
    return { hire, refund: payment ?? null };
  });
  // คืนเงินที่ผู้ให้บริการหลังบันทึกในฐานข้อมูลแล้ว ถ้าผู้ให้บริการล้ม ทีมงานเห็นและทำซ้ำได้จากแดชบอร์ดของผู้ให้บริการ
  if (outcome?.refund) await refundAtProvider(outcome.refund);
  return outcome;
}
