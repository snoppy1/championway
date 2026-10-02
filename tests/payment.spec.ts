import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { and, eq } from 'drizzle-orm';
import { db } from '../server/db/client';
import { competitionRequests, consultations, hirePayments, mentorPayouts, mentorPayoutAccounts } from '../server/db/schema';
import { seal } from '../server/lib/secret-box';
import { addMessage, createAccount, createHire, createMentorFixture, removeAccount, signIn } from './helpers';
import type { MentorFixture, TestAccount } from './helpers';

/* จ่ายเงินงานจ้าง: หน้าจ่ายเงินจำลอง (ไม่มีเงินจริง) การจ่ายซ้อน การแจ้งปัญหา บัญชีรับเงินของเมนเทอร์
   และหน้าจัดการโอนเงินกับเรื่องแจ้งปัญหา (เฉพาะ admin)
   ทุกเทสสร้างเมนเทอร์และบัญชีของตัวเอง รันขนานกันได้ */

let fixture: MentorFixture;
const accounts: TestAccount[] = [];
async function account(role: 'member' | 'reviewer' | 'admin' = 'member', name?: string) {
  const created = await createAccount(role, { verified: true, name });
  accounts.push(created);
  return created;
}
test.beforeEach(async () => { fixture = await createMentorFixture(); });
test.afterEach(async ({ page }) => {
  await page.close();
  for (const item of accounts.splice(0)) await removeAccount(item);
  await fixture.cleanup();
});

const paymentOf = async (page: Page, hireId: string) => {
  const response = await page.request.post(`/api/consult/${hireId}/pay`, { data: {} });
  expect(response.status()).toBe(200);
  return (await response.json()) as { url: string; paymentId: string };
};

test('a late second payment from another tab is refunded and says so', async ({ page, context }) => {
  const learner = await account();
  const { id } = await createHire(fixture, learner, 'accepted', { hours: 1 });
  await signIn(page, learner, '/');
  const first = await paymentOf(page, id);
  const second = await paymentOf(page, id);

  // แท็บแรกจ่ายก่อน งานเป็น paid ห้องแชตเปิด
  await page.goto(first.url);
  await expect(page.getByText('ชำระเงินทดสอบ — ไม่มีการเก็บเงินจริง')).toBeVisible();
  await expect(page.locator('.cx-pay__amount')).toHaveText('500 บาท');
  await page.getByRole('button', { name: 'ชำระเงิน (ทดสอบ)' }).click();
  await expect(page).toHaveURL(/\/consulting#room-/);

  // อีกแท็บยังค้างหน้าจ่ายเงินรายการที่สอง กดจ่ายหลังงานถูกจ่ายไปแล้ว: คืนเงินและไม่เปิดแชตซ้ำ
  const other = await context.newPage();
  await other.goto(second.url);
  await other.getByRole('button', { name: 'ชำระเงิน (ทดสอบ)' }).click();
  await expect(other.getByText(/รายการนี้ถูกคืนเงิน/).first()).toBeVisible();
  await expect(other.getByRole('button', { name: 'ชำระเงิน (ทดสอบ)' })).toHaveCount(0);
  const rows = await db.select().from(hirePayments).where(eq(hirePayments.hireId, id));
  expect(rows.map((row) => row.status).sort()).toEqual(['paid', 'refunded']);
  const [hire] = await db.select().from(consultations).where(eq(consultations.id, id));
  expect(hire.status).toBe('paid');
  await other.close();
});

test('the return page waits for the provider, then opens the chat; a failed payment says nothing was charged', async ({ page }) => {
  const learner = await account();
  const { id } = await createHire(fixture, learner, 'accepted', { hours: 1 });
  await signIn(page, learner, '/');
  const { paymentId } = await paymentOf(page, id);

  await page.goto(`/pay/return?payment=${paymentId}`);
  await expect(page.getByRole('heading', { level: 1, name: 'กำลังตรวจสอบการชำระเงินของคุณ…' })).toBeVisible();
  // ผู้ให้บริการยืนยันทีหลัง (webhook / จำลอง) หน้านี้ถามซ้ำจนรู้ผลแล้วพาไปแชต
  expect((await page.request.post(`/api/consult/payments/${paymentId}/simulate`, { data: {} })).status()).toBe(200);
  await expect(page).toHaveURL(/\/consulting#room-/, { timeout: 15_000 });

  const second = await account();
  const other = await createHire(fixture, second, 'accepted', { hours: 1 });
  await page.context().clearCookies();
  await signIn(page, second, '/');
  const failed = await paymentOf(page, other.id);
  await db.update(hirePayments).set({ status: 'failed' }).where(eq(hirePayments.id, failed.paymentId));
  await page.goto(`/pay/return?payment=${failed.paymentId}`);
  await expect(page.getByRole('alert')).toContainText('การชำระเงินไม่สำเร็จ คุณไม่ถูกเรียกเก็บเงิน');
  await expect(page.getByRole('link', { name: 'กลับไปที่การปรึกษา' })).toBeVisible();
});

test('without a payment provider the Pay button is replaced by a note', async ({ page }) => {
  const learner = await account();
  const { id } = await createHire(fixture, learner, 'accepted', { hours: 2 });
  // บน Production ที่ยังไม่มีผู้ให้บริการ เซิร์ฟเวอร์ตอบ paymentsOpen: false (เปลี่ยน VERCEL_ENV ในเบราว์เซอร์เทสไม่ได้ จึงจำลองคำตอบ)
  await page.route('**/api/consult/mine', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), paymentsOpen: false } });
  });
  await signIn(page, learner, `/consulting#hire-${id}`);
  const detail = page.locator('.hw__detail');
  await expect(detail.getByText('ตอนนี้ยังไม่เปิดรับชำระเงิน')).toBeVisible();
  await expect(detail.getByRole('button', { name: /^ชำระ / })).toHaveCount(0);
  // ยกเลิกได้ตามเดิม
  await expect(detail.getByRole('button', { name: 'ยกเลิกงานนี้' })).toBeVisible();
});

