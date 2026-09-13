import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { competitions } from '../src/data/competitions';

const PER_PAGE = 6;

/* ข้อมูลมาจากฐานข้อมูลแล้ว ไม่ใช่ไฟล์ในเครื่อง เทสจึงถามจำนวนจาก API ตอนรันจริง
   แทนการฝังตัวเลขไว้ ซึ่งจะพังทันทีที่มีใครเผยแพร่เวทีเพิ่ม */
async function apiTotal(page: Page, query = '') {
  const response = await page.request.get(`/api/competitions?${query}`);
  return (await response.json() as { total: number }).total;
}

test('home shows the first page of competitions and paginates', async ({ page }) => {
  await page.goto('/');
  // The hero heading is wordmark artwork, so its name comes from the image alt text.
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('ChampionWays');
  const total = await apiTotal(page);
  await expect(page.locator('.competition-card')).toHaveCount(PER_PAGE);
  await expect(page.getByRole('status').first()).toContainText(`${total} เวที`);

  const firstCardTitle = await page.locator('.competition-card h3').first().textContent();
  await page.getByRole('button', { name: '2', exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator('.competition-card h3').first()).not.toHaveText(firstCardTitle!);

  const pageCount = Math.ceil(total / PER_PAGE);
  await page.getByRole('button', { name: String(pageCount), exact: true }).click();
  await expect(page.locator('.competition-card')).toHaveCount(total - (pageCount - 1) * PER_PAGE);
  await expect(page.getByRole('button', { name: 'หน้าถัดไป' })).toBeDisabled();
});

test('search, category and timing filters all live in the URL', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'ค้นหาการแข่งขัน' }).fill('  หุ่นยนต์  ');
  await page.getByRole('button', { name: 'ค้นหา', exact: true }).click();
  await expect(page).toHaveURL(/q=/);
  await expect(page.locator('.competition-card')).toHaveCount(1);
  await expect(page.locator('.competition-card h3')).toHaveText('Robotics Frontier League');

  // `category` is the old name for `cat`, so links shared before the rename still open.
  await page.goto('/?category=design');
  const designCount = await apiTotal(page, 'cat=design');
  await expect(page.locator('.competition-card')).toHaveCount(designCount);
  await expect(page.getByRole('button', { name: 'ศิลปะและออกแบบ', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.goto('/');
  await page.getByRole('button', { name: 'ตัวกรอง' }).click();
  // click, not check: check() reads the state before the router flushes the new URL.
  const timing = page.getByRole('radio', { name: 'ปิดรับใน 30 วัน' });
  await timing.click();
  await expect(timing).toBeChecked();
  await page.getByRole('button', { name: /ดูผลลัพธ์/ }).click();
  await expect(page).toHaveURL(/when=d30/);
  const soonCount = await apiTotal(page, 'when=d30');
  await expect(page.getByRole('status').first()).toContainText(`${soonCount} เวที`);
});

test('an unknown category or page in the URL falls back instead of breaking', async ({ page }) => {
  await page.goto('/?category=not-real&sort=nonsense&page=99');
  const total = await apiTotal(page);
  await expect(page.locator('.competition-card')).toHaveCount(total - (Math.ceil(total / PER_PAGE) - 1) * PER_PAGE);
  await expect(page.getByRole('button', { name: 'ทั้งหมด', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('sorting by prize puts the largest award first', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('เรียงตาม').selectOption('prize');
  await expect(page).toHaveURL(/sort=prize/);
  const response = await page.request.get('/api/competitions?sort=prize&perPage=1');
  const { items } = await response.json() as { items: { name: string }[] };
  await expect(page.locator('.competition-card h3').first()).toHaveText(items[0].name);
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
    await expect(page.locator('.check-list li')).toHaveCount(competition.deliverables!.length);
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
  await expect(page.getByRole('button', { name: 'ธุรกิจและผู้ประกอบการ', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before - 50);
});

test('an unknown slug shows the not-found page, not a blank screen', async ({ page }) => {
  await page.goto('/competitions/no-such-competition');
  await expect(page.getByRole('heading', { name: 'ยังไม่พบเวทีนี้' })).toBeVisible();
  await page.getByRole('link', { name: /กลับไปสำรวจการแข่งขัน/ }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('explore: the kind tabs and theme filters live in the URL and survive a reload', async ({ page }) => {
  await page.goto('/explore');
  await expect(page.getByRole('heading', { level: 1, name: 'อยากแข่งงานไหน' })).toBeVisible();
  const all = await page.getByRole('status').first().textContent();

  await page.getByRole('button', { name: 'Hackathon', exact: true }).click();
  await expect(page).toHaveURL(/kind=hackathon/);
  // ทุกการ์ดที่เหลือต้องเป็น Hackathon จริง ไม่ใช่แค่จำนวนลดลง
  const chips = page.locator('.kind-chip');
  // รอผลจาก API ก่อนนับ ไม่อย่างนั้นจะนับตอนที่ยังเป็นโครงว่าง
  await expect(chips.first()).toBeVisible();
  for (const chip of await chips.all()) await expect(chip).toHaveText('Hackathon');
  expect(await page.getByRole('status').first().textContent()).not.toBe(all);

  // check() อ่านสถานะก่อนที่ router จะเขียน URL เสร็จ จึงใช้ click() แล้วค่อยยืนยันผล
  await page.getByRole('checkbox', { name: 'การแพทย์' }).click();
  await expect(page.getByRole('checkbox', { name: 'การแพทย์' })).toBeChecked();
  await expect(page).toHaveURL(/theme=medical/);
  const filtered = await page.getByRole('status').first().textContent();

  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'การแพทย์' })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Hackathon', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.getByRole('status').first().textContent()).toBe(filtered);

  // เวทีที่ยังไม่จัดประเภทต้องไม่ขึ้นหน้านี้ หน้ารายละเอียดจึงเปิดได้ทุกใบที่แสดง
  await page.locator('.competition-card .detail-link').first().click();
  await expect(page.getByRole('heading', { name: 'เมนเทอร์สำหรับงานนี้' })).toBeVisible();
});

test('the old mentor link redirects to the competition, where its mentors now live', async ({ page }) => {
  // ลิงก์เก่าที่เคยแชร์ไว้ต้องยังเปิดได้ แต่พาไปที่หน้าเวทีซึ่งมีรายชื่อเมนเทอร์ของงานนั้น
  await page.goto('/mentors?competition=poster-unbound');
  await expect(page).toHaveURL(/\/competitions\/poster-unbound/);
  await expect(page.getByRole('heading', { name: 'เมนเทอร์สำหรับงานนี้' })).toBeVisible();

  await page.goto('/mentors');
  await expect(page).toHaveURL(/\/explore/);
  await expect(page.getByRole('heading', { level: 1, name: 'อยากแข่งงานไหน' })).toBeVisible();
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

  for (const [name, path] of [['home', '/'], ['detail', '/competitions/venture-ignite'], ['explore', '/explore']] as const) {
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

test('filter groups are OR inside and AND across, and read back from the URL', async ({ page }) => {
  const camps = competitions.filter((item) => item.type === 'camp' || item.type === 'scholarship');
  const inBangkok = camps.filter((item) => item.region === 'bangkok');
  expect(camps.length, 'fixtures must exercise both sides of the OR').toBeGreaterThan(inBangkok.length);

  await page.goto('/');
  await page.getByRole('button', { name: 'ตัวกรอง' }).click();
  await page.getByRole('checkbox', { name: 'ค่าย' }).click();
  await page.getByRole('checkbox', { name: 'ทุน' }).click();
  await expect(page.getByRole('button', { name: `ดูผลลัพธ์ ${camps.length} รายการ` })).toBeVisible();

  await page.getByRole('checkbox', { name: 'กรุงเทพฯ และปริมณฑล' }).click();
  await page.getByRole('button', { name: /ดูผลลัพธ์/ }).click();
  await expect(page).toHaveURL(/type=camp%2Cscholarship/);
  await expect(page).toHaveURL(/region=bangkok/);
  await expect(page.locator('.competition-card')).toHaveCount(inBangkok.length);

  // A shared link has to open with the same filters already applied.
  await page.reload();
  await expect(page.locator('.competition-card')).toHaveCount(inBangkok.length);
  await expect(page.getByRole('button', { name: 'ตัวกรอง' })).toContainText('3');
  await page.getByRole('button', { name: 'ตัวกรอง' }).click();
  await expect(page.getByRole('checkbox', { name: 'ค่าย' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'กรุงเทพฯ และปริมณฑล' })).toBeChecked();
});

test('clearing the panel keeps the chosen category and search, and the panel passes axe', async ({ page }) => {
  await page.goto('/?q=ออกแบบ&cat=design&free=1&level=university');
  await page.getByRole('button', { name: 'ตัวกรอง' }).click();

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations, 'filter panel accessibility violations').toEqual([]);

  await page.getByRole('button', { name: 'ล้างทั้งหมด' }).click();
  await expect(page).not.toHaveURL(/free=1/);
  await expect(page).not.toHaveURL(/level=/);
  await expect(page).toHaveURL(/cat=design/);
  await expect(page).toHaveURL(/q=/);
  await expect(page.getByRole('searchbox', { name: 'ค้นหาการแข่งขัน' })).toHaveValue('ออกแบบ');
});
