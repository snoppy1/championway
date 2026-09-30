import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { and, eq } from 'drizzle-orm';
import { db } from '../server/db/client';
import { competitionRequests, consultations, mentorCompetitionChoices, mentorReviews } from '../server/db/schema';
import { newId } from '../server/lib/id';
import { createAccount, createMentorFixture, removeAccount, signIn } from './helpers';
import type { MentorFixture, TestAccount } from './helpers';

/* หน้าจัดการ (ภาษาไทยอย่างเดียว): คิวคำขอเพิ่มเวทีจากเมนเทอร์ และรายการรีวิวที่ซ่อนได้
   ทุกเทสสร้างเมนเทอร์และแถวของตัวเอง (id สุ่ม) จึงรันขนานกันได้ */

let reviewer: TestAccount;
let fixture: MentorFixture;
test.beforeAll(async () => { reviewer = await createAccount('reviewer'); });
test.afterAll(async () => { await removeAccount(reviewer); });
test.beforeEach(async () => { fixture = await createMentorFixture(); });
test.afterEach(async ({ page }) => {
  await page.close();
  await fixture.cleanup();
});

async function addRequest(name: string) {
  const id = newId('creq');
  await db.insert(competitionRequests).values({
    id, mentorId: fixture.mentorId, userId: fixture.owner.id, name, url: 'https://example.test/cup',
    details: 'Open to every student.', price: 300, minutes: 30,
  });
  return id;
}

test('the admin nav links to the request queue and the review list', async ({ page }) => {
  await signIn(page, reviewer, '/admin');
  const nav = page.getByRole('navigation', { name: 'เมนูหน้าจัดการ' });
  await expect(nav.getByRole('link', { name: /^คำขอเพิ่มเวที/ })).toHaveAttribute('href', '/admin/requests');
  await expect(nav.getByRole('link', { name: 'รีวิว' })).toHaveAttribute('href', '/admin/reviews');
});

test('a competition request needs a slug to approve and a reason to reject', async ({ page }) => {
  const approveName = `Approve Cup ${fixture.mentorId}`;
  const rejectName = `Reject Cup ${fixture.mentorId}`;
  const approveId = await addRequest(approveName);
  const rejectId = await addRequest(rejectName);
  await signIn(page, reviewer, '/admin/requests');
  await expect(page.getByRole('heading', { level: 1, name: 'คำขอเพิ่มเวทีจากเมนเทอร์' })).toBeVisible();

  const approveRow = page.locator('.queue-row').filter({ hasText: approveName });
  await expect(approveRow).toContainText(`ขอโดย Mentor ${fixture.mentorId.replace('-mentor', '')}`);
  await expect(approveRow).toContainText('300 บาท / 30 นาที');
  await expect(approveRow).toContainText('Open to every student.');

  // ไม่ใส่ slug หรือเหตุผล: ไม่ส่งอะไรไปเซิร์ฟเวอร์ และบอกว่าต้องกรอกอะไร
  await approveRow.getByRole('button', { name: 'ผูกกับเวทีและอนุมัติ' }).click();
  await expect(approveRow.getByRole('alert')).toContainText('ใส่ slug ของเวที');
  await approveRow.getByRole('button', { name: 'ไม่อนุมัติ' }).click();
  await expect(approveRow.getByRole('alert')).toContainText('กรอกเหตุผลที่ไม่อนุมัติ');
  // slug ที่ไม่มีในระบบ: เซิร์ฟเวอร์ปฏิเสธและบอกให้สร้างเวทีก่อน
  await approveRow.getByLabel('slug ของเวทีในระบบ').fill('no-such-competition');
  await approveRow.getByRole('button', { name: 'ผูกกับเวทีและอนุมัติ' }).click();
  await expect(approveRow.getByRole('alert')).toContainText('ไม่พบเวทีนี้');

  await approveRow.getByLabel('slug ของเวทีในระบบ').fill(fixture.spare.slug);
  await approveRow.getByRole('button', { name: 'ผูกกับเวทีและอนุมัติ' }).click();
  await expect(page.locator('.queue-row').filter({ hasText: approveName })).toHaveCount(0);
  const [choice] = await db.select().from(mentorCompetitionChoices).where(and(
    eq(mentorCompetitionChoices.mentorId, fixture.mentorId), eq(mentorCompetitionChoices.competitionId, fixture.spare.id)));
  expect([choice.price, choice.minutes]).toEqual([300, 30]);

  const rejectRow = page.locator('.queue-row').filter({ hasText: rejectName });
  await rejectRow.getByLabel('เหตุผลที่ไม่อนุมัติ').fill('The announcement link is broken.');
  await rejectRow.getByRole('button', { name: 'ไม่อนุมัติ' }).click();
  await expect(page.locator('.queue-row').filter({ hasText: rejectName })).toHaveCount(0);

  // ดูตามสถานะได้ และเห็นเหตุผลกับเวทีที่ผูก
  await page.getByRole('button', { name: 'ไม่ผ่าน', exact: true }).click();
  await expect(page.locator('.queue-row').filter({ hasText: rejectName })).toContainText('เหตุผล: The announcement link is broken.');
  await page.getByRole('button', { name: 'อนุมัติแล้ว', exact: true }).click();
  await expect(page.locator('.queue-row').filter({ hasText: approveName }).getByRole('link', { name: fixture.spare.slug })).toBeVisible();
  const [decided] = await db.select().from(competitionRequests).where(eq(competitionRequests.id, rejectId));
  expect(decided.status).toBe('rejected');
  expect((await db.select().from(competitionRequests).where(eq(competitionRequests.id, approveId)))[0].status).toBe('approved');
});