test('a member reports a problem after paying, the money stays on hold and Mark as done is gone', async ({ page }) => {
  const learner = await account();
  const { id } = await createHire(fixture, learner, 'paid', { hours: 1 });
  await signIn(page, learner, `/consulting#hire-${id}`);
  const detail = page.locator('.hw__detail');
  await expect(detail.getByText('ชำระเงินแล้ว แชตเปิดแล้ว')).toBeVisible();
  await expect(detail.getByRole('button', { name: 'กดเสร็จงาน' })).toBeVisible();
  // หลังจ่ายแล้วยกเลิกไม่ได้ (เซิร์ฟเวอร์ปฏิเสธ) ทางเดียวคือแจ้งปัญหา
  await expect(detail.getByRole('button', { name: 'ยกเลิกงานนี้' })).toHaveCount(0);
  expect((await page.request.post(`/api/consult/${id}/cancel`, { data: {} })).status()).toBe(409);

  await detail.getByRole('button', { name: 'แจ้งปัญหา' }).click();
  await detail.getByRole('button', { name: 'ส่งเรื่อง' }).click();
  await expect(detail.getByRole('alert').filter({ hasText: 'เขียนสั้น ๆ ว่าเกิดปัญหาอะไร' })).toBeVisible();
  await detail.getByLabel('เกิดอะไรขึ้น').fill('เมนเทอร์ไม่ตอบแชตเลยหลังจ่ายเงินแล้ว');
  await detail.getByRole('button', { name: 'ส่งเรื่อง' }).click();
  await expect(detail.getByText('คุณแจ้งปัญหาไว้แล้ว ทีมงานจะตัดสิน')).toBeVisible();
  await expect(detail.getByText('แจ้งปัญหาแล้ว').first()).toBeVisible();
  await expect(detail.getByRole('button', { name: 'กดเสร็จงาน' })).toHaveCount(0);
  await expect(detail.getByRole('button', { name: 'แจ้งปัญหา' })).toHaveCount(0);
  const [row] = await db.select().from(consultations).where(eq(consultations.id, id));
  expect([row.status, Boolean(row.disputedAt)]).toEqual(['paid', true]);
  // แจ้งได้ครั้งเดียว และกดเสร็จงานเองไม่ได้ระหว่างรอตัดสิน
  expect((await page.request.post(`/api/consult/${id}/dispute`, { data: { reason: 'อีกครั้ง' } })).status()).toBe(409);
  expect((await page.request.post(`/api/consult/${id}/complete`, { data: {} })).status()).toBe(409);
});

test('the chat is read-only when the room has no paid hire left', async ({ page }) => {
  const learner = await account();
  const { id, roomId } = await createHire(fixture, learner, 'paid');
  await addMessage(roomId!, fixture.owner.id, 'เริ่มกันเลยครับ');
  await db.update(consultations).set({ status: 'cancelled' }).where(eq(consultations.id, id));
  await signIn(page, learner, `/consulting#room-${roomId}`);
  const chat = page.getByRole('region', { name: /^แชตกับ/ });
  await expect(chat.getByText('เริ่มกันเลยครับ')).toBeVisible();
  // อ่านย้อนหลังได้ แต่ช่องพิมพ์ปิดพร้อมบอกเหตุผล
  await expect(chat.getByText('แชตนี้อ่านได้อย่างเดียว')).toBeVisible();
  await expect(chat.getByRole('textbox', { name: 'ข้อความ' })).toBeDisabled();
  await expect(chat.getByRole('button', { name: 'ส่ง', exact: true })).toBeDisabled();
});

