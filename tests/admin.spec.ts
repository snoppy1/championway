import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { competitionSubmissions, mentorSubmissions, pendingOf } from '../src/data/submissions';

const pages = [
  ['overview', '/admin'],
  ['competitions', '/admin/competitions'],
  ['competition-review', '/admin/competitions/cs-104'],
  ['mentors', '/admin/mentors'],
  ['mentor-review', '/admin/mentors/ms-057'],
] as const;

test('every admin page warns that there is no access control', async ({ page }) => {
  for (const [, path] of pages) {
    await page.goto(path);
    await expect(page.getByRole('note')).toContainText('ยังไม่มีระบบยืนยันตัวตนและสิทธิ์');
  }
});

test('the overview counts the queue and links through to both queues', async ({ page }) => {
  await page.goto('/admin');
  const waiting = pendingOf(competitionSubmissions).length + pendingOf(mentorSubmissions).length;
  await expect(page.getByRole('heading', { name: 'ภาพรวม' })).toBeVisible();
  await expect(page.locator('.stat-card').first()).toContainText(`${waiting} ใบ`);

  await page.getByRole('link', { name: /งานแข่ง \d+ ใบ/ }).click();
  await expect(page).toHaveURL(/admin\/competitions$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('คิวงานแข่ง');
});

test('the queue puts the longest wait first and filters by status', async ({ page }) => {
  await page.goto('/admin/competitions');
  const oldest = [...competitionSubmissions].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))[0];
  await expect(page.locator('.queue-row h2').first()).toHaveText(oldest.name);

  await page.getByRole('button', { name: 'รอตรวจ', exact: true }).click();
  const pending = pendingOf(competitionSubmissions);
  await expect(page.locator('.queue-row')).toHaveCount(pending.length);
  await expect(page.getByRole('status')).toContainText(`${pending.length} ใบ`);
});

test('publishing is blocked until every check is ticked', async ({ page }) => {
  await page.goto('/admin/competitions/cs-104');
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
  await publish.click();
  await expect(page.getByRole('status').last()).toContainText('ยังไม่บันทึกผล');

  // Unticking a box has to close the gate again, not leave the button enabled.
  await checks.first().click();
  await expect(publish).toBeDisabled();
});

test('rejecting and asking for more information both need a written reason', async ({ page }) => {
  await page.goto('/admin/competitions/cs-104');
  await page.getByRole('button', { name: 'ไม่ผ่าน' }).click();
  await expect(page.getByRole('alert')).toContainText('กรอกเหตุผลก่อน');
  await expect(page.getByLabel('เหตุผลที่จะส่งให้ผู้ส่ง')).toBeFocused();

  await page.getByLabel('เหตุผลที่จะส่งให้ผู้ส่ง').fill('ลิงก์ประกาศต้นทางเปิดไม่ได้');
  await page.getByRole('button', { name: 'ขอข้อมูลเพิ่ม' }).click();
  await expect(page.getByRole('status').last()).toContainText('ขอข้อมูลเพิ่ม');
});

test('the mentor review separates public data from data kept for checking only', async ({ page }) => {
  await page.goto('/admin/mentors/ms-057');
  const submission = mentorSubmissions.find((item) => item.id === 'ms-057')!;
  const publicBlock = page.locator('.admin-block.is-public');
  const privateBlock = page.locator('.admin-block.is-private');

  await expect(publicBlock).toContainText(`${submission.firstName} ${submission.lastName.slice(0, 1)}.`);
  await expect(publicBlock).not.toContainText(submission.email);
  await expect(privateBlock).toContainText(submission.email);
  await expect(privateBlock).toContainText(submission.lastName);

  // An award pointing at a competition we do not list has to be called out, not hidden.
  await page.goto('/admin/mentors/ms-056');
  await expect(page.locator('.award-unmatched')).toContainText('ไม่พบเวทีนี้ในระบบ');
});

test('admin visual QA and accessibility', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  for (const [name, path] of pages) {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow, `${name} overflows horizontally`).toBe(false);

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations, `${name} accessibility violations`).toEqual([]);

    await page.screenshot({ path: `artifacts/admin-${name}-${testInfo.project.name}.png`, fullPage: true });
  }

  expect(errors).toEqual([]);
});
