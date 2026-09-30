import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { eq } from 'drizzle-orm';
import { db } from '../server/db/client';
import { consultations, users } from '../server/db/schema';
import { competitions as demoCompetitions } from '../src/data/competitions';
import {
  createAccount, createMentorFixture, createVerifyToken, removeAccount, signIn, verifyEmail,
} from './helpers';
import type { MentorFixture, TestAccount } from './helpers';

/* ติดต่อเมนเทอร์ → ได้รับคำแนะนำ → เมนเทอร์ยืนยัน → รีวิว ทั้งเส้นทางผ่านเบราว์เซอร์จริง
   แต่ละเทสสร้างเมนเทอร์ เวที และบัญชีของตัวเอง (id สุ่ม) จึงรันขนานกันได้ทั้งสามขนาดจอ
   ส่วนอันดับในแท็บเมนเทอร์ที่พร้อมให้ปรึกษาใช้ข้อมูลตัวอย่างของ seed (server/db/demo-data.ts) */

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

test('a student contacts a mentor, gets guidance, the mentor confirms, and the student reviews', async ({ page, browser, baseURL }) => {
  const learner = await student();
  await signIn(page, learner, `/mentors/${fixture.mentorId}?competition=${fixture.competition.slug}`);
  await expect(page.getByRole('heading', { level: 1, name: fixture.name })).toBeVisible();
  await expect(page.locator('.cx-facts')).toContainText('500 บาท / 60 นาที');

  // ก่อนกดติดต่อยังไม่เห็นช่องทางใดเลย และเวทีที่มากับลิงก์ถูกเลือกไว้ให้แล้ว
  const contact = page.getByRole('region', { name: 'ติดต่อเมนเทอร์คนนี้' });
  await expect(contact.locator('.cx-contacts')).toHaveCount(0);
  await expect(page.getByLabel('ติดต่อเรื่องเวทีไหน')).toHaveValue(fixture.competition.slug);
  await contact.getByRole('button', { name: 'ติดต่อเมนเทอร์' }).click();

  // ช่องที่เมนเทอร์ไม่ได้กรอกต้องแสดงเป็น "-" ไม่ใช่หายไป
  const channels = contact.locator('.cx-contacts > div');
  await expect(channels).toHaveCount(5);
  await expect(channels.filter({ hasText: 'LINE ID' })).toContainText('fixture.line');
  await expect(channels.filter({ hasText: 'Instagram' })).toContainText('fixture.ig');
  await expect(channels.filter({ hasText: 'อีเมล' })).toContainText('-');
  await expect(channels.filter({ hasText: 'เบอร์โทร' })).toContainText('-');
  // ค่าที่กรอกแล้วกดได้ ประกอบลิงก์จากค่าที่เมนเทอร์พิมพ์ ช่องที่ว่างไม่มีลิงก์
  await expect(channels.filter({ hasText: 'LINE ID' }).getByRole('link')).toHaveAttribute('href', 'https://line.me/ti/p/~fixture.line');
  await expect(channels.filter({ hasText: 'Instagram' }).getByRole('link')).toHaveAttribute('href', 'https://www.instagram.com/fixture.ig/');
  await expect(channels.filter({ hasText: 'LINE ID' }).getByRole('link')).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(channels.filter({ hasText: 'อีเมล' }).getByRole('link')).toHaveCount(0);
  // บรรทัดขั้นตอนบอกว่าอยู่ตรงไหน ขั้นปัจจุบันตัวหนา
  await expect(contact.locator('.cx-steps')).toContainText('1 ติดต่อเมนเทอร์ · 2 แจ้งว่าได้รับคำแนะนำ · 3 รีวิว');
  await expect(contact.locator('.cx-steps strong')).toHaveText('2 แจ้งว่าได้รับคำแนะนำ');

  await contact.getByRole('button', { name: 'ฉันได้รับคำแนะนำแล้ว' }).click();
  await expect(contact.getByText('เราส่งอีเมลให้เมนเทอร์ยืนยันแล้ว')).toBeVisible();
  await expect(contact.getByRole('button', { name: 'ฉันได้รับคำแนะนำแล้ว' })).toHaveCount(0);

  // ฝั่งเมนเทอร์: ลิงก์ในอีเมลพามาที่รายการนี้ใน Mentor zone แล้วกดยืนยัน
  const [row] = await db.select().from(consultations).where(eq(consultations.mentorId, fixture.mentorId));
  const mentorContext = await browser.newContext({ storageState: THAI_ONLY(baseURL!), viewport: page.viewportSize() ?? undefined });
  const zone = await mentorContext.newPage();
  try {
    await signIn(zone, fixture.owner, `/mentor-zone#confirm-${row.id}`);
    const item = zone.locator(`#confirm-${row.id}`);
    await expect(item).toBeVisible();
    await expect(item).toHaveClass(/is-target/);
    await expect(item).toContainText('Test แจ้งว่าได้รับคำแนะนำจากคุณ');
    await item.getByRole('button', { name: 'ยืนยันการปรึกษากับ Test' }).click();
    await expect(zone.getByText('ยืนยันแล้ว นักเรียนรีวิวคุณได้แล้ว')).toBeVisible();
    await expect(zone.getByRole('heading', { name: 'การปรึกษาที่รอยืนยัน (0)' })).toBeVisible();
  } finally {
    await zone.close();
    await mentorContext.close();
  }

  // ฝั่งนักเรียน: เมื่อเมนเทอร์ยืนยันแล้วจึงรีวิวได้ ต้องเลือกดาวก่อนส่ง
  await page.reload();
  await expect(contact.getByText('เมนเทอร์ยืนยันการปรึกษานี้แล้ว')).toBeVisible();
  await expect(contact.locator('.cx-steps strong')).toHaveText('3 รีวิว');
  await contact.getByRole('button', { name: 'ส่งรีวิว' }).click();
  await expect(contact.getByRole('alert').filter({ hasText: 'เลือก 1 ถึง 5 ดาว' })).toBeVisible();
  await contact.locator('.cx-star').nth(3).click();
  await contact.getByLabel('ความเห็น (ไม่บังคับ)').fill('Clear advice on scoping.');
  await contact.getByRole('button', { name: 'ส่งรีวิว' }).click();
  await expect(contact.getByText('คุณรีวิวการปรึกษานี้แล้ว')).toBeVisible();

  // รีวิวขึ้นหน้าเมนเทอร์ทันที และคะแนนเดือนนี้เปลี่ยนจาก "ยังไม่มีรีวิว"
  await expect(page.locator('.cx-facts')).toContainText('4.0 · 1 รีวิว');
  await expect(page.getByRole('region', { name: 'รีวิว' })).toContainText('Clear advice on scoping.');
  // รีวิวได้ครั้งเดียว: ฟอร์มหายไปแล้ว แต่ติดต่ออีกครั้งได้
  await expect(contact.getByRole('button', { name: 'ส่งรีวิว' })).toHaveCount(0);
  await expect(contact.getByRole('button', { name: 'ติดต่ออีกครั้ง' })).toBeVisible();

  await page.goto('/consulting');
  const listed = page.locator('.cx-consult').filter({ hasText: fixture.name });
  await expect(listed.getByText('รีวิวแล้ว').first()).toBeVisible();
});

