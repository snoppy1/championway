import Stripe from 'stripe';
import { and, desc, eq, gt, inArray, isNull, lte, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  billingCustomers, billingRevocations, mentorSubmissions, mentors, risingStarPeriods, risingStarSubscriptions, stripeEvents, users,
} from '../db/schema.js';
import { env } from './env.js';
import { notify } from './email.js';

/* ค่าสมาชิก Rising Star ผ่าน Stripe (เมนเทอร์จ่ายให้ ChampionWays)

   บัตร      Checkout แบบ subscription ต่ออายุเองทุกเดือน ทุก invoice ที่จ่ายแล้ว = หนึ่งช่วงสมาชิก
   PromptPay Stripe ไม่รองรับการตัดเงินซ้ำ จึงเป็น Checkout แบบจ่ายครั้งเดียว ได้หนึ่งเดือน
             ต่อท้ายช่วงที่มีอยู่ และเตือนทางอีเมลก่อนหมด 3 วัน

   หลักความปลอดภัย
   - สมาชิกเกิดจาก webhook ที่ตรวจลายเซ็นแล้วเท่านั้น หน้า "จ่ายสำเร็จ" ของเบราว์เซอร์ไม่มีผลอะไร
   - ราคามาจากเซิร์ฟเวอร์ (price ใน Stripe หรือค่าคงที่ด้านล่าง) ไม่รับจากหน้าเว็บ
   - event id และ invoice/session id เป็น unique ในฐานข้อมูล Stripe ส่งซ้ำกี่ครั้งก็นับครั้งเดียว */

export const MONTH_PRICE_SATANG = 9900;
export const RISING_STAR_KIND = 'rising_star';
export const RISING_STAR_MONTH_KIND = 'rising_star_month';
/** subscription ที่ยังถือว่า "มีอยู่" ห้ามสมัครบัตรซ้ำ */
export const LIVE_SUBSCRIPTION = ['active', 'trialing', 'past_due'];
/** จ่าย PromptPay ล่วงหน้าได้เมื่อเหลือไม่เกินเท่านี้ กันกดซื้อซ้อนกันหลายเดือนโดยไม่ตั้งใจ */
const PREPAY_WINDOW_MS = 7 * 86400_000;
const REMIND_BEFORE_MS = 3 * 86400_000;

let client: Stripe | null = null;
export function stripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

/** เปิดให้สมัครได้เมื่อมีทั้งคีย์ webhook secret และ price รายเดือน */
export const billingEnabled = () => Boolean(
  process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && process.env.STRIPE_RISING_STAR_PRICE);

