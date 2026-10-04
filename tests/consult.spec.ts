import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { eq } from 'drizzle-orm';
import { db } from '../server/db/client';
import { consultations, mentorCompetitionChoices, mentorPayouts, users } from '../server/db/schema';
import { competitions as demoCompetitions } from '../src/data/competitions';
import {
  addFileMessage, addMessage, createAccount, createHire, createMentorFixture, createVerifyToken, removeAccount, signIn, verifyEmail,
} from './helpers';
import type { MentorFixture, TestAccount } from './helpers';

/* ติดต่อเมนเทอร์ → ได้รับคำแนะนำ → เมนเทอร์ยืนยัน → รีวิว ทั้งเส้นทางผ่านเบราว์เซอร์จริง
   แต่ละเทสสร้างเมนเทอร์ เวที และบัญชีของตัวเอง (id สุ่ม) จึงรันขนานกันได้ทั้งสามขนาดจอ
   ส่วนอันดับในแท็บเมนเทอร์ที่พร้อมให้ปรึกษาใช้ข้อมูลตัวอย่างของ seed (server/db/demo-data.ts) */

/* จ้างพักไว้ (ผู้ใช้ตัดสิน 2 ต.ค. 2569): เซิร์ฟเวอร์ของเทสรันโดยไม่ตั้ง HIRING_ENABLED เทสของการจ้าง แชต และจ่ายเงินจึงข้ามไว้ ไม่ได้ลบ
   เปิดกลับด้วย HIRING_ENABLED=true ทั้งฝั่งเซิร์ฟเวอร์ที่รันเทสและตอนสั่ง npm test เส้นทางโหมดตัวกลางทดสอบใน tests/contact.spec.ts */
const hiringOn = process.env.HIRING_ENABLED === 'true';

const THAI_ONLY = (baseURL: string) => ({
  cookies: [], origins: [{ origin: baseURL, localStorage: [{ name: 'cw-lang', value: 'th' }] }],
});

/** จอแคบเก็บเมนูไว้หลังปุ่มสามขีด เปิดก่อนถ้ามีปุ่มนี้ จอกว้างข้ามไปเอง */
async function openHeaderMenu(page: Page) {
  const toggle = page.getByRole('button', { name: 'เปิดเมนู' });
  if (await toggle.isVisible()) await toggle.click();
}

async function expectNoSideScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

let fixture: MentorFixture;
const students: TestAccount[] = [];
async function student(options: { verified?: boolean } = { verified: true }) {
  const account = await createAccount('member', options);
  students.push(account);
  return account;
}

test.beforeEach(async () => { fixture = await createMentorFixture(); });
test.afterEach(async ({ page }) => {
  // ปิดหน้าก่อนลบข้อมูล ไม่อย่างนั้นคำขอที่ค้างอยู่จะวิ่งไปหาบัญชีที่ถูกลบแล้วและได้ 500 ในล็อก
  await page.close();
  for (const account of students.splice(0)) await removeAccount(account);
  await fixture.cleanup();
});

