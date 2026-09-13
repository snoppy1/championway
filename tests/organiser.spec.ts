import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createAccount, removeAccount, signIn } from './helpers';
import type { TestAccount } from './helpers';

let organiser: TestAccount;
test.beforeAll(async () => { organiser = await createAccount('member'); });
test.afterAll(async () => { await removeAccount(organiser); });

const next = (page: Page) => page.getByRole('button', { name: 'ถัดไป', exact: true }).click();

function future(days: number) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

async function fillOrganiser(page: Page) {
  await page.getByLabel('ชื่อหน่วยงานที่จัด *').fill('ชมรมทดสอบการลงงาน');
  await page.getByLabel('ชื่อผู้ติดต่อ *').fill('ผู้ประสานงาน');
  await page.getByLabel('ตำแหน่ง *').fill('ประธานชมรม');
  await page.locator('#submit-email').fill('organiser@example.com');
  await page.getByLabel('เบอร์โทร *').fill('08x-xxx-0000');
  await page.getByLabel('ลิงก์เว็บหรือเพจทางการ *').fill('https://example.test/club');
}

async function fillEvent(page: Page, name: string) {
  await page.getByLabel('ชื่องาน *').fill(name);
  await page.getByRole('radio', { name: 'Hackathon' }).check();
  await page.getByRole('checkbox', { name: 'นวัตกรรม', exact: true }).check();
  await page.getByLabel('คำบรรยายสั้น *').fill('ใบนี้สร้างโดยชุดทดสอบเพื่อเดินเส้นทางการลงงานแข่ง');
  await page.getByRole('checkbox', { name: 'เทคโนโลยีและนวัตกรรม' }).check();
  await page.getByRole('checkbox', { name: 'อุดมศึกษา' }).check();
}

test('the landing page explains the rules and leads to the form', async ({ page }) => {
  await page.goto('/organizers');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ลงงานแข่งขันของคุณ ฟรี');
  await expect(page.getByText('ต้องมีลิงก์ประกาศต้นทาง')).toBeVisible();

  const results = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations).toEqual([]);

  await page.getByRole('link', { name: /เริ่มกรอกใบลงงาน/ }).click();
  await expect(page).toHaveURL(/organizers\/submit$/);
});

test('signed-out visitors can fill the form but cannot send it', async ({ page }) => {
  await page.goto('/organizers/submit');
  await expect(page.getByRole('status').filter({ hasText: 'ต้องเข้าสู่ระบบ' })).toBeVisible();
  await fillOrganiser(page);
  await next(page);
  await expect(page.getByRole('heading', { name: 'งานนี้คืออะไร' })).toBeVisible();
});

test('each step refuses to advance until its own fields are filled', async ({ page }) => {
  await signIn(page, organiser, '/organizers/submit');
  await next(page);
  await expect(page.getByRole('alert')).toHaveText('กรอกชื่อหน่วยงาน');

  await fillOrganiser(page);
  await next(page);
  await next(page);
  await expect(page.getByRole('alert')).toHaveText('กรอกชื่องาน');

  await fillEvent(page, 'เวทีตรวจความถูกต้อง');
  await next(page);

  // ปิดรับต้องเป็นวันในอนาคต และไม่มีเงินรางวัลก็ต้องบอกว่าได้อะไรแทน
  await page.getByLabel('วันปิดรับสมัคร *').fill(future(-1));
  await page.getByLabel('ลิงก์ประกาศต้นทาง *').fill('https://example.test/announcement');
  await next(page);
  await expect(page.getByRole('alert')).toHaveText('วันปิดรับต้องเป็นวันในอนาคต');

  await page.getByLabel('วันปิดรับสมัคร *').fill(future(30));
  await next(page);
  await expect(page.getByRole('alert')).toHaveText('ไม่มีเงินรางวัลก็ได้ แต่ต้องบอกว่าผู้ชนะได้อะไรแทน');
});