export function addMonth(date: Date) {
  const next = new Date(date);
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

/** สถานะสมาชิกของเมนเทอร์หนึ่งคน ใช้ทั้งหน้า Rising Star และตอนสร้าง checkout */
export async function membershipOf(mentorId: string, now = new Date()) {
  const [latest] = await db.select({ endsAt: risingStarPeriods.endsAt }).from(risingStarPeriods)
    .where(and(eq(risingStarPeriods.mentorId, mentorId), gt(risingStarPeriods.endsAt, risingStarPeriods.startsAt)))
    .orderBy(desc(risingStarPeriods.endsAt)).limit(1);
  const [subscription] = await db.select().from(risingStarSubscriptions)
    .where(and(eq(risingStarSubscriptions.mentorId, mentorId), inArray(risingStarSubscriptions.status, LIVE_SUBSCRIPTION)))
    .orderBy(desc(risingStarSubscriptions.eventCreated)).limit(1);
  const paidUntil = latest && latest.endsAt > now ? latest.endsAt : null;
  const autoRenew = Boolean(subscription && !subscription.cancelAtPeriodEnd);
  return {
    paidUntil,
    subscription: subscription ? { status: subscription.status, cancelAtPeriodEnd: subscription.cancelAtPeriodEnd } : null,
    canSubscribe: !subscription,
    canPrepay: !autoRenew && (!paidUntil || paidUntil.getTime() - now.getTime() <= PREPAY_WINDOW_MS),
  };
}

/** มีสมัครแบบบัตรอยู่แล้วฝั่ง Stripe (webhook อาจยังมาไม่ถึง) */
export class AlreadySubscribed extends Error {}

const integrationId = () => `rising_star_${Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('')}`;

/* สร้าง checkout ภายใต้ล็อกแถวผู้ใช้ กดพร้อมกันสองแท็บจะได้ customer เดียวและ checkout เดียว
   ก่อนสร้างใหม่ ถาม Stripe ตรง ๆ ว่ามี checkout ที่ยังเปิดอยู่หรือ subscription ที่ยังมีชีวิตไหม
   เพราะตารางของเราอัปเดตจาก webhook ซึ่งอาจมาช้า (Astra รีวิว 3 ต.ค. 2569: กันสมัครบัตรซ้อนสองรายการ) */
export async function createCheckout(input: {
  method: 'card' | 'promptpay'; mentorId: string; user: { id: string; email: string; name: string };
}) {
  const api = stripe()!;
  const metadata = { mentorId: input.mentorId, userId: input.user.id };
  const urls = { success_url: `${env.appOrigin}/mentors?joined=1`, cancel_url: `${env.appOrigin}/mentors` };
  const priceId = process.env.STRIPE_RISING_STAR_PRICE!;
  const kind = input.method === 'card' ? RISING_STAR_KIND : RISING_STAR_MONTH_KIND;

  return db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, input.user.id)).for('update');
    let [row] = await tx.select().from(billingCustomers).where(eq(billingCustomers.userId, input.user.id));
    if (!row) {
      const customer = await api.customers.create(
        { email: input.user.email, name: input.user.name, metadata: { userId: input.user.id } },
        { idempotencyKey: `customer-${input.user.id}` },
      );
      [row] = await tx.insert(billingCustomers).values({ userId: input.user.id, customerId: customer.id }).returning();
    }
    const customer = row.customerId;

    /* ดู checkout ที่เปิดอยู่ก่อน แล้วค่อยดู subscription ลำดับนี้ปิดช่องว่าง: checkout ที่จ่ายเสร็จหลังจากเราดูรายการแรก
       จะมี subscription ให้เห็นในรายการที่สอง (Astra รีวิว 3 ต.ค. 2569)
       checkout แบบเดียวกันที่ยังเปิดอยู่ ใช้ลิงก์เดิม ไม่สร้างใหม่ซ้อน */
    const open = await api.checkout.sessions.list({ customer, status: 'open', limit: 20 });
    const reuse = open.data.find((session) => session.metadata?.kind === kind && session.metadata?.mentorId === input.mentorId && session.url);
    if (reuse) return reuse;
    const subscriptions = await api.subscriptions.list({ customer, status: 'all', limit: 20 });
    if (subscriptions.data.some((sub) => sub.metadata?.kind === RISING_STAR_KIND && [...LIVE_SUBSCRIPTION, 'incomplete'].includes(sub.status)
      && (input.method === 'card' || !sub.cancel_at_period_end))) {
      throw new AlreadySubscribed();
    }

    if (input.method === 'card') {
      // ยังมีเวลาที่จ่ายด้วย PromptPay เหลืออยู่ เริ่มตัดบัตรเมื่อเวลานั้นหมด ไม่ให้จ่ายซ้อน (Checkout ต้องการอย่างน้อย 48 ชม.)
      const { paidUntil } = await membershipOf(input.mentorId);
      const trialEnd = paidUntil && paidUntil.getTime() - Date.now() > 49 * 3600_000 ? Math.floor(paidUntil.getTime() / 1000) : undefined;
      return api.checkout.sessions.create({
        mode: 'subscription', customer, client_reference_id: input.mentorId,
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: { ...metadata, kind },
        subscription_data: { metadata: { ...metadata, kind }, ...(trialEnd ? { trial_end: trialEnd } : {}) },
        integration_identifier: integrationId(),
        ...urls,
      });
    }
    const price = await api.prices.retrieve(priceId);
    return api.checkout.sessions.create({
      mode: 'payment', customer, client_reference_id: input.mentorId,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'thb', unit_amount: MONTH_PRICE_SATANG,
          product: typeof price.product === 'string' ? price.product : price.product.id,
        },
      }],
      metadata: { ...metadata, kind },
      payment_intent_data: { metadata: { ...metadata, kind } },
      integration_identifier: integrationId(),
      ...urls,
    });
  });
}

export async function portalUrl(userId: string) {
  const [row] = await db.select().from(billingCustomers).where(eq(billingCustomers.userId, userId));
  if (!row) return null;
  const session = await stripe()!.billingPortal.sessions.create({ customer: row.customerId, return_url: `${env.appOrigin}/mentors` });
  return session.url;
}

