import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/* หน้า /mentors (Rising Star) ใช้ข้อมูลตัวอย่างที่ seed ใส่ให้ตามแผนใน server/db/demo-data.ts
   อันดับมาจากค่าเฉลี่ยดาวของรีวิวที่เขียนในเดือนนั้น
   เดือนนี้ mind นำ (4.8) เดือนที่แล้ว jay นำ (4.8) สองเดือนก่อน pim นำ (5.0)
   สมาชิกตอนนี้เรียง mind, jay, nut, tae ส่วน pim (หมดสมาชิก) กับ aom (ไม่เคยสมัคร) ไม่มีอันดับ */

const emptyHall = [
  { month: '2026-09', closesAt: null, top: [] },
  { month: '2026-08', closesAt: null, top: [] },
  { month: '2026-07', closesAt: null, top: [] },
];
const payload = (viewer: unknown) => ({ hall: emptyHall, ranked: [], others: [], viewer, demo: false });

test('the Hall of Fame shows three months with this month first in the page', async ({ page }) => {
  await page.goto('/mentors');
  await expect(page.getByRole('heading', { level: 1, name: 'ทำเนียบ Rising Star' })).toBeVisible();

  const months = page.locator('.rs-month');
  await expect(months).toHaveCount(3);
  // ลำดับใน DOM คือเดือนนี้ เดือนที่แล้ว สองเดือนก่อน เพื่อให้คีย์บอร์ดและโปรแกรมอ่านหน้าจอเจอเดือนนี้ก่อน
  await expect(months.nth(0)).toHaveClass(/rs-month--now/);
  await expect(months.nth(0)).toContainText('เดือนนี้');
  await expect(months.nth(0).locator('.rs-winner__name')).toContainText('พี่มายด์');
  await expect(months.nth(0).locator('.rs-winner__count b')).toHaveText('4.8');
  await expect(months.nth(0)).toContainText('ปิดอันดับ');
  await expect(months.nth(1).locator('.rs-winner__name')).toContainText('พี่เจ');
  await expect(months.nth(1).locator('.rs-winner__count b')).toHaveText('4.8');
  await expect(months.nth(0).locator('.rs-winner__count')).toContainText(/4\s*รีวิว/);
  await expect(months.nth(1).locator('.rs-rank-row').first()).toContainText(/4\.3/);
  await expect(months.nth(2).locator('.rs-winner__name')).toContainText('พี่พิม');
  await expect(months.nth(2).locator('.rs-winner__count b')).toHaveText('5.0');

  // อันดับ 2 และ 3 ของเดือนนี้ต้องบอกอันดับเป็นข้อความ ไม่ใช่แค่สี
  await expect(months.nth(0).getByRole('img', { name: 'อันดับ 2' })).toBeVisible();
  await expect(months.nth(0).getByRole('img', { name: 'อันดับ 3' })).toBeVisible();
});

test('on wide screens the months sit in time order with this month in the middle', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) < 701, 'phones stack the months');
  await page.goto('/mentors');
  await expect(page.locator('.rs-month')).toHaveCount(3);
  const lefts = await page.locator('.rs-month').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().left));
  // [เดือนนี้, เดือนที่แล้ว, สองเดือนก่อน] → เดือนที่แล้วอยู่ซ้ายสุด เดือนนี้อยู่กลาง
  expect(lefts[1]).toBeLessThan(lefts[0]);
  expect(lefts[0]).toBeLessThan(lefts[2]);
});

test('the ranked list is numbered, and non-members come after it with no rank', async ({ page }) => {
  await page.goto('/mentors');
  const ranked = page.getByRole('region', { name: 'Rising Star เดือนนี้' }).locator('.rs-row');
  await expect(ranked).toHaveCount(4);
  // ทุกแถวบอกคะแนนเฉลี่ยกับจำนวนรีวิว ไม่ใช่จำนวนครั้งที่ปรึกษา
  const meta = (await ranked.locator('.rs-row__meta').allTextContents()).map((text) => text.replace(/\s+/g, ' '));
  expect(meta[0]).toContain('4.8 · 4 รีวิว');
  expect(meta[3]).toContain('3.5 · 2 รีวิว');
  const names = await ranked.locator('.rs-row__name').allTextContents();
  expect(names[0]).toContain('พี่มายด์');
  expect(names[1]).toContain('พี่เจ');
  expect(names[2]).toContain('พี่นัท');
  expect(names[3]).toContain('พี่เต้');
  for (const [index, row] of (await ranked.all()).entries()) {
    await expect(row.locator('.rs-row__rank')).toContainText(`อันดับ ${index + 1}`);
  }

  const others = page.getByRole('region', { name: 'เมนเทอร์คนอื่น ๆ' });
  await expect(others.locator('.rs-row__rank')).toHaveCount(0);
  await expect(others.locator('.rs-pill')).toHaveCount(0);
  await expect(ranked.locator('.rs-pill')).toHaveCount(4);
  await expect(others).toContainText('พี่พิม');
  await expect(others).toContainText('พี่ออม');
  // ส่วนที่ไม่มีอันดับอยู่หลังรายชื่อสมาชิกในหน้า
  const order = await page.locator('.rs-lists > section').evaluateAll((els) => els.map((el) => el.getAttribute('aria-labelledby')));
  expect(order).toEqual(['rs-ranked-title', 'rs-others-title']);

  await ranked.first().getByRole('link', { name: /ดูโปรไฟล์ของ/ }).click();
  await expect(page).toHaveURL(/\/mentors\/mentor-mind$/);
});

