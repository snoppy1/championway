import { expect, test } from '@playwright/test';

/* ภาษาตั้งต้นคืออังกฤษ ผู้ใช้สลับเป็นไทยได้ และเว็บจำตัวเลือกไว้
   เทสชุดอื่นตั้งภาษาไทยไว้ทั้งหมดใน playwright.config.ts ไฟล์นี้จึงล้างค่านั้นออกก่อน */
test.use({ storageState: { cookies: [], origins: [] } });

/* จอแคบซ่อนปุ่มภาษาไว้ในเมนูสามขีด เปิดเมนูก่อนถ้ามีปุ่มนี้ จอกว้างข้ามไปเอง */
async function openMenu(page: import('@playwright/test').Page, label: string) {
  const toggle = page.getByRole('button', { name: label });
  if (await toggle.isVisible()) await toggle.click();
}

test('a first visit is in English, and the choice of Thai is remembered', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeAttached();

  await openMenu(page, 'Open menu');
  const language = page.getByRole('group', { name: 'Language' });
  await expect(language.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('link', { name: 'Explore competitions' }).first()).toBeVisible();

  await language.getByRole('button', { name: 'TH' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'th');
  await expect(page.getByRole('link', { name: 'สำรวจการแข่งขัน' }).first()).toBeVisible();

  // เปิดหน้าใหม่แล้วต้องยังเป็นภาษาไทย ไม่เด้งกลับเป็นอังกฤษ
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'th');
  await openMenu(page, 'เปิดเมนู');
  await expect(page.getByRole('group', { name: 'ภาษา' }).getByRole('button', { name: 'TH' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('group', { name: 'ภาษา' }).getByRole('button', { name: 'EN' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('the chosen language travels with API requests', async ({ page }) => {
  const sent: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/')) sent.push(request.headers()['x-lang'] ?? '');
  });
  await page.goto('/');
  await expect.poll(() => sent.length).toBeGreaterThan(0);
  expect(new Set(sent)).toEqual(new Set(['en']));
});