/* ---------- webhook ---------- */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function mentorExists(tx: Tx, mentorId: string | undefined) {
  if (!mentorId) return false;
  // ล็อกแถวเมนเทอร์ event ของคนเดียวกันที่มาพร้อมกันจะต่อช่วงตามลำดับ ไม่ซ้อนกัน
  const [row] = await tx.select({ id: mentors.id }).from(mentors).where(eq(mentors.id, mentorId)).for('update');
  return Boolean(row);
}

/** PaymentIntent ของ invoice webhook ไม่แนบ payments มาเสมอ ถ้าไม่มีให้ถาม Stripe */
async function invoicePaymentRef(invoice: Stripe.Invoice) {
  const pick = (rows: Stripe.InvoicePayment[] | undefined) => {
    const ref = rows?.find((row) => row.payment.type === 'payment_intent')?.payment.payment_intent;
    return typeof ref === 'string' ? ref : ref?.id ?? null;
  };
  const inline = pick(invoice.payments?.data);
  if (inline || !invoice.id) return inline;
  const listed = await stripe()!.invoicePayments.list({ invoice: invoice.id, limit: 5 });
  return pick(listed.data);
}

/* ให้สมาชิกกับคืนเงินของเงินก้อนเดียวกันต้องเข้าคิวกัน ไม่งั้นฝั่งให้สมาชิกอาจอ่าน "ยังไม่คืน"
   ก่อนฝั่งคืนเงินจะบันทึก แล้วสร้างช่วงหลังฝั่งคืนเงินหาช่วงไม่เจอ (Astra รีวิว 4 ต.ค. 2569)
   ล็อกนี้ปลดเองเมื่อธุรกรรมจบ */