test('a guest is pointed to the mentor application', async ({ page }) => {
  await page.goto('/mentors');
  const upsell = page.getByRole('complementary');
  await expect(upsell.getByRole('heading', { name: 'ให้นักเรียนเจอคุณก่อนคนอื่น' })).toBeVisible();
  await expect(upsell.getByRole('link', { name: 'สมัครเป็นเมนเทอร์' })).toHaveAttribute('href', '/mentors/apply');
});

test('the old competition link still lands on the competition page', async ({ page }) => {
  await page.goto('/mentors?competition=some-competition');
  await expect(page).toHaveURL(/\/competitions\/some-competition#event-mentors$/);
});

test('an unreachable API shows an error with a retry that recovers', async ({ page }) => {
  let fail = true;
  await page.route('**/api/rising-star', (route) => (fail ? route.abort() : route.continue()));
  await page.goto('/mentors');
  await expect(page.getByRole('alert')).toContainText('โหลดรายชื่อเมนเทอร์ไม่สำเร็จ');
  fail = false;
  await page.getByRole('button', { name: 'ลองใหม่' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Rising Star เดือนนี้' })).toBeVisible();
});

test('empty data shows the empty states', async ({ page }) => {
  await page.route('**/api/rising-star', (route) => route.fulfill({ json: payload(null) }));
  await page.goto('/mentors');
  await expect(page.getByText('เดือนนี้ยังไม่มี Rising Star')).toBeVisible();
  await expect(page.getByText('เดือนนี้ไม่มี Rising Star ที่ติดอันดับ')).toHaveCount(2);
  await expect(page.getByText('ยังไม่มีสมาชิก Rising Star')).toBeVisible();
  await expect(page.getByText('ตอนนี้เมนเทอร์ทุกคนเป็นสมาชิก Rising Star แล้ว')).toBeVisible();
});

test('a mentor sees their own numbers, and a member sees a note instead of the upsell', async ({ page }) => {
  await page.route('**/api/rising-star', (route) => route.fulfill({
    json: payload({ mentorId: 'x', active: false, activeUntil: null, rating: { average: 4.3, reviews: 7 }, projectedRank: 2 }),
  }));
  await page.goto('/mentors');
  await expect(page.getByText(/คะแนนรีวิวเฉลี่ย 4\.3 จาก 7\s*รีวิว/)).toBeVisible();
  await expect(page.getByText('คุณจะอยู่อันดับ 2')).toBeVisible();
  await expect(page.getByRole('link', { name: 'สมัคร Rising Star' })).toHaveAttribute('href', '/profile');

  await page.unroute('**/api/rising-star');
  await page.route('**/api/rising-star', (route) => route.fulfill({
    json: payload({ mentorId: 'x', active: true, activeUntil: '2026-10-31T17:00:00.000Z', rating: { average: null, reviews: 0 }, projectedRank: 1 }),
  }));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'คุณเป็น Rising Star' })).toBeVisible();
  await expect(page.getByText(/ยังไม่มีรีวิว อันดับของคุณขึ้นอยู่กับรีวิว/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'สมัคร Rising Star' })).toHaveCount(0);
});

test('the page passes axe, has no sideways scroll, and is captured', async ({ page }, info) => {
  await page.goto('/mentors');
  await expect(page.locator('.rs-month')).toHaveCount(3);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  if (info.project.name !== 'tablet') {
    await page.screenshot({ path: `artifacts/rising-star-${info.project.name}.png`, fullPage: true });
  }
});

test('the sample-data pill shows only when the API says the ranking is demo data', async ({ page }) => {
  await page.route('**/api/rising-star', (route) => route.fulfill({ json: { ...payload(null), demo: true } }));
  await page.goto('/mentors');
  await expect(page.getByText('อันดับตัวอย่าง ยังไม่ใช่ข้อมูลจริง')).toBeVisible();
  await page.unroute('**/api/rising-star');
  await page.route('**/api/rising-star', (route) => route.fulfill({ json: payload(null) }));
  await page.reload();
  await expect(page.getByRole('heading', { level: 2, name: 'Rising Star เดือนนี้' })).toBeVisible();
  await expect(page.getByText('อันดับตัวอย่าง ยังไม่ใช่ข้อมูลจริง')).toHaveCount(0);
});

test('touch targets are at least 44px on phones', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) > 700, 'phone layout only');
  await page.goto('/mentors');
  const targets = page.locator('.rs-fold__toggle, .rs-row__action');
  await expect(targets.first()).toBeVisible();
  for (const box of await targets.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))) {
    expect(box).toBeGreaterThanOrEqual(44);
  }
});

test('ranked and unranked rows share the same right edge, and unranked avatars start at the content edge', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) < 1000, 'compared on desktop');
  await page.goto('/mentors');
  await expect(page.locator('.rs-row').first()).toBeVisible();
  const edge = (selector: string) => page.locator(selector).first().evaluate((el) => Math.round(el.getBoundingClientRect().right));
  const left = (selector: string) => page.locator(selector).first().evaluate((el) => Math.round(el.getBoundingClientRect().left));
  expect(await edge('.rs-list:not(.rs-list--plain) .rs-row__action')).toBe(await edge('.rs-list--plain .rs-row__action'));
  // avatars of the unranked list start at the content edge, level with the section heading
  expect(await left('.rs-list--plain .rs-avatar')).toBe(await left('#rs-others-title'));
});