test('a member hires a mentor, the mentor accepts, they chat with a file, the member marks it done and reviews', async ({ page, browser, baseURL }) => {
  test.skip(!hiringOn, 'hiring paused');
  const learner = await student();
  await signIn(page, learner, `/mentors/${fixture.mentorId}?competition=${fixture.competition.slug}`);
  await expect(page.getByRole('heading', { level: 1, name: fixture.name })).toBeVisible();
  await expect(page.locator('.cx-facts')).toContainText('500 บาท / 60 นาที');

  // ฟอร์มจ้าง: เวทีที่มากับลิงก์ถูกเลือกไว้ ราคารวมเปลี่ยนสดตามจำนวนชั่วโมง (500 บาท ต่อ 60 นาที)
  const hire = page.getByRole('region', { name: 'จ้างเมนเทอร์คนนี้' });
  // เวทีเป็นการ์ดเลือก (ชื่อบรรทัดแรก ราคาอีกบรรทัด) ตัวที่มากับลิงก์ถูกเลือกไว้
  await expect(hire.getByRole('radio', { checked: true })).toHaveAttribute('value', fixture.competition.slug);
  await expect(hire.locator('.cx-choice.is-on')).toContainText('500 บาท / 60 นาที');
  await expect(hire.locator('.cx-stepper li[aria-current="step"] .cx-stepper__label')).toHaveText('ส่งคำขอ');
  await expect(hire.locator('.cx-total__value')).toHaveText('500 บาท');
  await hire.getByLabel('จำนวนชั่วโมง').fill('3');
  await expect(hire.locator('.cx-total__value')).toHaveText('1,500 บาท');

  // ตรวจก่อนส่ง: ชั่วโมงต้องเป็นเลขเต็ม 1–10 เวลานัดต้องเป็นอนาคต ข้อความขอบังคับ
  await hire.getByLabel('จำนวนชั่วโมง').fill('11');
  await hire.getByRole('button', { name: 'ส่งคำขอ' }).click();
  await expect(hire.getByRole('alert')).toContainText('เลือกจำนวนชั่วโมงเต็ม 1 ถึง 10');
  await hire.getByLabel('จำนวนชั่วโมง').fill('3');
  // ข้อความที่เห็นเป็นรูปแบบของภาษา (ไม่ใช่ mm/dd/yyyy) ส่วนตัวเลือกวันเวลาจริงซ่อนอยู่ใต้ปุ่ม
  await expect(hire.locator('.cx-datetime__button')).toContainText('เลือกวันและเวลา');
  await hire.locator('input[type=datetime-local]').fill('2020-01-01T10:00');
  await hire.getByRole('button', { name: 'ส่งคำขอ' }).click();
  await expect(hire.getByRole('alert')).toContainText('เลือกเวลาในอนาคต');
  await hire.getByRole('button', { name: 'ล้างวันและเวลา' }).click();
  await expect(hire.locator('.cx-datetime__button')).toContainText('เลือกวันและเวลา');
  await hire.locator('input[type=datetime-local]').fill('2035-03-05T19:00');
  await expect(hire.locator('.cx-datetime__button')).toContainText('19:00');
  await expect(hire.locator('.cx-datetime__button')).not.toContainText('mm');
  await hire.getByRole('button', { name: 'ส่งคำขอ' }).click();
  await expect(hire.getByRole('alert')).toContainText('บอกเมนเทอร์ว่าอยากให้ช่วยเรื่องอะไร');
  await hire.getByLabel('อยากให้ช่วยเรื่องอะไร').fill('ช่วยดูสไลด์พิตช์รอบชิงให้หน่อย');
  await hire.getByRole('button', { name: 'ส่งคำขอ' }).click();

  // ส่งแล้ว: ฟอร์มหาย เหลือบรรทัดขั้นตอน (ตัวหนาที่ "เมนเทอร์รับงาน") กับทางไปต่อที่ Consulting
  await expect(hire.getByRole('heading', { name: 'งานของคุณกับเมนเทอร์คนนี้' })).toBeVisible();
  await expect(hire.locator('.cx-stepper li')).toHaveText(['ส่งคำขอ (เสร็จแล้ว)', '2เมนเทอร์รับงาน', '3ชำระเงิน', '4คุยในแชต', '5กดเสร็จงาน', '6รีวิว']);
  await expect(hire.locator('.cx-stepper li[aria-current="step"] .cx-stepper__label')).toHaveText('เมนเทอร์รับงาน');
  await expect(hire.getByText('รอเมนเทอร์ตอบรับ')).toBeVisible();
  await expect(hire.getByLabel('อยากให้ช่วยเรื่องอะไร')).toHaveCount(0);
  const [row] = await db.select().from(consultations).where(eq(consultations.mentorId, fixture.mentorId));
  expect([row.status, row.minutes, row.price]).toEqual(['requested', 180, 1500]);

  // ฝั่งเมนเทอร์: ลิงก์ในอีเมลพามาที่คำขอนี้ใน Mentor zone แล้วกดรับงาน ห้องแชตเปิด
  const mentorContext = await browser.newContext({ storageState: THAI_ONLY(baseURL!), viewport: page.viewportSize() ?? undefined });
  const zone = await mentorContext.newPage();
  try {
    await signIn(zone, fixture.owner, `/mentor-zone#hire-${row.id}`);
    await expect(zone.getByRole('tab', { name: 'คำขอจ้าง (1)' })).toHaveAttribute('aria-selected', 'true');
    const card = zone.locator(`#hire-${row.id}`);
    await expect(card).toBeVisible();
    await expect(card).toHaveClass(/is-target/);
    await expect(card).toContainText('Test อยากจ้างคุณ');
    await expect(card).toContainText('3 ชั่วโมง');
    await expect(card).toContainText('1,500 บาท');
    await expect(card).toContainText('ช่วยดูสไลด์พิตช์รอบชิงให้หน่อย');
    await card.getByRole('button', { name: 'รับงานตามคำขอของ Test' }).click();
    await expect(zone.getByText('รับงานแล้ว นักเรียนชำระเงินได้แล้ว')).toBeVisible();
    const [waiting] = await db.select().from(consultations).where(eq(consultations.id, row.id));
    // รับงานแล้วยังไม่มีห้องแชต รอนักเรียนจ่ายเงินก่อน เมนเทอร์เห็นว่ากำลังรอเงิน
    expect([waiting.status, waiting.roomId]).toEqual(['accepted', null]);
    const chats = zone.getByRole('tabpanel', { name: 'งานและแชต' });
    if (await chats.locator('.hw__row').first().isVisible()) await chats.locator('.hw__row').first().click();
    await expect(chats.getByText('รอนักเรียนชำระเงิน', { exact: true })).toBeVisible();
    await expect(chats.getByText('แชตจะเปิดเมื่อนักเรียนชำระเงิน')).toBeVisible();

    // ฝั่งนักเรียน: แถบ "เมนเทอร์รับงานแล้ว ชำระ 1,500 บาท เพื่อเริ่มงาน" ปุ่มชำระเงินเป็นปุ่มหลัก ยังยกเลิกได้
    await page.goto(`/consulting#hire-${row.id}`);
    const detail = page.locator('.hw__detail');
    await expect(detail.getByText('เมนเทอร์รับงานแล้ว ชำระ 1,500 บาท เพื่อเริ่มงาน')).toBeVisible();
    await expect(detail.locator('.cx-stepper li[aria-current="step"] .cx-stepper__label')).toHaveText('ชำระเงิน');
    await expect(detail.getByText('แชตจะเปิดทันทีที่คุณชำระเงิน')).toBeVisible();
    await expect(detail.getByRole('button', { name: 'ยกเลิกงานนี้' })).toBeVisible();
    // ยังไม่จ่ายเงิน ส่งข้อความไม่ได้ (เซิร์ฟเวอร์ปฏิเสธ ไม่ใช่แค่ซ่อนช่องพิมพ์)
    await detail.getByRole('button', { name: 'ชำระ 1,500 บาท' }).click();
    // หน้าจ่ายเงินจำลอง: บอกชัดว่าไม่ใช่เงินจริง แสดงยอดจากเซิร์ฟเวอร์
    await expect(page).toHaveURL(/\/pay\/simulated\?payment=/);
    await expect(page.getByText('หน้านี้ไม่มีการเก็บเงินจริง')).toBeVisible();
    await expect(page.locator('.cx-pay__amount')).toHaveText('1,500 บาท');
    await page.getByRole('button', { name: 'ชำระเงิน (ทดสอบ)' }).click();
    await expect(page).toHaveURL(/\/consulting#room-/);
    const [accepted] = await db.select().from(consultations).where(eq(consultations.id, row.id));
    expect(accepted.status).toBe('paid');
    expect(accepted.roomId).toBeTruthy();
    await expect(page.locator('.hw__detail').getByText('ชำระเงินแล้ว แชตเปิดแล้ว')).toBeVisible();
    await expect(page.locator('.hw__detail .cx-stepper li[aria-current="step"] .cx-stepper__label')).toHaveText('คุยในแชต');

    // ฝั่งเมนเทอร์อ่านใหม่แล้วเห็นว่าจ่ายแล้ว (เงินถูกถือไว้) และแชตเปิด แล้วส่งข้อความแรก
    await zone.reload();
    await zone.getByRole('tab', { name: /งานและแชต/ }).click();
    if (await chats.locator('.hw__row').first().isVisible()) await chats.locator('.hw__row').first().click();
    await expect(chats.getByText(/ชำระแล้ว 1,500\s*บาท ถูกถือไว้/)).toBeVisible();
    const mentorChat = chats.getByRole('region', { name: /^แชตกับ/ });
    await mentorChat.getByRole('textbox', { name: 'ข้อความ' }).fill('สวัสดีครับ ส่งสไลด์มาให้ดูได้เลย');
    await mentorChat.getByRole('button', { name: 'ส่ง', exact: true }).click();
    await expect(mentorChat.getByText('สวัสดีครับ ส่งสไลด์มาให้ดูได้เลย')).toBeVisible();

    await page.goto('/');
    await expect(page.locator('.main-nav .cx-unread span:first-child')).toHaveText('1');
    await page.goto(`/consulting#room-${accepted.roomId}`);
    const workspace = page.locator('.hw__detail');
    await expect(workspace.getByRole('heading', { level: 2, name: fixture.name })).toBeVisible();
    const chat = workspace.getByRole('region', { name: /^แชตกับ/ });
    await expect(chat.getByText('สวัสดีครับ ส่งสไลด์มาให้ดูได้เลย')).toBeVisible();
    // เปิดห้องแล้วอ่านแล้ว จุดแจ้งเตือนหายทั้งบนรายการและบนแท็บ
    await expect(page.locator('.cx-unread')).toHaveCount(0);

    // นักเรียนส่งข้อความกับไฟล์ PDF แล้วโหลดไฟล์กลับมาได้ครบ
    await chat.getByRole('textbox', { name: 'ข้อความ' }).fill('นี่คือสไลด์ฉบับร่างค่ะ');
    await chat.locator('input[type=file]').setInputFiles({ name: 'pitch.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 pitch deck sample') });
    await expect(chat.getByText('pitch.pdf').first()).toBeVisible();
    await chat.getByRole('button', { name: 'ส่ง', exact: true }).click();
    const sent = chat.getByRole('link', { name: 'ดาวน์โหลด pitch.pdf' });
    await expect(sent).toBeVisible();
    await expect(chat.getByText('นี่คือสไลด์ฉบับร่างค่ะ')).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent('download'), sent.click()]);
    expect(readFileSync((await download.path())!, 'utf8')).toBe('%PDF-1.4 pitch deck sample');
    expect(download.suggestedFilename()).toBe('pitch.pdf');

    // อีกฝั่งเห็นข้อความใหม่เองจากการถามเป็นระยะ ไม่ต้องรีโหลด
    await expect(mentorChat.getByText('นี่คือสไลด์ฉบับร่างค่ะ')).toBeVisible({ timeout: 20_000 });
    await expect(mentorChat.getByRole('link', { name: 'ดาวน์โหลด pitch.pdf' })).toBeVisible();

    // กดเสร็จงาน (ถามก่อน) แล้วรีวิวได้ครั้งเดียว
    await workspace.getByRole('button', { name: 'กดเสร็จงาน' }).click();
    await expect(workspace.getByText('กดเสร็จงานหรือไม่')).toBeVisible();
    await workspace.getByRole('button', { name: 'ใช่ เสร็จงานแล้ว' }).click();
    await expect(workspace.locator('.hw__head').getByText('เสร็จงานแล้ว')).toBeVisible();
    await expect(workspace.locator('.cx-stepper li[aria-current="step"] .cx-stepper__label')).toHaveText('รีวิว');
    await workspace.getByRole('button', { name: 'เขียนรีวิว' }).click();
    await workspace.getByRole('button', { name: 'ส่งรีวิว' }).click();
    await expect(workspace.getByRole('alert').filter({ hasText: 'เลือก 1 ถึง 5 ดาว' })).toBeVisible();
    await workspace.locator('.cx-star').nth(3).click();
    await workspace.getByLabel('ความเห็น (ไม่บังคับ)').fill('Clear advice on scoping.');
    await workspace.getByRole('button', { name: 'ส่งรีวิว' }).click();
    await expect(workspace.getByText('คุณรีวิวงานนี้แล้ว')).toBeVisible();
    await expect(workspace.getByText('คุณให้ 4 จาก 5')).toBeVisible();
    // ห้องแชตยังเปิดอยู่หลังจบงาน

    // ลิงก์ /chats เก่าพาไปถูกฝั่ง: นักเรียนไป Consulting เมนเทอร์ไป Mentor zone
    await page.goto(`/chats/${accepted.roomId}`);
    await expect(page).toHaveURL(new RegExp(`/consulting#room-${accepted.roomId}$`));
    await zone.goto(`/chats/${accepted.roomId}`);
    await expect(zone).toHaveURL(new RegExp(`/mentor-zone#room-${accepted.roomId}$`));
    await zone.goto('/chats');
    await expect(zone).toHaveURL(/\/mentor-zone$/);
  } finally {
    await zone.close();
    await mentorContext.close();
  }

  // รีวิวขึ้นหน้าเมนเทอร์ทันที และคะแนนเดือนนี้เปลี่ยนจาก "ยังไม่มีรีวิว"
  await page.goto(`/mentors/${fixture.mentorId}`);
  await expect(page.locator('.cx-facts')).toContainText('4.0 · 1 รีวิว');
  await expect(page.getByRole('region', { name: 'รีวิว' })).toContainText('Clear advice on scoping.');
  // จบงานแล้วส่งคำขอใหม่ได้ ฟอร์มกลับมา
  await expect(page.getByRole('region', { name: 'จ้างเมนเทอร์คนนี้' }).getByRole('button', { name: 'ส่งคำขอ' })).toBeVisible();
});

