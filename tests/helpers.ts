import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Page } from '@playwright/test';
import { db, client } from '../server/db/client';
import { reviewEvents, sessions, users } from '../server/db/schema';
import { hashPassword } from '../server/lib/password';
import { newId } from '../server/lib/id';

export type TestAccount = { id: string; email: string; password: string };

/** บัญชีชั่วคราวต่อการทดสอบหนึ่งครั้ง รหัสผ่านสุ่มใหม่ทุกครั้ง ไม่มีรหัสตั้งต้นในโค้ด */
export async function createAccount(role: 'member' | 'reviewer'): Promise<TestAccount> {
  const id = newId('usr');
  const email = `test-${randomBytes(5).toString('hex')}@championways.test`;
  const password = randomBytes(24).toString('base64url');
  await db.insert(users).values({
    id, email, name: 'Test Account', role, passwordHash: await hashPassword(password),
  });
  return { id, email, password };
}

export async function removeAccount(account: TestAccount) {
  // ร่องรอยการตรวจอ้างถึงผู้ใช้ ต้องลบก่อนจึงจะลบบัญชีได้ ซึ่งเป็นพฤติกรรมที่ถูกแล้ว
  await db.delete(reviewEvents).where(eq(reviewEvents.reviewedBy, account.id));
  await db.delete(sessions).where(eq(sessions.userId, account.id));
  await db.delete(users).where(eq(users.id, account.id));
}

/** เข้าสู่ระบบผ่านหน้าเว็บจริง เพื่อให้เทสเดินเส้นทางเดียวกับผู้ใช้ */
export async function signIn(page: Page, account: TestAccount, next = '/') {
  await page.goto(`/signin?next=${encodeURIComponent(next)}`);
  await page.getByLabel('อีเมล').fill(account.email);
  await page.getByLabel('รหัสผ่าน').fill(account.password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/signin'));
}

export async function closeDb() {
  await client.end();
}
