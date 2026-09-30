import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Page } from '@playwright/test';
import { like } from 'drizzle-orm';
import { db, client } from '../server/db/client';
import {
  competitionCategories, competitionLevels, competitionRewards, competitionRequests, competitions,
  emailVerifications, mentorCompetitionChoices, mentorSubmissions, mentors, reviewEvents, sessions, users,
} from '../server/db/schema';
import { hashPassword } from '../server/lib/password';
import { newId } from '../server/lib/id';

export type TestAccount = { id: string; email: string; password: string };

/** บัญชีชั่วคราวต่อการทดสอบหนึ่งครั้ง รหัสผ่านสุ่มใหม่ทุกครั้ง ไม่มีรหัสตั้งต้นในโค้ด
    verified: true ตั้งว่ายืนยันอีเมลแล้ว (บัญชี Google เป็นแบบนี้) ค่าตั้งต้นคือยังไม่ยืนยัน เหมือนบัญชีรหัสผ่านที่เพิ่งสมัคร */
export async function createAccount(
  role: 'member' | 'reviewer' | 'admin',
  options: { verified?: boolean; name?: string } = {},
): Promise<TestAccount> {
  const id = newId('usr');
  const email = `test-${randomBytes(5).toString('hex')}@championways.test`;
  const password = randomBytes(24).toString('base64url');
  await db.insert(users).values({
    id, email, name: options.name ?? 'Test Account', role, passwordHash: await hashPassword(password),
    emailVerifiedAt: options.verified ? new Date() : null,
  });
  return { id, email, password };
}

/** ตั้งว่ายืนยันอีเมลแล้ว เหมือนกดลิงก์ในอีเมลในอีกแท็บ */
export async function verifyEmail(account: TestAccount) {
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, account.id));
}

/** ลิงก์ยืนยันอีเมลที่ใช้ได้จริง ใส่แถว token ตรงในฐานข้อมูลเพราะอีเมลในเทสไม่ได้ส่งออกไปไหน */
export async function createVerifyToken(account: TestAccount) {
  const token = randomBytes(24).toString('base64url');
  await db.insert(emailVerifications).values({
    tokenHash: createHash('sha256').update(token).digest('hex'), userId: account.id, email: account.email,
    expiresAt: new Date(Date.now() + 3600_000),
  });
  return token;
}

export type MentorFixture = {
  mentorId: string;
  owner: TestAccount;
  /** เวทีที่เมนเทอร์เลือกรับปรึกษาไว้แล้ว (ราคา 500 บาท / 60 นาที) */
  competition: { id: string; slug: string; name: string };
  /** เวทีที่เปิดรับสมัครอยู่ แต่เมนเทอร์ยังไม่ได้เลือก ใช้ทดสอบการเพิ่มเวทีใน Mentor zone */
  spare: { id: string; slug: string; name: string };
  name: string;
  cleanup: () => Promise<void>;
};

/** เมนเทอร์ที่ผ่านอนุมัติและผูกกับบัญชีจริง พร้อมเวทีสองเวที ข้อความเป็นอังกฤษทั้งหมด
    ทุก id ขึ้นต้นด้วย prefix สุ่ม ไม่ชนกับเทสอื่นที่รันขนาน และลบทิ้งหมดใน cleanup */
export async function createMentorFixture(): Promise<MentorFixture> {
  const prefix = `fx-${randomBytes(4).toString('hex')}`;
  const owner = await createAccount('member', { verified: true, name: 'Mentor Owner' });
  const mentorId = `${prefix}-mentor`;
  const name = `Mentor ${prefix}`;
  const makeCompetition = async (suffix: string) => {
    const slug = `${prefix}-${suffix}`;
    const row = { id: `${prefix}-c-${suffix}`, slug, name: `Test Competition ${prefix} ${suffix}` };
    /* ตั้งใจไม่ใส่ kind กับหมวด เวทีจึงไม่ขึ้นหน้าแรกและหน้ารายละเอียด เทสที่นับการ์ดในหน้าแรกจะไม่เห็นเวทีของเทสนี้
       (เทสรันขนานกัน) ส่วนหน้าเวทีและแท็บเมนเทอร์ทดสอบกับเวทีตัวอย่างของ seed แทน */
    await db.insert(competitions).values({
      ...row,
      description: 'A competition made for a test.', type: 'contest', org: 'Test Org', closesAt: '2099-01-01',
      region: 'online', prizeValue: 0, prizeNote: 'Certificate', teamMin: 1, teamMax: 3, keywords: [],
      sourceUrl: 'https://example.test', source: 'editorial', lastVerifiedAt: '2026-09-30',
    });
    return row;
  };
  const competition = await makeCompetition('main');
  const spare = await makeCompetition('spare');
  await db.insert(mentors).values({
    id: mentorId, name, avatar: 'T', bio: 'Helps teams plan.', replyTime: '1 day', topics: [],
    best: 'Scoping a project.', cannot: 'Writing code for you.', verified: true,
    contactLine: 'fixture.line', contactInstagram: 'fixture.ig', price: 500, minutes: 60,
  });
  await db.insert(mentorSubmissions).values({
    id: `${prefix}-ms`, status: 'published', userId: owner.id, publishedMentorId: mentorId,
    firstName: 'Mentor', lastName: 'Owner', nickname: 'Mentor', email: owner.email, phone: '', occupation: 'working',
    organization: 'Test Org', role: 'Tester', experience: 'Led three teams to the final round.', best: 'Scoping a project.',
    cannot: 'Writing code for you.', topics: [],
  });
  await db.insert(mentorCompetitionChoices).values({
    mentorId, competitionId: competition.id, choice: 'help', price: 500, minutes: 60,
  });

  return {
    mentorId, owner, competition, spare, name,
    cleanup: async () => {
      await db.delete(competitionRequests).where(eq(competitionRequests.mentorId, mentorId));
      await db.delete(mentorSubmissions).where(eq(mentorSubmissions.id, `${prefix}-ms`));
      await db.delete(mentors).where(eq(mentors.id, mentorId));
      await db.delete(competitions).where(like(competitions.id, `${prefix}-c-%`));
      await removeAccount(owner);
    },
  };
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

/** ลบเวทีที่เทสสร้างไว้ พร้อมแถวในตารางลูกซึ่ง foreign key ไม่ได้ลบให้เอง */
export async function removeListings(namePrefix: string) {
  const rows = await db.select({ id: competitions.id }).from(competitions)
    .where(like(competitions.name, `${namePrefix}%`));
  for (const row of rows) {
    await db.delete(competitionCategories).where(eq(competitionCategories.competitionId, row.id));
    await db.delete(competitionLevels).where(eq(competitionLevels.competitionId, row.id));
    await db.delete(competitionRewards).where(eq(competitionRewards.competitionId, row.id));
    await db.delete(competitions).where(eq(competitions.id, row.id));
  }
  return rows.length;
}

export async function closeDb() {
  await client.end();
}