test('a mentor adds a payout account, sees only the last 4 digits, and is warned until then', async ({ page }) => {
  const learner = await account();
  await createHire(fixture, learner, 'requested');
  await signIn(page, fixture.owner, '/mentor-zone');
  // คำขอรออยู่และยังไม่มีบัญชีรับเงิน: เตือนบนแท็บคำขอ
  await expect(page.getByText('เพิ่มบัญชีรับเงินเพื่อให้เราจ่ายเงินให้คุณได้')).toBeVisible();
  await page.getByRole('button', { name: 'เพิ่มบัญชีรับเงิน' }).click();
  const panel = page.getByRole('region', { name: 'บัญชีรับเงิน' });
  await expect(panel).toBeVisible();

  await panel.getByRole('button', { name: 'บันทึกบัญชีรับเงิน' }).click();
  await expect(panel.getByRole('alert')).toContainText('กรอกชื่อบัญชี');
  await panel.getByLabel('ชื่อบัญชี').fill('ธนพล ศรีสุข');
  await panel.getByRole('button', { name: 'บันทึกบัญชีรับเงิน' }).click();
  await expect(panel.getByRole('alert')).toContainText('เลือกธนาคาร');
  await panel.getByLabel('ธนาคาร').selectOption('scb');
  await panel.getByLabel('เลขบัญชี').fill('12345');
  await panel.getByRole('button', { name: 'บันทึกบัญชีรับเงิน' }).click();
  await expect(panel.getByRole('alert')).toContainText('เลขบัญชีต้องเป็นตัวเลข 10 ถึง 15 หลัก');
  await panel.getByLabel('เลขบัญชี').fill('406-2-34567-1');
  await panel.getByRole('button', { name: 'บันทึกบัญชีรับเงิน' }).click();

  await expect(panel.getByText('ธนาคารไทยพาณิชย์ · ลงท้าย 4567'.replace('4567', '4567'))).toBeHidden().catch(() => undefined);
  await expect(panel.getByText(/ธนาคารไทยพาณิชย์ · ลงท้าย 5671/)).toBeVisible();
  await expect(panel.getByText('รอทีมงานตรวจ')).toBeVisible();
  // เลขเต็มไม่อยู่ในหน้า และไม่ถูกส่งกลับมาจาก API แม้แต่ให้เจ้าของ
  expect(await page.locator('body').innerText()).not.toContain('4062345671');
  const zone = await (await page.request.get('/api/consult/zone')).text();
  expect(zone).not.toContain('4062345671');
  expect(zone).not.toContain('406-2-34567-1');
  await expect(panel.getByRole('button', { name: 'เปลี่ยนบัญชี' })).toBeVisible();
  await expect(panel.getByLabel('เลขบัญชี')).toHaveCount(0);

  // เพิ่มแล้วคำเตือนหายไป
  await page.getByRole('tab', { name: 'คำขอจ้าง (1)' }).click();
  await expect(page.getByText('เพิ่มบัญชีรับเงินเพื่อให้เราจ่ายเงินให้คุณได้')).toHaveCount(0);
});

