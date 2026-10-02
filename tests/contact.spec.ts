import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { desc, eq } from 'drizzle-orm';
import { db } from '../server/db/client';
import { consultationConfirmTokens, consultations, emailLog, mentors } from '../server/db/schema';
import { createAccount, createMentorFixture, removeAccount, signIn } from './helpers';
import type { MentorFixture, TestAccount } from './helpers';

/* โหมดตัวกลาง (ใช้อยู่ตอนนี้): ติดต่อเมนเทอร์ → เห็นช่องทาง → ได้รับคำแนะนำ → เมนเทอร์ยืนยัน (ลิงก์ในอีเมลหรือ Mentor zone) → รีวิว
   เซิร์ฟเวอร์ของเทสรันโดยไม่ตั้ง HIRING_ENABLED จึงเป็นโหมดนี้เสมอ แต่ละเทสสร้างเมนเทอร์กับบัญชีของตัวเอง รันขนานกันได้
   โทเคนในลิงก์อ่านจากตาราง email_log เหมือนที่เมนเทอร์เปิดจากอีเมลจริง */

const THAI_ONLY = (baseURL: string) => ({
  cookies: [], origins: [{ origin: baseURL, localStorage: [{ name: 'cw-lang', value: 'th' }] }],
});

let fixture: MentorFixture;
const accounts: TestAccount[] = [];
const extraCleanups: Array<() => Promise<void>> = [];
async function member(name?: string, verified = true) {
  const account = await createAccount('member', { verified, name });
  accounts.push(account);
  return account;
}

test.beforeEach(async () => { fixture = await createMentorFixture(); });
test.afterEach(async ({ page }) => {
  await page.close();
  for (const account of accounts.splice(0)) await removeAccount(account);
  await fixture.cleanup();
  for (const cleanup of extraCleanups.splice(0)) await cleanup();
});

async function expectNoSideScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}
async function audit(page: Page, label: string) {
  await expectNoSideScroll(page);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations, label).toEqual([]);
}

/** โทเคนล่าสุดที่ส่งถึงเมนเทอร์ (อ่านจากอีเมลที่เก็บไว้) */
async function tokenFor(email: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const [mail] = await db.select().from(emailLog).where(eq(emailLog.to, email)).orderBy(desc(emailLog.sentAt)).limit(1);
    const found = mail?.body.match(/\/confirm\?token=([\w-]+)/)?.[1];
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('no confirmation email');
}

/** เมนเทอร์เปิดลิงก์จากอีเมลในเบราว์เซอร์ที่ไม่ได้เข้าสู่ระบบ */
async function anonymousPage(browser: Browser, baseURL: string, size?: { width: number; height: number }) {
  const context = await browser.newContext({ storageState: THAI_ONLY(baseURL), viewport: size });
  return { context, page: await context.newPage() };
}

/** นักเรียนกดติดต่อและกด "ฉันได้รับคำแนะนำแล้ว" ผ่านหน้าเว็บ (ใช้ในเทสที่สนใจขั้นหลังจากนั้น) */
async function contactAndClaim(page: Page, learner: TestAccount) {
  await signIn(page, learner, `/mentors/${fixture.mentorId}?competition=${fixture.competition.slug}`);
  await page.getByRole('button', { name: 'ติดต่อเมนเทอร์' }).click();
  await expect(page.getByRole('heading', { name: 'ช่องทางติดต่อเมนเทอร์' })).toBeVisible();
  await page.getByRole('button', { name: 'ฉันได้รับคำแนะนำแล้ว' }).click();
  await expect(page.getByText('เราส่งอีเมลให้เมนเทอร์ยืนยันแล้ว')).toBeVisible();
  const [row] = await db.select().from(consultations).where(eq(consultations.userId, learner.id));
  return row.id;
}

