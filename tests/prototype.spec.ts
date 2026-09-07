import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { competitions } from '../src/data/competitions';

test('search → combined filters → detail → back → refresh', async ({ page }) => {
  await page.goto('/competitions');
  await expect(page.locator('.competition-row')).toHaveCount(10);
  await page.getByRole('searchbox', { name: 'ค้นหาการแข่งขัน' }).fill('  BUSINESS  ');
  await page.getByRole('button', { name: 'ค้นหา', exact: true }).click();
  await expect(page.locator('.competition-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'ธุรกิจ', exact: true }).click();
  await page.getByLabel('ระดับผู้สมัคร', { exact: true }).selectOption('university');
  await expect(page).toHaveURL(/q=BUSINESS&category=business&level=university/);
  await page.getByRole('link', { name: 'ดูรายละเอียด Business Case Challenge', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Business Case Challenge');
  await expect(page.getByRole('heading', { name: 'สิ่งที่ต้องส่ง', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'กลับไปหน้าสำรวจ', exact: true }).click();
  await expect(page.getByRole('searchbox')).toHaveValue('BUSINESS');
  await expect(page.getByLabel('ระดับผู้สมัคร', { exact: true })).toHaveValue('university');
  await page.reload();
  await expect(page.locator('.competition-row')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'ธุรกิจ', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('Thai search, Enter, no results, clear search and clear all', async ({ page }) => {
  await page.goto('/competitions');
  const search = page.getByRole('searchbox');
  await search.fill('ออกแบบ');
  await search.press('Enter');
  await expect(page.locator('.competition-row')).toHaveCount(3);
  await page.getByRole('button', { name: 'เทคโนโลยี', exact: true }).click();
  await expect(page.locator('.competition-row')).toHaveCount(1);
  await search.fill('ไม่มีเวทีที่ใช้คำนี้');
  await search.press('Enter');
  await expect(page.getByRole('heading', { name: 'ยังไม่เจอเวทีที่คุณค้นหา' })).toBeVisible();
  await page.getByRole('button', { name: 'ล้างคำค้น', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(page.locator('.competition-row')).toHaveCount(2);
  await page.getByRole('button', { name: 'ล้างตัวกรองทั้งหมด' }).click();
  await expect(page.locator('.competition-row')).toHaveCount(10);
  await expect(page).toHaveURL(/\/competitions$/);
});

test('return restores the exact list scroll position; browser history works', async ({ page }) => {
  await page.goto('/competitions');
  await page.evaluate(() => document.fonts.ready);
  const link = page.getByRole('link', { name: 'ดูรายละเอียด Social Enterprise Sprint', exact: true });
  await link.scrollIntoViewIfNeeded();
  const scrollY = await page.evaluate(() => window.scrollY);
  await link.click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Social Enterprise Sprint');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.getByRole('link', { name: 'กลับไปหน้าสำรวจ', exact: true }).click();
  await expect.poll(async () => Math.abs(await page.evaluate(() => window.scrollY) - scrollY)).toBeLessThan(5);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Social Enterprise Sprint');
  await page.goBack();
  await expect(page.locator('.competition-row')).toHaveCount(10);
});

test('all ten direct detail URLs, related links, refresh, and missing routes', async ({ page }) => {
  for (const competition of competitions) {
    await page.goto(`/competitions/${competition.slug}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(competition.name);
    await expect(page.locator('.article-section')).toHaveCount(5);
    await expect(page.locator('.check-list li')).toHaveCount(3);
    const related = competitions.filter((item) => item.category === competition.category && item.id !== competition.id).slice(0, 2);
    await expect(page.locator('.related-item')).toHaveCount(related.length);
    for (const item of related) await expect(page.locator('.related-item', { hasText: item.name })).toHaveAttribute('href', `/competitions/${item.slug}`);
  }
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Young Maker Project');
  await page.locator('.related-item').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Innovation for Change');
  await page.goto('/competitions/not-a-real-event');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ยังไม่พบเวทีนี้');
  await page.getByRole('link', { name: 'กลับไปสำรวจการแข่งขัน', exact: true }).click();
  await expect(page.locator('.competition-row')).toHaveCount(10);
  await page.goto('/unknown');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ยังไม่พบเวทีนี้');
});

test('invalid filters fall back safely and URLs preserve combined filters', async ({ page }) => {
  await page.goto('/competitions?category=unknown&level=invalid');
  await expect(page.locator('.competition-row')).toHaveCount(10);
  await page.goto('/competitions?category=innovation&level=secondary');
  await expect(page.locator('.competition-row')).toHaveCount(2);
  await expect(page.getByRole('link', { name: 'Young Maker Project', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'สร้างสรรค์', exact: true }).click();
  await expect(page.locator('.competition-row')).toHaveCount(2);
  await page.goBack();
  await expect(page.getByRole('button', { name: 'นวัตกรรม', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('keyboard search and focus visibility', async ({ page }) => {
  await page.goto('/competitions');
  await page.getByRole('searchbox').focus();
  await page.keyboard.type('hackathon');
  await page.keyboard.press('Enter');
  await expect(page.locator('.competition-row')).toHaveCount(1);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'ล้างคำค้น', exact: true })).toBeFocused();
  const outline = await page.getByRole('button', { name: 'ล้างคำค้น', exact: true }).evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(outline).toBe('solid');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'ค้นหา', exact: true })).toBeFocused();
});

test('visual QA: local fonts, no overflow, accessibility, screenshots', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const [route, label] of [['/competitions', 'explore'], ['/competitions/business-case-challenge', 'detail']] as const) {
    await page.goto(route);
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.fonts.check('400 16px "IBM Plex Sans Thai"', 'การแข่งขัน'))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(accessibility.violations).toEqual([]);
    await page.screenshot({ path: `artifacts/${label}-${testInfo.project.name}.png`, fullPage: true });
    if (label === 'explore') await page.screenshot({ path: `artifacts/explore-${testInfo.project.name}-viewport.png` });
  }
  expect(errors).toEqual([]);
});