test('the Mentor zone shows where the money is for each hire', async ({ page }) => {
  const waiting = await account('member', 'Waiting Student');
  const held = await account('member', 'Held Student');
  const due = await account('member', 'Due Student');
  const sent = await account('member', 'Sent Student');
  const problem = await account('member', 'Problem Student');
  await createHire(fixture, waiting, 'accepted');
  await createHire(fixture, held, 'paid');
  await createHire(fixture, problem, 'paid', { disputed: 'ยังไม่ได้รับคำแนะนำ' });
  const dueHire = await createHire(fixture, due, 'completed');
  const sentHire = await createHire(fixture, sent, 'completed');
  await db.insert(mentorPayouts).values([
    { id: `pout-${dueHire.id}`, hireId: dueHire.id, mentorId: fixture.mentorId, amount: 1000, status: 'due' },
    { id: `pout-${sentHire.id}`, hireId: sentHire.id, mentorId: fixture.mentorId, amount: 1000, status: 'paid', paidAt: new Date(), note: 'REF-1' },
  ]);
  await signIn(page, fixture.owner, '/mentor-zone');
  await page.getByRole('tab', { name: /งานและแชต/ }).click();
  const panel = page.getByRole('tabpanel', { name: /งานและแชต/ });
  const expectLine = async (student: string, text: RegExp) => {
    const rows = panel.locator('.hw__row');
    if (await panel.locator('.hw__back').isVisible()) await panel.locator('.hw__back').click();
    await rows.filter({ hasText: student }).click();
    await expect(panel.locator('.cx-money')).toContainText(text);
  };
  await expectLine('Waiting', /รอนักเรียนชำระเงิน/);
  await expectLine('Held', /ชำระแล้ว 1,000\s*บาท ถูกถือไว้/);
  await expectLine('Problem', /นักเรียนแจ้งปัญหา เงินถูกพักไว้/);
  await expectLine('Due', /ถึงกำหนดจ่าย: เราจะโอน 1,000\s*บาท/);
  await expectLine('Sent', /โอนแล้ว: 1,000\s*บาท เมื่อ/);
});

/* ---------- หน้าจัดการ: เฉพาะ admin ---------- */

test('a reviewer does not see the payout pages and the server refuses them', async ({ page }) => {
  const reviewer = await account('reviewer');
  await signIn(page, reviewer, '/admin');
  const nav = page.getByRole('navigation', { name: 'เมนูหน้าจัดการ' });
  await expect(nav.getByRole('link', { name: 'รีวิว' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'โอนเงินเมนเทอร์' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'เรื่องแจ้งปัญหา' })).toHaveCount(0);
  await page.goto('/admin/payouts');
  await expect(page).toHaveURL(/\/admin$/);
  expect((await page.request.get('/api/admin/payouts')).status()).toBe(403);
  expect((await page.request.get('/api/admin/disputes')).status()).toBe(403);
});

test('an admin sees the full account number only while a payout is due, and marks it sent with a reference', async ({ page }, info) => {
  const admin = await account('admin');
  const learner = await account();
  const { id } = await createHire(fixture, learner, 'completed', { hours: 2 });
  await db.insert(mentorPayoutAccounts).values({
    mentorId: fixture.mentorId, accountName: 'ธนพล ศรีสุข', bankCode: 'kbank', accountNumberEncrypted: seal('1234567890'), accountLast4: '7890', status: 'verified',
  }).onConflictDoNothing();
  await db.insert(mentorPayouts).values({ id: `pout-${id}`, hireId: id, mentorId: fixture.mentorId, amount: 1000, status: 'due' });

  await signIn(page, admin, '/admin/payouts');
  await expect(page.getByRole('heading', { level: 1, name: 'โอนเงินเมนเทอร์' })).toBeVisible();
  const row = page.locator('.queue-row').filter({ hasText: fixture.name });
  await expect(row).toContainText('1,000 บาท');
  await expect(row).toContainText('ธนาคารกสิกรไทย');
  await expect(row.locator('.payout-number')).toHaveText('1234567890');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (info.project.name !== 'tablet') await page.screenshot({ path: `artifacts/admin-payouts-${info.project.name}.png`, fullPage: true });

  // ต้องมีเลขอ้างอิงการโอน ไม่ส่งอะไรไปเซิร์ฟเวอร์ถ้าว่าง
  await row.getByRole('button', { name: 'บันทึกว่าโอนแล้ว' }).click();
  await expect(row.getByRole('alert')).toContainText('บันทึกเลขอ้างอิงการโอนก่อน');
  await row.getByLabel('เลขอ้างอิงการโอน').fill('KBANK-20261002-001');
  await row.getByRole('button', { name: 'บันทึกว่าโอนแล้ว' }).click();
  await expect(page.locator('.queue-row').filter({ hasText: fixture.name })).toHaveCount(0);
  const [payout] = await db.select().from(mentorPayouts).where(eq(mentorPayouts.hireId, id));
  expect([payout.status, payout.note]).toEqual(['paid', 'KBANK-20261002-001']);

  // โอนแล้ว: ดูได้ในแท็บ "โอนแล้ว" แต่เลขบัญชีเหลือ 4 ตัวท้าย
  await page.getByRole('button', { name: 'โอนแล้ว', exact: true }).click();
  const paid = page.locator('.queue-row').filter({ hasText: fixture.name });
  await expect(paid).toContainText('ลงท้าย 7890');
  await expect(paid).not.toContainText('1234567890');
  await expect(paid).toContainText('อ้างอิง KBANK-20261002-001');
});