test('an account that has not verified its email is asked to, and can hire only after it does', async ({ page }) => {
  test.skip(!hiringOn, 'hiring paused');
  const learner = await student({ verified: false });
  await signIn(page, learner, `/mentors/${fixture.mentorId}`);
  await expect(page.getByRole('heading', { level: 1, name: fixture.name })).toBeVisible();

  const hire = page.getByRole('region', { name: 'จ้างเมนเทอร์คนนี้' });
  await expect(hire.getByText('ยืนยันอีเมลเพื่อทำต่อ')).toBeVisible();
  await expect(hire.getByRole('button', { name: 'ส่งคำขอ' })).toHaveCount(0);
  // เซิร์ฟเวอร์ปฏิเสธเองด้วย ไม่ใช่แค่ซ่อนฟอร์มในหน้า
  const body = { competition: fixture.competition.slug, hours: 1, note: 'ช่วยหน่อย' };
  expect((await page.request.post(`/api/consult/mentors/${fixture.mentorId}/hire`, { data: body })).status()).toBe(403);

  await hire.getByRole('button', { name: 'ส่งอีเมลยืนยัน' }).click();
  await expect(hire.getByRole('status')).toContainText(`เราส่งลิงก์ไปที่ ${learner.email}`);
  // ขอซ้ำทันทีโดนหน่วง 60 วินาที ต้องบอกให้รอ ไม่ใช่ error ลอย ๆ
  await hire.getByRole('button', { name: 'ส่งอีเมลยืนยัน' }).click();
  await expect(hire.getByRole('alert')).toContainText('รอ 1 นาที');

  // กดลิงก์ในอีกแท็บแล้วกลับมา หน้านี้ต้องอ่านสถานะใหม่เอง
  await verifyEmail(learner);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(hire.getByRole('button', { name: 'ส่งคำขอ' })).toBeVisible();
  await expect(hire.getByText('ยืนยันอีเมลเพื่อทำต่อ')).toHaveCount(0);
});

test('a signed-out visitor is sent to sign in and comes back to the same mentor', async ({ page }) => {
  test.skip(!hiringOn, 'hiring paused');
  await page.goto(`/mentors/${fixture.mentorId}?competition=${fixture.competition.slug}`);
  const hire = page.getByRole('region', { name: 'จ้างเมนเทอร์คนนี้' });
  await expect(hire.getByText('เข้าสู่ระบบเพื่อจ้างเมนเทอร์คนนี้')).toBeVisible();
  // ราคาและรีวิวดูได้โดยไม่ต้องเข้าสู่ระบบ ฟอร์มจ้างอย่างเดียวที่ไม่เปิด
  await expect(page.getByRole('region', { name: 'เวทีที่เมนเทอร์คนนี้ช่วยได้' })).toContainText('500 บาท / 60 นาที');
  await expect(hire.getByRole('button', { name: 'ส่งคำขอ' })).toHaveCount(0);
  await expect(hire.getByRole('link', { name: 'เข้าสู่ระบบ' })).toHaveAttribute('href',
    `/signin?next=${encodeURIComponent(`/mentors/${fixture.mentorId}?competition=${fixture.competition.slug}`)}`);
  expect((await page.request.post(`/api/consult/mentors/${fixture.mentorId}/hire`, { data: { competition: fixture.competition.slug, hours: 1, note: 'x' } })).status()).toBe(401);
});

test('the mentor sees their own profile without a hire form', async ({ page }) => {
  test.skip(!hiringOn, 'hiring paused');
  await signIn(page, fixture.owner, `/mentors/${fixture.mentorId}`);
  const hire = page.getByRole('region', { name: 'จ้างเมนเทอร์คนนี้' });
  await expect(hire.getByText('นี่คือโปรไฟล์ของคุณเอง')).toBeVisible();
  await expect(hire.getByRole('button', { name: 'ส่งคำขอ' })).toHaveCount(0);
  await expect(hire.getByRole('link', { name: 'เปิดโซนเมนเทอร์ของคุณ' })).toHaveAttribute('href', '/mentor-zone');
});

test('a mentor with no offered competition cannot be hired, and a competition the mentor dropped is refused', async ({ page }) => {
  test.skip(!hiringOn, 'hiring paused');
  const learner = await student();
  await signIn(page, learner, `/mentors/${fixture.mentorId}`);
  const hire = page.getByRole('region', { name: 'จ้างเมนเทอร์คนนี้' });
  await expect(hire.getByRole('radio', { checked: true })).toBeVisible();
  // ราคามาจากเมนเทอร์เสมอ เวทีที่เมนเทอร์ไม่ได้เปิดรับถูกปฏิเสธที่เซิร์ฟเวอร์
  const refused = await page.request.post(`/api/consult/mentors/${fixture.mentorId}/hire`, { data: { competition: fixture.spare.slug, hours: 1, note: 'x' } });
  expect(refused.status()).toBe(409);
  await db.delete(mentorCompetitionChoices).where(eq(mentorCompetitionChoices.mentorId, fixture.mentorId));
  await page.reload();
  await expect(page.getByRole('region', { name: 'จ้างเมนเทอร์คนนี้' }).getByText('ยังจ้างไม่ได้ในตอนนี้')).toBeVisible();
  await expect(page.getByRole('button', { name: 'ส่งคำขอ' })).toHaveCount(0);
});

test('a mentor declines with a reason, and the member sees the reason and can hire again', async ({ page, browser, baseURL }) => {
  test.skip(!hiringOn, 'hiring paused');
  const learner = await student();
  const { id } = await createHire(fixture, learner, 'requested', { note: 'ช่วยดูแผนธุรกิจ' });
  const mentorContext = await browser.newContext({ storageState: THAI_ONLY(baseURL!), viewport: page.viewportSize() ?? undefined });
  const zone = await mentorContext.newPage();
  try {
    await signIn(zone, fixture.owner, `/mentor-zone#hire-${id}`);
    const card = zone.locator(`#hire-${id}`);
    await card.getByRole('button', { name: 'ปฏิเสธคำขอของ Test' }).click();
    // ปฏิเสธต้องมีเหตุผล ไม่ส่งอะไรไปเซิร์ฟเวอร์ถ้าว่าง
    await card.getByRole('button', { name: 'ส่งการปฏิเสธ' }).click();
    await expect(card.getByRole('alert')).toContainText('เขียนเหตุผลสั้น ๆ ให้นักเรียนทราบ');
    await card.getByLabel('เหตุผลที่ปฏิเสธ').fill('ช่วงนี้คิวเต็ม ลองใหม่เดือนหน้านะครับ');
    await card.getByRole('button', { name: 'ส่งการปฏิเสธ' }).click();
    await expect(zone.getByText('ปฏิเสธแล้ว เราส่งอีเมลแจ้งนักเรียนแล้ว')).toBeVisible();
  } finally {
    await zone.close();
    await mentorContext.close();
  }
  await signIn(page, learner, '/consulting');
  // จอแคบเริ่มที่รายการ เลือกงานก่อนจึงเห็นรายละเอียด (จอกว้างเลือกให้เอง การกดซ้ำไม่เป็นไร)
  await page.locator('.hw__row').first().click();
  const workspace = page.locator('.hw__detail');
  await expect(workspace.getByText('ปฏิเสธ').first()).toBeVisible();
  await expect(workspace.getByText('ช่วงนี้คิวเต็ม ลองใหม่เดือนหน้านะครับ')).toBeVisible();
  await expect(workspace.getByText('แชตจะเปิดหลังเมนเทอร์รับงานและคุณชำระเงินแล้ว')).toBeVisible();
  await expect(workspace.getByRole('link', { name: 'จ้างอีกครั้ง' })).toHaveAttribute('href', `/mentors/${fixture.mentorId}?competition=${fixture.competition.slug}`);
});

