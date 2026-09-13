import { expect, test as base } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createAccount, removeAccount, signIn } from './helpers';
import type { TestAccount } from './helpers';

/* หน้าโปรไฟล์และหน้าแก้ไขของสมาชิกทั่วไป
   สิ่งที่ต้องถูกคือ ข้อมูลที่บันทึกกลับมาแสดงจริง และหัวเว็บเปลี่ยนตามโดยไม่ต้องรีโหลด

   เทสรันขนานกันและบางเทสเปลี่ยนชื่อหรือรหัสผ่าน จึงให้แต่ละเทสมีบัญชีของตัวเอง
   ถ้าใช้บัญชีร่วมกัน เทสที่ตรวจชื่อเดิมจะพังเมื่อบังเอิญรันหลังเทสที่เปลี่ยนชื่อ */
const test = base.extend<{ member: TestAccount }>({
  member: async ({ page }, use) => {
    const account = await createAccount('member');
    await use(account);
    /* ปิดหน้าเว็บก่อนลบบัญชี ไม่อย่างนั้นคำขอที่ยังค้างอยู่ในหน้าจะวิ่งไปหาผู้ใช้ที่ถูกลบไปแล้ว
       แล้วเซิร์ฟเวอร์จะตอบ 500 ทิ้งไว้ในล็อก ทั้งที่เทสผ่าน */
    await page.close();
    await removeAccount(account);
  },
});

test('the header name opens the profile, and the profile links to the edit page', async ({ page, member }) => {
  await signIn(page, member, '/');
  const headerName = page.locator('.site-header').getByRole('link', { name: 'Test Account' });
  await expect(headerName).toBeVisible();
  await headerName.click();

  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Test Account' })).toBeVisible();
  // ช่องที่ยังไม่ได้กรอกต้องบอกตรง ๆ ไม่ใช่ปล่อยว่าง
  await expect(page.getByText('ยังไม่ได้กรอก').first()).toBeVisible();

  await page.getByRole('link', { name: 'แก้ไขโปรไฟล์' }).click();
  await expect(page).toHaveURL(/\/profile\/edit$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ข้อมูลของฉัน');
});

test('saving the profile updates the page and the header without a reload', async ({ page, member }) => {
  await signIn(page, member, '/profile/edit');

  await page.getByLabel('ชื่อที่แสดง *').fill('น้องแชมป์');
  await page.getByLabel('แนะนำตัวสั้น ๆ').fill('กำลังหาทีมทำ Hackathon สายการแพทย์');
  await page.getByLabel('สถานะ', { exact: true }).selectOption('นักเรียน');
  await page.getByLabel('ระดับการศึกษา').selectOption('secondary');
  await page.getByLabel('โรงเรียน มหาวิทยาลัย หรือที่ทำงาน').fill('โรงเรียนสาธิตทดสอบ');
  await page.getByLabel('ชั้นปีหรือตำแหน่ง').fill('มัธยมศึกษาปีที่ 5');
  await page.getByRole('button', { name: 'บันทึกข้อมูล' }).click();

  await expect(page.getByText('บันทึกแล้ว')).toBeVisible();
  // ชื่อบนหัวเว็บมาจาก context เดียวกัน ต้องเปลี่ยนทันทีโดยไม่ต้องโหลดหน้าใหม่
  await expect(page.locator('.site-header').getByRole('link', { name: 'น้องแชมป์' })).toBeVisible();

  await page.goto('/profile');
  await expect(page.getByRole('heading', { level: 1, name: 'น้องแชมป์' })).toBeVisible();
  await expect(page.getByText('กำลังหาทีมทำ Hackathon สายการแพทย์')).toBeVisible();
  await expect(page.getByText('นักเรียน · โรงเรียนสาธิตทดสอบ · มัธยมศึกษาปีที่ 5')).toBeVisible();
  await expect(page.getByText('มัธยมศึกษา', { exact: true })).toBeVisible();

  // ค่าที่บันทึกไว้ต้องกลับมาอยู่ในฟอร์มตอนเปิดแก้ไขอีกครั้ง
  await page.goto('/profile/edit');
  await expect(page.getByLabel('ชื่อที่แสดง *')).toHaveValue('น้องแชมป์');
  await expect(page.getByLabel('ระดับการศึกษา')).toHaveValue('secondary');
});

test('a wrong current password is refused and a new one signs in', async ({ page, member }) => {
  await signIn(page, member, '/profile/edit');

  await page.getByLabel('รหัสผ่านปัจจุบัน *').last().fill('ไม่ใช่รหัสผ่านจริง');
  await page.getByLabel('รหัสผ่านใหม่ *').fill('replacement-password-1');
  await page.getByRole('button', { name: 'เปลี่ยนรหัสผ่าน' }).click();
  await expect(page.getByRole('alert')).toContainText('รหัสผ่านเดิมไม่ถูกต้อง');

  await page.getByLabel('รหัสผ่านปัจจุบัน *').last().fill(member.password);
  await page.getByRole('button', { name: 'เปลี่ยนรหัสผ่าน' }).click();
  await expect(page.getByText('อุปกรณ์อื่นถูกออกจากระบบ')).toBeVisible();

  // เครื่องนี้ต้องยังอยู่ในระบบ แม้ session อื่นถูกเตะออกไปแล้ว
  await page.goto('/profile');
  await expect(page.getByRole('heading', { level: 1, name: 'Test Account' })).toBeVisible();

  /* ล้างคุกกี้ก่อนเพื่อเข้าระบบใหม่จริง ๆ ถ้ายังล็อกอินค้างอยู่ หน้าเข้าสู่ระบบจะเด้งออกทันที
     แล้วเทสจะเดินต่อไปโดยที่คำขอล็อกอินยังไม่เสร็จ ซึ่งไม่ได้พิสูจน์ว่ารหัสใหม่ใช้ได้ */
  await page.context().clearCookies();
  await signIn(page, { ...member, password: 'replacement-password-1' }, '/profile');
  await expect(page.getByRole('heading', { level: 1, name: 'Test Account' })).toBeVisible();
});

test('both pages pass axe and fit the viewport', async ({ page, member }) => {
  await signIn(page, member, '/profile');
  for (const path of ['/profile', '/profile/edit']) {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), path).toBe(true);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations, path).toEqual([]);
  }
});