test('a member contacts a mentor, tells us they got guidance, the mentor confirms from the email link, and the member reviews', async ({ page, browser, baseURL }) => {
  const learner = await member('ปรียา วงศ์สวัสดิ์');
  await signIn(page, learner, `/mentors/${fixture.mentorId}?competition=${fixture.competition.slug}`);
  await expect(page.getByRole('heading', { level: 1, name: fixture.name })).toBeVisible();

  // ก่อนกดติดต่อ: อธิบายว่าเว็บเป็นแค่ตัวกลาง ยังไม่เห็นช่องทางติดต่อ ไม่มีฟอร์มจ้างหรือแชต
  const panel = page.getByRole('region', { name: 'ติดต่อเมนเทอร์คนนี้' });
  await expect(panel).toContainText('ChampionWays เป็นแค่ตัวกลาง');
  await expect(panel.locator('.cx-stepper li[aria-current="step"] .cx-stepper__label')).toHaveText('ติดต่อ');
  await expect(panel.locator('.cx-stepper li')).toHaveText(['1ติดต่อ', '2ได้รับคำแนะนำแล้ว', '3เมนเทอร์ยืนยัน', '4รีวิว']);
  await expect(page.getByRole('region', { name: 'จ้างเมนเทอร์คนนี้' })).toHaveCount(0);
  await expect(page.getByText('fixture.line')).toHaveCount(0);
  await audit(page, 'profile before contacting');

  // กดติดต่อ: เห็นครบห้าช่อง ช่องที่ว่างเป็น "-" ลิงก์สร้างอย่างปลอดภัย โฟกัสไปที่ช่องทางที่เพิ่งขึ้น
  await panel.getByLabel('ติดต่อเรื่องเวทีไหน').selectOption(fixture.competition.slug);
  await panel.getByRole('button', { name: 'ติดต่อเมนเทอร์' }).click();
  const channels = panel.locator('.cx-contacts');
  await expect(channels.locator('> div')).toHaveCount(5);
  await expect(channels.locator('div').filter({ hasText: 'LINE ID' }).getByRole('link', { name: 'fixture.line' }))
    .toHaveAttribute('href', 'https://line.me/ti/p/~fixture.line');
  await expect(channels.locator('div').filter({ hasText: 'Instagram' }).getByRole('link', { name: 'fixture.ig' }))
    .toHaveAttribute('href', 'https://www.instagram.com/fixture.ig/');
  for (const empty of ['อีเมล', 'เบอร์โทร', 'ลิงก์อื่น']) {
    const row = channels.locator('> div').filter({ has: page.locator('dt', { hasText: empty }) });
    await expect(row.locator('dd span[aria-hidden="true"]')).toHaveText('-');
  }
  await expect(panel.locator('.cx-stepper li[aria-current="step"] .cx-stepper__label')).toHaveText('ได้รับคำแนะนำแล้ว');
  await expect(page.getByRole('heading', { name: 'ช่องทางติดต่อเมนเทอร์' })).toBeFocused();
  await expect(panel.getByRole('button', { name: 'ยกเลิก' })).toBeVisible();
  await audit(page, 'profile with contacts');

  // ฉันได้รับคำแนะนำแล้ว → ส่งอีเมลให้เมนเทอร์ รอเมนเทอร์ ยังรีวิวไม่ได้
  await panel.getByRole('button', { name: 'ฉันได้รับคำแนะนำแล้ว' }).click();
  await expect(panel.getByText('เราส่งอีเมลให้เมนเทอร์ยืนยันแล้ว')).toBeVisible();
  await expect(panel.locator('.cx-stepper li[aria-current="step"] .cx-stepper__label')).toHaveText('เมนเทอร์ยืนยัน');
  await expect(panel.getByRole('button', { name: 'เขียนรีวิว' })).toHaveCount(0);
  const [row] = await db.select().from(consultations).where(eq(consultations.userId, learner.id));
  expect(row.status).toBe('claimed');

  // เมนเทอร์เปิดลิงก์จากอีเมลโดยไม่ได้เข้าสู่ระบบ: เปิดหน้าเฉย ๆ ไม่เปลี่ยนอะไร ต้องกดปุ่ม
  const token = await tokenFor(fixture.owner.email);
  const { context, page: mentorPage } = await anonymousPage(browser, baseURL!, page.viewportSize() ?? undefined);
  try {
    await mentorPage.goto(`/confirm?token=${token}`);
    await expect(mentorPage.getByRole('heading', { level: 1, name: 'คุณให้คำแนะนำ ปรียา ใช่ไหม' })).toBeVisible();
    await expect(mentorPage.getByText('ไม่ต้องเข้าสู่ระบบ')).toBeVisible();
    expect((await db.select().from(consultations).where(eq(consultations.id, row.id)))[0].status).toBe('claimed');
    await audit(mentorPage, 'confirm page');
    await mentorPage.getByRole('button', { name: 'ใช่ ยืนยัน' }).click();
    await expect(mentorPage.getByRole('heading', { level: 1, name: 'ขอบคุณ ยืนยันแล้ว' })).toBeVisible();
    // เปิดซ้ำ: ตอบไปแล้ว ไม่มีปุ่ม
    await mentorPage.reload();
    await expect(mentorPage.getByRole('heading', { level: 1, name: 'ตอบไปแล้ว' })).toBeVisible();
    await expect(mentorPage.getByRole('button', { name: 'ใช่ ยืนยัน' })).toHaveCount(0);
  } finally {
    await context.close();
  }
  expect((await db.select().from(consultations).where(eq(consultations.id, row.id)))[0].status).toBe('completed');

  // นักเรียนเห็นว่ายืนยันแล้ว และรีวิวได้ที่ Consulting
  await page.goto('/consulting');
  const card = page.locator(`#hire-${row.id}`);
  await expect(card.getByText('ยืนยันแล้ว', { exact: true })).toBeVisible();
  await expect(card.locator('.cx-stepper li[aria-current="step"] .cx-stepper__label')).toHaveText('รีวิว');
  await card.getByRole('button', { name: 'เขียนรีวิว' }).click();
  await card.getByRole('button', { name: 'ส่งรีวิว' }).click();
  await expect(card.getByText('เลือก 1 ถึง 5 ดาวก่อนส่งรีวิว')).toBeVisible();
  await card.locator('.cx-star').nth(4).click();
  await card.getByLabel('ความเห็น (ไม่บังคับ)').fill('ช่วยตีโจทย์ได้ชัดมาก');
  await card.getByRole('button', { name: 'ส่งรีวิว' }).click();
  await expect(card.getByText('คุณรีวิวการปรึกษานี้แล้ว')).toBeVisible();
  await expect(card.getByText('รีวิวแล้ว', { exact: true })).toBeVisible();
  await audit(page, 'consulting reviewed');

  // รีวิวขึ้นบนโปรไฟล์ของเมนเทอร์ และติดต่อใหม่ได้
  await page.goto(`/mentors/${fixture.mentorId}`);
  await expect(page.getByText('ช่วยตีโจทย์ได้ชัดมาก')).toBeVisible();
  await expect(page.getByRole('button', { name: 'ติดต่ออีกครั้ง' })).toBeVisible();
});

