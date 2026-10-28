import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createAccount, removeAccount, signIn } from './helpers';
import type { TestAccount } from './helpers';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../server/db/client';
import { files, mentorAwards, mentorSubmissions, reviewEvents } from '../server/db/schema';
import { newId } from '../server/lib/id';
import { applicationProfile, fakeUploads } from '../scripts/fake-files';

/* ใบสมัครเมนเทอร์ 6 ขั้น (spec 2026-10-13 ตัดสิน 21 ต.ค. 2569: ต่อเติมจากฟอร์มเดิม)
   ข้อมูลผู้สมัคร + โปรไฟล์ A → ทักษะ → ประสบการณ์แข่งขัน → วิธีที่ช่วย → เวลา ราคา ช่องทางติดต่อ → ตรวจและส่ง
   จ้างพักไว้ (เซิร์ฟเวอร์ของเทสไม่ตั้ง HIRING_ENABLED) ถ้อยคำของช่องยอมรับจึงเป็นของโหมดตัวกลาง */
const hiringOn = process.env.HIRING_ENABLED === 'true';

/* ใบสมัครถูกบันทึกลงฐานข้อมูลจริงแล้ว เทสจึงต้องมีบัญชีและเข้าสู่ระบบก่อน */
let applicant: TestAccount;
test.beforeAll(async () => { applicant = await createAccount('member'); });
test.afterAll(async () => { await removeAccount(applicant); });

const PHOTO = { name: 'me.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') };
const PROOF = { name: 'proof.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 proof') };
const chip = (page: Page, name: string) => page.getByRole('checkbox', { name, exact: true });

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
  // โปรไฟล์หมวด A
  await page.locator('#pv2-headline').fill('Strategy consultant | Case competition winner');
  await page.locator('#pv2-country').selectOption('TH');
  await page.locator('#pv2-background').fill('บริหารธุรกิจ');
  await chip(page, 'ภาษาไทย').check();
}
async function fillSkills(page: Page) {
  await page.locator('#pv2-skill-strategy').selectOption('expert');
  await page.locator('#pv2-skill-pitching').selectOption('advanced');
}

