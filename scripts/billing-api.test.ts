import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { asc, desc, eq, inArray, like } from 'drizzle-orm';
import Stripe from 'stripe';
import { app } from '../server/app';
import { db, client } from '../server/db/client';
import {
  billingRevocations, emailLog, mentorSubmissions, mentors, risingStarPeriods, risingStarSubscriptions, sessions, stripeEvents, users,
} from '../server/db/schema';
import { testDatabase } from '../server/lib/database-safety';
import { createSession } from '../server/lib/session';
import { env } from '../server/lib/env';
import { addMonth, membershipOf, remindExpiring } from '../server/lib/billing';

/* ค่าสมาชิก Rising Star ผ่าน Stripe: ทุกอย่างเกิดจาก webhook ที่เซ็นแล้วเท่านั้น
   เทสนี้ไม่ออกอินเทอร์เน็ต เซ็น payload เองด้วย secret ทดสอบ */

testDatabase(process.env);
process.env.STRIPE_SECRET_KEY = 'sk_test_offline';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_offline';
process.env.STRIPE_RISING_STAR_PRICE = 'price_test_offline';

const prefix = `bill-${randomUUID().slice(0, 8)}`;
const userIds: string[] = [];
const eventIds: string[] = [];
const signer = new Stripe('sk_test_offline');

async function account() {
  const id = `${prefix}-u${userIds.length}`;
  await db.insert(users).values({ id, email: `${id}@championways.test`, name: `ผู้ใช้${userIds.length}`, role: 'member', emailVerifiedAt: new Date() });
  userIds.push(id);
  return { id, email: `${id}@championways.test`, cookie: `cw_session=${(await createSession(id)).id}` };
}
const post = (path: string, cookie = '', body: unknown = {}, origin: string | null = env.appOrigin) => app.request(`/api${path}`, {
  method: 'POST', body: JSON.stringify(body),
  headers: { cookie, 'content-type': 'application/json', ...(origin ? { origin } : {}) },
});

let seq = 0;
async function send(type: string, object: Record<string, unknown>, opts: { id?: string; created?: number; secret?: string } = {}) {
  const id = opts.id ?? `evt_${prefix}_${seq++}`;
  eventIds.push(id);
  const payload = JSON.stringify({ id, object: 'event', type, created: opts.created ?? Math.floor(Date.now() / 1000), data: { object } });
  const header = signer.webhooks.generateTestHeaderString({ payload, secret: opts.secret ?? 'whsec_test_offline' });
  const response = await app.request('/api/billing/stripe-webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': header } });
  return { status: response.status, body: await response.json() };
}
const periodsOf = (mentorId: string) => db.select().from(risingStarPeriods).where(eq(risingStarPeriods.mentorId, mentorId)).orderBy(asc(risingStarPeriods.startsAt));

