import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createAccount, removeAccount, removeListings, signIn } from './helpers';
import type { TestAccount } from './helpers';

/* ช่วงเริ่มต้นยังไม่มีผู้จัดมาลงงานเอง ทีมงานจึงกรอกเวทีเองจากหน้าจัดการ
   เทสชุดนี้คุมเส้นทางนั้นตั้งแต่กรอกจนขึ้นหน้าเว็บสาธารณะ */

const PREFIX = 'เวทีเทสหน้าจัดการ';
let reviewer: TestAccount;

test.beforeAll(async () => { reviewer = await createAccount('reviewer'); });
/* ไม่ล้างเวทีรวมทีเดียวใน afterAll เพราะ hook นี้รันต่อ worker
   worker ที่จบก่อนจะลบเวทีที่ worker อื่นกำลังใช้อยู่ เทสจึงเก็บของตัวเองแทน */
test.afterAll(async () => { await removeAccount(reviewer); });

async function fillRequired(page: Page, name: string) {
  // ประเภทงานกับหมวดจับคู่เมนเทอร์บังคับกรอก เวทีที่ขาดสองช่องนี้จะไม่ขึ้นหน้า "อยากแข่งงานไหน"
  await page.getByLabel('ประเภทงาน *').selectOption('hackathon');
  await page.getByRole('checkbox', { name: 'นวัตกรรม', exact: true }).check();
  await page.getByLabel('ชื่อเวที *').fill(name);
  await page.getByLabel('ผู้จัด *').fill('หน่วยงานสำหรับทดสอบ');
  await page.getByLabel('คำบรรยายสั้น *').fill('ทีมงานคัดจากประกาศจริงมากรอกเอง');
  await page.getByRole('checkbox', { name: 'เทคโนโลยีและนวัตกรรม' }).check();
  await page.getByRole('checkbox', { name: 'อุดมศึกษา' }).check();
  await page.getByLabel('ปิดรับ *').fill('2099-05-20');
  await page.getByLabel('ลิงก์ประกาศต้นทาง *').fill('https://example.test/announce');
}

test('only the review team can reach the listing endpoints', async ({ page }) => {
  const blocked = await page.request.get('/api/admin/listings');
  expect(blocked.status()).toBe(401);

  const member = await createAccount('member');
  await signIn(page, member, '/');
  expect((await page.request.get('/api/admin/listings')).status()).toBe(403);
  expect((await page.request.post('/api/admin/listings', { data: {} })).status()).toBe(403);
  await removeAccount(member);
});

test('the list shows what needs checking and both pages pass axe', async ({ page }) => {
  await signIn(page, reviewer, '/admin/listings');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('เวทีบนหน้าเว็บ');
  await expect(page.locator('.queue-row').first()).toBeVisible();

  // ข้อมูลที่ไม่ได้ตรวจนานต้องเห็นได้ทันที ไม่ใช่ต้องไปเปิดดูทีละอัน
  await expect(page.locator('.queue-facts .is-overdue').first()).toContainText('เกิน 30 วัน');

  let results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations, 'หน้ารายการ').toEqual([]);

  await page.getByRole('link', { name: 'เพิ่มเวที' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('เพิ่มเวทีใหม่');
  results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations, 'หน้าฟอร์ม').toEqual([]);
});

test('a listing cannot be saved without a source link or a stated prize', async ({ page }) => {
  await signIn(page, reviewer, '/admin/listings/new');
  await fillRequired(page, `${PREFIX} ตรวจความถูกต้อง`);

  await page.getByLabel('ลิงก์ประกาศต้นทาง *').fill('');
  await page.getByRole('button', { name: 'เพิ่มเวที' }).click();
  await expect(page.getByRole('alert')).toContainText('ต้องมีลิงก์ประกาศต้นทางที่เปิดได้');

  // ไม่มีเงินรางวัลก็ได้ แต่การ์ดที่ขึ้นว่า "ไม่มีเงินรางวัล" เฉย ๆ ไม่ช่วยให้ใครตัดสินใจ
  await page.getByLabel('ลิงก์ประกาศต้นทาง *').fill('https://example.test/announce');
  await page.getByRole('button', { name: 'เพิ่มเวที' }).click();
  await expect(page.getByRole('alert')).toContainText('ต้องบอกว่าผู้ชนะได้อะไรแทน');
});

test('a listing added here appears on the public site and can be edited', async ({ page }, testInfo) => {
  // เทสนี้เพิ่มเวทีจริงเข้าฐาน จึงรันเบราว์เซอร์เดียวไม่ให้จำนวนรายการนับกันมั่ว
  test.skip(testInfo.project.name !== 'desktop', 'mutates shared data');

  const name = `${PREFIX} ${Date.now()}`;
  await signIn(page, reviewer, '/admin/listings/new');
  await fillRequired(page, name);
  await page.getByLabel('เงินรางวัล (บาท)').fill('75000');
  await page.getByLabel('รูปแบบการแข่งขัน').fill('รอบคัดเลือกออนไลน์\nรอบชิงที่กรุงเทพฯ');
  await page.getByRole('button', { name: 'เพิ่มเวที' }).click();

  await expect(page).toHaveURL(/admin\/listings$/);
  await expect(page.locator('.queue-row', { hasText: name })).toHaveCount(1);

  const listed = await page.request.get(`/api/competitions?q=${encodeURIComponent(name)}`);
  const body = await listed.json() as { total: number; items: { slug: string; source: string; prizeValue: number }[] };
  expect(body.total).toBe(1);
  expect(body.items[0].source).toBe('editorial');
  expect(body.items[0].prizeValue).toBe(75000);

  // ส่วนที่กรอกเป็นบรรทัดต้องกลายเป็นรายการบนหน้ารายละเอียด ส่วนที่เว้นว่างต้องไม่ขึ้น
  await page.goto(`/competitions/${body.items[0].slug}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
  await expect(page.locator('.article-section h2')).toHaveText(['รูปแบบการแข่งขัน']);
  await expect(page.locator('.step-list li')).toHaveCount(2);

  await page.goto('/admin/listings');
  await page.locator('.queue-row', { hasText: name }).getByRole('link', { name }).click();
  await expect(page.getByLabel('ชื่อเวที *')).toHaveValue(name);
  await page.getByLabel('เงินรางวัล (บาท)').fill('90000');
  await page.getByRole('button', { name: 'บันทึกการแก้ไข' }).click();
  await expect(page).toHaveURL(/admin\/listings$/);

  const after = await page.request.get(`/api/competitions?q=${encodeURIComponent(name)}`);
  const updated = await after.json() as { items: { prizeValue: number; lastVerifiedAt: string }[] };
  expect(updated.items[0].prizeValue).toBe(90000);
  // แก้ข้อมูลแล้วถือว่าตรวจใหม่วันนี้ การ์ดเตือนข้อมูลค้างจะได้ตรงความจริง
  expect(updated.items[0].lastVerifiedAt).toBe(new Date().toISOString().slice(0, 10));

  expect(await removeListings(name)).toBe(1);
});

test('marking a listing as checked today clears the stale warning', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'mutates shared data');

  await signIn(page, reviewer, '/admin/listings');
  const stale = page.locator('.queue-row').filter({ has: page.locator('.is-overdue') }).first();
  const name = await stale.locator('h2').innerText();
  await stale.getByRole('button', { name: 'ตรวจแล้ววันนี้' }).click();

  const row = page.locator('.queue-row', { hasText: name });
  await expect(row.locator('.is-overdue')).toHaveCount(0);
});