test('a complete submission reaches the review queue with its file attached', async ({ page }, testInfo) => {
  // เทสนี้เพิ่มใบจริงเข้าคิว จึงรันเบราว์เซอร์เดียวไม่ให้นับกันมั่ว
  test.skip(testInfo.project.name !== 'desktop', 'mutates shared data');

  const marker = `เวทีจากฟอร์ม ${Date.now()}`;
  await signIn(page, organiser, '/organizers/submit');

  await fillOrganiser(page);
  await next(page);
  await fillEvent(page, marker);
  await next(page);

  await page.getByLabel('วันปิดรับสมัคร *').fill(future(45));
  await page.getByLabel('เงินรางวัลรวม (บาท)').fill('25000');
  await expect(page.locator('.price-preview strong')).toHaveText('รางวัลรวม 25,000 บาท');
  await page.getByLabel('ลิงก์ประกาศต้นทาง *').fill('https://example.test/announcement');
  await page.locator('#submit-poster').setInputFiles({
    name: 'poster.png', mimeType: 'image/png',
    buffer: Buffer.from('89504e470d0a1a0a', 'hex'),
  });
  await next(page);

  // ขั้นตรวจทานต้องโชว์การ์ดแบบที่จะขึ้นจริง และบังคับติ๊กครบก่อนส่ง
  await expect(page.locator('.preview-card h3')).toHaveText(marker);
  await page.getByRole('button', { name: 'ส่งใบลงงานแข่ง' }).click();
  await expect(page.getByRole('alert')).toHaveText('ติ๊กยอมรับเงื่อนไขให้ครบทุกข้อก่อนส่งใบ');
  await expect(page.locator('#consent-authority')).toBeFocused();

  for (const box of await page.locator('.consent-check input').all()) await box.check();
  await page.getByRole('button', { name: 'ส่งใบลงงานแข่ง' }).click();
  await expect(page.getByRole('heading', { name: 'ส่งใบลงงานแข่งแล้ว' })).toBeVisible();

  // ทีมตรวจต้องเห็นใบนี้พร้อมไฟล์ที่แนบมา
  const reviewer = await createAccount('reviewer');
  await signIn(page, reviewer, '/admin/competitions');
  const row = page.locator('.queue-row', { hasText: marker });
  await expect(row).toHaveCount(1);
  await row.getByRole('link', { name: marker }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(marker);
  await expect(page.locator('.admin-block', { hasText: 'ไฟล์ที่แนบมา' }).getByRole('link')).toHaveCount(1);
  await removeAccount(reviewer);
});

test('editing from the review step returns to the right place and clears the accuracy tick', async ({ page }) => {
  await signIn(page, organiser, '/organizers/submit');
  await fillOrganiser(page);
  await next(page);
  await fillEvent(page, 'เวทีตรวจการแก้ไข');
  await next(page);
  await page.getByLabel('วันปิดรับสมัคร *').fill(future(20));
  await page.getByLabel('เงินรางวัลรวม (บาท)').fill('1000');
  await page.getByLabel('ลิงก์ประกาศต้นทาง *').fill('https://example.test/announcement');
  await next(page);

  await page.locator('#consent-accuracy').check();
  await page.getByRole('button', { name: 'แก้ไขรายละเอียดงาน' }).click();
  await expect(page.getByLabel('ชื่องาน *')).toHaveValue('เวทีตรวจการแก้ไข');
  await page.getByLabel('ชื่องาน *').fill('เวทีตรวจการแก้ไข รอบสอง');
  await next(page);
  await next(page);
  await expect(page.locator('#consent-accuracy')).not.toBeChecked();
});

test('every step of the form passes axe and fits the viewport', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await signIn(page, organiser, '/organizers/submit');

  for (let stage = 0; stage < 4; stage += 1) {
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const results = await new AxeBuilder({ page }).include('#cw-submit').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations, `ขั้นที่ ${stage + 1}`).toEqual([]);
    await page.screenshot({ path: `artifacts/organiser-${testInfo.project.name}-step-${stage + 1}.png`, fullPage: true });

    if (stage === 0) { await fillOrganiser(page); await next(page); }
    if (stage === 1) { await fillEvent(page, 'เวทีตรวจการเข้าถึง'); await next(page); }
    if (stage === 2) {
      await page.getByLabel('วันปิดรับสมัคร *').fill(future(25));
      await page.getByLabel('เงินรางวัลรวม (บาท)').fill('5000');
      await page.getByLabel('ลิงก์ประกาศต้นทาง *').fill('https://example.test/announcement');
      await next(page);
    }
  }
  expect(errors).toEqual([]);
});
