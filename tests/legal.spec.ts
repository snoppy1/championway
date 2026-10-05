import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/* หน้าเอกสาร: นโยบายความเป็นส่วนตัว ข้อกำหนดการใช้งาน นโยบายคืนเงิน (5 ต.ค. 2569)
   Stripe ต้องเห็นหน้าเหล่านี้บนเว็บ และต้องลิงก์จากท้ายเว็บ หน้าสมัครสมาชิก และการ์ดชำระเงิน */

const pages = [
  { path: '/privacy', th: 'นโยบายความเป็นส่วนตัว', en: 'Privacy Policy' },
  { path: '/terms', th: 'ข้อกำหนดการใช้งาน', en: 'Terms of Service' },
  { path: '/refunds', th: 'นโยบายการยกเลิกและคืนเงิน', en: 'Cancellation and Refund Policy' },
];

for (const doc of pages) {
  test(`${doc.path} reads in both languages, links its sections, and passes axe`, async ({ page }) => {
    await page.goto(doc.path);
    await expect(page.getByRole('heading', { level: 1, name: doc.th })).toBeVisible();
    await expect(page).toHaveTitle(`${doc.th} — ChampionWays`);
    const toc = page.getByRole('navigation', { name: 'ในหน้านี้' });
    const first = toc.locator('ol a').first();
    const target = (await first.getAttribute('href'))!;
    await expect(page.locator(target)).toHaveCount(1);
    await expect(page.locator('main a[href="mailto:support@championways.space"]').first()).toBeVisible();
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(scroll).toBeLessThanOrEqual(0);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);

    await page.evaluate(() => localStorage.setItem('cw-lang', 'en'));
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: doc.en })).toBeVisible();
  });
}

test('the footer, the sign-up form and the refund rule link to the policies', async ({ page }) => {
  await page.goto('/');
  const footer = page.locator('footer');
  await expect(footer.getByRole('link', { name: 'ข้อกำหนดการใช้งาน' })).toHaveAttribute('href', '/terms');
  await expect(footer.getByRole('link', { name: 'นโยบายความเป็นส่วนตัว' })).toHaveAttribute('href', '/privacy');
  await expect(footer.getByRole('link', { name: 'นโยบายคืนเงิน' })).toHaveAttribute('href', '/refunds');

  await page.goto('/signup');
  await expect(page.locator('.auth-agree').getByRole('link', { name: 'ข้อกำหนดการใช้งาน' })).toHaveAttribute('href', '/terms');
  await expect(page.locator('.auth-agree').getByRole('link', { name: 'นโยบายความเป็นส่วนตัว' })).toHaveAttribute('href', '/privacy');
  await page.goto('/signin');
  await expect(page.locator('.auth-agree')).toHaveCount(0);
});