test('a member cancels a request, and an open request stops a second one', async ({ page }) => {
  test.skip(!hiringOn, 'hiring paused');
  const learner = await student();
  await createHire(fixture, learner, 'requested');
  await signIn(page, learner, `/mentors/${fixture.mentorId}`);
  // มีคำขอค้างอยู่แล้ว: ไม่มีฟอร์มให้ส่งซ้อน มีทางไปดูที่ Consulting
  const hire = page.getByRole('region', { name: 'จ้างเมนเทอร์คนนี้' });
  await expect(hire.getByRole('button', { name: 'ส่งคำขอ' })).toHaveCount(0);
  await expect(hire.getByRole('link', { name: 'เปิดในการปรึกษา' })).toBeVisible();
  const again = await page.request.post(`/api/consult/mentors/${fixture.mentorId}/hire`, { data: { competition: fixture.competition.slug, hours: 1, note: 'อีกครั้ง' } });
  expect(again.status()).toBe(409);

  await page.goto('/consulting');
  await page.locator('.hw__row').first().click();
  const workspace = page.locator('.hw__detail');
  await expect(workspace.getByText('รอเมนเทอร์ตอบรับ').first()).toBeVisible();
  // ถามก่อนยกเลิก และเก็บไว้ได้
  await workspace.getByRole('button', { name: 'ยกเลิกงานนี้' }).click();
  await expect(workspace.getByText('ยกเลิกงานนี้หรือไม่')).toBeVisible();
  await workspace.getByRole('button', { name: 'เก็บไว้' }).click();
  await expect(workspace.getByRole('button', { name: 'ยกเลิกงานนี้' })).toBeVisible();
  await workspace.getByRole('button', { name: 'ยกเลิกงานนี้' }).click();
  await workspace.getByRole('button', { name: 'ใช่ ยกเลิก' }).click();
  await expect(workspace.getByText('งานนี้ถูกยกเลิกแล้ว')).toBeVisible();
  await expect(workspace.getByRole('link', { name: 'จ้างอีกครั้ง' })).toBeVisible();

  await page.goto(`/mentors/${fixture.mentorId}`);
  await expect(page.getByRole('region', { name: 'จ้างเมนเทอร์คนนี้' }).getByRole('button', { name: 'ส่งคำขอ' })).toBeVisible();
});

test('the chat checks files before sending, keeps a failed message for retry, and shows unread counts', async ({ page }) => {
  test.skip(!hiringOn, 'hiring paused');
  const learner = await student();
  const { id, roomId } = await createHire(fixture, learner, 'paid');
  await addMessage(roomId!, fixture.owner.id, 'พร้อมคุยแล้วครับ');
  await addMessage(roomId!, fixture.owner.id, 'ส่งโจทย์มาได้เลย');
  await signIn(page, learner, '/');
  // ข้อความที่ยังไม่อ่านรวมทุกห้อง ขึ้นบนแท็บ
  await expect(page.locator('.main-nav .cx-unread span:first-child')).toHaveText('2');
  await expect(page.locator('.main-nav .cx-unread .sr-only')).toHaveText('ข้อความที่ยังไม่ได้อ่าน 2 ข้อความ');

  await page.goto(`/consulting#hire-${id}`);
  const chat = page.getByRole('region', { name: /^แชตกับ/ });
  await expect(chat.getByText('ส่งโจทย์มาได้เลย')).toBeVisible();
  await expect(page.locator('.main-nav .cx-unread')).toHaveCount(0);

  // ไฟล์ใหญ่เกิน 4 MB และชนิดที่ไม่รองรับถูกปฏิเสธที่เครื่อง ไม่ส่งไปเซิร์ฟเวอร์
  const input = chat.locator('input[type=file]');
  await input.setInputFiles({ name: 'big.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(4 * 1024 * 1024 + 1) });
  await expect(chat.getByRole('alert').filter({ hasText: 'ไฟล์ต้องมีขนาดไม่เกิน 4 MB' })).toBeVisible();
  await input.setInputFiles({ name: 'run.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') });
  await expect(chat.getByRole('alert').filter({ hasText: 'เลือกไฟล์ JPG, PNG, WebP, PDF, PPTX, DOCX หรือ XLSX' })).toBeVisible();
  await expect(chat.getByRole('button', { name: 'ส่ง', exact: true })).toBeDisabled();

  // เครือข่ายล้ม: ข้อความค้างเป็น "ยังไม่ได้ส่ง" แล้วกดลองอีกครั้งด้วย clientId เดิม ได้ข้อความเดียว
  let fail = true;
  const sent: string[] = [];
  await page.route('**/api/chats/*/messages', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    sent.push(route.request().postData()?.match(/name="clientId"\r\n\r\n([^\r]+)/)?.[1] ?? '');
    return fail ? route.abort() : route.continue();
  });
  await chat.getByRole('textbox', { name: 'ข้อความ' }).fill('ข้อความที่ส่งตอนเน็ตหลุด');
  await chat.getByRole('button', { name: 'ส่ง', exact: true }).click();
  await expect(chat.getByText('ยังไม่ได้ส่ง')).toBeVisible();
  fail = false;
  await chat.getByRole('button', { name: 'ลองส่งอีกครั้ง' }).click();
  await expect(chat.getByText('ยังไม่ได้ส่ง')).toHaveCount(0);
  await expect(chat.getByText('ข้อความที่ส่งตอนเน็ตหลุด')).toHaveCount(1);
  expect(new Set(sent).size).toBe(1);
  expect(sent.length).toBeGreaterThanOrEqual(2);
});

test('only the two people in a room can read it, and a stranger is redirected away', async ({ page }) => {
  const learner = await student();
  const outsider = await student();
  const { roomId } = await createHire(fixture, learner, 'paid');
  await addMessage(roomId!, learner.id, 'ข้อความส่วนตัว');
  await signIn(page, outsider, '/');
  expect((await page.request.get(`/api/chats/${roomId}`)).status()).toBe(404);
  expect((await page.request.get(`/api/chats/${roomId}/messages`)).status()).toBe(404);
  await page.goto(`/chats/${roomId}`);
  await expect(page).toHaveURL(/\/consulting$/);
  await expect(page.getByText('ข้อความส่วนตัว')).toHaveCount(0);
});

test('the Consulting page starts empty, and signed-out visitors are sent to sign in first', async ({ page }) => {
  test.skip(!hiringOn, 'hiring paused');
  const learner = await student();
  await signIn(page, learner, '/consulting');
  await expect(page.getByRole('heading', { level: 1, name: 'การปรึกษา' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'ยังไม่มีงานที่จ้าง' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: 'สำรวจการแข่งขัน' })).toHaveAttribute('href', '/explore');

  await page.context().clearCookies();
  await page.goto('/consulting');
  await expect(page).toHaveURL(/\/signin\?next=(%2F|\/)consulting$/);
  await page.goto('/chats');
  await expect(page).toHaveURL(/\/signin\?next=(%2F|\/)chats$/);
});