test('an admin releases hires that stayed silent past the deadline', async ({ page }) => {
  const admin = await account('admin');
  const learner = await account();
  const { id } = await createHire(fixture, learner, 'paid', { hours: 1 });
  // เงียบเกินกำหนด: จ่ายเมื่อ 10 วันก่อนและไม่มีใครกดอะไร (เกิน 3 วันหลังเวลานัด)
  await db.update(consultations).set({ paidAt: new Date(Date.now() - 10 * 86_400_000) }).where(eq(consultations.id, id));
  await db.insert(hirePayments).values({ id: `pay-${id}`, hireId: id, provider: 'simulated', amount: 500, status: 'paid' });
  await signIn(page, admin, '/admin/payouts');
  await page.getByRole('button', { name: 'ปล่อยเงินงานที่เกินกำหนด' }).click();
  await expect(page.getByRole('status').filter({ hasText: /ปล่อยเงินแล้ว \d+ งาน/ })).toBeVisible();
  const [hire] = await db.select().from(consultations).where(eq(consultations.id, id));
  expect(hire.status).toBe('completed');
  const [payout] = await db.select().from(mentorPayouts).where(and(eq(mentorPayouts.hireId, id), eq(mentorPayouts.status, 'due')));
  expect(payout.amount).toBe(500);
  void competitionRequests;
});

test('an admin decides a reported problem: refund or release, with a reason and a confirm step', async ({ page }) => {
  const admin = await account('admin');
  const refundStudent = await account('member', 'Refund Student');
  const releaseStudent = await account('member', 'Release Student');
  const refund = await createHire(fixture, refundStudent, 'paid', { disputed: 'เมนเทอร์ไม่มาตามนัดและไม่ตอบแชต' });
  const release = await createHire(fixture, releaseStudent, 'paid', { disputed: 'ไม่พอใจคำแนะนำ' });
  await signIn(page, admin, '/admin/disputes');
  await expect(page.getByRole('heading', { level: 1, name: 'เรื่องแจ้งปัญหา' })).toBeVisible();

  const refundRow = page.locator('.queue-row').filter({ hasText: 'เมนเทอร์ไม่มาตามนัดและไม่ตอบแชต' });
  await expect(refundRow).toContainText('Refund Student');
  await expect(refundRow).toContainText(fixture.name);
  // ต้องเขียนเหตุผลก่อน แล้วยืนยันอีกชั้น เลือก "ยังก่อน" ก็กลับมาได้
  await refundRow.getByRole('button', { name: 'คืนเงินนักเรียน' }).click();
  await expect(refundRow.getByRole('alert')).toContainText('เขียนเหตุผลของการตัดสินก่อน');
  await refundRow.getByLabel('เหตุผลของการตัดสิน').fill('ตรวจแชตแล้ว เมนเทอร์ไม่ตอบจริง');
  await refundRow.getByRole('button', { name: 'คืนเงินนักเรียน' }).click();
  await expect(refundRow.getByText(/คืนเงิน 1,000 บาท ให้ Refund/)).toBeVisible();
  await refundRow.getByRole('button', { name: 'ยังก่อน' }).click();
  await expect(refundRow.getByRole('button', { name: 'คืนเงินนักเรียน' })).toBeVisible();
  await refundRow.getByRole('button', { name: 'คืนเงินนักเรียน' }).click();
  await refundRow.getByRole('button', { name: 'ยืนยัน' }).click();
  await expect(page.locator('.queue-row').filter({ hasText: 'เมนเทอร์ไม่มาตามนัดและไม่ตอบแชต' })).toHaveCount(0);
  const [refunded] = await db.select().from(consultations).where(eq(consultations.id, refund.id));
  expect([refunded.status, refunded.reason]).toEqual(['cancelled', 'ตรวจแชตแล้ว เมนเทอร์ไม่ตอบจริง']);

  const releaseRow = page.locator('.queue-row').filter({ hasText: 'ไม่พอใจคำแนะนำ' });
  await releaseRow.getByLabel('เหตุผลของการตัดสิน').fill('คำแนะนำครบตามที่ตกลง');
  await releaseRow.getByRole('button', { name: 'ปล่อยเงินให้เมนเทอร์' }).click();
  await releaseRow.getByRole('button', { name: 'ยืนยัน' }).click();
  await expect(page.locator('.queue-row').filter({ hasText: 'ไม่พอใจคำแนะนำ' })).toHaveCount(0);
  const [released] = await db.select().from(consultations).where(eq(consultations.id, release.id));
  expect(released.status).toBe('completed');
});
