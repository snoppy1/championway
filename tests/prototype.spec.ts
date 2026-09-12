import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { competitions } from '../src/data/competitions';
import { problems } from '../src/data/mentors';

const PER_PAGE = 6;

test('home shows the first page of competitions and paginates', async ({ page }) => {
  await page.goto('/');
  // The hero heading is wordmark artwork, so its name comes from the image alt text.
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('ChampionWays');
  await expect(page.locator('.competition-card')).toHaveCount(PER_PAGE);
  await expect(page.getByRole('status').first()).toContainText(`${competitions.length} เวที`);

  const firstCardTitle = await page.locator('.competition-card h3').first().textContent();
  await page.getByRole('button', { name: '2', exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator('.competition-card h3').first()).not.toHaveText(firstCardTitle!);

  const pageCount = Math.ceil(competitions.length / PER_PAGE);
  await page.getByRole('button', { name: String(pageCount), exact: true }).click();
  await expect(page.locator('.competition-card')).toHaveCount(competitions.length - (pageCount - 1) * PER_PAGE);
  await expect(page.getByRole('button', { name: 'หน้าถัดไป' })).toBeDisabled();
});

test('search, category and closing-soon filters all live in the URL', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'ค้นหาการแข่งขัน' }).fill('  หุ่นยนต์  ');
  await page.getByRole('button', { name: 'ค้นหา', exact: true }).click();
  await expect(page).toHaveURL(/q=/);
  await expect(page.locator('.competition-card')).toHaveCount(1);
  await expect(page.locator('.competition-card h3')).toHaveText('Robotics Frontier League');

  await page.goto('/?category=design');
  const designCount = competitions.filter((item) => item.category === 'design').length;
  await expect(page.locator('.competition-card')).toHaveCount(designCount);
  await expect(page.getByRole('button', { name: 'ออกแบบ', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.goto('/');
  await page.getByRole('button', { name: 'ตัวกรอง' }).click();
  await expect(page).toHaveURL(/soon=1/);
  const soonCount = competitions.filter((item) => item.dueInDays <= 14).length;
  await expect(page.getByRole('status').first()).toContainText(`${soonCount} เวที`);
});

test('an unknown category or page in the URL falls back instead of breaking', async ({ page }) => {
  await page.goto('/?category=not-real&sort=nonsense&page=99');
  await expect(page.locator('.competition-card')).toHaveCount(competitions.length - (Math.ceil(competitions.length / PER_PAGE) - 1) * PER_PAGE);
  await expect(page.getByRole('button', { name: 'ทั้งหมด', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('sorting by prize puts the largest award first', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('เรียงตาม').selectOption('prize');
  await expect(page).toHaveURL(/sort=prize/);
  const richest = [...competitions].sort((a, b) => b.prizeValue - a.prizeValue)[0];
  await expect(page.locator('.competition-card h3').first()).toHaveText(richest.name);
});

test('saving a competition updates the header count and the saved view', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('.competition-card').first();
  const title = await card.locator('h3').textContent();
  await card.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await expect(card.getByRole('button', { name: 'บันทึกแล้ว' })).toHaveAttribute('aria-pressed', 'true');

  const savedLink = page.getByRole('link', { name: /รายการที่บันทึก 1 รายการ/ });
  await expect(savedLink).toBeVisible();
  await savedLink.click();
  await expect(page).toHaveURL(/saved=1/);
  await expect(page.locator('.competition-card')).toHaveCount(1);
  await expect(page.locator('.competition-card h3')).toHaveText(title!);

  await page.reload();
  await expect(page.locator('.competition-card')).toHaveCount(1);

  await page.locator('.competition-card').first().getByRole('button', { name: 'บันทึกแล้ว' }).click();
  await expect(page.getByRole('heading', { name: 'ยังไม่มีเวทีที่บันทึกไว้' })).toBeVisible();
});

test('every competition opens from a direct URL with all five sections', async ({ page }) => {
  for (const competition of competitions) {
    await page.goto(`/competitions/${competition.slug}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(competition.name);
    for (const heading of ['เวทีนี้เกี่ยวกับอะไร', 'เหมาะกับใคร', 'รูปแบบการแข่งขัน', 'สิ่งที่ต้องส่ง', 'ทักษะและสิ่งที่ควรเตรียม']) {
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    }
    await expect(page.locator('.check-list li')).toHaveCount(competition.deliverables.length);
  }
});

test('returning from a detail page keeps the search, filter and scroll position', async ({ page }) => {
  await page.goto('/?category=business&sort=prize');
  // scrollTo rather than mouse.wheel: the wheel does not move the page under mobile emulation.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  const before = await page.evaluate(() => window.scrollY);

  await page.locator('.competition-card').first().getByRole('link', { name: /ดูรายละเอียด/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'กลับไปหน้าแรก' }).click();

  await expect(page).toHaveURL(/category=business/);
  await expect(page.getByRole('button', { name: 'ธุรกิจ', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before - 50);
});

test('an unknown slug shows the not-found page, not a blank screen', async ({ page }) => {
  await page.goto('/competitions/no-such-competition');
  await expect(page.getByRole('heading', { name: 'ยังไม่พบเวทีนี้' })).toBeVisible();
  await page.getByRole('link', { name: /กลับไปสำรวจการแข่งขัน/ }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('mentor page: context form tiers mentors and previews a booking', async ({ page }) => {
  await page.goto('/mentors');
  await expect(page.getByRole('heading', { name: 'ทีมคุณกำลังติดตรงไหน?' })).toBeVisible();

  await page.getByLabel(/งานแข่งขัน/).selectOption('venture-ignite');
  // Choosing a competition fills its own deadline in, so the form is submittable straight away.
  await expect(page.getByLabel(/วันและเวลาส่งงาน/)).not.toHaveValue('');
  await page.getByRole('radio', { name: problems[0] }).check();
  await page.getByRole('button', { name: /ดูเมนเทอร์ที่ช่วยทีมได้/ }).click();

  await expect(page).toHaveURL(/competition=venture-ignite/);
  await expect(page.getByRole('heading', { name: 'เคยชนะงานนี้' })).toBeVisible();
  const first = page.locator('.mentor-card').first();
  await expect(first.getByRole('heading', { level: 3 })).toHaveText('พี่มายด์ ก.');

  // The mentor who won this competition but is only free after the deadline is set aside.
  await expect(page.getByRole('heading', { name: 'คิวไม่ทันเดดไลน์' })).toBeVisible();

  const secondSlot = first.locator('.slot-button').nth(1);
  const slotLabel = await secondSlot.textContent();
  await secondSlot.click();
  await expect(secondSlot).toHaveAttribute('aria-pressed', 'true');
  await first.getByRole('button', { name: /^จอง/ }).click();
  const preview = page.getByRole('status').filter({ hasText: 'ยืนยันรายละเอียดการปรึกษา' });
  await expect(preview).toContainText(slotLabel!.trim());
  await expect(preview).toContainText('ยังไม่มีการจองหรือเรียกเก็บเงินจริง');
});

test('mentor page: team size splits the price and a past deadline is refused', async ({ page }) => {
  await page.goto('/mentors?competition=venture-ignite&problem=0');
  await page.getByRole('button', { name: /ดูเมนเทอร์ที่ช่วยทีมได้/ }).click();
  await expect(page.locator('.split').first()).toContainText('ทีม 4 คน');
  await page.getByLabel(/สมาชิกในทีม/).selectOption('2');
  await expect(page.locator('.split').first()).toContainText('฿400');

  await page.getByRole('button', { name: 'แก้ไขบริบท' }).click();
  await page.getByLabel(/วันและเวลาส่งงาน/).fill('2020-01-01T09:00');
  await page.getByRole('button', { name: /ดูเมนเทอร์ที่ช่วยทีมได้/ }).click();
  await expect(page.getByRole('alert')).toContainText('เลือกวันส่งงานในอนาคต');
});

test('the detail page links through to mentors for that competition', async ({ page }) => {
  await page.goto('/competitions/poster-unbound');
  await page.getByRole('link', { name: 'หาเมนเทอร์สำหรับเวทีนี้' }).click();
  await expect(page).toHaveURL(/\/mentors\?competition=poster-unbound/);
  await expect(page.getByLabel(/งานแข่งขัน/)).toHaveValue('poster-unbound');
});

test('keyboard reaches the search box and the skip link', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'ข้ามไปเนื้อหาหลัก' })).toBeFocused();

  await page.getByRole('searchbox', { name: 'ค้นหาการแข่งขัน' }).focus();
  await page.keyboard.type('ฟอนต์');
  await page.keyboard.press('Enter');
  await expect(page.locator('.competition-card')).toHaveCount(1);
});

test('visual QA: local fonts, no overflow, accessibility, screenshots', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  for (const [name, path] of [['home', '/'], ['detail', '/competitions/venture-ignite'], ['mentors', '/mentors']] as const) {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow, `${name} overflows horizontally`).toBe(false);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations, `${name} accessibility violations`).toEqual([]);

    await page.screenshot({ path: `artifacts/${name}-${testInfo.project.name}.png`, fullPage: true });
  }

  // Fonts must be bundled with the site rather than fetched from a CDN at runtime.
  const remoteFonts = await page.evaluate(() => [...document.styleSheets]
    .flatMap((sheet) => { try { return [...sheet.cssRules]; } catch { return []; } })
    .filter((rule): rule is CSSFontFaceRule => rule instanceof CSSFontFaceRule)
    .map((rule) => rule.style.getPropertyValue('src'))
    .filter((src) => src.includes('http')));
  expect(remoteFonts).toEqual([]);

  expect(errors).toEqual([]);
});
