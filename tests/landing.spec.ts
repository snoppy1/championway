import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/* หน้าแรกแบบใหม่ (Claude Design "ChampionWays", 23 ต.ค. 2569) ข้อมูลเมนเทอร์และรีวิวมาจาก /api/landing
   ไม่มีอันดับ Rising Star (พักไว้) */

test('the hero leads to Find my mentor and the steps', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ผู้ชนะงานแข่ง เขา ทำได้ยังไงนะ?');
  await expect(page.getByRole('link', { name: 'หาเมนเทอร์ของคุณ' })).toHaveAttribute('href', '/match');
  await expect(page.getByRole('link', { name: 'วิธีใช้งาน', exact: true }).first()).toHaveAttribute('href', '#how');
  await expect(page.locator('#how li')).toHaveCount(4);
  await expect(page).toHaveTitle('ChampionWays — จับคู่เมนเทอร์สำหรับ Hackathon และ Case competition');
  await expect(page.locator('#ranking')).toHaveCount(0);
});

test('mentor cards come from approved mentors and open their profile', async ({ page }) => {
  const data = await (await page.request.get('/api/landing')).json() as { mentors: { id: string; name: string }[]; stories: unknown[] };
  // ไม่มีช่องทางติดต่อในข้อมูลสาธารณะนี้
  if (data.mentors.length) expect(Object.keys(data.mentors[0]).sort()).toEqual(['bio', 'events', 'headline', 'helpsWith', 'id', 'initial', 'name', 'photoUrl', 'rating']);
  expect(JSON.stringify(data)).not.toMatch(/@|contact/i);
  await page.goto('/');
  if (!data.mentors.length) return;
  const track = page.getByRole('region', { name: 'โปรไฟล์เมนเทอร์' });
  // เทสอื่นที่รันขนานกันสร้างเมนเทอร์ชั่วคราวได้ จึงเช็กแค่ว่ามีการ์ด ไม่เกิน 8 ใบ และทุกใบพาไปหน้าโปรไฟล์
  await expect(track.locator('.lp-mentor').first()).toBeVisible();
  const links = await track.locator('.lp-mentor h3 a').evaluateAll((els) => els.map((el) => el.getAttribute('href')));
  expect(links.length).toBeLessThanOrEqual(8);
  for (const href of links) expect(href).toMatch(/^\/mentors\/[\w-]+$/);
  // หยุดการเลื่อนเองได้
  await page.getByRole('button', { name: 'หยุดเลื่อนรายชื่อเมนเทอร์' }).click();
  await expect(page.getByRole('button', { name: 'เลื่อนรายชื่อเมนเทอร์ต่อ' })).toBeVisible();
});

test('stories invite mentors and the FAQ opens and closes', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#stories').getByRole('link', { name: 'สมัครเป็นเมนเทอร์' })).toHaveAttribute('href', '/mentors/apply');
  const faq = page.locator('#faq');
  const first = faq.getByRole('button', { name: 'ChampionWays เหมาะกับใคร?' });
  await expect(first).toHaveAttribute('aria-expanded', 'true');
  const second = faq.getByRole('button', { name: 'จับคู่เมนเทอร์กับโปรเจกต์อย่างไร?' });
  await second.click();
  await expect(second).toHaveAttribute('aria-expanded', 'true');
  await expect(faq.getByText('ใช้สูตรตายตัว')).toBeVisible();
});

test('old competition search links on the home page move to /explore', async ({ page }) => {
  await page.goto('/?q=hack');
  await expect(page).toHaveURL(/\/explore\?q=hack$/);
  await expect(page.getByRole('heading', { level: 1, name: 'สำรวจการแข่งขัน' })).toBeVisible();
});

test('the header follows the new design: my projects and become a mentor, no ranking', async ({ page, viewport }) => {
  await page.goto('/mentors/apply');
  if ((viewport?.width ?? 0) <= 1100) await page.getByRole('button', { name: 'เปิดเมนู' }).click();
  const nav = page.getByRole('navigation', { name: 'เมนูหลัก' });
  await expect(nav.getByRole('link', { name: 'โปรเจกต์ของฉัน' })).toHaveAttribute('href', '/match');
  await expect(nav.getByRole('link', { name: 'สมัครเมนเทอร์' })).toHaveAttribute('href', '/mentors/apply');
  await expect(nav.getByRole('link', { name: 'อันดับ Rising Star' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'สำรวจการแข่งขัน' })).toHaveCount(0);
});

test('the footer links to mentors, the steps and the legal pages', async ({ page }) => {
  await page.goto('/');
  const footer = page.locator('footer');
  await expect(footer.getByRole('link', { name: 'หาเมนเทอร์' })).toHaveAttribute('href', '/mentors');
  await expect(footer.getByRole('link', { name: 'วิธีใช้งาน' })).toHaveAttribute('href', '/#how');
  await expect(footer.getByRole('link', { name: 'สมัครเป็นเมนเทอร์' })).toHaveAttribute('href', '/mentors/apply');
  await expect(footer.getByRole('link', { name: 'นโยบายความเป็นส่วนตัว' })).toHaveAttribute('href', '/privacy');
});

test('the landing page has no automatic accessibility violations and no sideways scroll', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('#faq')).toBeVisible();
  await page.waitForLoadState('networkidle');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/landing-${info.project.name}.png`, fullPage: true });
});

test.describe('English', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test('the landing reads in English by default', async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ready to win? meet your Mentor');
    await expect(page.getByRole('link', { name: 'Find your mentor' })).toHaveAttribute('href', '/match');
    await expect(page.locator('#faq')).toContainText('Curious?');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `artifacts/landing-en-${info.project.name}.png`, fullPage: true });
  });
});