test('the header shows Mentor zone to an approved mentor and Consulting to everyone else who is signed in', async ({ page }) => {
  await page.goto('/');
  await openHeaderMenu(page);
  const nav = page.getByRole('navigation', { name: 'เมนูหลัก' });
  await expect(nav.getByRole('link', { name: 'ทำเนียบ Rising Star' })).toHaveAttribute('href', '/mentors');
  await expect(nav.getByRole('link', { name: 'การปรึกษา' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'โซนเมนเทอร์' })).toHaveCount(0);

  const learner = await student();
  await signIn(page, learner, '/');
  await openHeaderMenu(page);
  await expect(nav.getByRole('link', { name: 'การปรึกษา' })).toHaveAttribute('href', '/consulting');
  await expect(nav.getByRole('link', { name: 'โซนเมนเทอร์' })).toHaveCount(0);

  await page.context().clearCookies();
  await signIn(page, fixture.owner, '/');
  await openHeaderMenu(page);
  await expect(nav.getByRole('link', { name: 'โซนเมนเทอร์' })).toHaveAttribute('href', '/mentor-zone');
  await expect(nav.getByRole('link', { name: 'การปรึกษา' })).toHaveCount(0);
});

test('the Mentor zone is for approved mentors, and a mentor can manage prices and requests', async ({ page }) => {
  // คนที่ไม่ใช่เมนเทอร์เห็นคำอธิบายพร้อมทางสมัคร ไม่ใช่หน้าเปล่า
  const learner = await student();
  await signIn(page, learner, '/mentor-zone');
  await expect(page.getByRole('heading', { name: 'โซนเมนเทอร์สำหรับเมนเทอร์ที่ผ่านการอนุมัติ' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'สมัครเป็นเมนเทอร์' })).toHaveAttribute('href', '/mentors/apply');
  await page.context().clearCookies();

  await signIn(page, fixture.owner, '/mentor-zone');
  await expect(page.getByRole('heading', { level: 1, name: 'โซนเมนเทอร์' })).toBeVisible();
  // ไม่มีคำขอที่รออยู่ก็ไม่มีส่วนสีทองให้เห็น ค่าเริ่มต้นไปแท็บเวที (ยังไม่มีงานให้ทำ)
  const competitionsTab = hiringOn ? 'เวทีที่รับปรึกษา' : 'เวทีของฉัน';
  if (hiringOn) {
    // แท็บคำขอบอกจำนวน (0)
    await expect(page.getByRole('tab', { name: 'คำขอจ้าง (0)' })).toBeVisible();
    await expect(page.getByRole('tab', { name: competitionsTab })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: 'คำขอจ้าง (0)' }).click();
    await expect(page.getByText('ตอนนี้ไม่มีคำขอจ้างที่รออยู่')).toBeVisible();
    await page.getByRole('tab', { name: 'งานและแชต' }).click();
    await expect(page.getByText('เมื่อคุณรับคำขอจ้าง งานจะแสดงที่นี่')).toBeVisible();
  } else {
    await expect(page.getByRole('tab', { name: 'คำขอให้ยืนยัน (0)' })).toBeVisible();
    await expect(page.getByRole('tab', { name: competitionsTab })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: 'คำขอให้ยืนยัน (0)' }).click();
    await expect(page.getByText('ตอนนี้ไม่มีอะไรให้ยืนยัน')).toBeVisible();
  }
  await page.getByRole('tab', { name: competitionsTab }).click();

  // เวทีที่รับปรึกษา: ราคาแบบเก่า (นาที) ยังแสดงได้ แก้เป็นบาทต่อหน่วยที่พิมพ์เองหรือฟรี แล้วหน้าเวทีเห็นราคาใหม่
  const mine = page.getByRole('region', { name: 'เวทีที่ฉันรับปรึกษา' });
  const row = mine.locator('.cx-competition').filter({ hasText: fixture.competition.name });
  await expect(row).toContainText('500 บาท / 60 นาที');
  await expect(row.getByRole('button', { name: /^บันทึกราคาของ/ })).toBeDisabled();
  await expect(row.getByLabel('จำนวนนาที')).toHaveCount(0);
  await row.getByLabel('ราคา (บาท)').fill('10');
  await row.getByRole('button', { name: /^บันทึกราคาของ/ }).click();
  // ราคามากกว่า 0 ต้องบอกว่าคิดต่ออะไร
  await expect(row.getByRole('alert')).toContainText('บอกหน่วย เช่น ชั่วโมง');
  await row.getByLabel('คิดต่ออะไร').fill('ครั้ง');
  await row.getByRole('button', { name: /^บันทึกราคาของ/ }).click();
  await expect(mine.getByRole('status')).toContainText('บันทึกแล้ว');
  await expect(row).toContainText('10 บาท / ครั้ง');
  const listed = await (await page.request.get(`/api/consult/competitions/${fixture.competition.slug}/mentors`)).json();
  expect([...listed.risingStar, ...listed.others].find((m: { id: string }) => m.id === fixture.mentorId)).toMatchObject({ price: 10, unit: 'ครั้ง' });
  await row.locator('.cx-price__option').filter({ hasText: 'ฟรี' }).click();
  await row.getByRole('button', { name: /^บันทึกราคาของ/ }).click();
  await expect(row).toContainText('ฟรี');

  // เพิ่มได้เฉพาะเวทีที่เคยแข่ง แล้วเอาออก
  const add = page.getByRole('region', { name: 'เวทีที่คุณเคยแข่ง' });
  await add.getByLabel('ค้นหาเวทีของคุณ').fill(fixture.spare.name);
  const candidate = add.locator('.cx-competition').filter({ hasText: fixture.spare.name });
  await candidate.getByText('รายละเอียด').click();
  await expect(candidate).toContainText('A competition made for a test.');
  // ถามราคาหลังเลือกเวทีเท่านั้น และต้องเลือกฟรีหรือตั้งราคาก่อน
  await expect(candidate.getByLabel('ราคา (บาท)')).toHaveCount(0);
  await candidate.getByRole('button', { name: `เพิ่ม ${fixture.spare.name}` }).click();
  await candidate.getByRole('button', { name: 'เพิ่มในรายการของฉัน' }).click();
  await expect(candidate.getByRole('alert')).toContainText('เลือก "ฟรี" หรือ "ตั้งราคา"');
  await candidate.locator('.cx-price__option').filter({ hasText: 'ฟรี' }).click();
  await candidate.getByRole('button', { name: 'เพิ่มในรายการของฉัน' }).click();
  await expect(mine.locator('.cx-competition').filter({ hasText: fixture.spare.name })).toBeVisible();
  await mine.getByRole('button', { name: `เอา ${fixture.spare.name} ออก` }).click();
  await expect(mine.getByText(`เอา ${fixture.spare.name} ออกจากรายการของคุณหรือไม่`).first()).toBeVisible();
  await mine.getByRole('button', { name: 'ใช่ เอาออก' }).click();
  await expect(mine.locator('.cx-competition').filter({ hasText: fixture.spare.name })).toHaveCount(0);
  await add.getByLabel('ค้นหาเวทีของคุณ').fill('zzz-no-such-competition');
  await expect(add.getByText('ไม่พบเวทีของคุณที่ตรงกับคำค้น')).toBeVisible();

  // ขอเพิ่มเวทีที่เคยแข่ง: ตรวจฟอร์มก่อนส่ง (ต้องมีผล ปี หลักฐาน และราคา) แล้วเห็นสถานะรอทีมงาน
  const request = page.getByRole('region', { name: 'เพิ่มเวทีที่คุณเคยแข่ง' });
  await expect(request).toBeHidden();
  await add.getByRole('button', { name: 'เคยแข่งเวทีที่ไม่อยู่ในรายการนี้? ส่งให้ทีมตรวจ' }).click();
  await request.getByRole('button', { name: 'ส่งคำขอ' }).click();
  await expect(request.getByRole('alert')).toContainText('กรอกชื่อเวที');
  await request.getByLabel('ชื่อเวที').fill('Brand New Cup');
  await request.getByLabel('ลิงก์ประกาศ').fill('ftp://nope');
  await request.getByRole('button', { name: 'ส่งคำขอ' }).click();
  await expect(request.getByRole('alert')).toContainText('ขึ้นต้นด้วย https://');
  await request.getByLabel('ลิงก์ประกาศ').fill('https://example.test/brand-new-cup');
  await request.getByLabel('รายละเอียด (ไม่บังคับ)').fill('Open to all students.');
  await request.getByRole('button', { name: 'ส่งคำขอ' }).click();
  await expect(request.getByRole('alert')).toContainText('เลือกผลที่ได้จากเวทีนี้');
  await request.getByLabel('ผลที่ได้').selectOption('finalist');
  await request.getByLabel('ปี พ.ศ.').fill('2567');
  await request.getByLabel('ลิงก์ที่แสดงว่าคุณเคยแข่ง').fill('https://example.test/brand-new-cup/results');
  await request.locator('.cx-price__option').filter({ hasText: 'ตั้งราคา' }).click();
  await request.getByLabel('ราคา (บาท)').fill('500');
  await request.getByLabel('คิดต่ออะไร').fill('ชั่วโมง');
  await request.getByRole('button', { name: 'ส่งคำขอ' }).click();
  await expect(request.getByRole('status')).toContainText('ส่งคำขอแล้ว');
  const submitted = page.locator('.cx-request').filter({ hasText: 'Brand New Cup' });
  await expect(submitted).toContainText('รอทีมงานตรวจ');
  await expect(submitted).toContainText('500 บาท / ชั่วโมง');
  await expectNoSideScroll(page);
});