test('"No, that was not me" asks again, then the member sees neutral wording and can contact again', async ({ page, browser, baseURL }) => {
  const learner = await member('ณัฐพล แก้วใส');
  const id = await contactAndClaim(page, learner);
  const token = await tokenFor(fixture.owner.email);
  const { context, page: mentorPage } = await anonymousPage(browser, baseURL!);
  try {
    await mentorPage.goto(`/confirm?token=${token}`);
    await mentorPage.getByRole('button', { name: 'ไม่ใช่ ฉันไม่ได้ให้คำแนะนำ' }).click();
    // ถามซ้ำก่อนตอบ เพราะตอบแล้วนักเรียนรีวิวไม่ได้ กลับได้โดยไม่เปลี่ยนอะไร
    await expect(mentorPage.getByText('แจ้งว่าไม่ใช่คุณใช่ไหม')).toBeVisible();
    await mentorPage.getByRole('button', { name: 'กลับ' }).click();
    await expect(mentorPage.getByRole('button', { name: 'ใช่ ยืนยัน' })).toBeVisible();
    expect((await db.select().from(consultations).where(eq(consultations.id, id)))[0].status).toBe('claimed');
    await mentorPage.getByRole('button', { name: 'ไม่ใช่ ฉันไม่ได้ให้คำแนะนำ' }).click();
    await mentorPage.getByRole('button', { name: 'ใช่ ไม่ใช่ฉัน' }).click();
    await expect(mentorPage.getByRole('heading', { level: 1, name: 'รับทราบ ไม่ยืนยัน' })).toBeVisible();
  } finally {
    await context.close();
  }
  expect((await db.select().from(consultations).where(eq(consultations.id, id)))[0].status).toBe('denied');

  await page.goto('/consulting');
  const card = page.locator(`#hire-${id}`);
  await expect(card.getByText('เมนเทอร์ไม่ยืนยัน', { exact: true })).toBeVisible();
  await expect(card.getByText('เมนเทอร์แจ้งว่าครั้งนี้ไม่ได้ให้คำแนะนำคุณ เราจึงไม่นับครั้งนี้')).toBeVisible();
  await expect(card.getByRole('button', { name: 'เขียนรีวิว' })).toHaveCount(0);
  await expect(card.getByRole('link', { name: 'ติดต่ออีกครั้ง' })).toBeVisible();
  // ติดต่อใหม่ได้จากโปรไฟล์ และได้รายการใหม่
  await page.goto(`/mentors/${fixture.mentorId}`);
  await page.getByRole('button', { name: 'ติดต่ออีกครั้ง' }).click();
  await expect(page.getByRole('heading', { name: 'ช่องทางติดต่อเมนเทอร์' })).toBeVisible();
  expect((await db.select().from(consultations).where(eq(consultations.userId, learner.id))).length).toBe(2);
});