async function next(page: Page) { await page.getByRole('button', { name: 'ถัดไป', exact: true }).click(); }
/** เพิ่มประสบการณ์แข่งขันหนึ่งรายการ (บังคับอย่างน้อยหนึ่ง: เป็นเมนเทอร์ได้ต้องเคยแข่ง) */
async function addExperience(page: Page, name: string, options: { result?: string; link?: boolean } = {}) {
  await page.getByRole('button', { name: '+ เพิ่มเวทีที่เคยแข่ง', exact: true }).click();
  const card = page.locator('#cw-apply .exp').last();
  await card.getByLabel('ชื่อเวที *', { exact: true }).fill(name);
  await card.getByLabel('ประเภทการแข่งขัน *', { exact: true }).selectOption('case');
  await card.getByLabel('ปี พ.ศ. *', { exact: true }).fill('2567');
  await card.locator('.offer-mode__option').filter({ hasText: options.result ?? 'ผู้เข้าร่วมการแข่งขัน' }).click();
  await card.getByLabel('บทบาทในทีม *', { exact: true }).selectOption('business');
  await card.getByLabel('สิ่งที่รับผิดชอบในการแข่งขัน *', { exact: true }).fill('วิเคราะห์โจทย์และทำสไลด์');
  await card.getByLabel('ประสบการณ์ที่ส่งต่อให้ทีมรุ่นต่อไปได้ *', { exact: true }).fill('เริ่มจากตีโจทย์ให้แคบก่อนทำสไลด์');
  // หลักฐานเป็นไฟล์หรือลิงก์ https อย่างใดอย่างหนึ่งก็พอ
  if (options.link) await card.getByLabel('ลิงก์หลักฐาน', { exact: true }).fill('https://example.com/results');
  else await card.locator('input[type=file]').setInputFiles(PROOF);
  return card;
}
async function fillExperience(page: Page) {
  await page.locator('#apply-experience').fill('เคยวิเคราะห์โจทย์ธุรกิจและนำเสนอผลงานร่วมกับทีม');
  await addExperience(page, 'เวทีที่ยังไม่มีในระบบ');
}
async function fillHelp(page: Page) {
  await page.locator('#apply-best').fill('ช่วยฝึกนำเสนอไอเดีย');
  await page.locator('#apply-cannot').fill('ไม่รับทำงานส่งแทน');
  await chip(page, 'Case Analysis').check();
  await chip(page, 'Beginner').check();
  await chip(page, 'Review งาน').check();
  await chip(page, 'Team Mentoring').check();
}
async function fillTime(page: Page) {
  await page.getByRole('button', { name: 'เพิ่มช่วงเวลา' }).click();
  await page.locator('#pv2-per-week').fill('2');
  await chip(page, '60 นาที').check();
  await page.locator('#pv2-reply').selectOption('24');
  await page.locator('#pv2-mode').selectOption('online');
  await page.locator('#cw-apply .offer .offer-mode__option').filter({ hasText: 'ฟรี' }).click();
  // ช่องทางติดต่ออย่างน้อยหนึ่งช่องบังคับตั้งแต่สมัคร
  await page.locator('#apply-contactLine').fill('mentor.line');
}
/** กรอกขั้น 1–5 ให้ครบ ไปถึงหน้าตรวจและส่ง */
async function reachReview(page: Page) {
  await fillIdentity(page); await next(page);
  await fillSkills(page); await next(page);
  await fillExperience(page); await next(page);
  await fillHelp(page); await next(page);
  await fillTime(page); await next(page);
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

test('all six steps, private preview, uploads, back navigation and the payload', async ({ page }) => {
  await signIn(page, applicant, '/mentors/apply');
  const writes: string[] = [];
  page.on('request', (request) => { if (['POST', 'PUT', 'PATCH'].includes(request.method())) writes.push(request.url()); });
  await page.goto('/mentors/apply');
  await reachReview(page);
  const profile = page.locator('#cw-apply .profile');
  await expect(profile).toContainText('พี่มายด์ น.');
  await expect(profile).toContainText('Strategy consultant');
  await expect(profile).toContainText('Case Analysis');
  await expect(profile).not.toContainText('นามสกุลทดสอบ');
  await expect(profile).not.toContainText('mentor@example.com');
  await expect(profile).toContainText(/เก็บเงิน/);
  await expect(page.locator('#cw-apply .review-group').filter({ hasText: 'ทักษะ' })).toContainText('Strategy / Consulting (Expert)');
  await expect(page.locator('#cw-apply .review-group').filter({ hasText: 'ราคาของคุณ' })).toContainText('ฟรี');
  await page.getByRole('button', { name: 'ย้อนกลับ', exact: true }).click();
  await expect(page.locator('#pv2-per-week')).toHaveValue('2');
  await expect(chip(page, '60 นาที')).toBeChecked();
  await next(page);
  await acceptAll(page);
  const sent = page.waitForRequest((request) => request.url().endsWith('/api/submissions/mentor'));
  await page.getByRole('button', { name: 'ส่งใบสมัคร', exact: true }).click();
  const body = (await sent).postDataJSON();
  expect(body.profile).toMatchObject({ country: 'TH', languages: ['th'], helpsWith: ['case_analysis'], formats: ['team'], sessionMinutes: [60], replyHours: 24, mode: 'online' });
  expect(body.profile.skills).toEqual(expect.arrayContaining([{ tag: 'strategy', level: 'expert' }, { tag: 'pitching', level: 'advanced' }]));
  expect(body.price).toEqual({ amount: 0, unit: '' });
  expect(body.awards[0]).toMatchObject({ title: 'เวทีที่ยังไม่มีในระบบ', kind: 'case', result: 'participant', role: 'business', responsibility: 'วิเคราะห์โจทย์และทำสไลด์' });
  expect(body.offers).toBeUndefined();
  await expect(page.getByRole('heading', { name: 'ส่งใบสมัครแล้ว' })).toBeVisible();
  // อัปโหลดรูปโปรไฟล์และไฟล์หลักฐานก่อน แล้วส่งใบสมัครครั้งเดียว
  const apiWrites = writes.filter((url) => url.includes('/api/'));
  expect(apiWrites.map((url) => new URL(url).pathname), apiWrites.join(' | ')).toEqual(['/api/files', '/api/files', '/api/submissions/mentor']);
  await page.getByRole('button', { name: 'กลับไปตรวจใบสมัคร', exact: true }).click();
  await expect(profile).toContainText('พี่มายด์ น.');
});

test('each profile step blocks until its section is complete', async ({ page }) => {
  await page.goto('/mentors/apply');
  await next(page);
  await expect(page.locator('#apply-first')).toBeFocused();
  await fillIdentity(page);
  await page.locator('#pv2-headline').fill('');
  await next(page);
  await expect(page.getByRole('alert')).toHaveText('กรอก Headline ประเทศ การศึกษาหรือสายงาน และเลือกภาษาอย่างน้อย 1 ภาษา');
  await page.locator('#pv2-headline').fill('Mentor');
  await next(page);
  await expect(page.getByRole('heading', { name: 'คุณเชี่ยวชาญด้านไหน' })).toBeVisible();
  await next(page);
  await expect(page.getByRole('alert')).toHaveText('เลือกทักษะอย่างน้อย 1 อย่างพร้อมระดับ');
  await fillSkills(page); await next(page);
  await page.locator('#apply-experience').fill('ประสบการณ์ตัวอย่าง');
  await next(page);
  await expect(page.getByRole('alert')).toHaveText('เพิ่มเวทีที่เคยแข่งอย่างน้อยหนึ่งรายการ เป็นเมนเทอร์ได้เฉพาะเวทีที่เคยแข่งเอง');
  await addExperience(page, 'เวทีตัวอย่าง', { link: true }); await next(page);
  await page.locator('#apply-best').fill('ช่วยฝึกนำเสนอไอเดีย');
  await page.locator('#apply-cannot').fill('ไม่รับทำงานส่งแทน');
  await chip(page, 'Case Analysis').check();
  await next(page);
  await expect(page.getByRole('alert')).toContainText('เลือกอย่างน้อยกลุ่มละ 1 ข้อ');
  await fillHelp(page); await next(page);
  await next(page);
  await expect(page.getByRole('alert')).toContainText('เพิ่มเวลาว่างอย่างน้อย 1 ช่วง');
  await page.getByRole('button', { name: 'เพิ่มช่วงเวลา' }).click();
  await page.locator('#pv2-per-week').fill('2');
  await chip(page, '60 นาที').check();
  await page.locator('#pv2-reply').selectOption('24');
  await page.locator('#pv2-mode').selectOption('online');
  await next(page);
  // ราคา: ต้องเลือกฟรี หรือใส่ราคาพร้อมหน่วย
  await expect(page.getByRole('alert')).toHaveText('เลือก "ฟรี" หรือใส่ราคาและบอกว่าคิดต่ออะไร');
  const offer = page.locator('#cw-apply .offer');
  await offer.locator('.offer-mode__option').filter({ hasText: 'ตั้งราคา' }).click();
  await offer.getByLabel('ราคา (บาท)').fill('300');
  await next(page);
  await expect(offer).toContainText('บอกหน่วย เช่น ชั่วโมง');
  await offer.getByLabel('คิดต่ออะไร').fill('ชั่วโมง');
  await next(page);
  await expect(page.getByRole('alert')).toHaveText('ใส่ช่องทางที่นักเรียนติดต่อคุณได้อย่างน้อยหนึ่งช่อง');
  await page.locator('#apply-contactLine').fill('mentor.line');
  await next(page);
  await expect(page.getByRole('heading', { name: 'ตรวจทานก่อนส่งใบสมัคร' })).toBeVisible();
  await expect(page.locator('#cw-apply .review-group').filter({ hasText: 'ราคาของคุณ' })).toContainText('300 บาท / ชั่วโมง');
});

test('a competition on ChampionWays only says so, and a name that is not found can be added as a new competition', async ({ page }) => {
  const list = await (await page.request.get('/api/consult/open-competitions?all=1')).json() as { items: { name: string }[] };
  await page.goto('/mentors/apply'); await fillIdentity(page); await next(page); await fillSkills(page); await next(page);
  await page.getByRole('button', { name: '+ เพิ่มเวทีที่เคยแข่ง', exact: true }).click();
  const card = page.locator('#cw-apply .exp').first();
  const name = card.getByLabel('ชื่อเวที *', { exact: true });
  // งานที่มีในระบบ บอกแค่ "มีใน ChampionWays" ไม่มีรายละเอียดหรือลิงก์ไปหน้างาน
  await name.fill(list.items[0].name);
  await expect(card.locator('.exp-match')).toHaveText('มีใน ChampionWays');
  await expect(card.getByRole('link', { name: /ดูหน้าเวที/ })).toHaveCount(0);
  // ค้นไม่เจอ เลือก "เพิ่มงานแข่งใหม่" ได้
  const typed = `งานแข่งใหม่ทดสอบ ${Date.now()}`;
  await name.fill(typed);
  await page.getByRole('option', { name: `เพิ่มงานแข่งใหม่: “${typed}”` }).click();
  await expect(card.locator('.exp-match')).toHaveText('งานแข่งใหม่ · ระบบจะเพิ่มชื่อนี้เข้า ChampionWays');
});

test('experiences are unlimited, show what is missing under each field, fold when done, and can be undone', async ({ page }) => {
  await page.goto('/mentors/apply'); await fillIdentity(page); await next(page); await fillSkills(page); await next(page);
  await page.locator('#apply-experience').fill('ผลงานและหน้าที่ในทีมตัวอย่าง');
  await page.getByRole('button', { name: '+ เพิ่มเวทีที่เคยแข่ง', exact: true }).click();
  const card = page.locator('#cw-apply .exp').first();
  await card.getByLabel('ชื่อเวที *', { exact: true }).fill('Venture Ignite');
  await next(page);
  // ข้อความรวมบอกจำนวน และใต้ช่องบอกว่าขาดอะไร
  await expect(page.getByRole('alert').first()).toContainText('ยังกรอกไม่ครบ');
  for (const text of ['เลือกประเภทการแข่งขัน', 'เลือกผลที่ได้', 'ใส่ปี พ.ศ.', 'เลือกบทบาทในทีม', 'บอกสิ่งที่รับผิดชอบในการแข่งขัน', 'บอกประสบการณ์ที่ส่งต่อให้ทีมรุ่นต่อไปได้', 'แนบไฟล์หรือใส่ลิงก์']) {
    await expect(card).toContainText(text);
  }
  await card.getByLabel('ประเภทการแข่งขัน *', { exact: true }).selectOption('hackathon');
  await card.getByLabel('ปี พ.ศ. *', { exact: true }).fill('2568');
  // ได้รางวัลต้องบอกชื่อรางวัล
  await card.locator('.offer-mode__option').filter({ hasText: 'ได้รับรางวัล' }).click();
  await expect(card).toContainText('ระบุชื่อรางวัลที่ได้');
  await card.getByLabel('ชื่อรางวัล *', { exact: true }).fill('รองชนะเลิศอันดับ 1');
  // บทบาทอื่นต้องบอกว่าอะไร
  await card.getByLabel('บทบาทในทีม *', { exact: true }).selectOption('other');
  await expect(card).toContainText('ระบุบทบาทในทีม');
  await card.getByLabel('ระบุบทบาท *', { exact: true }).fill('Analyst');
  await card.getByLabel('สิ่งที่รับผิดชอบในการแข่งขัน *', { exact: true }).fill('ทำ financial model');
  // ลิงก์ต้องเป็น https
  await card.getByLabel('ลิงก์หลักฐาน', { exact: true }).fill('http://example.com/x');
  await expect(card).toContainText('ลิงก์ต้องขึ้นต้นด้วย https://');
  await card.getByLabel('ลิงก์หลักฐาน', { exact: true }).fill('');
  await card.locator('input[type=file]').setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('sample') });
  await expect(card).toContainText('ใช้ไฟล์ PDF, JPG หรือ PNG ไม่เกิน 4 MB');
  await card.getByRole('button', { name: 'ลบไฟล์ invalid.txt' }).click();
  // แนบได้หลายไฟล์ (7 ต.ค. 2569) สูงสุดห้าไฟล์
  await card.locator('input[type=file]').setInputFiles([
    { name: 'award.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 sample') },
    { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') },
  ]);
  await expect(card.locator('.exp-file__list li')).toHaveCount(2);
  await card.locator('input[type=file]').setInputFiles(['a', 'b', 'c', 'd'].map((name) => ({ name: `${name}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') })));
  await expect(card.locator('.exp-file__list li')).toHaveCount(5);
  await expect(card.getByText('แนบไฟล์เพิ่ม')).toHaveCount(0);
  await card.getByLabel('ประสบการณ์ที่ส่งต่อให้ทีมรุ่นต่อไปได้ *', { exact: true }).fill('แบ่งเวลาซ้อมพิตช์');
  // กดเสร็จแล้วพับเหลือบรรทัดเดียว
  await card.getByRole('button', { name: 'เสร็จ', exact: true }).click();
  await expect(card).toContainText('Venture Ignite');
  await expect(card).toContainText('Hackathon · 2568 · ได้รับรางวัล');
  await expect(card.getByLabel('ชื่อเวที *', { exact: true })).toHaveCount(0);
  // เพิ่มได้ไม่จำกัด หลักฐานเป็นลิงก์อย่างเดียวก็ได้
  for (let i = 0; i < 3; i++) await addExperience(page, `เวทีเพิ่ม ${i + 1}`, { link: true });
  await expect(page.locator('#cw-apply .exp')).toHaveCount(4);
  await page.getByRole('button', { name: 'ลบเวทีที่ 4' }).click();
  await expect(page.locator('#cw-apply .exp')).toHaveCount(3);
  await page.getByRole('button', { name: 'เลิกทำ', exact: true }).click();
  await expect(page.locator('#cw-apply .exp')).toHaveCount(4);
  await page.getByRole('button', { name: 'ลบเวทีที่ 4' }).click();
  await next(page); await fillHelp(page); await next(page); await fillTime(page); await next(page);
  const review = page.locator('#cw-apply .review').filter({ hasText: 'Venture Ignite' });
  await expect(review).toContainText('award.pdf');
  await expect(review).toContainText('รองชนะเลิศอันดับ 1');
  await expect(review).toContainText('Analyst');
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
  await expect(page.getByRole('alert')).toHaveText('เพิ่มรูปโปรไฟล์ นักเรียนจะเห็นรูปนี้ในโปรไฟล์ของคุณ');
  await page.locator('#apply-portrait').setInputFiles(PHOTO);
  await next(page);
  await expect(page.getByRole('heading', { name: 'คุณเชี่ยวชาญด้านไหน' })).toBeVisible();
});

test('every consent box is required, and the first missing one takes focus', async ({ page }) => {
  await signIn(page, applicant, '/mentors/apply');
  await reachReview(page);
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
  await reachReview(page);
  await acceptAll(page);

  await page.getByRole('button', { name: 'แก้ไขวิธีที่ช่วย' }).click();
  await expect(page.getByRole('heading', { name: 'บอกให้ชัดว่าช่วยอะไรได้' })).toBeVisible();
  await expect(chip(page, 'Case Analysis')).toBeChecked();
  await page.locator('#apply-best').fill('ช่วยวางโครงการนำเสนอ');
  await chip(page, 'Pitch Deck').check();
  await next(page); await next(page);

  // Changing the application invalidates only the "this data is mine" tick.
  await expect(page.locator('#cw-apply .profile')).toContainText('ช่วยวางโครงการนำเสนอ');
  await expect(page.locator('#cw-apply .profile')).toContainText('Pitch Deck');
  await expect(page.getByRole('checkbox', { name: consentNames[0] })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: consentNames[4] })).toBeChecked();

  await page.getByRole('button', { name: 'แก้ไขข้อมูลผู้สมัคร' }).click();
  await expect(page.locator('#apply-email')).toHaveValue('mentor@example.com');
  await expect(page.locator('#pv2-headline')).toHaveValue('Strategy consultant | Case competition winner');
});

test('application visual QA and accessibility for every step', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/mentors/apply');
  const fill = [fillIdentity, fillSkills, fillExperience, fillHelp, fillTime];
  for (let stage = 0; stage < 6; stage++) {
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const results = await new AxeBuilder({ page }).include('#cw-apply').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations).toEqual([]);
    await page.screenshot({ path: `artifacts/application-${testInfo.project.name}-step-${stage + 1}.png`, fullPage: true });
    if (stage < 5) { await fill[stage](page); await next(page); }
  }
  expect(errors).toEqual([]);
});

test('after the team asks for more information, the applicant edits the application from the profile and sends it back', async ({ page }) => {
  // เทสยาวหกขั้นพร้อมอัปโหลดและตรวจ axe รันพร้อมกันสามจอแล้วเกิน 30 วินาทีได้
  test.setTimeout(60000);
  // บัญชีแยก ใบของบัญชีหลักในเทสอื่นจะได้ไม่ปนกัน
  const owner = await createAccount('member');
  const reviewer = await createAccount('admin');
  try {
    const [photo, proof] = await fakeUploads(owner.id, 2);
    const id = newId('ms');
    await db.insert(mentorSubmissions).values({
      id, userId: owner.id, status: 'info', firstName: 'ใบ', lastName: 'ขอเพิ่ม', nickname: 'พี่ใบ', email: owner.email, phone: '',
      occupation: 'ทำงานแล้ว', organization: 'บริษัทตัวอย่าง', role: 'นักออกแบบ', experience: 'เคยแข่งออกแบบ', best: 'ช่วยวางเรื่องสไลด์',
      cannot: 'ไม่ทำสไลด์แทน', contactLine: 'bai.line', photoFileId: photo,
      profile: applicationProfile as never, price: 200, priceUnit: 'ครั้ง',
    });
    await db.update(files).set({ ownerType: 'mentor_submission', ownerId: id }).where(inArray(files.id, [photo, proof]));
    await db.insert(mentorAwards).values({
      id: newId('aw'), submissionId: id, title: 'เวทีออกแบบตัวอย่าง', year: '2567', evidence: '', result: 'winner', detail: 'ชนะเลิศ', evidenceFileIds: [proof],
      kind: 'other', role: 'designer', responsibility: 'ออกแบบหน้าจอ',
    });
    await db.insert(reviewEvents).values({ id: newId('rev'), target: 'mentor', targetId: id, decision: 'info', note: 'ขอเกียรติบัตรที่เห็นชื่อชัด ๆ', reviewedBy: reviewer.id });

    await signIn(page, owner, '/profile');
    await expect(page.getByText('ทีมงานขอ: ขอเกียรติบัตรที่เห็นชื่อชัด ๆ')).toBeVisible();
    await page.getByRole('link', { name: 'แก้ไขใบสมัคร' }).click();
    await expect(page).toHaveURL((url) => url.pathname === '/mentors/apply' && url.searchParams.get('edit') === id);
    await expect(page.getByRole('heading', { name: 'ทีมงานขอข้อมูลเพิ่ม' })).toBeVisible();
    await expect(page.locator('.application-request__note')).toHaveText('ขอเกียรติบัตรที่เห็นชื่อชัด ๆ');
    // ค่าจากใบเดิม รูปเดิมใช้ต่อได้โดยไม่ต้องเลือกใหม่ โปรไฟล์เดิมกลับมาครบ
    await expect(page.locator('#apply-nickname')).toHaveValue('พี่ใบ');
    await expect(page.locator('.portrait-current img')).toBeVisible();
    await expect(page.locator('#pv2-headline')).toHaveValue(applicationProfile.headline);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(axe.violations).toEqual([]);
    await next(page);
    await expect(page.locator('#pv2-skill-react')).toHaveValue('expert');
    await next(page);
    // ไฟล์เดิมอยู่ในการ์ด แนบเพิ่มได้
    const card = page.locator('#cw-apply .exp').first();
    await card.getByRole('button', { name: /^แก้ไข/ }).click();
    await expect(card.locator('.exp-file__list li')).toHaveCount(1);
    await expect(card.getByLabel('ชื่อรางวัล *', { exact: true })).toHaveValue('ชนะเลิศ');
    await card.locator('input[type=file]').setInputFiles(PROOF);
    await expect(card.locator('.exp-file__list li')).toHaveCount(2);
    // ใบเก่าไม่มีช่องนี้ ตอนนี้บังคับกรอก (28 ต.ค. 2569)
    await card.getByLabel('ประสบการณ์ที่ส่งต่อให้ทีมรุ่นต่อไปได้ *', { exact: true }).fill('ทำ moodboard ก่อนออกแบบจริง');
    await next(page);
    await expect(chip(page, 'Coding')).toBeChecked();
    await next(page);
    await expect(page.locator('#cw-apply .offer').getByLabel('ราคา (บาท)')).toHaveValue('200');
    await next(page);
    await acceptAll(page);
    const sent = page.waitForRequest((request) => request.url().endsWith(`/api/submissions/mentor/${id}`) && request.method() === 'PUT');
    await page.getByRole('button', { name: 'ส่งใบที่แก้แล้ว', exact: true }).click();
    const body = (await sent).postDataJSON();
    expect(body.photoFileId).toBe(photo);
    expect(body.price).toEqual({ amount: 200, unit: 'ครั้ง' });
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