test('a reviewer hides a suspicious review, it stops counting, and it can be shown again', async ({ page }) => {
  const consultationId = newId('cns');
  await db.insert(consultations).values({
    id: consultationId, userId: reviewer.id, mentorId: fixture.mentorId, status: 'confirmed', confirmedAt: new Date(),
  });
  const comment = `Suspicious review ${fixture.mentorId}`;
  await db.insert(mentorReviews).values({ id: newId('rvw'), consultationId, userId: reviewer.id, mentorId: fixture.mentorId, stars: 5, comment });
  const rating = async () => (await (await page.request.get(`/api/consult/mentors/${fixture.mentorId}`)).json()).mentor.rating;

  await signIn(page, reviewer, '/admin/reviews');
  await expect(page.getByRole('heading', { level: 1, name: 'รีวิวเมนเทอร์' })).toBeVisible();
  const row = page.locator('.queue-row').filter({ hasText: comment });
  await expect(row).toContainText('แสดงอยู่');
  expect(await rating()).toEqual({ average: 5, reviews: 1 });

  await row.getByRole('button', { name: /^ซ่อนรีวิว/ }).click();
  await expect(row).toContainText('ซ่อนอยู่');
  expect(await rating()).toEqual({ average: null, reviews: 0 });

  await page.getByRole('button', { name: 'แสดงอยู่', exact: true }).click();
  await expect(page.locator('.queue-row').filter({ hasText: comment })).toHaveCount(0);
  await page.getByRole('button', { name: 'ซ่อนอยู่', exact: true }).click();
  await page.locator('.queue-row').filter({ hasText: comment }).getByRole('button', { name: /^แสดงรีวิวอีกครั้ง/ }).click();
  await page.getByRole('button', { name: 'ทั้งหมด', exact: true }).click();
  await expect(page.locator('.queue-row').filter({ hasText: comment })).toContainText('แสดงอยู่');
  expect(await rating()).toEqual({ average: 5, reviews: 1 });
});

test('the request and review pages pass axe and fit the viewport', async ({ page }, info) => {
  await addRequest(`Axe Cup ${fixture.mentorId}`);
  await signIn(page, reviewer, '/admin/requests');
  for (const path of ['/admin/requests', '/admin/reviews']) {
    await page.goto(path);
    await expect(page.locator('.queue-count')).not.toHaveText('กำลังโหลด…');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path).toBe(true);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations, path).toEqual([]);
    if (info.project.name !== 'tablet') await page.screenshot({ path: `artifacts/admin-${path.split('/').pop()}-${info.project.name}.png`, fullPage: true });
  }
});