test('an account that has not verified its email is asked to, and sees contacts only after it does', async ({ page }) => {
  const learner = await student({ verified: false });
  await signIn(page, learner, `/mentors/${fixture.mentorId}`);
  await expect(page.getByRole('heading', { level: 1, name: fixture.name })).toBeVisible();

  const contact = page.getByRole('region', { name: 'ติดต่อเมนเทอร์คนนี้' });
  await expect(contact.getByText('ยืนยันอีเมลเพื่อทำต่อ')).toBeVisible();
  await expect(contact.getByRole('button', { name: 'ติดต่อเมนเทอร์' })).toHaveCount(0);
  await expect(contact.locator('.cx-contacts')).toHaveCount(0);
  // เซิร์ฟเวอร์ปฏิเสธเองด้วย ไม่ใช่แค่ซ่อนปุ่มในหน้า
  expect((await page.request.post(`/api/consult/mentors/${fixture.mentorId}/contact`, { data: {} })).status()).toBe(403);

  await contact.getByRole('button', { name: 'ส่งอีเมลยืนยัน' }).click();
  await expect(contact.getByRole('status')).toContainText(`เราส่งลิงก์ไปที่ ${learner.email}`);
  // ขอซ้ำทันทีโดนหน่วง 60 วินาที ต้องบอกให้รอ ไม่ใช่ error ลอย ๆ
  await contact.getByRole('button', { name: 'ส่งอีเมลยืนยัน' }).click();
  await expect(contact.getByRole('alert')).toContainText('รอ 1 นาที');

  // กดลิงก์ในอีกแท็บแล้วกลับมา หน้านี้ต้องอ่านสถานะใหม่เอง
  await verifyEmail(learner);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(contact.getByRole('button', { name: 'ติดต่อเมนเทอร์' })).toBeVisible();
  await expect(contact.getByText('ยืนยันอีเมลเพื่อทำต่อ')).toHaveCount(0);
});