test('the email verification page verifies once, then says the link is used up', async ({ page }) => {
  const learner = await student({ verified: false });
  const token = await createVerifyToken(learner);
  await page.goto(`/verify-email?token=${token}`);
  await expect(page.getByRole('heading', { level: 1, name: 'ยืนยันอีเมลแล้ว' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'ไปที่การปรึกษา' })).toBeVisible();
  const [row] = await db.select().from(users).where(eq(users.id, learner.id));
  expect(row.emailVerifiedAt).not.toBeNull();

  // ลิงก์ใช้ได้ครั้งเดียว เปิดซ้ำต้องบอกว่าใช้ไม่ได้และบอกทางขอลิงก์ใหม่
  await page.goto(`/verify-email?token=${token}`);
  await expect(page.getByRole('heading', { level: 1, name: 'ลิงก์นี้ใช้ไม่ได้' })).toBeVisible();
  await expect(page.getByText('ลิงก์อาจหมดอายุหรือถูกใช้ไปแล้ว')).toBeVisible();
  await expect(page.getByRole('link', { name: 'เข้าสู่ระบบเพื่อขอลิงก์ใหม่' })).toBeVisible();

  await page.goto('/verify-email');
  await expect(page.getByRole('heading', { level: 1, name: 'ลิงก์ไม่ครบ' })).toBeVisible();
  await page.goto('/verify-email?token=not-a-real-token-at-all-0000');
  await expect(page.getByRole('heading', { level: 1, name: 'ลิงก์นี้ใช้ไม่ได้' })).toBeVisible();
});

test('the profile shows the email status, sends the link, and no longer offers bookings', async ({ page }) => {
  const learner = await student({ verified: false });
  await signIn(page, learner, '/profile');
  await expect(page.getByRole('heading', { level: 1, name: 'Test Account' })).toBeVisible();
  await expect(page.getByText('ยังไม่ยืนยันอีเมล').first()).toBeVisible();
  await page.getByRole('button', { name: 'ส่งอีเมลยืนยัน' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'เราส่งลิงก์ไปที่' })).toBeVisible();
  for (const gone of ['แชตของฉัน', 'เปิดช่องเวลาว่าง', 'นัดหมายของฉัน']) await expect(page.getByText(gone)).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('link', { name: 'การปรึกษา' })).toHaveAttribute('href', '/consulting');

  await verifyEmail(learner);
  await page.reload();
  await expect(page.getByText(hiringOn ? 'ยืนยันแล้ว คุณจ้างเมนเทอร์และเขียนรีวิวได้' : 'ยืนยันแล้ว คุณเห็นช่องทางติดต่อเมนเทอร์และเขียนรีวิวได้')).toBeVisible();
  await expect(page.getByRole('button', { name: 'ส่งอีเมลยืนยัน' })).toHaveCount(0);
});

test('a mentor with a published profile reaches the Mentor zone from their profile page', async ({ page }) => {
  await signIn(page, fixture.owner, '/profile');
  await expect(page.getByRole('link', { name: 'โซนเมนเทอร์' }).first()).toHaveAttribute('href', '/mentor-zone');
  await expect(page.locator(`main a[href="/mentors/${fixture.mentorId}"]`)).toBeVisible();
});

/* ---------- แท็บเมนเทอร์ที่พร้อมให้ปรึกษาในหน้าเวที ---------- */

test('Available mentors lists Rising Star members first and ranked, then everyone else, in the order the server scores them', async ({ page }) => {
  const slug = demoCompetitions[0].slug;
  // ลำดับคำนวณที่เซิร์ฟเวอร์ (รีวิวทั้งหมด + ครั้งที่ปรึกษาสำเร็จ + ผลงานในเวทีนี้ ดู scripts/mentor-rank.test.ts) หน้าเว็บต้องแสดงตามนั้น
  const api = await (await page.request.get(`/api/consult/competitions/${slug}/mentors`)).json() as {
    risingStar: { id: string; name: string }[]; others: { id: string; name: string }[];
  };
  await page.goto(`/competitions/${slug}#mentors`);
  // ลิงก์ที่มี #mentors เปิดที่แท็บเมนเทอร์เลย
  const tab = page.getByRole('tab', { name: 'เมนเทอร์ที่พร้อมให้ปรึกษา' });
  await expect(tab).toHaveAttribute('aria-selected', 'true');

  const rising = page.getByRole('region', { name: 'เมนเทอร์ Rising Star' }).locator('.rs-row');
  await expect(rising).toHaveCount(api.risingStar.length);
  expect(api.risingStar.length).toBeGreaterThan(1);
  const names = await rising.locator('.rs-row__name').allTextContents();
  expect(names.map((name) => name.replace('Rising Star', ''))).toEqual(api.risingStar.map((mentor) => mentor.name));
  await expect(page.getByRole('region', { name: 'เมนเทอร์ Rising Star' })).toContainText('เรียงตามรีวิว จำนวนครั้งที่ให้คำปรึกษา และผลงานในเวทีนี้');
  for (const [index, row] of (await rising.all()).entries()) {
    await expect(row.locator('.rs-row__rank')).toContainText(`อันดับ ${index + 1}`);
    await expect(row.locator('.rs-row__meta')).toContainText('บาท');
    await expect(row.getByRole('link', { name: hiringOn ? /^จ้าง / : /^ดูโปรไฟล์ของ / })).toBeVisible();
  }

  // ที่ไม่ใช่สมาชิกอยู่ต่อท้าย ไม่มีเลขอันดับและไม่มีป้าย Rising Star
  const others = page.getByRole('region', { name: 'เมนเทอร์คนอื่น ๆ' });
  await expect(others.locator('.rs-row__rank')).toHaveCount(0);
  await expect(others.locator('.rs-pill')).toHaveCount(0);
  await expect(others.locator('.rs-row__name')).toHaveText(api.others.map((mentor) => mentor.name));
  const order = await page.locator('#panel-mentors section').evaluateAll((els) => els.map((el) => el.getAttribute('aria-labelledby')));
  expect(order).toEqual(['rising-title', 'others-title']);

  // ทุกคนลิงก์ไปโปรไฟล์ของตัวเอง พกเวทีไปด้วยเพื่อให้กดติดต่อเรื่องเวทีนี้ได้เลย
  await rising.first().getByRole('link', { name: hiringOn ? /^จ้าง / : /^ดูโปรไฟล์ของ / }).click();
  await expect(page).toHaveURL(new RegExp(`/mentors/${api.risingStar[0].id}\\?competition=${slug}$`));
});

test('a mentor card on the competition page shows their checked result there and how many consultations they confirmed', async ({ page }) => {
  const slug = demoCompetitions[0].slug;
  await page.route(`**/api/consult/competitions/${slug}/mentors`, async (route) => {
    const json = await (await route.fetch()).json();
    json.risingStar[0] = { ...json.risingStar[0], experience: { result: 'winner', year: '2567' }, consultations: 12 };
    if (json.others[0]) json.others[0] = { ...json.others[0], experience: { result: 'participant', year: '2566' }, consultations: 0 };
    await route.fulfill({ json });
  });
  await page.goto(`/competitions/${slug}#mentors`);
  const first = page.getByRole('region', { name: 'เมนเทอร์ Rising Star' }).locator('.rs-row').first();
  await expect(first.locator('.rs-proof--winner')).toHaveText('ได้รางวัลในเวทีนี้ · 2567');
  await expect(first.locator('.rs-proof--count')).toHaveText('ให้คำปรึกษาแล้ว 12 ครั้ง');
  const other = page.getByRole('region', { name: 'เมนเทอร์คนอื่น ๆ' }).locator('.rs-row').first();
  await expect(other.locator('.rs-proof--participant')).toHaveText('เข้าร่วมในเวทีนี้ · 2566');
  await expect(other.locator('.rs-proof--count')).toHaveCount(0);
  await page.locator('#panel-mentors').screenshot({ path: `artifacts/competition-mentors-proof-${test.info().project.name}.png` });
});

