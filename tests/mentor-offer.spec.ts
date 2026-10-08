import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../server/db/client';
import { competitionSubmissions, competitions, mentorCompetitionChoices, mentorExperiences } from '../server/db/schema';
import { competitions as demoCompetitions } from '../src/data/competitions';
import { createAccount, createMentorFixture, removeAccount, signIn } from './helpers';
import type { MentorFixture } from './helpers';

/* ผู้ใช้ขอ 9 ต.ค. 2569
   1. เมนเทอร์กดรับปรึกษาเวทีได้จากหน้าเวทีเลย: เวทีที่ตรวจผลงานแล้วตั้งราคาแล้วขึ้นทันที เวทีอื่นส่งหลักฐานให้ทีมงานตรวจ
   2. เวทีที่ยังไม่มีในระบบ เมนเทอร์ส่งผ่านฟอร์มเต็มแบบเดียวกับผู้จัด เข้าคิวงานแข่งพร้อมป้าย Mentor request
      เผยแพร่แล้วเมนเทอร์รับปรึกษาเวทีนั้นทันที */

const PROOF = { name: 'proof.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 proof') };
// เวทีตัวอย่างของ seed ที่เทสอื่นไม่ได้นับรายชื่อเมนเทอร์ (เทสอื่นใช้ตัวแรกกับตัวสุดท้าย)
const checked = demoCompetitions[2];
const unchecked = demoCompetitions[3];
const next = (page: Page) => page.getByRole('button', { name: 'ถัดไป', exact: true }).click();

let fixture: MentorFixture;
test.beforeEach(async () => {
  fixture = await createMentorFixture();
  const [row] = await db.select({ id: competitions.id }).from(competitions).where(eq(competitions.slug, checked.slug));
  await db.insert(mentorExperiences).values({ id: `${fixture.mentorId}-exp-seed`, mentorId: fixture.mentorId, competitionId: row.id, name: checked.name, result: 'finalist', year: '2566' });
});
test.afterEach(async () => {
  await db.delete(mentorCompetitionChoices).where(eq(mentorCompetitionChoices.mentorId, fixture.mentorId));
  await db.delete(mentorExperiences).where(eq(mentorExperiences.mentorId, fixture.mentorId));
  await fixture.cleanup();
});

