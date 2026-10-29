import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { RANKING_SHOWN } from '../src/data/flags';

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
  test.skip(!RANKING_SHOWN, 'Rising Star ranking is hidden for now (src/data/flags.ts)');
  await page.goto('/mentors');
  await expect(page.getByRole('heading', { level: 1, name: 'สำรวจ Mentor' })).toBeVisible();

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
  test.skip(!RANKING_SHOWN, 'Rising Star ranking is hidden for now (src/data/flags.ts)');
  test.skip((viewport?.width ?? 0) < 701, 'phones stack the months');
  await page.goto('/mentors');
  await expect(page.locator('.rs-month')).toHaveCount(3);
  const lefts = await page.locator('.rs-month').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().left));
  // [เดือนนี้, เดือนที่แล้ว, สองเดือนก่อน] → เดือนที่แล้วอยู่ซ้ายสุด เดือนนี้อยู่กลาง
  expect(lefts[1]).toBeLessThan(lefts[0]);
  expect(lefts[0]).toBeLessThan(lefts[2]);
});

test('the ranked list is numbered, and non-members come after it with no rank', async ({ page }) => {
  test.skip(!RANKING_SHOWN, 'Rising Star ranking is hidden for now (src/data/flags.ts)');
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

test('someone who is not a mentor sees no Rising Star sign-up box', async ({ page }) => {
  test.skip(!RANKING_SHOWN, 'Rising Star ranking is hidden for now (src/data/flags.ts)');
  // การ์ดชวนสมัคร Rising Star สำหรับเมนเทอร์เท่านั้น (ผู้ใช้ขอ 5 ต.ค. 2569)
  await page.goto('/mentors');
  await expect(page.getByRole('heading', { level: 2, name: 'Rising Star เดือนนี้' })).toBeVisible();
  await expect(page.locator('.rs-upsell')).toHaveCount(0);
  await expect(page.locator('main').getByRole('link', { name: 'สมัครเป็นเมนเทอร์' })).toHaveCount(0);
  await expect(page.locator('.rs-layout')).toHaveClass(/rs-layout--solo/);
});

/* ผู้ใช้ขอ 7 ต.ค. 2569: โปสเตอร์ทุกใบกรอบเท่ากัน รูปเมนเทอร์ขึ้นในหน้าโปรไฟล์ (การ์ดเมนเทอร์ใหม่ย้ายไป landing.spec.ts) */
const tallPoster = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="1200"><rect width="200" height="1200" fill="#c33"/></svg>')}`;
const widePoster = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="400"><rect width="1600" height="400" fill="#36c"/></svg>')}`;

test('competition card covers are all the same 4:3 frame, whatever the poster shape', async ({ page }) => {
  // อ่านข้อมูลจริงก่อนแล้วตอบแบบตายตัว หน้าอาจยกเลิกคำขอแรกตอนเครื่องช้า route.fetch จึงอ่านคำตอบที่ทิ้งไปแล้ว
  const real = await (await page.request.get('/api/competitions?perPage=6')).json();
  real.items = real.items.map((item: object, index: number) => ({ ...item, posterUrl: [tallPoster, widePoster, null][index % 3] }));
  await page.route('**/api/competitions?*', (route) => route.fulfill({ json: real }));
  await page.goto('/explore');
  const covers = page.locator('.competition-card .card-cover');
  await expect(covers.nth(2)).toBeVisible();
  const boxes = await covers.evaluateAll((els) => els.slice(0, 6).map((el) => { const r = el.getBoundingClientRect(); return [r.width, r.height]; }));
  for (const [width, height] of boxes) expect(Math.abs(height / width - 3 / 4)).toBeLessThan(0.02);
  // ภาพไม่ล้นกรอบ
  const poster = await covers.first().locator('img').boundingBox();
  const frame = await covers.first().boundingBox();
  expect(Math.abs(poster!.height - frame!.height)).toBeLessThanOrEqual(1);
});

test('the mentor profile shows the mentor photo', async ({ page }) => {
  // คนเก่าสุดในรายการเป็นข้อมูลตัวอย่างที่ไม่หายระหว่างเทส (เทสอื่นสร้างแล้วลบเมนเทอร์ชั่วคราวพร้อมกัน)
  const { items } = await (await page.request.get('/api/rising-star/newest')).json() as { items: { id: string }[] };
  const mentor = items.at(-1)!;
  const photo = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><circle cx="40" cy="40" r="40" fill="#555"/></svg>')}`;
  // อ่านข้อมูลจริงก่อนแล้วตอบแบบตายตัว: ตอนเครื่องช้า หน้าอาจยกเลิกคำขอแรก route.fetch จึงอ่านคำตอบที่ทิ้งไปแล้ว
  const json = await (await page.request.get(`/api/consult/mentors/${mentor.id}`)).json();
  json.mentor.photoUrl = photo;
  await page.route(`**/api/consult/mentors/${mentor.id}`, (route) => route.fulfill({ json }));
  await page.goto(`/mentors/${mentor.id}`);
  await expect(page.locator('.mp-hero img.mp-avatar')).toHaveAttribute('src', photo);
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
  await expect(page.getByRole('heading', { level: 2, name: RANKING_SHOWN ? 'Rising Star เดือนนี้' : 'เมนเทอร์ทั้งหมด' })).toBeVisible();
});

test('empty data shows the empty states', async ({ page }) => {
  test.skip(!RANKING_SHOWN, 'Rising Star ranking is hidden for now (src/data/flags.ts)');
  await page.route('**/api/rising-star', (route) => route.fulfill({ json: payload(null) }));
  await page.goto('/mentors');
  await expect(page.getByText('เดือนนี้ยังไม่มี Rising Star')).toBeVisible();
  await expect(page.getByText('เดือนนี้ไม่มี Rising Star ที่ติดอันดับ')).toHaveCount(2);
  await expect(page.getByText('ยังไม่มีสมาชิก Rising Star')).toBeVisible();
  await expect(page.getByText('ตอนนี้เมนเทอร์ทุกคนเป็นสมาชิก Rising Star แล้ว')).toBeVisible();
});

test('a mentor sees their own numbers, and a member sees a note instead of the upsell', async ({ page }) => {
  test.skip(!RANKING_SHOWN, 'Rising Star ranking is hidden for now (src/data/flags.ts)');
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
  test.skip(!RANKING_SHOWN, 'Rising Star ranking is hidden for now (src/data/flags.ts)');
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
  test.skip(!RANKING_SHOWN, 'Rising Star ranking is hidden for now (src/data/flags.ts)');
  test.skip((viewport?.width ?? 0) > 700, 'phone layout only');
  await page.goto('/mentors');
  const targets = page.locator('.rs-fold__toggle, .rs-row__action');
  await expect(targets.first()).toBeVisible();
  for (const box of await targets.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))) {
    expect(box).toBeGreaterThanOrEqual(44);
  }
});