test('a signed-out visitor is sent to sign in and comes back to the same mentor', async ({ page }) => {
  await page.goto(`/mentors/${fixture.mentorId}?competition=${fixture.competition.slug}`);
  const contact = page.getByRole('region', { name: 'ติดต่อเมนเทอร์คนนี้' });
  await expect(contact.getByText('เข้าสู่ระบบเพื่อดูช่องทางติดต่อเมนเทอร์คนนี้')).toBeVisible();
  // ราคาและรีวิวดูได้โดยไม่ต้องเข้าสู่ระบบ มีแค่ช่องทางติดต่อที่ไม่เปิด
  await expect(page.getByRole('region', { name: 'เวทีที่เมนเทอร์คนนี้ช่วยได้' })).toContainText('500 บาท / 60 นาที');
  await expect(page.locator('.cx-contacts')).toHaveCount(0);
  const signInLink = contact.getByRole('link', { name: 'เข้าสู่ระบบ' });
  await expect(signInLink).toHaveAttribute('href', `/signin?next=${encodeURIComponent(`/mentors/${fixture.mentorId}?competition=${fixture.competition.slug}`)}`);
  expect((await page.request.post(`/api/consult/mentors/${fixture.mentorId}/contact`, { data: {} })).status()).toBe(401);
});

test('the mentor sees their own profile without a contact button', async ({ page }) => {
  await signIn(page, fixture.owner, `/mentors/${fixture.mentorId}`);
  const contact = page.getByRole('region', { name: 'ติดต่อเมนเทอร์คนนี้' });
  await expect(contact.getByText('นี่คือโปรไฟล์ของคุณเอง')).toBeVisible();
  await expect(contact.getByRole('button', { name: 'ติดต่อเมนเทอร์' })).toHaveCount(0);
  await expect(contact.getByRole('link', { name: 'แก้ข้อมูลของคุณในโซนเมนเทอร์' })).toHaveAttribute('href', '/mentor-zone');
});

test('a student can cancel before the mentor confirms, then contact again', async ({ page }) => {
  const learner = await student();
  await signIn(page, learner, `/mentors/${fixture.mentorId}`);
  const contact = page.getByRole('region', { name: 'ติดต่อเมนเทอร์คนนี้' });
  await contact.getByRole('button', { name: 'ติดต่อเมนเทอร์' }).click();
  await expect(contact.getByRole('button', { name: 'ฉันได้รับคำแนะนำแล้ว' })).toBeVisible();

  await contact.getByRole('button', { name: 'ยกเลิกการปรึกษา' }).click();
  // ถามก่อนยกเลิก และเก็บไว้ได้
  await expect(contact.getByText('ยกเลิกการปรึกษานี้หรือไม่')).toBeVisible();
  await contact.getByRole('button', { name: 'เก็บไว้' }).click();
  await expect(contact.getByRole('button', { name: 'ฉันได้รับคำแนะนำแล้ว' })).toBeVisible();

  await contact.getByRole('button', { name: 'ยกเลิกการปรึกษา' }).click();
  await contact.getByRole('button', { name: 'ใช่ ยกเลิก' }).click();
  await expect(contact.getByText('คุณยกเลิกการปรึกษานี้แล้ว')).toBeVisible();
  // ยกเลิกแล้วช่องทางติดต่อถูกซ่อนอีกครั้ง
  await expect(contact.locator('.cx-contacts')).toHaveCount(0);
  await contact.getByRole('button', { name: 'ติดต่ออีกครั้ง' }).click();
  await expect(contact.locator('.cx-contacts')).toBeVisible();
  await expect(contact.getByRole('button', { name: 'ฉันได้รับคำแนะนำแล้ว' })).toBeVisible();
});