test('the confirm link says so when it is invalid, expired, or already used, and never acts on page load', async ({ page, browser, baseURL }) => {
  const learner = await member();
  const id = await contactAndClaim(page, learner);
  const token = await tokenFor(fixture.owner.email);
  const { context, page: other } = await anonymousPage(browser, baseURL!, page.viewportSize() ?? undefined);
  try {
    await other.goto('/confirm');
    await expect(other.getByRole('heading', { level: 1, name: 'ลิงก์นี้ใช้ไม่ได้' })).toBeVisible();
    await other.goto('/confirm?token=not-a-real-token-at-all-0000');
    await expect(other.getByRole('heading', { level: 1, name: 'ลิงก์นี้ใช้ไม่ได้' })).toBeVisible();
    await expect(other.getByRole('link', { name: 'เปิดโซนเมนเทอร์' })).toBeVisible();

    // หมดอายุ: ไม่มีปุ่มตอบ ชี้ไปที่โซนเมนเทอร์
    await db.update(consultationConfirmTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(consultationConfirmTokens.consultationId, id));
    await other.goto(`/confirm?token=${token}`);
    await expect(other.getByRole('heading', { level: 1, name: 'ลิงก์นี้หมดอายุแล้ว' })).toBeVisible();
    await expect(other.getByRole('button', { name: 'ใช่ ยืนยัน' })).toHaveCount(0);
    await expect(other.getByRole('link', { name: 'เปิดโซนเมนเทอร์' })).toBeVisible();
    await audit(other, 'expired link');
    expect((await db.select().from(consultations).where(eq(consultations.id, id)))[0].status).toBe('claimed');

    // เปิดไว้สองแท็บ แท็บแรกตอบแล้ว แท็บสองกดตอบทีหลัง: บอกว่าถูกใช้ไปแล้ว ไม่ตอบซ้ำ
    await db.update(consultationConfirmTokens).set({ expiresAt: new Date(Date.now() + 3_600_000) }).where(eq(consultationConfirmTokens.consultationId, id));
    const second = await context.newPage();
    await other.goto(`/confirm?token=${token}`);
    await second.goto(`/confirm?token=${token}`);
    // รอให้ทั้งสองหน้าอ่านข้อมูลเสร็จ (ปุ่มขึ้นแล้ว) ก่อนตอบจากหน้าแรก ไม่อย่างนั้นหน้าที่สองอาจอ่านหลังมีคนตอบไปแล้ว
    await expect(other.getByRole('button', { name: 'ใช่ ยืนยัน' })).toBeVisible();
    await expect(second.getByRole('button', { name: 'ใช่ ยืนยัน' })).toBeVisible();
    await other.getByRole('button', { name: 'ใช่ ยืนยัน' }).click();
    await expect(other.getByRole('heading', { level: 1, name: 'ขอบคุณ ยืนยันแล้ว' })).toBeVisible();
    await second.getByRole('button', { name: 'ใช่ ยืนยัน' }).click();
    await expect(second.getByRole('heading', { level: 1, name: 'ตอบไปแล้ว' })).toBeVisible();
    await expect(second.getByText('ลิงก์นี้เพิ่งถูกใช้หรือหมดอายุแล้ว')).toBeVisible();
  } finally {
    await context.close();
  }
});