test('the competition page tabs work with mouse, keyboard and deep links', async ({ page }) => {
  const slug = demoCompetitions[0].slug;
  await page.goto(`/competitions/${slug}`);
  const details = page.getByRole('tab', { name: 'รายละเอียด' });
  const mentors = page.getByRole('tab', { name: 'เมนเทอร์ที่พร้อมให้ปรึกษา' });
  await expect(page.getByRole('tablist', { name: 'ส่วนต่าง ๆ ของเวที' })).toBeVisible();
  await expect(details).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'รายละเอียด' })).toBeVisible();
  await expect(page.locator('#panel-mentors')).toBeHidden();

  await mentors.click();
  await expect(mentors).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/#mentors$/);
  await expect(page.locator('#panel-details')).toBeHidden();
  await expect(page.getByRole('heading', { level: 2, name: 'เมนเทอร์ที่พร้อมให้ปรึกษา' })).toBeVisible();

  // เลื่อนด้วยลูกศร โฟกัสตามไปที่แท็บที่เลือก และ roving tabindex เหลือแท็บเดียวที่เข้าถึงด้วย Tab
  await mentors.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(details).toBeFocused();
  await expect(details).toHaveAttribute('aria-selected', 'true');
  await expect(mentors).toHaveAttribute('tabindex', '-1');
  await expect(page).not.toHaveURL(/#mentors/);
  await page.keyboard.press('End');
  await expect(mentors).toBeFocused();

  // ลิงก์เก่า #event-mentors ยังพาไปแท็บเมนเทอร์ ส่วนปุ่มในกล่องสรุปเอาออกแล้วตามที่ผู้ใช้สั่ง ใช้แท็บด้านบนแทน
  await page.goto(`/competitions/${slug}#event-mentors`);
  await expect(mentors).toHaveAttribute('aria-selected', 'true');
  await details.click();
  await expect(page.locator('.detail-side').getByRole('button')).toHaveCount(0);
});

test('a competition nobody mentors says so and points to the Hall of Fame', async ({ page }) => {
  // เวทีสุดท้ายของข้อมูลตัวอย่างไม่มีเมนเทอร์คนไหนเลือก (ตัวอย่างเลือกแค่เวทีแรก ๆ)
  const empty = demoCompetitions[demoCompetitions.length - 1];
  await page.goto(`/competitions/${empty.slug}#mentors`);
  await expect(page.getByRole('heading', { level: 1, name: empty.name })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'ยังไม่มีเมนเทอร์เลือกเวทีนี้' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'ดูทำเนียบ Rising Star' })).toHaveAttribute('href', '/mentors');
});

test('an unreachable mentor list shows an error with a retry that recovers', async ({ page }) => {
  let fail = true;
  await page.route('**/api/consult/competitions/*/mentors', (route) => (fail ? route.abort() : route.continue()));
  await page.goto(`/competitions/${demoCompetitions[0].slug}#mentors`);
  await expect(page.getByRole('alert').filter({ hasText: 'โหลดรายชื่อเมนเทอร์ของเวทีนี้ไม่สำเร็จ' })).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'ลองใหม่' }).click();
  await expect(page.getByRole('region', { name: 'เมนเทอร์ Rising Star' })).toBeVisible();
});

/* ---------- คุณภาพหน้า ---------- */