test('a mentor can start mentoring a checked competition, or send evidence for another one, from the competition page', async ({ page }) => {
  // คนที่ไม่ใช่เมนเทอร์ไม่เห็นกล่องนี้เลย
  const learner = await createAccount('member', { verified: true });
  await signIn(page, learner, `/competitions/${checked.slug}`);
  await expect(page.locator('#mentors .mentor-tile, #mentors .cx-state').first()).toBeVisible();
  await expect(page.locator('.mentor-offer')).toHaveCount(0);
  await removeAccount(learner);

  await signIn(page, fixture.owner, `/competitions/${checked.slug}`);
  const box = page.locator('.mentor-offer');
  await expect(box.getByRole('heading', { name: 'สำหรับ Mentor' })).toBeVisible();
  await expect(box).toContainText('ทีมงานตรวจผลงานของคุณในเวทีนี้แล้ว');
  await expect(page.locator('#mentors .mentor-tile', { hasText: fixture.name })).toHaveCount(0);
  await box.getByRole('button', { name: 'รับปรึกษาเวทีนี้' }).click();
  await box.getByRole('button', { name: 'เริ่มรับปรึกษา' }).click();
  await expect(box.getByRole('alert')).toContainText('เลือก "ฟรี" หรือ "ตั้งราคา"');
  await box.locator('.cx-price__option').filter({ hasText: 'ฟรี' }).click();
  await box.getByRole('button', { name: 'เริ่มรับปรึกษา' }).click();
  await expect(box.getByRole('heading', { name: 'คุณรับปรึกษาเวทีนี้อยู่' })).toBeVisible();
  await expect(box).toContainText('ราคาของคุณ: ฟรี');
  // รายชื่อเมนเทอร์ในหน้าเดียวกันอ่านใหม่ทันที
  await expect(page.locator('#mentors .mentor-tile', { hasText: fixture.name })).toBeVisible();
  await expect(box.getByRole('link', { name: 'จัดการใน Mentor zone' })).toHaveAttribute('href', '/mentor-zone#competitions');
  await page.locator('#mentors').screenshot({ path: `artifacts/mentor-offer-helping-${test.info().project.name}.png` });

  // เวทีที่ยังไม่มีผลงานที่ตรวจแล้ว: ส่งหลักฐาน
  await page.goto(`/competitions/${unchecked.slug}`);
  await expect(box).toContainText('เคยแข่งเวทีนี้? ส่งผลที่ได้และหลักฐาน');
  await box.getByRole('button', { name: 'รับปรึกษาเวทีนี้' }).click();
  const claim = box.getByRole('form', { name: `ผลงานของคุณใน ${unchecked.name}` });
  await claim.getByLabel('ผลที่ได้').selectOption('participant');
  await claim.getByLabel('ปี พ.ศ.').fill('2566');
  await claim.locator('input[type=file]').setInputFiles(PROOF);
  await claim.locator('.cx-price__option').filter({ hasText: 'ฟรี' }).click();
  await page.locator('#mentors').screenshot({ path: `artifacts/mentor-offer-claim-${test.info().project.name}.png` });
  await claim.getByRole('button', { name: 'ส่งให้ทีมงานตรวจ' }).click();
  await expect(box).toContainText('คุณส่งหลักฐานของเวทีนี้แล้ว');
  await expect(box.getByRole('button', { name: 'รับปรึกษาเวทีนี้' })).toHaveCount(0);
  // ยังไม่ขึ้นในรายชื่อจนกว่าทีมงานอนุมัติ
  await expect(page.locator('#mentors .mentor-tile', { hasText: fixture.name })).toHaveCount(0);

  // ทีมงานเห็นคำขอพร้อมไฟล์หลักฐาน อนุมัติได้โดยไม่ต้องเลือกเวที แล้วเมนเทอร์ขึ้นหน้าเวที
  const reviewer = await createAccount('reviewer');
  await signIn(page, reviewer, '/admin/requests');
  const row = page.locator('.request-row', { hasText: fixture.name }).filter({ hasText: unchecked.name });
  await expect(row.getByRole('link', { name: 'proof.pdf' })).toBeVisible();
  await row.getByRole('button', { name: 'หลักฐานถูกต้อง อนุมัติ' }).click();
  await expect(row).toHaveCount(0);
  await page.goto(`/competitions/${unchecked.slug}`);
  await expect(page.locator('#mentors .mentor-tile', { hasText: fixture.name })).toBeVisible();
  await removeAccount(reviewer);
});