test('the Mentor zone shows requests to confirm, highlights the one from the email, and asks again before "Not me"', async ({ page }) => {
  const first = await member('ปรียา วงศ์สวัสดิ์');
  const second = await member('ณัฐพล แก้วใส');
  const firstId = await (async () => {
    await db.insert(consultations).values({ id: `cns-${first.id}`, userId: first.id, mentorId: fixture.mentorId, competitionId: fixture.competition.id, status: 'claimed', minutes: 0, claimedAt: new Date() });
    return `cns-${first.id}`;
  })();
  const secondId = `cns-${second.id}`;
  await db.insert(consultations).values({ id: secondId, userId: second.id, mentorId: fixture.mentorId, competitionId: null, status: 'claimed', minutes: 0, claimedAt: new Date() });

  await signIn(page, fixture.owner, `/mentor-zone#confirm-${secondId}`);
  // โหมดตัวกลางมีสามส่วนเท่านั้น ไม่มีคำขอจ้าง แชต หรือการรับเงิน
  await expect(page.getByRole('tab')).toHaveText(['คำขอให้ยืนยัน (2)', 'ช่องทางติดต่อ', 'เวทีของฉัน']);
  await expect(page.getByRole('tab', { name: /คำขอให้ยืนยัน/ })).toHaveAttribute('aria-selected', 'true');
  // ลิงก์จากอีเมลเลือกรายการนั้นให้เห็นเด่น
  const target = page.locator(`#confirm-${secondId}`);
  await expect(target).toHaveClass(/is-target/);
  await expect(target).toContainText('ณัฐพล แจ้งว่าได้รับคำแนะนำจากคุณ');
  await expect(page.locator(`#confirm-${firstId}`)).toContainText('เรื่อง ' + fixture.competition.name);
  await audit(page, 'mentor zone confirm');

  // ไม่ใช่ฉัน: ถามซ้ำก่อน กลับได้ ยังไม่เปลี่ยนอะไร
  await target.getByRole('button', { name: 'ไม่ใช่ฉัน' }).click();
  await expect(target.getByText(/แจ้งว่าไม่ได้ให้คำแนะนำ ณัฐพล ใช่ไหม/)).toBeVisible();
  await target.getByRole('button', { name: 'กลับ' }).click();
  expect((await db.select().from(consultations).where(eq(consultations.id, secondId)))[0].status).toBe('claimed');
  await target.getByRole('button', { name: 'ไม่ใช่ฉัน' }).click();
  await target.getByRole('button', { name: 'ใช่ ไม่ใช่ฉัน' }).click();
  await expect(page.getByText('รับทราบ เราไม่นับครั้งนี้')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'คำขอให้ยืนยัน (1)' })).toBeVisible();
  expect((await db.select().from(consultations).where(eq(consultations.id, secondId)))[0].status).toBe('denied');

  // ยืนยันรายการที่เหลือ
  await page.locator(`#confirm-${firstId}`).getByRole('button', { name: /^ยืนยันว่าคุณให้คำแนะนำ ปรียา/ }).click();
  await expect(page.getByText('ยืนยันแล้ว นักเรียนรีวิวคุณได้แล้ว')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'คำขอให้ยืนยัน (0)' })).toBeVisible();
  await expect(page.getByText('ตอนนี้ไม่มีอะไรให้ยืนยัน')).toBeVisible();
  expect((await db.select().from(consultations).where(eq(consultations.id, firstId)))[0].status).toBe('completed');
});

