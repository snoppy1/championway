/* ตรวจความพร้อมทั้งเส้นทางบนเว็บ dev จริง (https://dev.championways.space) ด้วยเบราว์เซอร์
   สมัครเมนเทอร์ → admin เผยแพร่ → Mentor zone → Rising Star (PromptPay ของ Stripe Sandbox) → หน้าเวที (ป้ายผลงาน)
   → นักเรียนติดต่อ → เมนเทอร์ยืนยัน → รีวิว → คำขอเพิ่มเวที → หน้าตั้งค่าการแจ้งเตือน แล้วลบข้อมูลทดสอบออก
   ใช้ฐานข้อมูล dev จาก .env.local และอีเมลทดสอบของ Resend (delivered+...@resend.dev) ไม่เด้งกลับ ไม่กระทบชื่อเสียงโดเมน
   admin ทุกคนบน dev จะได้อีเมลแจ้งเตือนจริงตามที่ตั้งไว้ในหน้าจัดการ
   รัน: OUT=<โฟลเดอร์เก็บภาพ> npx tsx scripts/e2e-dev.mts   (ห้ามชี้ไปที่ Production) */
import { chromium } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { and, desc, eq, inArray, like } from 'drizzle-orm';
import { db, client } from '../server/db/client.ts';
import {
  billingCustomers, consultationConfirmTokens, consultations, emailLog, emailVerifications, mentorAwards, mentorCompetitionChoices,
  mentorExperiences, mentorReviews, mentorSubmissions, mentors, reviewEvents, risingStarPeriods, sessions, staffAlerts, users,
} from '../server/db/schema.ts';
import { createSession } from '../server/lib/session.ts';

const BASE = 'https://dev.championways.space';

const OUT = process.env.OUT!;
const tag = randomBytes(3).toString('hex');
const results: { step: string; ok: boolean; note: string }[] = [];
const ids = { users: [] as string[], submission: '', mentor: '' };

