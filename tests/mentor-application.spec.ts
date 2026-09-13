import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createAccount, removeAccount, signIn } from './helpers';
import type { TestAccount } from './helpers';

/* ใบสมัครถูกบันทึกลงฐานข้อมูลจริงแล้ว เทสจึงต้องมีบัญชีและเข้าสู่ระบบก่อน */
let applicant: TestAccount;
test.beforeAll(async () => { applicant = await createAccount('member'); });
test.afterAll(async () => { await removeAccount(applicant); });

async function fillIdentity(page: Page) {
  await page.getByLabel('ชื่อจริง *', { exact: true }).fill('มาลี');
  await page.getByLabel('นามสกุล *', { exact: false }).fill('นามสกุลทดสอบ');
  await page.getByLabel('ชื่อที่อยากให้ทีมเรียก *', { exact: true }).fill('พี่มายด์');
  await page.locator('#apply-email').fill('mentor@example.com');
  await page.getByRole('combobox', { name: 'สถานะ *', exact: true }).selectOption('นักศึกษา');
  await page.getByLabel('มหาวิทยาลัยหรือที่ทำงาน *', { exact: true }).fill('มหาวิทยาลัยตัวอย่าง');
  await page.getByLabel('คณะและชั้นปี หรือตำแหน่งงาน *', { exact: true }).fill('บริหารธุรกิจ ปี 4');
}

async function next(page: Page) { await page.getByRole('button', { name: 'ถัดไป', exact: true }).click(); }
async function reachService(page: Page) {
  await fillIdentity(page); await next(page);
  await page.locator('#apply-experience').fill('เคยวิเคราะห์โจทย์ธุรกิจและนำเสนอผลงานร่วมกับทีม');
  await page.locator('#apply-portfolio').fill('https://example.com/portfolio');
  await next(page);
}
const consentNames = [
  /ยืนยันว่าข้อมูลและหลักฐาน/,
  /ไม่ทำงานหรือจัดทำผลงานส่งแข่งขันแทนทีม/,
  /ไม่รับงานนอกระบบ/,
  /กรรมการตัดสิน/,
  /ยังไม่มีการเก็บเงิน/,
];
async function acceptAll(page: Page) {
  for (const name of consentNames) await page.getByRole('checkbox', { name }).check();
}