test('ranked and unranked rows share the same right edge, and unranked avatars start at the content edge', async ({ page, viewport }) => {
  test.skip(!RANKING_SHOWN, 'Rising Star ranking is hidden for now (src/data/flags.ts)');
  test.skip((viewport?.width ?? 0) < 1000, 'compared on desktop');
  await page.goto('/mentors');
  await expect(page.locator('.rs-row').first()).toBeVisible();
  const edge = (selector: string) => page.locator(selector).first().evaluate((el) => Math.round(el.getBoundingClientRect().right));
  const left = (selector: string) => page.locator(selector).first().evaluate((el) => Math.round(el.getBoundingClientRect().left));
  expect(await edge('.rs-list:not(.rs-list--plain) .rs-row__action')).toBe(await edge('.rs-list--plain .rs-row__action'));
  // avatars of the unranked list start at the content edge, level with the section heading
  expect(await left('.rs-list--plain .rs-avatar')).toBe(await left('#rs-others-title'));
});

test('with the ranking hidden, /mentors is one list sorted by name with no ranks, badges or sign-up box', async ({ page }) => {
  test.skip(RANKING_SHOWN, 'only while the ranking is hidden');
  const mentor = (id: string, name: string) => ({ id, name, initial: name[0], photoUrl: null, specialty: 'Pitching', price: null, minutes: null, rating: { average: 4.5, reviews: 2 } });
  await page.route('**/api/rising-star', (route) => route.fulfill({ json: {
    hall: emptyHall, ranked: [{ ...mentor('m1', 'Zed'), rank: 1 }], others: [mentor('m2', 'Anna')],
    viewer: { mentorId: 'm2', active: false, activeUntil: null, rating: { average: null, reviews: 0 }, projectedRank: 1, billing: null }, demo: false,
  } }));
  await page.goto('/mentors');
  await expect(page.getByRole('heading', { level: 2, name: 'เมนเทอร์ทั้งหมด' })).toBeVisible();
  await expect(page.locator('.rs-list .rs-row__name')).toHaveText(['Anna', 'Zed']);
  await expect(page.locator('.rs-months, .rs-row__rank, .rs-upsell, .rs-note')).toHaveCount(0);
  await expect(page.getByText('Rising Star')).toHaveCount(0);
});
