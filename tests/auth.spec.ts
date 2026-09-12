import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('Google sign-in is visible on both auth pages and preserves the return path', async ({ page }, info) => {
  // Provider visibility only; server authorization/callback is covered by test:auth.
  await page.route('**/api/auth/providers', route => route.fulfill({ json: { google: true } }));
  await page.goto('/signin?next=%2Fmentors%2Fapply');
  const google = page.getByRole('link', { name: 'เข้าสู่ระบบด้วย Google' });
  await expect(google).toBeVisible();
  await expect(google).toHaveAttribute('href', '/api/auth/google?next=%2Fmentors%2Fapply');
  await google.focus();
  await expect(google).toBeFocused();
  expect((await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/signin-${info.project.name}.png`, fullPage: true });
  await page.locator('main').getByRole('link', { name: 'สมัครสมาชิก', exact: true }).click();
  await expect(google).toHaveAttribute('href', '/api/auth/google?next=%2Fmentors%2Fapply');
});

test('cancelled login explains the error and retry retains the destination', async ({ page }) => {
  await page.route('**/api/auth/providers', route => route.fulfill({ json: { google: true } }));
  await page.goto(`/signin?error=${encodeURIComponent('ยกเลิกการเข้าสู่ระบบด้วย Google')}&next=%2Fmentors%2Fapply`);
  await expect(page.getByRole('alert')).toContainText('ยกเลิกการเข้าสู่ระบบด้วย Google');
  await expect(page.getByRole('link', { name: 'เข้าสู่ระบบด้วย Google' })).toHaveAttribute('href', '/api/auth/google?next=%2Fmentors%2Fapply');
  await page.goto('/signin?next=%2F%5Coutside.example');
  await expect(page.getByRole('link', { name: 'เข้าสู่ระบบด้วย Google' })).toHaveAttribute('href', '/api/auth/google?next=%2F');
});