test('Rising Star billing through signed Stripe webhooks', async (t) => {
  const owner = await account();
  const stranger = await account();
  const mentorId = `${prefix}-mentor`;
  await db.insert(mentors).values({ id: mentorId, name: 'พี่บิล ท.', avatar: 'บ', bio: 'ทดสอบ', replyTime: '1 วัน', topics: [], best: 'ทดสอบ', cannot: 'ทดสอบ', price: 500, minutes: 60 });
  await db.insert(mentorSubmissions).values({
    id: `${mentorId}-ms`, status: 'published', userId: owner.id, publishedMentorId: mentorId, firstName: 'บิล', lastName: 'ท', nickname: 'บ',
    email: owner.email, phone: '', occupation: 'working', organization: 'ทดสอบ', role: 'ทดสอบ', experience: 'ทดสอบ', best: 'ทดสอบ', cannot: 'ทดสอบ', topics: [],
  });
  const meta = { mentorId, userId: owner.id, kind: 'rising_star' };
  const now = Math.floor(Date.now() / 1000);

  try {
    await t.test('unsigned or wrongly signed webhooks change nothing', async () => {
      const bad = await app.request('/api/billing/stripe-webhook', { method: 'POST', body: '{}', headers: { 'stripe-signature': 't=1,v1=abc' } });
      assert.equal(bad.status, 400);
      assert.equal((await send('invoice.paid', {}, { secret: 'whsec_wrong' })).status, 400);
      assert.equal((await periodsOf(mentorId)).length, 0);
    });

    await t.test('checkout needs our origin and an approved mentor', async () => {
      assert.equal((await post('/billing/rising-star/checkout', owner.cookie, { method: 'card' }, null)).status, 403);
      assert.equal((await post('/billing/rising-star/checkout', owner.cookie, { method: 'card' }, 'https://evil.example')).status, 403);
      assert.equal((await post('/billing/rising-star/checkout', stranger.cookie, { method: 'card' })).status, 403);
      assert.equal((await post('/billing/rising-star/checkout', owner.cookie, { method: 'cash' })).status, 400);
      assert.equal((await post('/billing/rising-star/checkout', '', { method: 'card' })).status, 401);
    });

    await t.test('a paid card invoice adds exactly one period, however many times Stripe sends it', async () => {
      const sub = { id: `sub_${prefix}`, object: 'subscription', status: 'active', cancel_at_period_end: false, cancel_at: null, metadata: meta };
      assert.equal((await send('customer.subscription.created', sub, { created: now })).body.result, 'subscription');
      const invoice = {
        id: `in_${prefix}_1`, object: 'invoice', amount_paid: 9900, currency: 'thb',
        payments: { data: [{ payment: { type: 'payment_intent', payment_intent: `pi_${prefix}_inv1` } }] },
        parent: { type: 'subscription_details', subscription_details: { subscription: sub.id, metadata: meta } },
        lines: { data: [{ period: { start: now, end: now + 30 * 86400 }, pricing: { type: 'price_details', price_details: { price: 'price_test_offline', product: 'prod_x' } } }] },
      };
      // price อื่นหรือสกุลเงินอื่นไม่ได้สมาชิก
      const other = { ...invoice, id: `in_${prefix}_other`, lines: { data: [{ ...invoice.lines.data[0], pricing: { type: 'price_details', price_details: { price: 'price_cheap', product: 'prod_x' } } }] } };
      assert.equal((await send('invoice.paid', other)).body.result, 'ignored');
      assert.equal((await send('invoice.paid', { ...invoice, id: `in_${prefix}_usd`, currency: 'usd' })).body.result, 'ignored');
      const first = await send('invoice.paid', invoice, { id: `evt_${prefix}_inv` });
      assert.equal(first.body.result, 'period');
      assert.equal((await send('invoice.paid', invoice, { id: `evt_${prefix}_inv` })).body.result, 'duplicate');
      assert.equal((await send('invoice.paid', invoice)).body.result, 'period'); // event ใหม่ invoice เดิม
      const rows = await periodsOf(mentorId);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].endsAt.getTime(), (now + 30 * 86400) * 1000);
      const state = await membershipOf(mentorId);
      assert.deepEqual([state.canSubscribe, state.canPrepay], [false, false]);
      // สมัครบัตรซ้ำไม่ได้ และต่อด้วย PromptPay ไม่ได้ระหว่างที่บัตรต่ออายุเอง (ตอบก่อนเรียก Stripe)
      assert.equal((await post('/billing/rising-star/checkout', owner.cookie, { method: 'card' })).status, 409);
      assert.equal((await post('/billing/rising-star/checkout', owner.cookie, { method: 'promptpay' })).status, 409);
    });

    await t.test('the Rising Star page shows the mentor their billing state', async () => {
      const page = await (await app.request('/api/rising-star', { headers: { cookie: owner.cookie } })).json();
      assert.equal(page.viewer.active, true);
      assert.deepEqual(page.viewer.billing.subscription, { status: 'active', cancelAtPeriodEnd: false });
    });

    await t.test('an older subscription event never overwrites a newer one; cancelling allows PromptPay again', async () => {
      const sub = { id: `sub_${prefix}`, object: 'subscription', cancel_at: null, metadata: meta };
      await send('customer.subscription.updated', { ...sub, status: 'canceled', cancel_at_period_end: false }, { created: now + 100 });
      await send('customer.subscription.updated', { ...sub, status: 'active', cancel_at_period_end: false }, { created: now + 50 });
      // วินาทีเดียวกัน: snapshot ที่ยังเปิดอยู่ห้ามทับอันที่ยกเลิกแล้ว
      await send('customer.subscription.updated', { ...sub, status: 'active', cancel_at_period_end: false }, { created: now + 100 });
      await send('customer.subscription.updated', { ...sub, status: 'active', cancel_at_period_end: true }, { created: now + 100 });
      const [row] = await db.select().from(risingStarSubscriptions).where(eq(risingStarSubscriptions.id, sub.id));
      assert.equal(row.status, 'canceled');
      const state = await membershipOf(mentorId);
      assert.equal(state.canSubscribe, true);
      assert.equal(state.canPrepay, false); // ยังเหลือเกิน 7 วัน
    });

    await t.test('PromptPay months start after the current period and count once', async () => {
      const session = {
        id: `cs_${prefix}_1`, object: 'checkout.session', mode: 'payment', payment_status: 'unpaid', amount_total: 9900, currency: 'thb',
        payment_intent: `pi_${prefix}_1`,
        metadata: { mentorId, userId: owner.id, kind: 'rising_star_month' },
      };
      assert.equal((await send('checkout.session.completed', session)).body.result, 'pending');
      assert.equal((await send('checkout.session.async_payment_succeeded', { ...session, payment_status: 'paid' })).body.result, 'period');
      assert.equal((await send('checkout.session.async_payment_succeeded', { ...session, payment_status: 'paid' })).body.result, 'duplicate');
      assert.equal((await send('checkout.session.completed', { ...session, id: `cs_${prefix}_cheap`, payment_status: 'paid', amount_total: 100 })).body.result, 'ignored');
      const rows = await periodsOf(mentorId);
      assert.equal(rows.length, 2);
      assert.equal(rows[1].startsAt.getTime(), rows[0].endsAt.getTime());
      assert.equal(rows[1].endsAt.getTime(), addMonth(rows[0].endsAt).getTime());
    });

    await t.test('a PromptPay month about to end sends one reminder', async () => {
      const soon = new Date(Date.now() + 2 * 86400000);
      await db.update(risingStarPeriods).set({ endsAt: new Date(Date.now() - 1000) }).where(eq(risingStarPeriods.externalId, `in_${prefix}_1`));
      await db.update(risingStarPeriods).set({ startsAt: new Date(Date.now() - 1000), endsAt: soon }).where(eq(risingStarPeriods.externalId, `cs_${prefix}_1`));
      assert.equal(await remindExpiring(), 1);
      assert.equal(await remindExpiring(), 0);
      const [mail] = await db.select().from(emailLog).where(eq(emailLog.to, owner.email)).orderBy(desc(emailLog.sentAt)).limit(1);
      assert.match(mail.body, /\/mentors/);
      assert.equal((await membershipOf(mentorId)).canPrepay, true);
    });

    await t.test('a full refund or a dispute ends the period it paid for; a partial refund does not', async () => {
      const ref = `pi_${prefix}_1`;
      assert.equal((await send('charge.refunded', { id: 'ch_1', object: 'charge', refunded: false, payment_intent: ref })).body.result, 'ignored');
      const before = (await db.select().from(risingStarPeriods).where(eq(risingStarPeriods.paymentRef, ref)))[0];
      assert.ok(before.endsAt > new Date());
      const disputed = await send('charge.dispute.created', { id: 'dp_1', object: 'dispute', payment_intent: ref });
      assert.equal(disputed.body.result, 'revoked', JSON.stringify(disputed));
      const after = (await db.select().from(risingStarPeriods).where(eq(risingStarPeriods.paymentRef, ref)))[0];
      assert.ok(after.endsAt <= new Date() && after.endsAt >= after.startsAt);
      assert.equal((await membershipOf(mentorId)).paidUntil, null);
    });

    await t.test('a refund that arrives before the payment event means that payment never grants a month', async () => {
      assert.equal((await send('charge.dispute.created', { id: 'dp_2', object: 'dispute', payment_intent: `pi_${prefix}_early` })).body.result, 'ignored');
      const session = {
        id: `cs_${prefix}_early`, object: 'checkout.session', mode: 'payment', payment_status: 'paid', amount_total: 9900, currency: 'thb',
        payment_intent: `pi_${prefix}_early`, metadata: { mentorId, userId: owner.id, kind: 'rising_star_month' },
      };
      assert.equal((await send('checkout.session.completed', session)).body.result, 'revoked');
      assert.equal((await db.select().from(risingStarPeriods).where(eq(risingStarPeriods.externalId, session.id))).length, 0);
    });

    await t.test('refunding a month that has not started yet leaves zero days, which never count as paid', async () => {
      const start = new Date(Date.now() + 10 * 86400000);
      await db.insert(risingStarPeriods).values({
        id: `rsp_${prefix}_future`, mentorId, startsAt: start, endsAt: addMonth(start), source: 'stripe', externalId: `cs_${prefix}_future`, paymentRef: `pi_${prefix}_future`,
      });
      assert.ok((await membershipOf(mentorId)).paidUntil);
      assert.equal((await send('charge.refunded', { id: 'ch_2', object: 'charge', refunded: true, payment_intent: `pi_${prefix}_future` })).body.result, 'revoked');
      const [row] = await db.select().from(risingStarPeriods).where(eq(risingStarPeriods.id, `rsp_${prefix}_future`));
      assert.equal(row.endsAt.getTime(), row.startsAt.getTime());
      assert.equal((await membershipOf(mentorId)).paidUntil, null);
    });

    await t.test('addMonth keeps the day and clamps to the end of short months', () => {
      assert.equal(addMonth(new Date('2026-01-31T05:00:00Z')).toISOString(), '2026-02-28T05:00:00.000Z');
      assert.equal(addMonth(new Date('2026-12-15T00:00:00Z')).toISOString(), '2027-01-15T00:00:00.000Z');
    });
  } finally {
    await db.delete(stripeEvents).where(inArray(stripeEvents.id, eventIds));
    await db.delete(billingRevocations).where(like(billingRevocations.paymentRef, `pi_${prefix}%`));
    await db.delete(risingStarSubscriptions).where(eq(risingStarSubscriptions.mentorId, mentorId));
    await db.delete(risingStarPeriods).where(eq(risingStarPeriods.mentorId, mentorId));
    await db.delete(mentorSubmissions).where(eq(mentorSubmissions.id, `${mentorId}-ms`));
    await db.delete(mentors).where(eq(mentors.id, mentorId));
    await db.delete(emailLog).where(inArray(emailLog.to, userIds.map((id) => `${id}@championways.test`)));
    await db.delete(sessions).where(inArray(sessions.userId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
    await client.end();
  }
});