async function fillService(page: Page) {
  await page.locator('#apply-best').fill('ช่วยฝึกนำเสนอไอเดีย');
  await page.locator('#apply-cannot').fill('ไม่รับทำงานส่งแทน');
  await page.getByRole('checkbox', { name: 'ตีโจทย์และหาไอเดีย', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Pitching และตอบคำถาม', exact: true }).check();
}

test('the apply link now lives in the profile, and a direct URL refresh works', async ({ page }) => {
  await signIn(page, applicant, '/profile');
  await page.getByRole('link', { name: 'สมัครเป็นเมนเทอร์' }).click();
  await expect(page).toHaveURL(/\/mentors\/apply$/);
  await expect(page.getByRole('heading', { name: 'เริ่มจากแนะนำตัวคุณ' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('ประสบการณ์ของคุณ');
  await page.getByRole('link', { name: 'กลับไปโปรไฟล์', exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
});

test('all four steps, private preview, no upload, back navigation and completion', async ({ page }) => {
  await signIn(page, applicant, '/mentors/apply');
  const writes: string[] = [];
  page.on('request', (request) => { if (['POST', 'PUT', 'PATCH'].includes(request.method())) writes.push(request.url()); });
  await page.goto('/mentors/apply');
  await reachService(page);
  await fillService(page);
  await next(page);
  const profile = page.locator('#cw-apply .profile');
  await expect(profile).toContainText('พี่มายด์ น.');
  await expect(profile).not.toContainText('นามสกุลทดสอบ');
  await expect(profile).not.toContainText('mentor@example.com');
  // ตัวอย่างโปรไฟล์ต้องไม่พูดถึงราคา เพราะรอบนี้ยังไม่เก็บเงิน
  await expect(profile).toContainText('ยังไม่มีการเก็บเงิน');
  await page.getByRole('button', { name: 'ย้อนกลับ', exact: true }).click();
  await expect(page.locator('#apply-best')).toHaveValue('ช่วยฝึกนำเสนอไอเดีย');
  await expect(page.locator('#cw-apply .topics input:checked')).toHaveCount(2);
  await next(page);
  await acceptAll(page);
  await page.getByRole('button', { name: 'ส่งใบสมัคร', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'ส่งใบสมัครแล้ว' })).toBeVisible();
  await expect(page.getByText(/ไฟล์ที่เลือกยังไม่ถูกอัปโหลด/)).toBeVisible();
  // ใบสมัครต้องถูกส่งครั้งเดียว และต้องไม่มีการอัปโหลดไฟล์ไปที่ไหนในรอบนี้
  const apiWrites = writes.filter((url) => url.includes('/api/'));
  expect(apiWrites, apiWrites.join(' | ')).toHaveLength(1);
  expect(apiWrites[0]).toContain('/api/submissions/mentor');
  await page.getByRole('button', { name: 'กลับไปตรวจใบสมัคร', exact: true }).click();
  await expect(profile).toContainText('พี่มายด์ น.');
  await page.reload();
  await expect(page.locator('#apply-first')).toHaveValue('');
});

test('required identity, evidence and exactly two topics', async ({ page }) => {
  await page.goto('/mentors/apply');
  await next(page);
  await expect(page.locator('#apply-first')).toBeFocused();
  await fillIdentity(page); await next(page);
  await page.locator('#apply-experience').fill('ประสบการณ์ตัวอย่าง');
  await next(page);
  await expect(page.getByRole('alert')).toHaveText('เพิ่มหลักฐานรางวัล หรือใส่ลิงก์ผลงานก่อนดำเนินการต่อ');
  await page.locator('#apply-portfolio').fill('https://example.com/work'); await next(page);
  await fillService(page);
  await page.getByRole('checkbox', { name: 'พัฒนาต้นแบบ', exact: true }).click();
  await expect(page.locator('#cw-apply .topics input:checked')).toHaveCount(2);
  await expect(page.getByRole('alert')).toHaveText('เลือกได้สูงสุด 2 หัวข้อ');
  // ราคาและคิวไม่อยู่ในใบสมัครแล้ว ขั้นนี้จึงเหลือแค่ความถนัดสองหัวข้อพอดี
  await page.getByRole('checkbox', { name: 'Pitching และตอบคำถาม', exact: true }).uncheck();
  await next(page);
  await expect(page.getByRole('alert')).toHaveText('เลือกความถนัดให้ครบ 2 หัวข้อ');
  await page.getByRole('checkbox', { name: 'Pitching และตอบคำถาม', exact: true }).check();
  await next(page);
  await expect(page.getByRole('heading', { name: 'ตรวจทานก่อนส่งใบสมัคร' })).toBeVisible();
});

test('awards can be added and removed; evidence files validate and survive steps', async ({ page }) => {
  await page.goto('/mentors/apply'); await fillIdentity(page); await next(page);
  await page.locator('#apply-experience').fill('ผลงานและหน้าที่ในทีมตัวอย่าง');
  await page.getByRole('button', { name: /เพิ่มรางวัล/ }).click();
  const award = page.locator('#cw-apply .award').first();
  await award.getByLabel('ชื่อการแข่งขัน *', { exact: true }).fill('Venture Ignite');
  await award.getByLabel('รางวัลที่ได้รับ *', { exact: true }).fill('ชนะเลิศ');
  await award.getByLabel('ปี พ.ศ. *', { exact: true }).fill('2568');
  await next(page);
  await expect(page.getByRole('alert')).toHaveText('แต่ละรางวัลต้องมีลิงก์ประกาศหรือไฟล์หลักฐาน');
  await award.locator('input[type=file]').setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('sample') });
  await next(page);
  await expect(page.getByRole('alert')).toHaveText('หลักฐานต้องเป็น PDF, JPG หรือ PNG ไม่เกิน 10 MB');
  await award.locator('input[type=file]').setInputFiles({ name: 'award.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 sample') });
  await page.getByRole('button', { name: /เพิ่มรางวัล/ }).click();
  await expect(page.getByRole('button', { name: /เพิ่มรางวัล/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'ลบรางวัล 2' }).click();
  await next(page); await fillService(page); await next(page);
  await expect(page.locator('#cw-apply .review').filter({ hasText: 'Venture Ignite' })).toContainText('award.pdf');
  await expect(page.locator('#cw-apply .review').filter({ hasText: 'Venture Ignite' })).toContainText('รอตรวจสอบ');
});

test('profile file type and size are checked before proceeding', async ({ page }) => {
  await page.goto('/mentors/apply'); await fillIdentity(page);
  await page.locator('#apply-portrait').setInputFiles({ name: 'not-an-image.pdf', mimeType: 'application/pdf', buffer: Buffer.from('sample') });
  await next(page);
  await expect(page.getByRole('alert')).toHaveText('เลือกรูป JPG, PNG หรือ WebP ไม่เกิน 5 MB');
  await page.locator('#apply-portrait').setInputFiles({ name: 'too-large.png', mimeType: 'image/png', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
  await next(page);
  await expect(page.getByRole('alert')).toHaveText('เลือกรูป JPG, PNG หรือ WebP ไม่เกิน 5 MB');
  await page.locator('#apply-portrait').setInputFiles([]);
  await next(page);
  await expect(page.getByRole('heading', { name: 'ให้ประสบการณ์เล่าแทนคุณ' })).toBeVisible();
});

test('every consent box is required, and the first missing one takes focus', async ({ page }) => {
  await signIn(page, applicant, '/mentors/apply');
  await reachService(page); await fillService(page); await next(page);
  const submit = page.getByRole('button', { name: 'ส่งใบสมัคร', exact: true });
  await submit.click();
  await expect(page.getByRole('alert')).toHaveText('ติ๊กยอมรับเงื่อนไขให้ครบทุกข้อก่อนส่งใบสมัคร');
  await expect(page.locator('#consent-accuracy')).toBeFocused();

  // Everything but the payment acknowledgement: still blocked, focus moves to it.
  for (const name of consentNames.slice(0, 4)) await page.getByRole('checkbox', { name }).check();
  await submit.click();
  await expect(page.locator('#consent-payment')).toBeFocused();
  await expect(page.getByRole('heading', { name: 'ส่งใบสมัครแล้ว' })).toHaveCount(0);

  await page.getByRole('checkbox', { name: consentNames[4] }).check();
  await submit.click();
  await expect(page.getByRole('heading', { name: 'ส่งใบสมัครแล้ว' })).toBeVisible();
});

test('review edits jump to the right step, keep data, and reset the accuracy tick', async ({ page }) => {
  await page.goto('/mentors/apply');
  await reachService(page); await fillService(page); await next(page);
  await acceptAll(page);

  await page.getByRole('button', { name: 'แก้ไขความถนัด' }).click();
  await expect(page.getByRole('heading', { name: 'บอกให้ชัดว่าช่วยอะไรได้' })).toBeVisible();
  await expect(page.locator('#cw-apply .topics input:checked')).toHaveCount(2);
  await page.locator('#apply-best').fill('ช่วยวางโครงการนำเสนอ');
  await next(page);

  // Changing the application invalidates only the "this data is mine" tick.
  await expect(page.locator('#cw-apply .profile')).toContainText('ช่วยวางโครงการนำเสนอ');
  await expect(page.getByRole('checkbox', { name: consentNames[0] })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: consentNames[4] })).toBeChecked();

  await page.getByRole('button', { name: 'แก้ไขข้อมูลผู้สมัคร' }).click();
  await expect(page.locator('#apply-email')).toHaveValue('mentor@example.com');
});

test('application visual QA and accessibility for every step', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/mentors/apply');
  for (let stage = 0; stage < 4; stage++) {
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const results = await new AxeBuilder({ page }).include('#cw-apply').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations).toEqual([]);
    await page.screenshot({ path: `artifacts/application-${testInfo.project.name}-step-${stage + 1}.png`, fullPage: true });
    if (stage === 0) { await fillIdentity(page); await next(page); }
    if (stage === 1) { await page.locator('#apply-experience').fill('ประสบการณ์ตัวอย่าง'); await page.locator('#apply-portfolio').fill('https://example.com/work'); await next(page); }
    if (stage === 2) { await fillService(page); await next(page); }
  }
  expect(errors).toEqual([]);
});