test('the Consulting page lists every consultation, starts empty, and old chat links land on it', async ({ page }) => {
  const learner = await student();
  await signIn(page, learner, '/consulting');
  await expect(page.getByRole('heading', { level: 1, name: 'การปรึกษา' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'ยังไม่มีการปรึกษา' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: 'สำรวจการแข่งขัน' })).toHaveAttribute('href', '/explore');

  await page.goto(`/mentors/${fixture.mentorId}`);
  await page.getByRole('button', { name: 'ติดต่อเมนเทอร์' }).click();
  await expect(page.getByRole('button', { name: 'ฉันได้รับคำแนะนำแล้ว' })).toBeVisible();

  await page.goto('/consulting');
  const item = page.locator('.cx-consult').filter({ hasText: fixture.name });
  await expect(item.getByText('กำลังดำเนินการ').first()).toBeVisible();
  // ทำได้จากหน้านี้เลย ไม่ต้องกลับไปหน้าเมนเทอร์
  await item.getByRole('button', { name: 'ฉันได้รับคำแนะนำแล้ว' }).click();
  await expect(item.getByText('รอเมนเทอร์ยืนยัน').first()).toBeVisible();
  await expect(item.getByRole('link', { name: 'ดูเมนเทอร์และช่องทางติดต่อ' })).toBeVisible();

  for (const old of ['/chats', '/chats/some-room']) {
    await page.goto(old);
    await expect(page).toHaveURL(/\/consulting$/);
  }
  // คนที่ยังไม่เข้าสู่ระบบถูกพาไปเข้าสู่ระบบก่อน แล้วกลับมาที่หน้านี้
  await page.context().clearCookies();
  await page.goto('/consulting');
  await expect(page).toHaveURL(/\/signin\?next=(%2F|\/)consulting$/);
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

test('the Mentor zone is for approved mentors, and a mentor can manage contacts, prices and requests', async ({ page }) => {
  // คนที่ไม่ใช่เมนเทอร์เห็นคำอธิบายพร้อมทางสมัคร ไม่ใช่หน้าเปล่า
  const learner = await student();
  await signIn(page, learner, '/mentor-zone');
  await expect(page.getByRole('heading', { name: 'โซนเมนเทอร์สำหรับเมนเทอร์ที่ผ่านการอนุมัติ' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'สมัครเป็นเมนเทอร์' })).toHaveAttribute('href', '/mentors/apply');
  await page.context().clearCookies();

  await signIn(page, fixture.owner, '/mentor-zone');
  await expect(page.getByRole('heading', { level: 1, name: 'โซนเมนเทอร์' })).toBeVisible();
  // ไม่มีรายการรอยืนยันก็ไม่มีส่วนนี้เลย ไม่ใช่กล่องว่างที่แย่งที่
  await expect(page.getByRole('heading', { name: /การปรึกษาที่รอยืนยัน/ })).toHaveCount(0);

  // ช่องทางติดต่อ: ต้องมีอย่างน้อยหนึ่งช่อง อีเมลและลิงก์ต้องถูกรูปแบบ
  const contacts = page.getByRole('region', { name: 'ช่องทางที่นักเรียนติดต่อคุณ' });
  await expect(contacts.getByLabel('LINE ID')).toHaveValue('fixture.line');
  await contacts.getByLabel('LINE ID').fill('');
  await contacts.getByLabel('Instagram').fill('');
  await contacts.getByRole('button', { name: 'บันทึก' }).click();
  await expect(contacts.getByRole('alert')).toContainText('ใส่ช่องทางติดต่ออย่างน้อยหนึ่งช่อง');
  await contacts.getByLabel('อีเมล').fill('not-an-email');
  await contacts.getByRole('button', { name: 'บันทึก' }).click();
  await expect(contacts.getByRole('alert')).toContainText('ใส่อีเมลให้ถูกต้อง');
  await contacts.getByLabel('อีเมล').fill('mentor@example.test');
  await contacts.getByLabel('ลิงก์อื่น').fill('javascript:alert(1)');
  await contacts.getByRole('button', { name: 'บันทึก' }).click();
  await expect(contacts.getByRole('alert')).toContainText('ลิงก์ต้องขึ้นต้นด้วย https://');
  await contacts.getByLabel('ลิงก์อื่น').fill('');
  await contacts.getByRole('button', { name: 'บันทึก' }).click();
  await expect(contacts.getByRole('status')).toContainText('บันทึกแล้ว');

  // เวทีที่รับปรึกษา: แก้ราคาเป็นอัตราเล็ก ๆ ได้ และหน้าเวทีเห็นราคาใหม่
  const mine = page.getByRole('region', { name: 'เวทีที่ฉันรับปรึกษา' });
  const row = mine.locator('.cx-competition').filter({ hasText: fixture.competition.name });
  await expect(row).toContainText('500 บาท / 60 นาที');
  await expect(row.getByRole('button', { name: /^บันทึกราคาของ/ })).toBeDisabled();
  await row.getByLabel('ราคา (บาท)').fill('10');
  await row.getByLabel('จำนวนนาที').fill('1');
  await row.getByRole('button', { name: /^บันทึกราคาของ/ }).click();
  await expect(mine.getByRole('status')).toContainText('บันทึกแล้ว');
  await expect(row).toContainText('10 บาท / 1 นาที');
  const listed = await (await page.request.get(`/api/consult/competitions/${fixture.competition.slug}/mentors`)).json();
  expect([...listed.risingStar, ...listed.others].find((m: { id: string }) => m.id === fixture.mentorId)).toMatchObject({ price: 10, minutes: 1 });
  // ราคาเป็นศูนย์ได้ แต่ราคาติดลบหรือนาทีเป็นศูนย์ไม่ได้
  await row.getByLabel('จำนวนนาที').fill('0');
  await row.getByRole('button', { name: /^บันทึกราคาของ/ }).click();
  await expect(row.getByRole('alert')).toContainText('ใส่ราคา 0 ถึง 100,000 บาท');

  // เพิ่มเวทีที่เปิดรับสมัครอยู่จากรายการ แล้วเอาออก
  const add = page.getByRole('region', { name: 'เพิ่มเวที' });
  await add.getByLabel('ค้นหาเวทีที่เปิดรับสมัคร').fill(fixture.spare.name);
  const candidate = add.locator('.cx-competition').filter({ hasText: fixture.spare.name });
  await candidate.getByText('รายละเอียด').click();
  await expect(candidate).toContainText('A competition made for a test.');
  // ถามราคาหลังเลือกเวทีเท่านั้น
  await expect(candidate.getByLabel('ราคา (บาท)')).toHaveCount(0);
  await candidate.getByRole('button', { name: `เพิ่ม ${fixture.spare.name}` }).click();
  await candidate.getByRole('button', { name: 'เพิ่มในรายการของฉัน' }).click();
  await expect(mine.locator('.cx-competition').filter({ hasText: fixture.spare.name })).toBeVisible();
  await mine.getByRole('button', { name: `เอา ${fixture.spare.name} ออก` }).click();
  await expect(mine.getByText(`เอา ${fixture.spare.name} ออกจากรายการของคุณหรือไม่`).first()).toBeVisible();
  await mine.getByRole('button', { name: 'ใช่ เอาออก' }).click();
  await expect(mine.locator('.cx-competition').filter({ hasText: fixture.spare.name })).toHaveCount(0);
  await add.getByLabel('ค้นหาเวทีที่เปิดรับสมัคร').fill('zzz-no-such-competition');
  await expect(add.getByText('ไม่พบเวทีที่ตรงกับคำค้น')).toBeVisible();

  // ขอเพิ่มเวทีใหม่: ตรวจฟอร์มก่อนส่ง แล้วเห็นสถานะรอทีมงาน
  const request = page.getByRole('region', { name: 'ไม่เจอเวทีของคุณ' });
  await expect(request).toBeHidden();
  await add.getByRole('button', { name: 'ไม่มีในรายการ? ขอเพิ่มเวที' }).click();
  await request.getByRole('button', { name: 'ส่งคำขอ' }).click();
  await expect(request.getByRole('alert')).toContainText('กรอกชื่อเวที');
  await request.getByLabel('ชื่อเวที').fill('Brand New Cup');
  await request.getByLabel('ลิงก์ประกาศ').fill('ftp://nope');
  await request.getByRole('button', { name: 'ส่งคำขอ' }).click();
  await expect(request.getByRole('alert')).toContainText('ขึ้นต้นด้วย https://');
  await request.getByLabel('ลิงก์ประกาศ').fill('https://example.test/brand-new-cup');
  await request.getByLabel('รายละเอียด (ไม่บังคับ)').fill('Open to all students.');
  await request.getByRole('button', { name: 'ส่งคำขอ' }).click();
  await expect(request.getByRole('status')).toContainText('ส่งคำขอแล้ว');
  const submitted = page.locator('.cx-request').filter({ hasText: 'Brand New Cup' });
  await expect(submitted).toContainText('รอทีมงานตรวจ');
  await expect(submitted).toContainText('500 บาท / 60 นาที');
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

test('the profile shows the email status, sends the link, and no longer offers bookings or chats', async ({ page }) => {
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
  await expect(page.getByText('ยืนยันแล้ว คุณเห็นช่องทางติดต่อเมนเทอร์และเขียนรีวิวได้')).toBeVisible();
  await expect(page.getByRole('button', { name: 'ส่งอีเมลยืนยัน' })).toHaveCount(0);
});

test('a mentor with a published profile reaches the Mentor zone from their profile page', async ({ page }) => {
  await signIn(page, fixture.owner, '/profile');
  await expect(page.getByRole('link', { name: 'โซนเมนเทอร์' }).first()).toHaveAttribute('href', '/mentor-zone');
  await expect(page.locator(`main a[href="/mentors/${fixture.mentorId}"]`)).toBeVisible();
});

/* ---------- แท็บเมนเทอร์ที่พร้อมให้ปรึกษาในหน้าเวที ---------- */

test('Available mentors ranks Rising Star members by this month’s average stars, then lists the rest unranked', async ({ page }) => {
  const slug = demoCompetitions[0].slug;
  await page.goto(`/competitions/${slug}#mentors`);
  // ลิงก์ที่มี #mentors เปิดที่แท็บเมนเทอร์เลย
  const tab = page.getByRole('tab', { name: 'เมนเทอร์ที่พร้อมให้ปรึกษา' });
  await expect(tab).toHaveAttribute('aria-selected', 'true');

  const rising = page.getByRole('region', { name: 'เมนเทอร์ Rising Star' }).locator('.rs-row');
  await expect(rising).toHaveCount(4);
  const names = await rising.locator('.rs-row__name').allTextContents();
  expect(names.map((name) => name.replace('Rising Star', ''))).toEqual(['พี่มายด์ ก.', 'พี่เจ ธ.', 'พี่นัท ว.', 'พี่เต้ ส.']);
  // เรียงตามค่าเฉลี่ยดาวของรีวิวเดือนนี้ และบอกจำนวนรีวิวกำกับ
  const ratings = await rising.locator('.rating').allTextContents();
  expect(ratings.map((text) => text.replace(/\s+/g, ' ').trim())).toEqual([
    expect.stringContaining('4.8 · 4 รีวิว'), expect.stringContaining('4.3 · 3 รีวิว'),
    expect.stringContaining('4.0 · 2 รีวิว'), expect.stringContaining('3.5 · 2 รีวิว'),
  ]);
  for (const [index, row] of (await rising.all()).entries()) {
    await expect(row.locator('.rs-row__rank')).toContainText(`อันดับ ${index + 1}`);
    await expect(row.locator('.rs-row__meta')).toContainText('บาท');
  }

  // ที่ไม่ใช่สมาชิกอยู่ต่อท้ายและไม่มีอันดับ แม้คนหนึ่งจะมีรีวิว 5 ดาวเดือนนี้
  const others = page.getByRole('region', { name: 'เมนเทอร์คนอื่น ๆ' });
  await expect(others.locator('.rs-row__rank')).toHaveCount(0);
  await expect(others.locator('.rs-pill')).toHaveCount(0);
  await expect(others.locator('.rs-row__name')).toHaveText(['พี่พิม พ.', 'พี่ออม ร.']);
  const order = await page.locator('#panel-mentors section').evaluateAll((els) => els.map((el) => el.getAttribute('aria-labelledby')));
  expect(order).toEqual(['rising-title', 'others-title']);

  // ทุกคนลิงก์ไปโปรไฟล์ของตัวเอง พกเวทีไปด้วยเพื่อให้กดติดต่อเรื่องเวทีนี้ได้เลย
  await rising.first().getByRole('link', { name: /ดูโปรไฟล์ของ/ }).click();
  await expect(page).toHaveURL(new RegExp(`/mentors/mentor-mind\\?competition=${slug}$`));
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
  // ภาพหน้าจอใช้เมนเทอร์และนักเรียนชื่อไทย เวทีที่ปิดรับในอีกเดือนครึ่ง ไม่ใช่ข้อมูลทดสอบภาษาอังกฤษ
  const thai = await createMentorFixture({ thai: true });
  const learner = await createAccount('member', { verified: true, name: 'ปรียา วงศ์สวัสดิ์' });
  students.push(learner);
  const capture = async (name: string) => {
    if (info.project.name !== 'tablet') await page.screenshot({ path: `artifacts/${name}-${info.project.name}.png`, fullPage: true });
  };
  const audit = async (label: string) => {
    await expectNoSideScroll(page);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations, label).toEqual([]);
  };
  const mentorContext = await browser.newContext({ storageState: THAI_ONLY(baseURL!), viewport: page.viewportSize() ?? undefined });
  const zone = await mentorContext.newPage();
  try {
    await page.goto(`/competitions/${demoCompetitions[0].slug}#mentors`);
    await expect(page.locator('.rs-row').first()).toBeVisible();
    await audit('competition mentors tab');
    await capture('competition-mentors');

    await signIn(page, learner, `/mentors/${thai.mentorId}?competition=${thai.competition.slug}`);
    await page.getByRole('button', { name: 'ติดต่อเมนเทอร์' }).click();
    await expect(page.locator('.cx-contacts')).toBeVisible();
    await audit('mentor profile with contacts');
    await capture('mentor-profile');

    await page.getByRole('button', { name: 'ฉันได้รับคำแนะนำแล้ว' }).click();
    await expect(page.getByText('เราส่งอีเมลให้เมนเทอร์ยืนยันแล้ว')).toBeVisible();
    await page.goto('/consulting');
    await expect(page.locator('.cx-consult').first()).toBeVisible();
    await audit('consulting');
    await capture('consulting');

    // ฝั่งเมนเทอร์มีรายการรอยืนยัน ส่วนสีทองจึงโผล่ในภาพ
    await signIn(zone, thai.owner, '/mentor-zone');
    await expect(zone.getByRole('heading', { name: 'การปรึกษาที่รอยืนยัน (1)' })).toBeVisible();
    await expect(zone.getByRole('region', { name: 'เวทีที่ฉันรับปรึกษา' })).toBeVisible();
    await zone.setViewportSize(page.viewportSize()!);
    await zone.evaluate(() => window.scrollTo(0, 0));
    const results = await new AxeBuilder({ page: zone }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations, 'mentor zone').toEqual([]);
    expect(await zone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    if (info.project.name !== 'tablet') await zone.screenshot({ path: `artifacts/mentor-zone-${info.project.name}.png`, fullPage: true });
  } finally {
    await zone.close();
    await mentorContext.close();
    await thai.cleanup();
  }
});

test('touch targets on the new pages are at least 44px tall on phones', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) > 700, 'phone layout only');
  const learner = await student();
  await signIn(page, learner, `/mentors/${fixture.mentorId}`);
  await page.getByRole('button', { name: 'ติดต่อเมนเทอร์' }).click();
  await expect(page.locator('.cx-contacts')).toBeVisible();
  await page.goto('/consulting');
  await expect(page.locator('.cx-consult').first()).toBeVisible();
  for (const box of await page.locator('main button, main a.cx-button, main .cx-link').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height).filter((height) => height > 0))) {
    expect(box).toBeGreaterThanOrEqual(44);
  }
  await page.context().clearCookies();
  await signIn(page, fixture.owner, '/mentor-zone');
  await expect(page.getByRole('region', { name: 'เวทีที่ฉันรับปรึกษา' })).toBeVisible();
  for (const box of await page.locator('main button:not([disabled]), main a.cx-button, main summary').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height).filter((height) => height > 0))) {
    expect(box).toBeGreaterThanOrEqual(44);
  }
  // ตัวที่ถูก disabled ก็ต้องสูงพอเช่นกัน ปุ่มบันทึกราคายังไม่มีอะไรเปลี่ยนจึงถูกปิดอยู่
  await expect(page.getByRole('button', { name: /^บันทึกราคาของ/ }).first()).toBeDisabled();
  expect(await page.getByRole('button', { name: /^บันทึกราคาของ/ }).first().evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
});
