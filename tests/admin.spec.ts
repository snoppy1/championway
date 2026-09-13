import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createAccount, removeAccount, signIn } from './helpers';
import type { TestAccount } from './helpers';

const pages = [
  ['overview', '/admin'],
  ['competitions', '/admin/competitions'],
  ['competition-review', '/admin/competitions/cs-104'],
  ['mentors', '/admin/mentors'],
  ['mentor-review', '/admin/mentors/ms-057'],
] as const;

let reviewer: TestAccount;
test.beforeAll(async () => { reviewer = await createAccount('reviewer'); });
test.afterAll(async () => { await removeAccount(reviewer); });

test('the console is closed to signed-out visitors and to ordinary members', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'เข้าหน้าจัดการไม่ได้' })).toBeVisible();

  const member = await createAccount('member');
  await signIn(page, member, '/admin');
  await expect(page.getByRole('heading', { name: 'เข้าหน้าจัดการไม่ได้' })).toBeVisible();
  await expect(page.getByText('บัญชีนี้เป็นสมาชิกทั่วไป')).toBeVisible();

  // หน้าเว็บถูกข้ามได้เสมอ API จึงต้องปฏิเสธเองด้วย ไม่ใช่พึ่งการซ่อนปุ่ม
  const denied = await page.request.get('/api/admin/overview');
  expect(denied.status()).toBe(403);
  await removeAccount(member);
});

