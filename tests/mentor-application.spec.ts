import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createAccount, removeAccount, signIn } from './helpers';
import type { TestAccount } from './helpers';

/* จ้างพักไว้ (เซิร์ฟเวอร์ของเทสไม่ตั้ง HIRING_ENABLED) ถ้อยคำของช่องยอมรับสองข้อกับตัวอย่างโปรไฟล์จึงเป็นของโหมดตัวกลาง
   เปิดจ้างกลับแล้วใช้ถ้อยคำเดิม ส่วนช่องทางติดต่ออย่างน้อยหนึ่งช่องบังคับทั้งสองโหมด */
const hiringOn = process.env.HIRING_ENABLED === 'true';

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
/** เพิ่มประสบการณ์แข่งขันหนึ่งรายการ (บังคับอย่างน้อยหนึ่ง: เป็นเมนเทอร์ได้เฉพาะเวทีที่เคยแข่ง) */
async function addExperience(page: Page, name: string, options: { result?: string; mentor?: boolean } = {}) {
  await page.getByRole('button', { name: '+ เพิ่มเวทีที่เคยแข่ง', exact: true }).click();
  const card = page.locator('#cw-apply .exp').last();
  await card.getByLabel('ชื่อเวที *', { exact: true }).fill(name);
  await card.locator('.offer-mode__option').filter({ hasText: options.result ?? 'เข้าร่วม' }).click();
  await card.getByLabel('ปี พ.ศ. *', { exact: true }).fill('2567');
  await card.getByLabel('ลิงก์ประกาศผล หรือหลักฐานว่าเคยเข้าร่วม', { exact: true }).fill('https://example.com/result');
  if (options.mentor) await card.getByRole('checkbox', { name: /อยากเป็นเมนเทอร์ของเวทีนี้/ }).check();
  return card;
}
async function reachService(page: Page) {
  await fillIdentity(page); await next(page);
  await page.locator('#apply-experience').fill('เคยวิเคราะห์โจทย์ธุรกิจและนำเสนอผลงานร่วมกับทีม');
  await addExperience(page, 'เวทีที่ยังไม่มีในระบบ');
  await next(page);
}
const consentNames = [
  /ยืนยันว่าข้อมูลและหลักฐาน/,
  /ไม่ทำงานหรือจัดทำผลงานส่งแข่งขันแทนทีม/,
  hiringOn ? /ตอบคำขอจ้างโดยเร็ว/ : /ตอบนักเรียนที่ติดต่อมา/,
  /กรรมการตัดสิน/,
  hiringOn ? /การชำระเงินบน ChampionWays ยังไม่เปิด/ : /ChampionWays ไม่รับชำระเงิน/,
];
async function acceptAll(page: Page) {
  for (const name of consentNames) await page.getByRole('checkbox', { name }).check();
}

