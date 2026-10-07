import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createAccount, removeAccount, signIn } from './helpers';
import type { TestAccount } from './helpers';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../server/db/client';
import { files, mentorAwards, mentorSubmissions, reviewEvents } from '../server/db/schema';
import { newId } from '../server/lib/id';
import { fakeUploads } from '../scripts/fake-files';

/* จ้างพักไว้ (เซิร์ฟเวอร์ของเทสไม่ตั้ง HIRING_ENABLED) ถ้อยคำของช่องยอมรับสองข้อกับตัวอย่างโปรไฟล์จึงเป็นของโหมดตัวกลาง
   เปิดจ้างกลับแล้วใช้ถ้อยคำเดิม ส่วนช่องทางติดต่ออย่างน้อยหนึ่งช่องบังคับทั้งสองโหมด */
const hiringOn = process.env.HIRING_ENABLED === 'true';

/* ใบสมัครถูกบันทึกลงฐานข้อมูลจริงแล้ว เทสจึงต้องมีบัญชีและเข้าสู่ระบบก่อน */
let applicant: TestAccount;
test.beforeAll(async () => { applicant = await createAccount('member'); });
test.afterAll(async () => { await removeAccount(applicant); });

const PHOTO = { name: 'me.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') };
const PROOF = { name: 'proof.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 proof') };

async function fillIdentity(page: Page) {
  await page.getByLabel('ชื่อจริง *', { exact: true }).fill('มาลี');
  await page.getByLabel('นามสกุล *', { exact: false }).fill('นามสกุลทดสอบ');
  await page.getByLabel('ชื่อที่อยากให้ทีมเรียก *', { exact: true }).fill('พี่มายด์');
  await page.locator('#apply-email').fill('mentor@example.com');
  await page.getByRole('combobox', { name: 'สถานะ *', exact: true }).selectOption('นักศึกษา');
  await page.getByLabel('มหาวิทยาลัยหรือที่ทำงาน *', { exact: true }).fill('มหาวิทยาลัยตัวอย่าง');
  await page.getByLabel('คณะและชั้นปี หรือตำแหน่งงาน *', { exact: true }).fill('บริหารธุรกิจ ปี 4');
  // รูปโปรไฟล์บังคับ (6 ต.ค. 2569)
  await page.locator('#apply-portrait').setInputFiles(PHOTO);
}