test('the new pages pass axe, fit the viewport, and are captured with realistic Thai data', async ({ page, browser, baseURL }, info) => {
  test.skip(!hiringOn, 'hiring paused');
  // ภาพหน้าจอใช้เมนเทอร์และนักเรียนชื่อไทย เวทีที่ปิดรับในอีกเดือนครึ่ง ไม่ใช่ข้อมูลทดสอบภาษาอังกฤษ
  const thai = await createMentorFixture({ thai: true });
  const learner = await createAccount('member', { verified: true, name: 'ปรียา วงศ์สวัสดิ์' });
  const second = await createAccount('member', { verified: true, name: 'ณัฐพล แก้วใส' });
  students.push(learner, second);
  const size = page.viewportSize() ?? undefined;
  const narrow = (size?.width ?? 1440) <= 900;
  const capture = async (target: Page, name: string) => {
    if (info.project.name !== 'tablet') await target.screenshot({ path: `artifacts/${name}-${info.project.name}.png`, fullPage: true });
  };
  const audit = async (target: Page, label: string) => {
    expect(await target.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${label} overflow`).toBeLessThanOrEqual(0);
    const results = await new AxeBuilder({ page: target }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations, label).toEqual([]);
  };
  const mentorContext = await browser.newContext({ storageState: THAI_ONLY(baseURL!), viewport: size });
  const zone = await mentorContext.newPage();
  try {
    await page.goto(`/competitions/${demoCompetitions[0].slug}#mentors`);
    await expect(page.locator('.rs-row').first()).toBeVisible();
    await audit(page, 'competition mentors tab');
    await capture(page, 'competition-mentors');

    // โปรไฟล์เมนเทอร์กับฟอร์มจ้าง: วันเวลาแสดงเป็นรูปแบบไทย เวทีเป็นการ์ดเลือก ปุ่มส่งเต็มการ์ดใต้ราคารวม
    await signIn(page, learner, `/mentors/${thai.mentorId}?competition=${thai.competition.slug}`);
    const hire = page.getByRole('region', { name: 'จ้างเมนเทอร์คนนี้' });
    await hire.getByLabel('จำนวนชั่วโมง').fill('2');
    const when = new Date(Date.now() + 10 * 86_400_000);
    const pad = (n: number) => String(n).padStart(2, '0');
    await hire.locator('input[type=datetime-local]').fill(`${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}T19:00`);
    await hire.getByLabel('อยากให้ช่วยเรื่องอะไร').fill('ทีมเราเข้ารอบสุดท้ายแล้ว อยากให้ช่วยซ้อมพิตช์ 7 นาทีและตอบคำถามกรรมการ');
    await expect(hire.locator('.cx-total__value')).toHaveText('1,000 บาท');
    await audit(page, 'mentor profile with the hire form');
    await capture(page, 'mentor-profile');

    // งานเก่าที่จบแล้ว (แชตมีข้อความที่ยังไม่อ่าน) กับงานใหม่ที่เมนเทอร์เพิ่งรับ (แชตมีไฟล์แนบ)
    const finished = await createHire(thai, learner, 'completed', { hours: 1, note: 'ช่วยดูโครงเรื่องพิตช์รอบแรก' });
    await addMessage(finished.roomId!, thai.owner.id, 'ขอให้โชคดีรอบชิงนะครับ ถ้ามีคำถามเพิ่มทักมาได้เลย');
    await new Promise((resolve) => setTimeout(resolve, 50));
    await page.request.post(`/api/consult/mentors/${thai.mentorId}/hire`, { data: { competition: thai.competition.slug, hours: 2, note: 'ทีมเราเข้ารอบสุดท้ายแล้ว อยากให้ช่วยซ้อมพิตช์ 7 นาทีและตอบคำถามกรรมการ' } });
    const [row] = (await db.select().from(consultations).where(eq(consultations.userId, learner.id))).filter((item) => item.status === 'requested');
    await signIn(zone, thai.owner, '/mentor-zone');
    await zone.request.post(`/api/consult/${row.id}/accept`, { data: {} });

    // รับงานแล้วรอจ่ายเงิน: แถบสถานะบนการ์ด ปุ่มชำระเงินเป็นปุ่มหลัก แล้วไปหน้าจ่ายเงินจำลอง
    await page.goto(`/consulting#hire-${row.id}`);
    await expect(page.getByText(/เมนเทอร์รับงานแล้ว ชำระ 1,000\s*บาท เพื่อเริ่มงาน/)).toBeVisible();
    await audit(page, 'consulting waiting for payment');
    await capture(page, 'consulting-pay');
    await page.getByRole('button', { name: 'ชำระ 1,000 บาท' }).click();
    await expect(page.getByRole('button', { name: 'ชำระเงิน (ทดสอบ)' })).toBeVisible();
    await audit(page, 'simulated payment page');
    await capture(page, 'pay-simulated');
    await page.getByRole('button', { name: 'ชำระเงิน (ทดสอบ)' }).click();
    await expect(page).toHaveURL(/\/consulting#room-/);
    const [accepted] = await db.select().from(consultations).where(eq(consultations.id, row.id));
    await addMessage(accepted.roomId!, thai.owner.id, 'สวัสดีครับ ส่งสไลด์พิตช์ฉบับล่าสุดมาให้ดูก่อนได้เลย');
    await addMessage(accepted.roomId!, learner.id, 'ได้ค่ะ ส่งให้ตอนนี้เลยนะคะ');
    await addFileMessage(accepted.roomId!, thai.owner.id, 'ข้อเสนอแนะสไลด์พิตช์.pdf', 'ดูสไลด์แล้วครับ ใส่คอมเมนต์ไว้ในไฟล์นี้');
    await addMessage(accepted.roomId!, thai.owner.id, 'เดี๋ยวเรามานัดเวลาซ้อมกัน');
    await page.goto('/consulting');
    if (narrow) {
      await expect(page.locator('.hw__row .cx-unread').first()).toBeVisible();
      await audit(page, 'consulting list');
      await capture(page, 'consulting-list');
      await page.locator('.hw__row').first().click();
    }
    await expect(page.getByText('เดี๋ยวเรามานัดเวลาซ้อมกัน')).toBeVisible();
    await expect(page.getByRole('link', { name: 'ดาวน์โหลด ข้อเสนอแนะสไลด์พิตช์.pdf' })).toBeVisible();
    if (!narrow) await expect(page.locator('.hw__row .cx-unread').first()).toBeVisible();
    await audit(page, 'consulting with an open chat');
    await capture(page, 'consulting');

    // Mentor zone: คำขอใหม่ของอีกคนรออยู่ เปิดช่องเหตุผลปฏิเสธไว้ แล้วแท็บงานและแชต
    await createHire(thai, second, 'requested', { hours: 3, note: 'อยากได้คำแนะนำเรื่องแผนธุรกิจและประมาณการรายได้ก่อนส่งรอบแรก' });
    await addMessage(accepted.roomId!, learner.id, 'ขอบคุณมากค่ะ จะส่งฉบับแก้ไขให้ดูพรุ่งนี้นะคะ');
    await zone.goto('/mentor-zone');
    await expect(zone.getByRole('tab', { name: 'คำขอจ้าง (1)' })).toHaveAttribute('aria-selected', 'true');
    await zone.getByRole('button', { name: 'ปฏิเสธคำขอของ ณัฐพล' }).click();
    await zone.getByLabel('เหตุผลที่ปฏิเสธ').fill('ช่วงนี้คิวเต็มจนถึงสิ้นเดือน ลองส่งคำขอใหม่เดือนหน้านะครับ');
    await audit(zone, 'mentor zone, hire requests with the decline field open');
    await capture(zone, 'mentor-zone');
    await zone.getByRole('tab', { name: /งานและแชต/ }).click();
    if (narrow) await zone.locator('.hw__row').first().click();
    await expect(zone.getByText('ขอบคุณมากค่ะ จะส่งฉบับแก้ไขให้ดูพรุ่งนี้นะคะ')).toBeVisible();
    await audit(zone, 'mentor zone, hires and chats');
    await capture(zone, 'mentor-zone-chats');

    // เงินของเมนเทอร์: งานที่รอโอนกับงานที่โอนแล้ว (มีเลขอ้างอิง) เพิ่มจากงานที่นักเรียนจ่ายไปแล้วข้างบน
    const third = await createAccount('member', { verified: true, name: 'กมลชนก ใจดี' });
    const fourth = await createAccount('member', { verified: true, name: 'ธีรภัทร สุขสันต์' });
    students.push(third, fourth);
    const dueHire = await createHire(thai, third, 'completed', { hours: 2, note: 'ซ้อมพิตช์รอบรองชนะเลิศ' });
    const sentHire = await createHire(thai, fourth, 'completed', { hours: 1, note: 'ตรวจประมาณการรายได้' });
    await db.insert(mentorPayouts).values([
      { id: `pout-${dueHire.id}`, hireId: dueHire.id, mentorId: thai.mentorId, amount: 1000, status: 'due' },
      { id: `pout-${sentHire.id}`, hireId: sentHire.id, mentorId: thai.mentorId, amount: 500, status: 'paid', paidAt: new Date(Date.now() - 2 * 86_400_000), note: 'KBANK-20261001-014' },
    ]);
    await zone.reload();
    // บัญชีรับเงิน: กรอกแล้วบันทึก เห็นเลขแค่ 4 ตัวท้าย
    await zone.getByRole('tab', { name: 'การรับเงิน' }).click();
    await zone.getByLabel('ชื่อบัญชี').fill('ธนพล ศรีสุข');
    await zone.getByLabel('ธนาคาร').selectOption('kbank');
    await zone.getByLabel('เลขบัญชี').fill('123-4-56789-0');
    await zone.getByRole('button', { name: 'บันทึกบัญชีรับเงิน' }).click();
    await expect(zone.getByText('ธนาคารกสิกรไทย · ลงท้าย 7890')).toBeVisible();
    await audit(zone, 'mentor zone payouts');
    await capture(zone, 'mentor-zone-payouts');
  } finally {
    await zone.close();
    await mentorContext.close();
    await thai.cleanup();
  }
});

test('touch targets on the new pages are at least 44px tall on phones', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) > 700, 'phone layout only');
  const learner = await student();
  if (hiringOn) {
    const { id } = await createHire(fixture, learner, 'paid');
    await signIn(page, learner, `/mentors/${fixture.mentorId}`);
    await page.goto('/consulting');
    await page.locator('.hw__row').first().click();
    await expect(page.getByRole('region', { name: /^แชตกับ/ })).toBeVisible();
    for (const box of await page.locator('main button:not([disabled]), main a.cx-button, main .cx-link, main .chat__file, main label.chat__attach').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height).filter((height) => height > 0))) {
      expect(box).toBeGreaterThanOrEqual(44);
    }
    void id;
  } else {
    // โหมดตัวกลาง: โปรไฟล์ที่กดติดต่อแล้ว และรายการ Consulting
    await signIn(page, learner, `/mentors/${fixture.mentorId}`);
    await page.getByRole('button', { name: 'ติดต่อเมนเทอร์' }).click();
    await expect(page.getByRole('heading', { name: 'ช่องทางติดต่อเมนเทอร์' })).toBeVisible();
    for (const box of await page.locator('main button:not([disabled]), main a.cx-button, .cx-contacts a').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height).filter((height) => height > 0))) {
      expect(box).toBeGreaterThanOrEqual(44);
    }
    await page.goto('/consulting');
    await expect(page.locator('.cx-consult')).toBeVisible();
    for (const box of await page.locator('main button:not([disabled]), main a.cx-button, main .cx-link').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height).filter((height) => height > 0))) {
      expect(box).toBeGreaterThanOrEqual(44);
    }
  }
  await page.context().clearCookies();
  await signIn(page, fixture.owner, '/mentor-zone');
  await page.getByRole('tab', { name: hiringOn ? 'เวทีที่รับปรึกษา' : 'เวทีของฉัน' }).click();
  await expect(page.getByRole('region', { name: 'เวทีที่ฉันรับปรึกษา' })).toBeVisible();
  for (const box of await page.locator('main button:not([disabled]), main a.cx-button, main summary').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height).filter((height) => height > 0))) {
    expect(box).toBeGreaterThanOrEqual(44);
  }
  // ตัวที่ถูก disabled ก็ต้องสูงพอเช่นกัน ปุ่มบันทึกราคายังไม่มีอะไรเปลี่ยนจึงถูกปิดอยู่
  await expect(page.getByRole('button', { name: /^บันทึกราคาของ/ }).first()).toBeDisabled();
  expect(await page.getByRole('button', { name: /^บันทึกราคาของ/ }).first().evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
});