async function account(role: 'member' | 'admin', label: string, verified: boolean) {
  const id = `e2e-${tag}-${label}`;
  const email = `delivered+e2e-${tag}-${label}@resend.dev`;
  await db.insert(users).values({ id, email, name: label === 'student' ? 'นักเรียน ทดสอบ' : `E2E ${label}`, role, emailVerifiedAt: verified ? new Date() : null });
  ids.users.push(id);
  return { id, email, session: (await createSession(id)).id };
}
async function ctxFor(browser: Awaited<ReturnType<typeof chromium.launch>>, session: string, width = 1280): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('cw-lang', 'th'); } catch { /* */ } });
  await ctx.addCookies([{ name: 'cw_session', value: session, domain: 'dev.championways.space', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]);
  return ctx;
}
async function step(name: string, fn: () => Promise<string | void>) {
  try {
    const note = await fn();
    results.push({ step: name, ok: true, note: note ?? '' });
    console.log('PASS', name, note ?? '');
  } catch (error) {
    for (const [i, pg] of openPages.entries()) await pg.screenshot({ path: `${OUT}/e2e-fail-${name.split(' ')[0]}-${i}.png` }).catch(() => {});
    results.push({ step: name, ok: false, note: String(error instanceof Error ? error.message : error).slice(0, 300) });
    console.log('FAIL', name, String(error).slice(0, 300));
  }
}
const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/e2e-${name}.png`, fullPage: false });
const openPages: Page[] = [];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ channel: 'msedge' });
const applicant = await account('member', 'mentor', true);
const admin = await account('admin', 'admin', true);
const student = await account('member', 'student', false);

try {
  // ใช้เวทีแรกที่มีหน้าบนเว็บและยังเปิดรับ (รายการเดียวกับที่ใบสมัครใช้)
  const open = await (await fetch(`${BASE}/api/consult/open-competitions`)).json() as { items: { slug: string; name: string }[] };
  const competitionName = open.items[0].name;
  const competitionSlug = open.items[0].slug;
  console.log('competition', competitionSlug, competitionName);

  // ---------- 1. สมัครเมนเทอร์ ----------
  const mctx = await ctxFor(browser, applicant.session);
  const m = await mctx.newPage(); openPages.push(m);
  await step('1 สมัครเมนเทอร์ (4 ขั้น)', async () => {
    await m.goto(`${BASE}/mentors/apply`);
    await m.fill('#apply-first', 'สมชาย'); await m.fill('#apply-last', 'ทดสอบระบบ'); await m.fill('#apply-nickname', 'ชาย');
    await m.fill('#apply-email', applicant.email);
    await m.selectOption('#apply-occupation', { index: 2 }); await m.fill('#apply-organization', 'มหาวิทยาลัยทดสอบ'); await m.fill('#apply-role', 'วิศวกร');
    await m.getByRole('button', { name: 'ถัดไป', exact: true }).click();
    await m.fill('#apply-experience', 'เคยแข่ง AI for Good และเวทีอื่น ๆ หลายรายการ');
    await m.getByRole('button', { name: '+ เพิ่มเวทีที่เคยแข่ง' }).click();
    let card = m.locator('.exp').last();
    await card.getByLabel('ชื่อเวที *').fill(competitionName);
    await card.locator('.exp-match.is-known').waitFor();
    await card.locator('.offer-mode__option').filter({ hasText: 'ได้รางวัล' }).click();
    await card.getByLabel('ปี พ.ศ. *').fill('2567');
    await card.getByLabel(/ลิงก์ประกาศผล/).fill('https://example.com/results-2567');
    await card.getByRole('checkbox', { name: /อยากเป็นเมนเทอร์ของเวทีนี้/ }).check();
    await m.getByRole('button', { name: '+ เพิ่มเวทีที่เคยแข่ง' }).click();
    card = m.locator('.exp').last();
    await card.getByLabel('ชื่อเวที *').fill('เวทีนอกระบบ E2E');
    await card.locator('.offer-mode__option').filter({ hasText: 'เข้าร่วม' }).click();
    await card.getByLabel('ปี พ.ศ. *').fill('2566');
    await card.getByLabel(/ลิงก์ประกาศผล/).fill('https://example.com/other');
    await m.getByRole('button', { name: 'ถัดไป', exact: true }).click();
    await m.fill('#apply-best', 'ช่วยตีโจทย์และซ้อมพิทช์'); await m.fill('#apply-cannot', 'ไม่ทำงานส่งแทน');
    await m.locator('.topic input').nth(0).check(); await m.locator('.topic input').nth(1).check();
    await m.fill('#apply-contactLine', 'e2e.mentor.line');
    const price = m.locator('.offers-list .offer').first();
    await price.locator('.offer-mode__option').filter({ hasText: 'ตั้งราคา' }).click();
    await price.getByLabel('ราคา (บาท)').fill('300');
    await price.getByLabel('คิดต่ออะไร').fill('ชั่วโมง');
    await m.getByRole('button', { name: 'ถัดไป', exact: true }).click();
    for (const box of await m.locator('.consent-check input').all()) await box.check();
    await shot(m, '1-review');
    await m.getByRole('button', { name: 'ส่งใบสมัคร', exact: true }).click();
    await m.getByRole('heading', { name: 'ส่งใบสมัครแล้ว' }).waitFor({ timeout: 20000 });
    const [row] = await db.select().from(mentorSubmissions).where(eq(mentorSubmissions.userId, applicant.id)).orderBy(desc(mentorSubmissions.submittedAt));
    ids.submission = row.id;
    const awards = await db.select().from(mentorAwards).where(eq(mentorAwards.submissionId, row.id));
    if (awards.length !== 2 || row.competitionOffers.length !== 1) throw new Error(`awards ${awards.length} offers ${row.competitionOffers.length}`);
    return `ใบ ${row.id} · ประสบการณ์ ${awards.length} · ราคา ${row.competitionOffers[0].price} ต่อ ${row.competitionOffers[0].unit}`;
  });

  await step('1b อีเมล: ผู้สมัครได้รับ + admin ได้แจ้งเตือน', async () => {
    await wait(1500);
    const toApplicant = await db.select().from(emailLog).where(eq(emailLog.to, applicant.email));
    const toAdmin = await db.select().from(emailLog).where(and(eq(emailLog.to, admin.email), like(emailLog.body, `%${ids.submission}%`)));
    if (!toApplicant.length) throw new Error('ผู้สมัครไม่ได้อีเมลยืนยันการรับใบ');
    if (!toAdmin.length) throw new Error('admin ไม่ได้อีเมลแจ้งเตือน');
    return `ผู้สมัคร: ${toApplicant[0].provider} · admin: ${toAdmin[0].provider} ("${toAdmin[0].subject}")`;
  });

  // ---------- 2. admin อนุมัติ ----------
  const actx = await ctxFor(browser, admin.session);
  const a = await actx.newPage(); openPages.push(a);
  await step('2 admin ตรวจและเผยแพร่ใบสมัคร', async () => {
    await a.goto(`${BASE}/admin/mentors`);
    await a.getByText('สมชาย').first().waitFor();
    await a.goto(`${BASE}/admin/mentors/${ids.submission}`);
    await a.getByText('ประสบการณ์แข่งขันและหลักฐาน').waitFor();
    for (const box of await a.locator('.review-check input').all()) await box.check();
    await shot(a, '2-admin-review');
    await a.getByRole('button', { name: 'เผยแพร่', exact: true }).click();
    await a.getByText(/บันทึกผลแล้ว: เผยแพร่/).waitFor({ timeout: 20000 });
    const [row] = await db.select().from(mentorSubmissions).where(eq(mentorSubmissions.id, ids.submission));
    ids.mentor = row.publishedMentorId!;
    const choices = await db.select().from(mentorCompetitionChoices).where(eq(mentorCompetitionChoices.mentorId, ids.mentor));
    const exps = await db.select().from(mentorExperiences).where(eq(mentorExperiences.mentorId, ids.mentor));
    const [mentor] = await db.select().from(mentors).where(eq(mentors.id, ids.mentor));
    return `เมนเทอร์ ${ids.mentor} · รับปรึกษา ${choices.length} เวที (${choices[0]?.price} ต่อ ${choices[0]?.unit}) · ประสบการณ์ ${exps.length} · ป้ายชนะ ${mentor.wonSlug ?? '-'}`;
  });

  await step('2b อีเมลแจ้งผลถึงผู้สมัคร', async () => {
    await wait(1500);
    const mails = await db.select().from(emailLog).where(eq(emailLog.to, applicant.email)).orderBy(desc(emailLog.sentAt));
    if (mails.length < 2) throw new Error('ยังไม่มีอีเมลแจ้งผล');
    return `"${mails[0].subject}" (${mails[0].provider})`;
  });

  // ---------- 3. Mentor zone ----------
  await step('3 Mentor zone: เห็นเวที ราคา และช่องทางติดต่อ', async () => {
    await m.goto(`${BASE}/mentor-zone`);
    await m.getByRole('tab', { name: 'เวทีของฉัน' }).click();
    const row = m.locator('.cx-competition').filter({ hasText: competitionName }).first();
    await row.waitFor();
    const text = (await row.innerText()).replace(/ /g, ' ');
    if (!text.includes('300 บาท / ชั่วโมง')) throw new Error(`ราคาไม่ตรง: ${text.slice(0, 120)}`);
    await shot(m, '3-mentor-zone');
    return 'เห็น "300 บาท / ชั่วโมง"';
  });

  // ---------- 4. Rising Star (PromptPay ทดสอบ) ----------
  await step('4 สมัคร Rising Star ด้วย PromptPay (Stripe Sandbox)', async () => {
    await m.goto(`${BASE}/mentors`);
    await m.getByRole('button', { name: 'จ่ายหนึ่งเดือนด้วย PromptPay' }).click();
    await m.waitForURL(/checkout\.stripe\.com/, { timeout: 30000 });
    await wait(4000);
    await m.getByText('PromptPay', { exact: true }).first().click({ force: true }).catch(() => {});
    await m.locator('input[type=radio]').first().check({ force: true }).catch(() => {});
    await wait(800);
    await m.locator('.SubmitButton').first().click();
    await wait(6000);
    let clicked = false;
    for (const frame of m.frames()) {
      const sim = frame.getByText('Simulate scan');
      if (await sim.count().catch(() => 0)) {
        const popup = m.context().waitForEvent('page', { timeout: 15000 }).catch(() => null);
        await sim.first().click(); clicked = true;
        const auth = await popup;
        const target = auth ?? m;
        await wait(3000);
        await target.getByRole('button', { name: /authorize/i }).first().click();
        break;
      }
    }
    if (!clicked) throw new Error('ไม่เจอปุ่ม Simulate scan');
    await m.waitForURL(/\/mentors\?joined=1/, { timeout: 60000 });
    for (let i = 0; i < 10; i++) {
      const periods = await db.select().from(risingStarPeriods).where(eq(risingStarPeriods.mentorId, ids.mentor));
      if (periods.length) { await shot(m, '4-joined'); return `ได้สมาชิกถึง ${periods[0].endsAt.toISOString().slice(0, 10)}`; }
      await wait(3000);
    }
    throw new Error('จ่ายแล้วแต่ webhook ยังไม่สร้างช่วงสมาชิก');
  });

  // ---------- 5. นักเรียน ----------
  const sctx = await ctxFor(browser, student.session, 390);
  const s = await sctx.newPage(); openPages.push(s);
  await step('5 หน้าเวที: เมนเทอร์ขึ้นพร้อมป้ายผลงานและ Rising Star', async () => {
    await s.goto(`${BASE}/competitions/${competitionSlug}#mentors`);
    const row = s.locator('.rs-row').filter({ hasText: 'สมชาย' }).first();
    await row.waitFor({ timeout: 20000 });
    const text = await row.innerText();
    await shot(s, '5-competition');
    if (!text.includes('ได้รางวัลในเวทีนี้')) throw new Error(`ไม่มีป้ายผลงาน: ${text.slice(0, 150)}`);
    return `${text.includes('Rising Star') ? 'มีป้าย Rising Star' : 'ไม่มีป้าย Rising Star'} · มีป้ายผลงาน`;
  });

  await step('5b นักเรียนยังไม่ยืนยันอีเมล: ติดต่อไม่ได้ และขอลิงก์ยืนยันได้', async () => {
    await s.goto(`${BASE}/mentors/${ids.mentor}?competition=${competitionSlug}`);
    await s.getByText(/ต้องยืนยันอีเมลก่อน/).first().waitFor({ timeout: 20000 });
    const send = s.getByRole('button', { name: /ส่งลิงก์ยืนยัน/ });
    if (await send.count()) { await send.first().click(); await wait(2500); }
    const mails = await db.select().from(emailVerifications).where(eq(emailVerifications.userId, student.id));
    return `ขอลิงก์ยืนยันแล้ว ${mails.length} ครั้ง`;
  });

  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, student.id));

  await step('6 นักเรียนกดติดต่อเมนเทอร์ → เห็นช่องทาง → ฉันได้รับคำแนะนำแล้ว', async () => {
    await s.goto(`${BASE}/mentors/${ids.mentor}?competition=${competitionSlug}`);
    const contact = s.getByRole('button', { name: 'ติดต่อเมนเทอร์' }).first();
    await contact.waitFor({ timeout: 20000 });
    const pick = s.getByLabel('ติดต่อเรื่องเวทีไหน');
    if (await pick.count()) await pick.selectOption(competitionSlug).catch(() => {});
    await contact.click();
    await s.getByText('e2e.mentor.line').first().waitFor();
    await shot(s, '6-contacts');
    await s.getByRole('button', { name: 'ฉันได้รับคำแนะนำแล้ว' }).click();
    await s.getByText('เราส่งอีเมลให้เมนเทอร์ยืนยันแล้ว').waitFor();
    const [row] = await db.select().from(consultations).where(eq(consultations.userId, student.id));
    await wait(1500);
    const mail = await db.select().from(emailLog).where(and(eq(emailLog.to, applicant.email), like(emailLog.subject, '%ยืนยัน%')));
    return `สถานะ ${row.status} · อีเมลถึงเมนเทอร์ ${mail.length ? mail[0].provider : 'ไม่มี'}`;
  });

  await step('7 เมนเทอร์ยืนยันใน Mentor zone', async () => {
    await m.goto(`${BASE}/mentor-zone`);
    await m.getByRole('tab', { name: /คำขอให้ยืนยัน \(1\)/ }).click();
    await m.getByRole('button', { name: /^ยืนยันว่าคุณให้คำแนะนำ/ }).first().click();
    await m.getByText('ยืนยันแล้ว นักเรียนรีวิวคุณได้แล้ว').waitFor();
    const [row] = await db.select().from(consultations).where(eq(consultations.userId, student.id));
    return `สถานะ ${row.status}`;
  });

  await step('8 นักเรียนรีวิว 5 ดาว แล้วรีวิวขึ้นโปรไฟล์', async () => {
    await s.goto(`${BASE}/consulting`);
    const card = s.locator('[id^="hire-"]').first();
    await card.getByRole('button', { name: 'เขียนรีวิว' }).click();
    await card.locator('.cx-star').nth(4).click();
    await card.getByLabel('ความเห็น (ไม่บังคับ)').fill('E2E: ช่วยได้มาก');
    await card.getByRole('button', { name: 'ส่งรีวิว' }).click();
    await card.getByText('คุณรีวิวการปรึกษานี้แล้ว').waitFor();
    await s.goto(`${BASE}/mentors/${ids.mentor}`);
    await s.getByText('E2E: ช่วยได้มาก').waitFor();
    await s.goto(`${BASE}/competitions/${competitionSlug}#mentors`);
    const row = s.locator('.rs-row').filter({ hasText: 'สมชาย' }).first();
    await row.waitFor();
    await shot(s, '8-after-review');
    const text = await row.innerText();
    return `การ์ดหลังรีวิว: ${text.replace(/\s+/g, ' ').slice(0, 140)}`;
  });

  await step('9 เมนเทอร์ส่งคำขอเพิ่มเวทีที่เคยแข่ง → admin ได้อีเมล', async () => {
    await m.goto(`${BASE}/mentor-zone`);
    await m.getByRole('tab', { name: 'เวทีของฉัน' }).click();
    await m.getByRole('button', { name: 'เคยแข่งเวทีที่ไม่อยู่ในรายการนี้? ส่งให้ทีมตรวจ' }).click();
    const form = m.getByRole('region', { name: 'เพิ่มเวทีที่คุณเคยแข่ง' });
    await form.getByLabel('ชื่อเวที').fill('E2E Cup');
    await form.getByLabel('ลิงก์ประกาศ').fill('https://example.com/e2e-cup');
    await form.getByLabel('ผลที่ได้').selectOption('finalist');
    await form.getByLabel('ปี พ.ศ.').fill('2566');
    await form.getByLabel('ลิงก์ที่แสดงว่าคุณเคยแข่ง').fill('https://example.com/e2e-cup/results');
    await form.locator('.cx-price__option').filter({ hasText: 'ฟรี' }).click();
    await form.getByRole('button', { name: 'ส่งคำขอ' }).click();
    await form.getByText('ส่งคำขอแล้ว').waitFor();
    await wait(1500);
    const mail = await db.select().from(emailLog).where(and(eq(emailLog.to, admin.email), like(emailLog.subject, 'เมนเทอร์ขอเพิ่มเวที%')));
    if (!mail.length) throw new Error('admin ไม่ได้อีเมล');
    return `admin ได้อีเมล (${mail[0].provider})`;
  });

  await step('10 หน้าตั้งค่าการแจ้งเตือน (admin) และลิงก์ลงงานแข่งท้ายเว็บ', async () => {
    await a.goto(`${BASE}/admin/notifications`);
    await a.locator('.notify-card').first().waitFor();
    const cards = await a.locator('.notify-card').count();
    await a.goto(`${BASE}/`);
    const link = await a.getByRole('link', { name: 'ลงงานแข่งขันฟรี' }).count();
    return `การ์ดตั้งค่า ${cards} ใบ · ลิงก์ลงงานแข่ง ${link ? 'มี' : 'ไม่มี'}`;
  });
} finally {
  await browser.close();
  console.log(JSON.stringify(results));
  // ล้างข้อมูลทดสอบออกจากฐาน dev
  const mentorId = ids.mentor;
  if (mentorId) {
    await db.delete(mentorReviews).where(eq(mentorReviews.mentorId, mentorId));
    const cons = await db.select({ id: consultations.id }).from(consultations).where(eq(consultations.mentorId, mentorId));
    if (cons.length) await db.delete(consultationConfirmTokens).where(inArray(consultationConfirmTokens.consultationId, cons.map((c) => c.id)));
    await db.delete(consultations).where(eq(consultations.mentorId, mentorId));
    await db.delete(risingStarPeriods).where(eq(risingStarPeriods.mentorId, mentorId));
    await db.delete(mentors).where(eq(mentors.id, mentorId));
  }
  if (ids.submission) {
    await db.delete(reviewEvents).where(eq(reviewEvents.targetId, ids.submission));
    await db.delete(mentorSubmissions).where(eq(mentorSubmissions.id, ids.submission));
  }
  await db.delete(staffAlerts).where(inArray(staffAlerts.actorId, ids.users));
  await db.delete(billingCustomers).where(inArray(billingCustomers.userId, ids.users));
  await db.delete(emailVerifications).where(inArray(emailVerifications.userId, ids.users));
  await db.delete(sessions).where(inArray(sessions.userId, ids.users));
  await db.delete(emailLog).where(like(emailLog.to, `delivered+e2e-${tag}-%`));
  await db.delete(users).where(inArray(users.id, ids.users)).catch((e) => console.log('cleanup users', String(e).slice(0, 200)));
  await client.end();
}
