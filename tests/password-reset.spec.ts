import { expect, test } from '@playwright/test';
import { desc, eq } from 'drizzle-orm';
import { db } from '../server/db/client';
import { emailLog } from '../server/db/schema';
import { createAccount, removeAccount } from './helpers';

/* ลืมรหัสผ่าน (10 ต.ค. 2569): จากหน้าเข้าสู่ระบบ → ขอลิงก์ → เปิดลิงก์จากอีเมล → ตั้งรหัสใหม่ → เข้าสู่ระบบด้วยรหัสใหม่ */

test('a member who forgot the password sets a new one from the emailed link', async ({ page }) => {
  const account = await createAccount('member');
  try {
    await page.goto('/signin');
    await page.getByLabel('อีเมล').fill(account.email);
    await page.getByRole('link', { name: 'ลืมรหัสผ่าน?' }).click();
    await expect(page).toHaveURL(/\/forgot-password/);
    // อีเมลที่พิมพ์ไว้ในหน้าเข้าสู่ระบบติดมาด้วย
    await expect(page.getByLabel('อีเมล')).toHaveValue(account.email);
    await page.getByRole('button', { name: 'ส่งลิงก์ตั้งรหัสใหม่' }).click();
    await expect(page.getByRole('status')).toContainText(account.email);

    const [mail] = await db.select({ body: emailLog.body }).from(emailLog)
      .where(eq(emailLog.to, account.email)).orderBy(desc(emailLog.sentAt)).limit(1);
    const link = mail.body.match(/\/reset-password\?token=[\w-]+/)![0];

    await page.goto(link);
    await page.getByLabel(/^รหัสผ่านใหม่/).fill('a brand new passphrase');
    await page.getByLabel('พิมพ์รหัสผ่านใหม่อีกครั้ง').fill('a different passphrase');
    await page.getByRole('button', { name: 'บันทึกรหัสผ่านใหม่' }).click();
    await expect(page.getByRole('alert')).toHaveText('รหัสผ่านสองช่องไม่ตรงกัน');

    await page.getByLabel('พิมพ์รหัสผ่านใหม่อีกครั้ง').fill('a brand new passphrase');
    await page.getByRole('button', { name: 'บันทึกรหัสผ่านใหม่' }).click();
    await expect(page.getByRole('heading', { name: 'ตั้งรหัสผ่านใหม่แล้ว' })).toBeVisible();

    await page.getByRole('link', { name: 'เข้าสู่ระบบ' }).last().click();
    await page.getByLabel('อีเมล').fill(account.email);
    await page.getByLabel('รหัสผ่าน').fill('a brand new passphrase');
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await expect(page).not.toHaveURL(/\/signin/);
  } finally {
    await db.delete(emailLog).where(eq(emailLog.to, account.email));
    await removeAccount(account);
  }
});

test('a reset page opened without a token offers a new link', async ({ page }) => {
  await page.goto('/reset-password');
  await expect(page.getByRole('link', { name: 'ขอลิงก์ใหม่' })).toHaveAttribute('href', '/forgot-password');
});