test('a mentor sends a competition that is not listed through the full form, and publishing it lists them as its mentor', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'mutates the shared review queue');
  const marker = `เวทีจากเมนเทอร์ ${Date.now()}`;
  const closes = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
  await signIn(page, fixture.owner, '/mentor-zone/new-competition');
  await expect(page.getByRole('heading', { level: 1, name: 'เพิ่มเวทีที่คุณเคยแข่ง' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'กลับไป Mentor zone' })).toHaveAttribute('href', '/mentor-zone#competitions');

  // ขั้นแรกเป็นผลงานของเมนเทอร์ ไม่มีข้อมูลผู้ติดต่อของผู้จัด
  await expect(page.getByLabel('ชื่อผู้ติดต่อ *')).toHaveCount(0);
  await page.getByLabel('ผู้จัดงาน (ตามที่เขียนในประกาศ) *').fill('ชมรมทดสอบ');
  await next(page);
  await expect(page.getByRole('alert')).toHaveText('เลือกผลที่ได้จากเวทีนี้');
  await page.getByLabel('ผลที่ได้').selectOption('winner');
  await page.getByLabel('ปี พ.ศ.').fill('2567');
  await next(page);
  await expect(page.getByRole('alert')).toHaveText('แนบไฟล์หลักฐานอย่างน้อย 1 ไฟล์');
  await page.locator('.evidence-picker input[type=file]').setInputFiles(PROOF);
  await page.locator('.cx-price__option').filter({ hasText: 'ตั้งราคา' }).click();
  await page.getByLabel('ราคา (บาท)').fill('300');
  await page.getByLabel('คิดต่ออะไร').fill('ชั่วโมง');
  await page.locator('#cw-submit .sheet').screenshot({ path: `artifacts/mentor-new-competition-${testInfo.project.name}.png` });
  await next(page);

  // ขั้นที่เหลือเหมือนฟอร์มผู้จัด รวมถึงแนบโปสเตอร์ได้
  await page.getByLabel('ชื่องาน *').fill(marker);
  await page.getByRole('radio', { name: 'Hackathon' }).check();
  await page.getByRole('checkbox', { name: 'นวัตกรรม', exact: true }).check();
  await page.getByLabel('คำบรรยายสั้น *').fill('ใบนี้สร้างโดยชุดทดสอบ เมนเทอร์ขอเพิ่มเวทีที่เคยแข่ง');
  await page.getByRole('checkbox', { name: 'เทคโนโลยีและนวัตกรรม' }).check();
  await page.getByRole('checkbox', { name: 'อุดมศึกษา' }).check();
  await next(page);
  await page.getByLabel('วันปิดรับสมัคร *').fill(closes);
  await page.getByLabel('เงินรางวัลรวม (บาท)').fill('10000');
  await page.getByLabel('ลิงก์ประกาศต้นทาง *').fill('https://example.test/mentor-cup');
  await page.locator('#submit-poster').setInputFiles({ name: 'poster.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') });
  await next(page);

  await expect(page.locator('.review-group', { hasText: 'ผลงานของคุณ' })).toContainText('ได้รางวัล');
  await expect(page.locator('.review-group', { hasText: 'ผลงานของคุณ' })).toContainText('300 บาท / ชั่วโมง');
  await expect(page.locator('.consent-check')).toHaveCount(3);
  for (const box of await page.locator('.consent-check input').all()) await box.check();
  await page.getByRole('button', { name: 'ส่งใบลงงานแข่ง' }).click();
  await expect(page.getByRole('heading', { name: 'ส่งคำขอแล้ว' })).toBeVisible();

  // คิวงานแข่งของแอดมิน: ป้าย Mentor request ไฟล์หลักฐาน และข้อตรวจหลักฐานเพิ่มหนึ่งข้อ
  const reviewer = await createAccount('reviewer');
  await signIn(page, reviewer, '/admin/competitions');
  const row = page.locator('.queue-row', { hasText: marker });
  await expect(row.locator('.status-pill.is-mentor')).toHaveText('Mentor request');
  await row.getByRole('link', { name: marker }).click();
  const claim = page.locator('.admin-block', { hasText: 'เมนเทอร์ที่ขอเพิ่มเวทีนี้' });
  await expect(claim).toContainText(fixture.name);
  await expect(claim).toContainText('ชนะ/ได้รางวัล · ปี 2567');
  await expect(claim.getByRole('link', { name: 'proof.pdf' })).toBeVisible();
  await expect(page.locator('.admin-block', { hasText: 'ไฟล์ที่แนบมา' }).getByRole('link')).toHaveCount(1);
  await expect(page.locator('.review-check')).toHaveCount(7);
  for (const box of await page.locator('.review-check input').all()) await box.check();
  await page.getByRole('button', { name: 'เผยแพร่' }).click();
  await expect(page.locator('.status-pill').first()).toContainText('เผยแพร่แล้ว');

  // เวทีขึ้นเว็บ และเมนเทอร์คนนี้อยู่ในรายชื่อพร้อมราคาที่ขอ
  const [submission] = await db.select().from(competitionSubmissions).where(eq(competitionSubmissions.name, marker));
  const [event] = await db.select().from(competitions).where(eq(competitions.id, submission.publishedCompetitionId!));
  const listed = await (await page.request.get(`/api/consult/competitions/${event.slug}/mentors`)).json();
  expect([...listed.risingStar, ...listed.others].find((m: { id: string }) => m.id === fixture.mentorId)).toMatchObject({ price: 300, unit: 'ชั่วโมง' });

  await db.delete(mentorCompetitionChoices).where(and(eq(mentorCompetitionChoices.mentorId, fixture.mentorId), eq(mentorCompetitionChoices.competitionId, event.id)));
  await db.delete(competitionSubmissions).where(inArray(competitionSubmissions.id, [submission.id]));
  await db.delete(competitions).where(eq(competitions.id, event.id));
  await removeAccount(reviewer);
});
