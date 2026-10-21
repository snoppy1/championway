import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createAccount, removeAccount, signIn, type TestAccount } from './helpers';

/* หน้าแรกแบบใหม่ (Landing v4) ใช้ข้อมูลตัวอย่างจาก seed: สมาชิก Rising Star เดือนนี้คือ mind, jay, nut, tae
   (ดู server/db/demo-data.ts และ tests/rising-star.spec.ts) */

test('the landing page leads with the matching promise and sends the CTA to the mentors', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('เรียนจากคน ที่เคยลงสนามมาแล้ว');
  const ctas = page.getByRole('link', { name: 'พร้อมชนะการแข่งขันแล้วหรือยัง?' });
  await expect(ctas).toHaveCount(3);
  for (const cta of await ctas.all()) await expect(cta).toHaveAttribute('href', '/mentors');
  await expect(page.getByRole('link', { name: 'ดูวิธีใช้งาน' })).toHaveAttribute('href', '#how');
  await expect(page.locator('#how li')).toHaveCount(4);
  await expect(page).toHaveTitle('ChampionWays — จับคู่เมนเทอร์สำหรับ Hackathon และ Case competition');
});

test('new mentor cards come from the newest approvals and open the profile', async ({ page }) => {
  const { items } = await (await page.request.get('/api/rising-star/newest')).json();
  expect(items.length).toBeGreaterThan(0);
  // ไม่มีช่องทางติดต่อในข้อมูลสาธารณะนี้
  expect(Object.keys(items[0]).sort()).toEqual(['credit', 'headline', 'helpsWith', 'id', 'initial', 'joinedAt', 'minutes', 'name', 'photoUrl', 'price', 'specialty', 'unit']);
  await page.goto('/');
  const cards = page.locator('.lp-card');
  await expect(cards).toHaveCount(Math.min(4, items.length));
  await expect(cards.first().getByRole('link')).toHaveAttribute('href', `/mentors/${items[0].id}`);
  await expect(cards.first()).toContainText(items[0].name);
  await expect(page.getByRole('link', { name: 'ดูเมนเทอร์ทั้งหมด' }).first()).toHaveAttribute('href', '/mentors');
});

test('the Rising Star board ranks this month’s members and switches period and field', async ({ page }) => {
  await page.goto('/');
  const board = page.locator('#ranking');
  await expect(board.getByRole('heading', { name: 'เมนเทอร์ Rising Star' })).toBeVisible();
  const first = board.locator('.lp-podium__card.is-first');
  await expect(first).toContainText('พี่มายด์');
  await expect(first).toContainText('★ 4.8');
  await expect(board.locator('.lp-podium__card')).toHaveCount(3);
  await expect(board.locator('.lp-list li')).toHaveCount(1);
  await expect(board).toContainText('ปิดอันดับวันที่');

  await board.getByRole('button', { name: 'เดือนที่แล้ว' }).click();
  await expect(board.getByRole('button', { name: 'เดือนที่แล้ว' })).toHaveAttribute('aria-pressed', 'true');
  await expect(board.locator('.lp-podium__card.is-first')).toContainText('พี่เจ');
  await expect(board).not.toContainText('ปิดอันดับวันที่');

  // สายที่ไม่มีใครเลยขึ้นข้อความว่าง ไม่ใช่ช่องโล่ง
  await page.route('**/api/rising-star/board*', (route) => route.fulfill({ json: { month: '2026-10', closesAt: null, items: [], viewer: null, demo: false } }));
  await board.getByRole('button', { name: 'เดือนนี้' }).click();
  await expect(board).toContainText('เดือนนี้ยังไม่มีเมนเทอร์ Rising Star');
});

test('the board API lists only members, with a field and no contact details', async ({ request }) => {
  const board = await (await request.get('/api/rising-star/board')).json();
  expect(board.items.map((item: { rank: number }) => item.rank)).toEqual(board.items.map((_: unknown, index: number) => index + 1));
  for (const item of board.items) {
    expect(Object.keys(item).sort()).toEqual(['credit', 'field', 'headline', 'id', 'initial', 'name', 'photoUrl', 'rank', 'rating', 'sessions']);
    expect([null, 'business', 'technology', 'design']).toContain(item.field);
  }
});

test('old competition search links on the home page move to /explore', async ({ page }) => {
  await page.goto('/?q=hack');
  await expect(page).toHaveURL(/\/explore\?q=hack$/);
  await expect(page.getByRole('heading', { level: 1, name: 'สำรวจการแข่งขัน' })).toBeVisible();
});

test('the header follows the landing: find a mentor, ranking, no competition menu', async ({ page, viewport }) => {
  await page.goto('/mentors/apply');
  if ((viewport?.width ?? 0) <= 1100) await page.getByRole('button', { name: 'เปิดเมนู' }).click();
  const nav = page.getByRole('navigation', { name: 'เมนูหลัก' });
  await expect(nav.getByRole('link', { name: 'หาเมนเทอร์' })).toHaveAttribute('href', '/mentors');
  await expect(nav.getByRole('link', { name: 'อันดับ Rising Star' })).toHaveAttribute('href', '/#ranking');
  await expect(nav.getByRole('link', { name: 'สำรวจการแข่งขัน' })).toHaveCount(0);
  await nav.getByRole('link', { name: 'อันดับ Rising Star' }).click();
  await expect(page).toHaveURL(/\/#ranking$/);
  await expect(page.locator('#ranking')).toBeInViewport();
});

test('the footer links teams to mentors and mentors to the application', async ({ page }) => {
  await page.goto('/');
  const footer = page.locator('footer');
  await expect(footer.getByRole('link', { name: 'จับคู่เมนเทอร์' })).toHaveAttribute('href', '/mentors');
  await expect(footer.getByRole('link', { name: 'สมัครเป็นเมนเทอร์' })).toHaveAttribute('href', '/mentors/apply');
  await expect(footer.getByRole('link', { name: 'นโยบายความเป็นส่วนตัว' })).toHaveAttribute('href', '/privacy');
});

test.describe('signed-in mentor', () => {
  let mentor: TestAccount;
  test.beforeAll(async () => { mentor = await createAccount('member'); });
  test.afterAll(async () => { await removeAccount(mentor); });

  test('a mentor who is not a member sees the Rising Star invitation', async ({ page }) => {
    await signIn(page, mentor, '/');
    await page.route('**/api/rising-star/board*', async (route) => {
      const json = await (await route.fetch()).json();
      await route.fulfill({ json: { ...json, viewer: { member: false } } });
    });
    await page.reload();
    const invite = page.locator('.lp-become');
    await expect(invite).toContainText('ขึ้นรายชื่อในส่วนนี้');
    await expect(invite.getByRole('link', { name: 'สมัคร Rising Star' })).toHaveAttribute('href', '/mentors');
  });
});

test('the landing page has no automatic accessibility violations and no sideways scroll', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.locator('.lp-podium__card').first()).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/landing-${info.project.name}.png`, fullPage: true });
});

test.describe('English', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test('the landing reads in English by default', async ({ page }, info) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Learn from people who’ve been there.');
    await expect(page.getByRole('link', { name: 'Ready to win the competition?' }).first()).toBeVisible();
    await expect(page.locator('#ranking')).toContainText('Rising Star mentors');
    await expect(page.locator('.lp-podium__card').first()).toBeVisible();
    await page.screenshot({ path: `artifacts/landing-en-${info.project.name}.png`, fullPage: true });
  });
});