test('a reviewer sees the queue counts and can walk into both queues', async ({ page }) => {
  await signIn(page, reviewer, '/admin');
  await expect(page.getByRole('heading', { name: 'ภาพรวม' })).toBeVisible();
  await expect(page.locator('.stat-card').first()).toContainText('ใบ');

  await page.getByRole('link', { name: /งานแข่ง \d+ ใบ/ }).click();
  await expect(page).toHaveURL(/admin\/competitions$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('คิวงานแข่ง');
  // เรียงตามรอนานสุดก่อน ใบที่ส่งเมื่อ 16 วันก่อนจึงอยู่บนสุด
  await expect(page.locator('.queue-row h2').first()).toHaveText('Youth Ensemble Contest');
});

test('the queue filters by status', async ({ page }) => {
  await signIn(page, reviewer, '/admin/competitions');
  await page.getByRole('button', { name: 'รอตรวจ', exact: true }).click();

  /* ตรวจว่าหน้าจอสอดคล้องกับตัวเอง ไม่เทียบกับคำขอ API แยกอีกอัน
     เพราะเทสอื่นเปลี่ยนสถานะใบอยู่พร้อมกัน ตัวเลขจากสองแหล่งจึงไม่ตรงกันได้ */
  await expect(page.getByRole('status')).toHaveText(/^\d+ ใบ$/);
  const shown = Number((await page.getByRole('status').innerText()).replace(/\D/g, ''));
  await expect(page.locator('.queue-row')).toHaveCount(shown);

  // ทุกแถวที่กรองแล้วต้องเป็นสถานะที่เลือกจริง ๆ
  const pills = await page.locator('.queue-row .status-pill').allInnerTexts();
  expect(pills.every((text) => text === 'รอตรวจ'), pills.join(',')).toBe(true);
});

test('the mentor review separates public data from data kept for checking only', async ({ page }) => {
  await signIn(page, reviewer, '/admin/mentors/ms-057');
  const publicBlock = page.locator('.admin-block.is-public');
  const privateBlock = page.locator('.admin-block.is-private');

  await expect(publicBlock).toContainText('ณิชา ภ.');
  await expect(publicBlock).not.toContainText('nicha@example.com');
  await expect(privateBlock).toContainText('nicha@example.com');
  await expect(privateBlock).toContainText('ภัทรวงศ์');

  await page.goto('/admin/mentors/ms-056');
  await expect(page.locator('.award-unmatched')).toContainText('ไม่พบเวทีนี้ในระบบ');
});

test('rejecting needs a written reason, and the reason reaches the queue', async ({ page }, testInfo) => {
  // เทสนี้เปลี่ยนสถานะใบจริง จึงรันเบราว์เซอร์เดียว ไม่อย่างนั้นสามรอบจะชนกัน
  test.skip(testInfo.project.name !== 'desktop', 'mutates shared data');

  await signIn(page, reviewer, '/admin/competitions/cs-103');
  await page.getByRole('button', { name: 'ไม่ผ่าน' }).click();
  await expect(page.getByRole('alert')).toContainText('กรอกเหตุผลก่อน');
  await expect(page.getByLabel('เหตุผลที่จะส่งให้ผู้ส่ง')).toBeFocused();

  await page.getByLabel('เหตุผลที่จะส่งให้ผู้ส่ง').fill('ลิงก์ประกาศต้นทางเปิดไม่ได้');
  await page.getByRole('button', { name: 'ไม่ผ่าน' }).click();
  await expect(page.getByRole('status').last()).toContainText('บันทึกผลแล้ว');

  await page.reload();
  await expect(page.locator('.status-pill')).toContainText('ไม่ผ่าน');
  await expect(page.locator('.admin-trail')).toContainText('ลิงก์ประกาศต้นทางเปิดไม่ได้');
});

test('publishing needs every check, and the listing then appears on the public site', async ({ page }, testInfo) => {
  // เทสนี้เพิ่มเวทีจริงเข้าฐานข้อมูล ถ้ารันสามเบราว์เซอร์พร้อมกันจำนวนรายการจะนับกันมั่ว
  test.skip(testInfo.project.name !== 'desktop', 'mutates shared data');

  const organiser = await createAccount('member');
  await signIn(page, organiser, '/');
  const marker = `เวทีทดสอบระบบ ${Date.now()}`;
  const created = await page.request.post('/api/submissions/competition', {
    data: {
      organizerName: 'ชมรมทดสอบระบบ',
      contactName: 'ผู้ทดสอบ',
      contactRole: 'ผู้ประสานงาน',
      contactEmail: 'organiser@championways.test',
      contactPhone: '08x-xxx-0000',
      organizerUrl: 'https://example.test/club',
      name: marker,
      description: 'ใบนี้สร้างโดยชุดทดสอบเพื่อเดินเส้นทางตรวจและเผยแพร่',
      type: 'contest',
      kind: 'hackathon',
      themes: ['innovation'],
      categories: ['technology'],
      levels: ['university'],
      rewards: ['certificate'],
      teamMin: 1,
      teamMax: 3,
      closesAt: '2099-12-31',
      region: 'online',
      prizeValue: 12345,
      sourceUrl: 'https://example.test/club/announcement',
    },
  });
  expect(created.status()).toBe(201);
  const { id } = await created.json() as { id: string };

  await signIn(page, reviewer, `/admin/competitions/${id}`);
  const publish = page.getByRole('button', { name: 'เผยแพร่' });
  await expect(publish).toBeDisabled();

  const checks = page.locator('.review-check input');
  const total = await checks.count();
  for (let index = 0; index < total - 1; index += 1) await checks.nth(index).click();
  await expect(publish).toBeDisabled();
  await expect(page.locator('.review-gate')).toContainText('เหลืออีก 1 ข้อ');

  await checks.nth(total - 1).click();
  await expect(page.locator('.review-gate')).toHaveCount(0);
  await expect(publish).toBeEnabled();

  // เอาติ๊กออกแล้วต้องล็อกกลับ ไม่ใช่ปล่อยให้กดได้ทั้งที่เกณฑ์ไม่ครบ
  await checks.first().click();
  await expect(publish).toBeDisabled();
  await checks.first().click();

  await publish.click();
  await expect(page.getByRole('status').last()).toContainText('บันทึกผลแล้ว');
  await expect(page.locator('.status-pill')).toContainText('เผยแพร่แล้ว');

  const listed = await page.request.get(`/api/competitions?q=${encodeURIComponent(marker)}`);
  const body = await listed.json() as { total: number; items: { prizeValue: number; source: string }[] };
  expect(body.total).toBe(1);
  expect(body.items[0].prizeValue).toBe(12345);
  expect(body.items[0].source).toBe('organiser');

  await removeAccount(organiser);
});

test('admin visual QA and accessibility', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await signIn(page, reviewer, '/admin');

  for (const [name, path] of pages) {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
    await expect(page.getByText('กำลังโหลด…')).toHaveCount(0);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow, `${name} overflows horizontally`).toBe(false);

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations, `${name} accessibility violations`).toEqual([]);

    await page.screenshot({ path: `artifacts/admin-${name}-${testInfo.project.name}.png`, fullPage: true });
  }

  expect(errors).toEqual([]);
});