test('a mentor sets contact channels with at least one and a safe link, and is warned until then', async ({ page }) => {
  await db.update(mentors).set({ contactEmail: '', contactLine: '', contactPhone: '', contactInstagram: '', contactLink: '' }).where(eq(mentors.id, fixture.mentorId));
  await signIn(page, fixture.owner, '/mentor-zone');
  // ยังไม่มีช่องทางเลย: เตือนบนสุด และเปิดแท็บช่องทางติดต่อให้
  await expect(page.getByText('เพิ่มช่องทางติดต่ออย่างน้อยหนึ่งช่อง')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'ช่องทางติดต่อ' })).toHaveAttribute('aria-selected', 'true');
  const form = page.getByRole('region', { name: 'ช่องทางที่นักเรียนติดต่อคุณ' });
  await form.getByRole('button', { name: 'บันทึก' }).click();
  await expect(form.getByRole('alert')).toHaveText('ใส่ช่องทางติดต่ออย่างน้อยหนึ่งช่อง');
  await form.getByLabel('อีเมล').fill('not-an-email');
  await form.getByRole('button', { name: 'บันทึก' }).click();
  await expect(form.getByRole('alert')).toHaveText('ใส่อีเมลให้ถูกต้อง');
  await form.getByLabel('อีเมล').fill('');
  await form.getByLabel('ลิงก์อื่น (ขึ้นต้นด้วย https://)').fill('javascript:alert(1)');
  await form.getByRole('button', { name: 'บันทึก' }).click();
  await expect(form.getByRole('alert')).toHaveText('ลิงก์ต้องขึ้นต้นด้วย https:// หรือ http://');
  await form.getByLabel('ลิงก์อื่น (ขึ้นต้นด้วย https://)').fill('');
  await form.getByLabel('Instagram').fill('mentor.ig');
  await form.getByRole('button', { name: 'บันทึก' }).click();
  await expect(form.getByRole('status')).toHaveText('บันทึกแล้ว');
  await expect(page.getByText('เพิ่มช่องทางติดต่ออย่างน้อยหนึ่งช่อง')).toHaveCount(0);
  const [saved] = await db.select().from(mentors).where(eq(mentors.id, fixture.mentorId));
  expect([saved.contactInstagram, saved.contactLine]).toEqual(['mentor.ig', '']);
  await audit(page, 'mentor zone contacts');

  // เวทีของฉัน: ราคาต่อเวทียังอยู่ และไม่มีคำพูดเรื่องจ้างหรือชำระเงิน
  await page.getByRole('tab', { name: 'เวทีของฉัน' }).click();
  await expect(page.getByRole('region', { name: 'เวทีที่ฉันรับปรึกษา' })).toContainText(fixture.competition.name);
  await expect(page.locator('main')).not.toContainText('คำขอจ้าง');
});