const lockPayment = (tx: Tx, paymentRef: string) => tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`pay:${paymentRef}`}))`);

/** ล็อกเงินก้อนนี้แล้วดูว่าถูกคืนไปแล้วหรือยัง ต้องเรียกก่อนสร้างช่วงทุกครั้ง */
async function revoked(tx: Tx, paymentRef: string | null) {
  if (!paymentRef) return false;
  await lockPayment(tx, paymentRef);
  const [row] = await tx.select({ ref: billingRevocations.paymentRef }).from(billingRevocations).where(eq(billingRevocations.paymentRef, paymentRef));
  return Boolean(row);
}

async function onInvoicePaid(tx: Tx, invoice: Stripe.Invoice) {
  const details = invoice.parent?.subscription_details;
  if (!details || details.metadata?.kind !== RISING_STAR_KIND) return 'ignored';
  if (invoice.amount_paid <= 0) return 'ignored'; // ช่วงทดลอง (ใช้เวลา PromptPay ที่เหลือ) ไม่ใช่เดือนใหม่
  const mentorId = details.metadata.mentorId;
  if (!await mentorExists(tx, mentorId)) return 'ignored';
  // ต้องเป็น price ของ Rising Star เป็นเงินบาท ถ้าวันหน้ามีแผนอื่นในหน้าจัดการของ Stripe จะไม่ได้สมาชิกโดยบังเอิญ (Astra รีวิว 3 ต.ค. 2569)
  if (invoice.currency !== 'thb') return 'ignored';
  const priceOf = (item: Stripe.InvoiceLineItem) => {
    const price = item.pricing?.price_details?.price;
    return typeof price === 'string' ? price : price?.id;
  };
  const line = invoice.lines.data.find((item) => priceOf(item) === process.env.STRIPE_RISING_STAR_PRICE);
  if (!line) return 'ignored';
  const paymentRef = await invoicePaymentRef(invoice);
  if (await revoked(tx, paymentRef)) return 'revoked';
  await tx.insert(risingStarPeriods).values({
    id: `rsp_${invoice.id}`, mentorId,
    startsAt: new Date(line.period.start * 1000), endsAt: new Date(line.period.end * 1000),
    source: 'stripe', externalId: invoice.id, paymentRef,
  }).onConflictDoNothing();
  return 'period';
}

async function onMonthPaid(tx: Tx, session: Stripe.Checkout.Session) {
  if (session.mode !== 'payment' || session.metadata?.kind !== RISING_STAR_MONTH_KIND) return 'ignored';
  if (session.payment_status !== 'paid') return 'pending'; // PromptPay ยืนยันทีหลังผ่าน async_payment_succeeded
  if (session.amount_total !== MONTH_PRICE_SATANG || session.currency !== 'thb') return 'ignored';
  const mentorId = session.metadata.mentorId;
  if (!await mentorExists(tx, mentorId)) return 'ignored';
  const [already] = await tx.select({ id: risingStarPeriods.id }).from(risingStarPeriods).where(eq(risingStarPeriods.externalId, session.id));
  if (already) return 'duplicate';
  const paymentRef = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null;
  if (await revoked(tx, paymentRef)) return 'revoked';
  const now = new Date();
  const [latest] = await tx.select({ endsAt: risingStarPeriods.endsAt }).from(risingStarPeriods)
    .where(and(eq(risingStarPeriods.mentorId, mentorId), gt(risingStarPeriods.endsAt, risingStarPeriods.startsAt)))
    .orderBy(desc(risingStarPeriods.endsAt)).limit(1);
  const startsAt = latest && latest.endsAt > now ? latest.endsAt : now;
  await tx.insert(risingStarPeriods).values({
    id: `rsp_${session.id}`, mentorId, startsAt, endsAt: addMonth(startsAt), source: 'stripe', externalId: session.id, paymentRef,
  }).onConflictDoNothing();
  return 'period';
}

async function onSubscription(tx: Tx, subscription: Stripe.Subscription, eventCreated: number) {
  if (subscription.metadata?.kind !== RISING_STAR_KIND) return 'ignored';
  const mentorId = subscription.metadata.mentorId;
  if (!await mentorExists(tx, mentorId)) return 'ignored';
  const values = {
    id: subscription.id, mentorId, status: subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end || Boolean(subscription.cancel_at), eventCreated, updatedAt: new Date(),
  };
  /* event มาไม่เรียงลำดับได้ อันที่เก่ากว่าห้ามทับสถานะใหม่ ถ้าเวลาเท่ากัน (วินาทีเดียวกัน) ให้สถานะที่ "ปิดกว่า" ชนะ
     จบแล้ว (canceled ฯลฯ) > ตั้งยกเลิกปลายรอบ > ยังต่ออายุ ไม่ให้ snapshot ที่มาช้ากลับไปเปิดสิ่งที่ปิดแล้ว (Astra รีวิว 3 ต.ค. 2569) */
  const closed = ['canceled', 'incomplete_expired', 'unpaid'];
  const rank = (status: string, ending: boolean) => (closed.includes(status) ? 3 : ending ? 2 : 1);
  const storedRank = sql`case when ${risingStarSubscriptions.status} in ('canceled', 'incomplete_expired', 'unpaid') then 3
    when ${risingStarSubscriptions.cancelAtPeriodEnd} then 2 else 1 end`;
  await tx.insert(risingStarSubscriptions).values(values).onConflictDoUpdate({
    target: risingStarSubscriptions.id,
    set: { status: values.status, cancelAtPeriodEnd: values.cancelAtPeriodEnd, eventCreated, updatedAt: values.updatedAt },
    setWhere: sql`${risingStarSubscriptions.eventCreated} < ${eventCreated}
      or (${risingStarSubscriptions.eventCreated} = ${eventCreated} and ${rank(values.status, values.cancelAtPeriodEnd)} >= ${storedRank})`,
  });
  return 'subscription';
}

/* คืนเงินเต็มจำนวนหรือถูก dispute: ช่วงที่จ่ายด้วยเงินก้อนนั้นสิ้นสุดทันที (ช่วงอนาคตกลายเป็นศูนย์วัน)
   หาช่วงจาก PaymentIntent ที่เก็บไว้ตอนให้สมาชิก และจดไว้ว่าเงินก้อนนี้ถูกคืนแล้ว
   ถ้า event คืนเงินมาก่อน event จ่ายเงิน ตอนจ่ายจะเห็นบันทึกนี้และไม่ให้สมาชิก */
async function revoke(tx: Tx, paymentIntent: string | Stripe.PaymentIntent | null, reason: string) {
  const ref = typeof paymentIntent === 'string' ? paymentIntent : paymentIntent?.id;
  if (!ref) return 'ignored';
  await lockPayment(tx, ref);
  await tx.insert(billingRevocations).values({ paymentRef: ref, reason }).onConflictDoNothing();
  const now = new Date();
  const end = sql`greatest(${risingStarPeriods.startsAt}, least(${risingStarPeriods.endsAt}, ${now.toISOString()}::timestamptz))`;
  const rows = await tx.update(risingStarPeriods).set({ endsAt: end }).where(eq(risingStarPeriods.paymentRef, ref)).returning({ id: risingStarPeriods.id });
  return rows.length ? 'revoked' : 'ignored';
}

/** ตรวจลายเซ็นแล้วประมวลผล คืน null เมื่อลายเซ็นไม่ผ่าน */
export async function handleWebhook(payload: string, signature: string | undefined) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const api = stripe();
  if (!secret || !api || !signature) return null;
  let event: Stripe.Event;
  try {
    event = await api.webhooks.constructEventAsync(payload, signature, secret);
  } catch {
    return null;
  }
  // event id กับผลลัพธ์อยู่ในธุรกรรมเดียวกัน พังกลางทางจะไม่ถูกบันทึกว่าทำแล้ว Stripe ส่งซ้ำแล้วทำใหม่ได้
  return db.transaction(async (tx) => {
    const inserted = await tx.insert(stripeEvents).values({ id: event.id, type: event.type }).onConflictDoNothing().returning();
    if (!inserted.length) return 'duplicate';
    switch (event.type) {
      case 'invoice.paid':
        return onInvoicePaid(tx, event.data.object);
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        return onMonthPaid(tx, event.data.object);
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        return onSubscription(tx, event.data.object, event.created);
      case 'charge.refunded':
        // คืนบางส่วนไม่ยกเลิกสมาชิก
        return event.data.object.refunded ? revoke(tx, event.data.object.payment_intent, 'refund') : 'ignored';
      case 'charge.dispute.created':
        return revoke(tx, event.data.object.payment_intent, 'dispute');
      default:
        return 'ignored';
    }
  });
}

/* ---------- เตือน PromptPay ใกล้หมด ---------- */

/** ช่วงที่จ่ายด้วย PromptPay (checkout session) ใกล้หมดใน 3 วัน ยังไม่มีช่วงต่อ และไม่มีบัตรต่ออายุเอง เตือนครั้งเดียว */
export async function remindExpiring(now = new Date()) {
  const due = await db.select({ id: risingStarPeriods.id, mentorId: risingStarPeriods.mentorId, endsAt: risingStarPeriods.endsAt })
    .from(risingStarPeriods)
    .where(and(
      eq(risingStarPeriods.source, 'stripe'), sql`${risingStarPeriods.externalId} like 'cs_%'`, isNull(risingStarPeriods.remindedAt),
      gt(risingStarPeriods.endsAt, now), lte(risingStarPeriods.endsAt, new Date(now.getTime() + REMIND_BEFORE_MS)),
    ));
  let sent = 0;
  for (const period of due) {
    const state = await membershipOf(period.mentorId, now);
    if (!state.paidUntil || state.paidUntil.getTime() !== period.endsAt.getTime() || state.subscription) continue;
    // จองการเตือนก่อนส่ง cron สองตัวทับกันจะส่งแค่ฉบับเดียว
    const [claimed] = await db.update(risingStarPeriods).set({ remindedAt: now })
      .where(and(eq(risingStarPeriods.id, period.id), isNull(risingStarPeriods.remindedAt))).returning({ id: risingStarPeriods.id });
    if (!claimed) continue;
    const [owner] = await db.select({ email: users.email }).from(mentorSubmissions)
      .innerJoin(users, eq(users.id, mentorSubmissions.userId))
      .where(and(eq(mentorSubmissions.publishedMentorId, period.mentorId), eq(mentorSubmissions.status, 'published'))).limit(1);
    if (!owner) continue;
    const date = period.endsAt.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'long' });
    const dateEn = period.endsAt.toLocaleDateString('en-GB', { timeZone: 'Asia/Bangkok', dateStyle: 'long' });
    await notify(owner.email, 'Rising Star ของคุณใกล้หมดแล้ว / Your Rising Star membership ends soon',
      `สมาชิก Rising Star ของคุณใช้ได้ถึง ${date} ต่ออีกเดือนด้วย PromptPay หรือสมัครแบบตัดบัตรอัตโนมัติได้ที่หน้านี้\n`
      + `Your Rising Star membership runs until ${dateEn}. Renew for another month with PromptPay, or switch to automatic card billing:\n\n`
      + `${env.appOrigin}/mentors`);
    sent++;
  }
  return sent;
}
