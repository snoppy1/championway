import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { eq } from 'drizzle-orm';
import { db } from '../server/db/client';
import { competitionImports, competitions } from '../server/db/schema';
import { newId } from '../server/lib/id';
import { createAccount, removeAccount, signIn } from './helpers';
import type { TestAccount } from './helpers';

/* หน้า "งานแข่งที่ดึงมา" (5 ต.ค. 2569): ทุกแหล่งปิดเป็นค่าเริ่มต้น แอดมินตรวจร่างที่ AI กรอก แล้วเพิ่มเป็นเวทีหรือปฏิเสธ
   เทสเบราว์เซอร์ไม่มีคีย์ AI จึงใส่ร่างลงฐานข้อมูลตรง ๆ แทนการให้ AI อ่าน */

const PREFIX = 'ร่างเทสดึงงาน';
let admin: TestAccount;
let draftId = '';

test.beforeAll(async () => {
  admin = await createAccount('admin');
});
/* ล้างเฉพาะของเทสนี้ ไม่ล้างตาม prefix ใน afterAll เพราะ worker ที่จบก่อนจะลบร่างที่ worker อื่นกำลังใช้อยู่ */
test.afterEach(async () => {
  const [row] = await db.select().from(competitionImports).where(eq(competitionImports.id, draftId));
  await db.delete(competitionImports).where(eq(competitionImports.id, draftId));
  if (row?.competitionId) await db.delete(competitions).where(eq(competitions.id, row.competitionId));
});
test.afterAll(async () => { await removeAccount(admin); });
test.beforeEach(async () => {
  draftId = newId('imp');
  await db.insert(competitionImports).values({
    id: draftId, origin: 'contest_thailand', url: `https://example.test/${draftId}`, title: `${PREFIX} ${draftId}`,
    status: 'pending', itemKind: 'call', uncertain: ['teamMax'], note: 'ประกาศไม่บอกขนาดทีม',
    draft: {
      name: `${PREFIX} ${draftId}`, org: 'หน่วยงานทดสอบ', description: 'สรุปสั้นที่ AI เขียน', type: 'contest', kind: 'hackathon',
      themes: ['innovation'], categories: ['technology'], levels: ['university'], rewards: [], teamMin: 2, teamMax: null,
      opensAt: null, closesAt: '2099-03-01', eventDate: null, region: 'online', venue: null, prizeValue: 20000, prizeNote: null,
      fee: null, registerUrl: null, keywords: [],
    },
  });
});

test('sources start off, a draft prefills the listing form, and adding it closes the draft', async ({ page }) => {
  await signIn(page, admin, '/admin/imports');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('งานแข่งที่ดึงมา');
  for (const name of ['YSC / สวทช.', 'Contest Thailand']) {
    await expect(page.getByRole('switch', { name: `ดึงอัตโนมัติจาก ${name}` })).not.toBeChecked();
  }
  await expect(page.getByText('ยังไม่ได้ตั้ง ANTHROPIC_API_KEY')).toBeVisible();

  const row = page.locator('.import-row', { hasText: `${PREFIX} ${draftId}` });
  await expect(row.getByText('ต้องเช็กเป็นพิเศษ: ขนาดทีมสูงสุด')).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations).toEqual([]);

  await row.getByRole('link', { name: 'ตรวจและเพิ่มเวที' }).click();
  // หน้าแรกที่เปิดอาจโหลดซ้ำหนึ่งครั้งตอน dev server เตรียม dependency รอแบนเนอร์นานขึ้นหน่อย
  await expect(page.getByText('ร่างนี้ AI กรอกจากประกาศ')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('ชื่อเวที *')).toHaveValue(`${PREFIX} ${draftId}`);
  await expect(page.getByLabel('ปิดรับ *')).toHaveValue('2099-03-01');
  await expect(page.getByLabel('ลิงก์ประกาศต้นทาง *')).toHaveValue(`https://example.test/${draftId}`);
  await expect(page.getByText('ร่างนี้ AI กรอกจากประกาศ')).toBeVisible();
  await page.getByRole('button', { name: 'เพิ่มเวที' }).click();
  await expect(page).toHaveURL(/\/admin\/imports$/);
  const [stored] = await db.select().from(competitionImports).where(eq(competitionImports.id, draftId));
  expect(stored.status).toBe('accepted');
  expect(stored.competitionId).toBeTruthy();
});

test('a draft can be rejected with a reason', async ({ page }) => {
  await signIn(page, admin, '/admin/imports');
  const row = page.locator('.import-row', { hasText: `${PREFIX} ${draftId}` });
  await row.getByRole('button', { name: 'ปฏิเสธ' }).click();
  await row.getByLabel('เหตุผลที่ปฏิเสธ').fill('ปิดรับแล้ว');
  await row.getByRole('button', { name: 'ยืนยันปฏิเสธ' }).click();
  await expect(row).toHaveCount(0);
  const [stored] = await db.select().from(competitionImports).where(eq(competitionImports.id, draftId));
  expect([stored.status, stored.rejectReason]).toEqual(['rejected', 'ปิดรับแล้ว']);
});