async function next(page: Page) { await page.getByRole('button', { name: 'ถัดไป', exact: true }).click(); }
/** เพิ่มประสบการณ์แข่งขันหนึ่งรายการ (บังคับอย่างน้อยหนึ่ง: เป็นเมนเทอร์ได้เฉพาะเวทีที่เคยแข่ง) */
async function addExperience(page: Page, name: string, options: { result?: string; mentor?: boolean } = {}) {
  await page.getByRole('button', { name: '+ เพิ่มเวทีที่เคยแข่ง', exact: true }).click();
  const card = page.locator('#cw-apply .exp').last();
  await card.getByLabel('ชื่อเวที *', { exact: true }).fill(name);
  await card.locator('.offer-mode__option').filter({ hasText: options.result ?? 'เข้าร่วม' }).click();
  await card.getByLabel('ปี พ.ศ. *', { exact: true }).fill('2567');
  // ไฟล์หลักฐานบังคับ ลิงก์ประกาศผลไม่บังคับ (6 ต.ค. 2569)
  await card.locator('input[type=file]').setInputFiles(PROOF);
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

test('all four steps, private preview, uploads, back navigation and completion', async ({ page }) => {
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
  await expect(page.getByText(/ได้รับรูปโปรไฟล์และไฟล์หลักฐานของคุณแล้ว/)).toBeVisible();
  // อัปโหลดรูปโปรไฟล์และไฟล์หลักฐานก่อน แล้วส่งใบสมัครครั้งเดียว
  const apiWrites = writes.filter((url) => url.includes('/api/'));
  expect(apiWrites.map((url) => new URL(url).pathname), apiWrites.join(' | ')).toEqual(['/api/files', '/api/files', '/api/submissions/mentor']);
  await page.getByRole('button', { name: 'กลับไปตรวจใบสมัคร', exact: true }).click();
  await expect(profile).toContainText('พี่มายด์ น.');
  await page.reload();
  await expect(page.locator('#apply-first')).toHaveValue('');
});

test('required identity, evidence, up to four topics plus a typed "other"', async ({ page }) => {
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
  // เลือกจากรายการได้สูงสุดสี่ข้อ (7 ต.ค. 2569)
  await page.getByRole('checkbox', { name: 'พัฒนาต้นแบบ', exact: true }).check();
  await page.getByRole('checkbox', { name: 'ออกแบบสไลด์', exact: true }).check();
  await page.getByRole('checkbox', { name: 'วางแผนและแบ่งงาน', exact: true }).click();
  await expect(page.locator('#cw-apply .topics input:checked')).toHaveCount(4);
  await expect(page.getByRole('alert')).toHaveText('เลือกจากรายการได้สูงสุด 4 หัวข้อ');
  // "อื่นๆ" ไม่นับรวมสี่ข้อ ติ๊กแล้วต้องพิมพ์ว่าช่วยอะไร
  await page.getByRole('checkbox', { name: 'อื่นๆ', exact: true }).check();
  await next(page);
  await expect(page.getByRole('alert')).toHaveText('พิมพ์ความถนัดอื่นๆ ที่ช่วยได้ หรือเอาติ๊ก “อื่นๆ” ออก');
  await page.getByLabel('ความถนัดอื่นๆ ที่ช่วยได้').fill('เขียนแผนธุรกิจ');
  // ต้องมีความถนัดอย่างน้อยหนึ่งข้อ
  for (const name of ['ตีโจทย์และหาไอเดีย', 'Pitching และตอบคำถาม', 'พัฒนาต้นแบบ', 'ออกแบบสไลด์', 'อื่นๆ']) {
    await page.getByRole('checkbox', { name, exact: true }).uncheck();
  }
  await next(page);
  await expect(page.getByRole('alert')).toHaveText('เลือกความถนัดอย่างน้อย 1 หัวข้อ');
  await page.getByRole('checkbox', { name: 'อื่นๆ', exact: true }).check();
  await expect(page.getByLabel('ความถนัดอื่นๆ ที่ช่วยได้')).toHaveValue('เขียนแผนธุรกิจ');
  await next(page);
  await expect(page.getByRole('heading', { name: 'ตรวจทานก่อนส่งใบสมัคร' })).toBeVisible();
  await expect(page.locator('#cw-apply .profile')).toContainText('เขียนแผนธุรกิจ');
});

test('only competitions you competed in can be mentored, each priced as free or per a unit you name', async ({ page }) => {
  await signIn(page, applicant, '/mentors/apply');
  const list = await (await page.request.get('/api/consult/open-competitions?all=1')).json() as { items: { name: string }[] };
  expect(list.items.length).toBeGreaterThan(1);
  const [first, second] = list.items;
  await fillIdentity(page); await next(page);
  await page.locator('#apply-experience').fill('เคยแข่งหลายเวที');
  // เวทีที่ยังไม่มีในระบบก็ติ๊กเป็นเมนเทอร์ได้ ทีมงานจะเพิ่มเวทีให้หลังอนุมัติ (6 ต.ค. 2569)
  const typed = await addExperience(page, 'เวทีเล็ก ๆ นอกระบบ', { mentor: true });
  await expect(typed).toContainText('ยังไม่มีใน ChampionWays');
  await expect(typed).toContainText('ทีมงานจะเพิ่มให้หลังตรวจใบสมัคร');
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
  // ไม่มีส่วนเลือกเวทีและไม่มีช่องนาทีแล้ว ราคามีเฉพาะเวทีที่ติ๊กไว้ (รวมเวทีนอกระบบ)
  await expect(page.locator('#apply-price')).toHaveCount(0);
  const cards = page.locator('#cw-apply .offers-list .offer');
  await expect(cards).toHaveCount(3);
  await next(page);
  await expect(page.getByRole('alert')).toContainText('ยังไม่ได้ตั้งราคา');
  await cards.nth(0).locator('.offer-mode__option').filter({ hasText: 'ตั้งราคา' }).click();
  await cards.nth(0).getByLabel('ราคา (บาท)').fill('500');
  await next(page);
  await expect(cards.nth(0)).toContainText('บอกหน่วย เช่น ชั่วโมง');
  await cards.nth(0).getByLabel('คิดต่ออะไร').fill('โปรเจกต์');
  await cards.nth(1).locator('.offer-mode__option').filter({ hasText: 'ฟรี' }).click();
  await cards.nth(2).locator('.offer-mode__option').filter({ hasText: 'ฟรี' }).click();
  await next(page);

  await expect(page.locator('#cw-apply .review-offers')).toContainText('500 บาท / โปรเจกต์');
  await expect(page.locator('#cw-apply .review-offers')).toContainText('ฟรี');
  await acceptAll(page);
  const sent = page.waitForRequest((request) => request.url().endsWith('/api/submissions/mentor'));
  await page.getByRole('button', { name: 'ส่งใบสมัคร', exact: true }).click();
  const body = (await sent).postDataJSON();
  expect(body.price).toBeUndefined();
  expect(body.awards).toHaveLength(3);
  expect(body.awards.filter((award: { wantsMentor: boolean }) => award.wantsMentor)).toHaveLength(3);
  expect(body.photoFileId).toMatch(/^fil_/);
  expect(body.awards.every((award: { evidenceFileIds: string[] }) => award.evidenceFileIds.length === 1 && /^fil_/.test(award.evidenceFileIds[0]))).toBe(true);
  // เวทีนอกระบบส่งราคาไปกับรายการนั้น อนุมัติแล้วกลายเป็นคำขอเพิ่มเวที
  // การ์ดราคาเรียงตามลำดับประสบการณ์ เวทีนอกระบบเป็นใบแรก (500 บาท ต่อโปรเจกต์)
  expect(body.awards[0]).toMatchObject({ competitionSlug: null, wantsMentor: true, offer: { price: 500, unit: 'โปรเจกต์' } });
  expect(body.offers).toEqual([
    expect.objectContaining({ price: 0, unit: '' }),
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
  await expect(card).toContainText('แนบไฟล์หลักฐาน');
  await card.locator('.offer-mode__option').filter({ hasText: 'เข้ารอบชิง' }).click();
  await card.getByLabel('ปี พ.ศ. *', { exact: true }).fill('2568');
  await card.locator('input[type=file]').setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('sample') });
  await expect(card).toContainText('ใช้ไฟล์ PDF, JPG หรือ PNG ไม่เกิน 4 MB');
  await card.getByRole('button', { name: 'ลบไฟล์ invalid.txt' }).click();
  // แนบได้หลายไฟล์ (7 ต.ค. 2569) เลือกพร้อมกันหรือเพิ่มทีละไฟล์ก็ได้ สูงสุดห้าไฟล์
  await card.locator('input[type=file]').setInputFiles([
    { name: 'award.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 sample') },
    { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') },
  ]);
  await expect(card.locator('.exp-file__list li')).toHaveCount(2);
  await expect(card).not.toContainText('ใช้ไฟล์ PDF, JPG หรือ PNG ไม่เกิน 4 MB');
  await card.locator('input[type=file]').setInputFiles(['a', 'b', 'c', 'd'].map((name) => ({ name: `${name}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') })));
  await expect(card.locator('.exp-file__list li')).toHaveCount(5);
  await expect(card.getByText('แนบไฟล์เพิ่ม')).toHaveCount(0);
  // เลือกเกินห้าไฟล์ เก็บแค่ห้าไฟล์แรก
  await expect(card.getByText('d.pdf', { exact: true })).toHaveCount(0);
  await card.getByRole('button', { name: 'ลบไฟล์ c.pdf' }).click();
  await expect(card.getByText('แนบไฟล์เพิ่ม')).toBeVisible();
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
  await expect(page.getByRole('alert')).toHaveText('เลือกรูป JPG, PNG หรือ WebP ไม่เกิน 4 MB');
  await page.locator('#apply-portrait').setInputFiles({ name: 'too-large.png', mimeType: 'image/png', buffer: Buffer.alloc(4 * 1024 * 1024 + 1) });
  await next(page);
  await expect(page.getByRole('alert')).toHaveText('เลือกรูป JPG, PNG หรือ WebP ไม่เกิน 4 MB');
  // รูปโปรไฟล์บังคับ
  await page.locator('#apply-portrait').setInputFiles([]);
  await next(page);
  await expect(page.getByRole('alert')).toHaveText('เพิ่มรูปโปรไฟล์ นักเรียนจะเห็นรูปนี้ในหน้าเวที');
  await page.locator('#apply-portrait').setInputFiles(PHOTO);
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

test('after the team asks for more information, the applicant edits the application from the profile and sends it back', async ({ page }) => {
  // บัญชีแยก ใบของบัญชีหลักในเทสอื่นจะได้ไม่ปนกัน
  const owner = await createAccount('member');
  const reviewer = await createAccount('admin');
  try {
    const [photo, proof] = await fakeUploads(owner.id, 2);
    const id = newId('ms');
    await db.insert(mentorSubmissions).values({
      id, userId: owner.id, status: 'info', firstName: 'ใบ', lastName: 'ขอเพิ่ม', nickname: 'พี่ใบ', email: owner.email, phone: '',
      occupation: 'ทำงานแล้ว', organization: 'บริษัทตัวอย่าง', role: 'นักออกแบบ', experience: 'เคยแข่งออกแบบ', best: 'ช่วยวางเรื่องสไลด์',
      cannot: 'ไม่ทำสไลด์แทน', topics: ['ออกแบบสไลด์', 'เขียนแผนธุรกิจ'], contactLine: 'bai.line', photoFileId: photo,
    });
    await db.update(files).set({ ownerType: 'mentor_submission', ownerId: id }).where(inArray(files.id, [photo, proof]));
    await db.insert(mentorAwards).values({ id: newId('aw'), submissionId: id, title: 'เวทีออกแบบตัวอย่าง', year: '2567', evidence: '', result: 'winner', evidenceFileIds: [proof] });
    await db.insert(reviewEvents).values({ id: newId('rev'), target: 'mentor', targetId: id, decision: 'info', note: 'ขอเกียรติบัตรที่เห็นชื่อชัด ๆ', reviewedBy: reviewer.id });

    await signIn(page, owner, '/profile');
    await expect(page.getByText('ทีมงานขอ: ขอเกียรติบัตรที่เห็นชื่อชัด ๆ')).toBeVisible();
    await page.getByRole('link', { name: 'แก้ไขใบสมัคร' }).click();
    await expect(page).toHaveURL((url) => url.pathname === '/mentors/apply' && url.searchParams.get('edit') === id);
    await expect(page.getByRole('heading', { name: 'ทีมงานขอข้อมูลเพิ่ม' })).toBeVisible();
    await expect(page.locator('.application-request__note')).toHaveText('ขอเกียรติบัตรที่เห็นชื่อชัด ๆ');
    // ค่าจากใบเดิม รูปเดิมใช้ต่อได้โดยไม่ต้องเลือกใหม่
    await expect(page.locator('#apply-nickname')).toHaveValue('พี่ใบ');
    await expect(page.locator('.portrait-current img')).toBeVisible();
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(axe.violations).toEqual([]);
    await next(page);
    // ไฟล์เดิมอยู่ในการ์ด แนบเพิ่มได้
    const card = page.locator('#cw-apply .exp').first();
    await card.getByRole('button', { name: /^แก้ไข/ }).click();
    await expect(card.locator('.exp-file__list li')).toHaveCount(1);
    await card.locator('input[type=file]').setInputFiles(PROOF);
    await expect(card.locator('.exp-file__list li')).toHaveCount(2);
    await next(page);
    // ความถนัดอื่นๆ ที่พิมพ์ไว้กลับมาในช่องเดิม
    await expect(page.getByRole('checkbox', { name: 'ออกแบบสไลด์', exact: true })).toBeChecked();
    await expect(page.getByLabel('ความถนัดอื่นๆ ที่ช่วยได้')).toHaveValue('เขียนแผนธุรกิจ');
    await next(page);
    await acceptAll(page);
    const sent = page.waitForRequest((request) => request.url().endsWith(`/api/submissions/mentor/${id}`) && request.method() === 'PUT');
    await page.getByRole('button', { name: 'ส่งใบที่แก้แล้ว', exact: true }).click();
    const body = (await sent).postDataJSON();
    expect(body.photoFileId).toBe(photo);
    expect(body.awards[0].evidenceFileIds).toHaveLength(2);
    expect(body.awards[0].evidenceFileIds[0]).toBe(proof);
    await expect(page.getByRole('heading', { name: 'ส่งใบที่แก้แล้ว' })).toBeVisible();
    const [row] = await db.select().from(mentorSubmissions).where(eq(mentorSubmissions.id, id));
    expect(row.status).toBe('pending');
    await page.goto('/profile');
    await expect(page.getByRole('link', { name: 'แก้ไขใบสมัคร' })).toHaveCount(0);
  } finally {
    const ids = (await db.select({ id: mentorSubmissions.id }).from(mentorSubmissions).where(eq(mentorSubmissions.userId, owner.id))).map((row) => row.id);
    if (ids.length) {
      await db.delete(reviewEvents).where(inArray(reviewEvents.targetId, ids));
      await db.delete(files).where(inArray(files.ownerId, ids));
      await db.delete(mentorSubmissions).where(inArray(mentorSubmissions.id, ids));
    }
    await db.delete(files).where(eq(files.ownerId, owner.id));
    await removeAccount(owner);
    await removeAccount(reviewer);
  }
});