test('with hiring paused there is no hire form, no chat or payout page, and no chat requests', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => { if (/\/api\/chats/.test(request.url())) requests.push(request.url()); });
  const learner = await member();
  await signIn(page, learner, '/consulting');
  await expect(page.getByRole('heading', { level: 1, name: 'การปรึกษา' })).toBeVisible();
  await expect(page.getByText('ยังไม่มีการปรึกษา')).toBeVisible();
  await expect(page.locator('.main-nav .cx-unread')).toHaveCount(0);
  await page.goto(`/mentors/${fixture.mentorId}`);
  await expect(page.getByRole('region', { name: 'ติดต่อเมนเทอร์คนนี้' })).toBeVisible();
  await expect(page.getByText('ชำระ')).toHaveCount(0);
  await page.goto(`/competitions/${fixture.competition.slug}`);
  expect(requests).toEqual([]);

  // ผู้ดูแลไม่เห็นลิงก์โอนเงินกับเรื่องแจ้งปัญหา
  const admin = await createAccount('admin', { verified: true });
  accounts.push(admin);
  await page.context().clearCookies();
  await signIn(page, admin, '/admin');
  const nav = page.getByRole('navigation', { name: 'เมนูหน้าจัดการ' });
  await expect(nav.getByRole('link', { name: 'รีวิว' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'โอนเงินเมนเทอร์' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'เรื่องแจ้งปัญหา' })).toHaveCount(0);
});