async function fillService(page: Page) {
  await page.locator('#apply-best').fill('ช่วยฝึกนำเสนอไอเดีย');
  await page.locator('#apply-cannot').fill('ไม่รับทำงานส่งแทน');
  await page.getByRole('checkbox', { name: 'ตีโจทย์และหาไอเดีย', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Pitching และตอบคำถาม', exact: true }).check();
  // ช่องทางติดต่ออย่างน้อยหนึ่งช่องบังคับตั้งแต่สมัคร ราคาอยู่กับแต่ละงานที่ติ๊ก (ไม่ติ๊กก็ได้)
  await page.locator('#apply-contactLine').fill('mentor.line');
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
  // ตัวอย่างโปรไฟล์บอกว่าเว็บไม่เก็บเงิน
  await expect(profile).toContainText(/เก็บเงิน/);
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
  await page.locator('#apply-portfolio').fill('https://example.com/work');
  await next(page);
  // ลิงก์ผลงานอย่างเดียวไม่พอแล้ว ต้องเคยแข่งอย่างน้อยหนึ่งเวที
  await expect(page.getByRole('alert')).toHaveText('เพิ่มเวทีที่เคยแข่งอย่างน้อยหนึ่งรายการ เป็นเมนเทอร์ได้เฉพาะเวทีที่เคยแข่งเอง');
  await addExperience(page, 'เวทีตัวอย่าง'); await next(page);
  await fillService(page);
  await page.getByRole('checkbox', { name: 'พัฒนาต้นแบบ', exact: true }).click();
  await expect(page.locator('#cw-apply .topics input:checked')).toHaveCount(2);
  await expect(page.getByRole('alert')).toHaveText('เลือกได้สูงสุด 2 หัวข้อ');
  // ความถนัดต้องสองหัวข้อพอดี
  await page.getByRole('checkbox', { name: 'Pitching และตอบคำถาม', exact: true }).uncheck();
  await next(page);
  await expect(page.getByRole('alert')).toHaveText('เลือกความถนัดให้ครบ 2 หัวข้อ');
  await page.getByRole('checkbox', { name: 'Pitching และตอบคำถาม', exact: true }).check();
  await next(page);
  await expect(page.getByRole('heading', { name: 'ตรวจทานก่อนส่งใบสมัคร' })).toBeVisible();
});

test('only competitions you competed in can be mentored, each priced as free or per a unit you name', async ({ page }) => {
  await signIn(page, applicant, '/mentors/apply');
  const list = await (await page.request.get('/api/consult/open-competitions?all=1')).json() as { items: { name: string }[] };
  expect(list.items.length).toBeGreaterThan(1);
  const [first, second] = list.items;
  await fillIdentity(page); await next(page);
  await page.locator('#apply-experience').fill('เคยแข่งหลายเวที');
  // เวทีที่ไม่มีในระบบเก็บเป็นประสบการณ์ได้ แต่ติ๊กเป็นเมนเทอร์ไม่ได้
  const typed = await addExperience(page, 'เวทีเล็ก ๆ นอกระบบ');
  await expect(typed.getByRole('checkbox', { name: /อยากเป็นเมนเทอร์ของเวทีนี้/ })).toBeDisabled();
  await expect(typed).toContainText('ยังไม่มีใน ChampionWays');
  const known = await addExperience(page, first.name, { result: 'ได้รางวัล', mentor: true });
  await expect(known).toContainText('มีใน ChampionWays');
  // จับคู่ได้แล้วเห็นรายละเอียดเวทีและลิงก์ไปหน้าเวที เพื่อให้แน่ใจว่าเลือกถูกเวที
  await expect(known.locator('.exp-info__name')).toHaveText(first.name);
  await expect(known.getByRole('link', { name: /ดูหน้าเวทีนี้/ })).toHaveAttribute('target', '_blank');
  await addExperience(page, second.name, { mentor: true });
  await next(page);

  await page.locator('#apply-best').fill('ช่วยฝึกนำเสนอไอเดีย');
  await page.locator('#apply-cannot').fill('ไม่รับทำงานส่งแทน');
  await page.getByRole('checkbox', { name: 'ตีโจทย์และหาไอเดีย', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Pitching และตอบคำถาม', exact: true }).check();
  await page.locator('#apply-contactInstagram').fill('mentor.ig');
  // ไม่มีส่วนเลือกเวทีและไม่มีช่องนาทีแล้ว ราคามีเฉพาะเวทีที่ติ๊กไว้
  await expect(page.locator('#apply-price')).toHaveCount(0);
  const cards = page.locator('#cw-apply .offers-list .offer');
  await expect(cards).toHaveCount(2);
  await next(page);
  await expect(page.getByRole('alert')).toContainText('ยังไม่ได้ตั้งราคา');
  await cards.nth(0).locator('.offer-mode__option').filter({ hasText: 'ตั้งราคา' }).click();
  await cards.nth(0).getByLabel('ราคา (บาท)').fill('500');
  await next(page);
  await expect(cards.nth(0)).toContainText('บอกหน่วย เช่น ชั่วโมง');
  await cards.nth(0).getByLabel('คิดต่ออะไร').fill('โปรเจกต์');
  await cards.nth(1).locator('.offer-mode__option').filter({ hasText: 'ฟรี' }).click();
  await next(page);

  await expect(page.locator('#cw-apply .review-offers')).toContainText('500 บาท / โปรเจกต์');
  await expect(page.locator('#cw-apply .review-offers')).toContainText('ฟรี');
  await acceptAll(page);
  const sent = page.waitForRequest((request) => request.url().endsWith('/api/submissions/mentor'));
  await page.getByRole('button', { name: 'ส่งใบสมัคร', exact: true }).click();
  const body = (await sent).postDataJSON();
  expect(body.price).toBeUndefined();
  expect(body.awards).toHaveLength(3);
  expect(body.awards.filter((award: { wantsMentor: boolean }) => award.wantsMentor)).toHaveLength(2);
  expect(body.offers).toEqual([
    expect.objectContaining({ price: 500, unit: 'โปรเจกต์' }),
    expect.objectContaining({ price: 0, unit: '' }),
  ]);
  await expect(page.getByRole('heading', { name: 'ส่งใบสมัครแล้ว' })).toBeVisible();
});

test('a competition name typed before the list finishes loading still matches once it loads', async ({ page }) => {
  const list = await (await page.request.get('/api/consult/open-competitions?all=1')).json() as { items: { name: string }[] };
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/consult/open-competitions?all=1', async (route) => { await gate; await route.continue(); });
  await page.goto('/mentors/apply'); await fillIdentity(page); await next(page);
  await page.getByRole('button', { name: '+ เพิ่มเวทีที่เคยแข่ง', exact: true }).click();
  const card = page.locator('#cw-apply .exp').first();
  await card.getByLabel('ชื่อเวที *', { exact: true }).fill(list.items[0].name);
  await expect(card).toContainText('ยังไม่มีใน ChampionWays');
  release();
  await expect(card).toContainText('มีใน ChampionWays · เป็นเมนเทอร์ของเวทีนี้ได้');
  await expect(card.getByRole('checkbox', { name: /อยากเป็นเมนเทอร์ของเวทีนี้/ })).toBeEnabled();
});

test('experiences are unlimited, show what is missing under each field, fold when done, and can be undone', async ({ page }) => {
  await page.goto('/mentors/apply'); await fillIdentity(page); await next(page);
  await page.locator('#apply-experience').fill('ผลงานและหน้าที่ในทีมตัวอย่าง');
  await page.getByRole('button', { name: '+ เพิ่มเวทีที่เคยแข่ง', exact: true }).click();
  const card = page.locator('#cw-apply .exp').first();
  await card.getByLabel('ชื่อเวที *', { exact: true }).fill('Venture Ignite');
  await next(page);
  // ข้อความรวมบอกจำนวน และใต้ช่องบอกว่าขาดอะไร
  await expect(page.getByRole('alert').first()).toContainText('ยังกรอกไม่ครบ');
  await expect(card).toContainText('เลือกผลที่ได้');
  await expect(card).toContainText('ใส่ปี พ.ศ.');
  await expect(card).toContainText('ใส่ลิงก์ประกาศผล หรือแนบไฟล์');
  await card.locator('.offer-mode__option').filter({ hasText: 'เข้ารอบชิง' }).click();
  await card.getByLabel('ปี พ.ศ. *', { exact: true }).fill('2568');
  await card.locator('input[type=file]').setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('sample') });
  await expect(card).toContainText('ใช้ไฟล์ PDF, JPG หรือ PNG ไม่เกิน 10 MB');
  await card.locator('input[type=file]').setInputFiles({ name: 'award.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 sample') });
  await expect(card).toContainText('award.pdf');
  // กดเสร็จแล้วพับเหลือบรรทัดเดียว
  await card.getByRole('button', { name: 'เสร็จ', exact: true }).click();
  await expect(card).toContainText('Venture Ignite');
  await expect(card.getByLabel('ชื่อเวที *', { exact: true })).toHaveCount(0);
  // เพิ่มได้ไม่จำกัด
  for (let i = 0; i < 3; i++) await addExperience(page, `เวทีเพิ่ม ${i + 1}`);
  await expect(page.locator('#cw-apply .exp')).toHaveCount(4);
  await page.getByRole('button', { name: 'ลบเวทีที่ 4' }).click();
  await expect(page.locator('#cw-apply .exp')).toHaveCount(3);
  await page.getByRole('button', { name: 'เลิกทำ', exact: true }).click();
  await expect(page.locator('#cw-apply .exp')).toHaveCount(4);
  await page.getByRole('button', { name: 'ลบเวทีที่ 4' }).click();
  await next(page); await fillService(page); await next(page);
  await expect(page.locator('#cw-apply .review').filter({ hasText: 'Venture Ignite' })).toContainText('award.pdf');
  await expect(page.locator('#cw-apply .review').filter({ hasText: 'Venture Ignite' })).toContainText('เข้ารอบชิง');
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
    if (stage === 1) { await page.locator('#apply-experience').fill('ประสบการณ์ตัวอย่าง'); await addExperience(page, 'เวทีตัวอย่าง'); await next(page); }
    if (stage === 2) { await fillService(page); await next(page); }
  }
  expect(errors).toEqual([]);
});
