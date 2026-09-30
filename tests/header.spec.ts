import { test, expect } from '@playwright/test';
import { createAccount, removeAccount, signIn, type TestAccount } from './helpers';

/* แถบบนต้องอยู่บรรทัดเดียวทุกความกว้างที่ยังไม่ใช่เมนูมือถือ
   กรณีแน่นสุดคือ admin ที่เข้าสู่ระบบแล้ว มีปุ่มภาษา ปุ่มหน้าจัดการ ชื่อ และออกจากระบบ */

let admin: TestAccount;
test.beforeAll(async () => { admin = await createAccount('admin'); });
test.afterAll(async () => { await removeAccount(admin); });

test('the signed-in admin header stays on one line on wide screens', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'widths are set inside the test');
  await signIn(page, admin, '/');
  for (const width of [1440, 1280, 1200, 1101]) {
    await page.setViewportSize({ width, height: 800 });
    const header = page.locator('.header-inner');
    const brand = await page.locator('.site-header .brand-link').boundingBox();
    const signOut = await header.getByRole('button', { name: 'ออกจากระบบ' });
    const menuToggle = header.locator('.menu-toggle');
    if (await menuToggle.isVisible()) continue; // เมนูมือถือ ทุกอย่างอยู่ในเมนูพับ
    const out = await signOut.boundingBox();
    expect(Math.abs(out!.y - brand!.y), `width ${width}`).toBeLessThan(brand!.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `width ${width}`).toBe(true);
  }
});