test('the contact card handles signed-out, unverified and own-profile viewers', async ({ page }) => {
  await page.goto(`/mentors/${fixture.mentorId}?competition=${fixture.competition.slug}`);
  const panel = page.getByRole('region', { name: 'ติดต่อเมนเทอร์คนนี้' });
  await expect(panel.getByText('เข้าสู่ระบบเพื่อดูช่องทางติดต่อเมนเทอร์คนนี้')).toBeVisible();
  await expect(panel.getByRole('link', { name: 'เข้าสู่ระบบ' })).toBeVisible();
  await expect(page.getByText('fixture.line')).toHaveCount(0);

  // ยังไม่ยืนยันอีเมล: ให้ยืนยันก่อน ไม่มีปุ่มติดต่อ และเซิร์ฟเวอร์ไม่ให้ช่องทางติดต่อ
  const unverified = await member(undefined, false);
  await signIn(page, unverified, `/mentors/${fixture.mentorId}`);
  await expect(page.getByText('ยืนยันอีเมลเพื่อทำต่อ')).toBeVisible();
  await expect(page.getByRole('button', { name: 'ติดต่อเมนเทอร์' })).toHaveCount(0);
  expect((await page.request.post(`/api/consult/mentors/${fixture.mentorId}/contact`, { data: {} })).status()).toBe(403);
  await expect(page.getByText('fixture.line')).toHaveCount(0);

  // โปรไฟล์ของตัวเอง: ไปแก้ช่องทางในโซนเมนเทอร์ ติดต่อตัวเองไม่ได้
  await page.context().clearCookies();
  await signIn(page, fixture.owner, `/mentors/${fixture.mentorId}`);
  await expect(page.getByText('นี่คือโปรไฟล์ของคุณเอง')).toBeVisible();
  await expect(page.getByRole('link', { name: 'แก้ช่องทางติดต่อในโซนเมนเทอร์' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ติดต่อเมนเทอร์' })).toHaveCount(0);
});

test('cancelling a contact asks first, and the member can contact again', async ({ page }) => {
  const learner = await member();
  await signIn(page, learner, `/mentors/${fixture.mentorId}`);
  await page.getByRole('button', { name: 'ติดต่อเมนเทอร์' }).click();
  await expect(page.getByRole('heading', { name: 'ช่องทางติดต่อเมนเทอร์' })).toBeVisible();
  await page.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
  await expect(page.getByText('ยกเลิกการติดต่อนี้หรือไม่')).toBeVisible();
  await page.getByRole('button', { name: 'เก็บไว้' }).click();
  await page.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
  await page.getByRole('button', { name: 'ใช่ ยกเลิก' }).click();
  await expect(page.getByText('คุณยกเลิกการติดต่อนี้แล้ว')).toBeVisible();
  // ยกเลิกแล้วช่องทางติดต่อหายไปจนกว่าจะติดต่อใหม่
  await expect(page.getByText('fixture.line')).toHaveCount(0);
  await page.getByRole('button', { name: 'ติดต่ออีกครั้ง' }).click();
  await expect(page.getByText('fixture.line')).toBeVisible();
});

/* ---------- ภาพหน้าจอ: ข้อมูลไทยที่สมจริง ---------- */

test('the contact pages are captured with realistic Thai data', async ({ page, browser, baseURL }, info) => {
  const thai = await createMentorFixture({ thai: true });
  extraCleanups.push(thai.cleanup);
  await db.update(mentors).set({ contactEmail: 'thanaphon@example.com', contactLine: 'thanaphon.coach', contactInstagram: 'thanaphon.pitch', contactLink: 'https://example.com/book' })
    .where(eq(mentors.id, thai.mentorId));
  const learner = await member('ปรียา วงศ์สวัสดิ์');
  const other = await member('ณัฐพล แก้วใส');
  const capture = async (target: Page, name: string) => {
    if (info.project.name !== 'tablet') await target.screenshot({ path: `artifacts/${name}-${info.project.name}.png`, fullPage: true });
  };

  await signIn(page, learner, `/mentors/${thai.mentorId}?competition=${thai.competition.slug}`);
  await page.getByRole('button', { name: 'ติดต่อเมนเทอร์' }).click();
  await expect(page.getByRole('heading', { name: 'ช่องทางติดต่อเมนเทอร์' })).toBeVisible();
  await audit(page, 'profile with contacts (thai)');
  await capture(page, 'mentor-profile-contacts');
  await page.getByRole('button', { name: 'ฉันได้รับคำแนะนำแล้ว' }).click();
  await expect(page.getByText('เราส่งอีเมลให้เมนเทอร์ยืนยันแล้ว')).toBeVisible();

  // นักเรียนอีกคนที่คุยเสร็จและรอเมนเทอร์ยืนยัน ให้หน้า Mentor zone มีสองรายการ
  await db.insert(consultations).values({ id: `cns-${other.id}`, userId: other.id, mentorId: thai.mentorId, competitionId: thai.competition.id, status: 'claimed', minutes: 0, claimedAt: new Date(Date.now() - 2 * 86_400_000) });

  await page.goto('/consulting');
  await expect(page.getByRole('heading', { level: 1, name: 'การปรึกษา' })).toBeVisible();
  await audit(page, 'consulting (thai)');
  await capture(page, 'consulting-contact');

  const size = page.viewportSize() ?? undefined;
  const zoneContext = await browser.newContext({ storageState: THAI_ONLY(baseURL!), viewport: size });
  const zone = await zoneContext.newPage();
  try {
    await signIn(zone, thai.owner, '/mentor-zone');
    await expect(zone.getByRole('tab', { name: 'คำขอให้ยืนยัน (2)' })).toBeVisible();
    await expect(zone.locator('.cx-waiting')).toHaveCount(2);
    await audit(zone, 'mentor zone confirmations (thai)');
    await capture(zone, 'mentor-zone-confirm');
    const token = await tokenFor(thai.owner.email);
    const link = await zoneContext.newPage();
    await link.goto(`/confirm?token=${token}`);
    await expect(link.getByRole('button', { name: 'ใช่ ยืนยัน' })).toBeVisible();
    await capture(link, 'confirm-page');
    await link.close();
  } finally {
    await zone.close();
    await zoneContext.close();
  }
});
