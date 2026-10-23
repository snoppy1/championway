import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../server/db/client';
import { consultations, learnerProfiles, mentorExperiences, mentorSkills, mentors, projects } from '../server/db/schema';
import { createSession } from '../server/lib/session';
import { createAccount, createMentorFixture, removeAccount, signIn } from './helpers';
import type { MentorFixture, TestAccount } from './helpers';

/* หา Mentor ให้ฉัน (Claude Design "Find My Mentor"): ครั้งแรก 9 หน้า → ผลจับคู่ → เริ่มปรึกษาแล้วเห็นช่องทางติดต่อ
   เมนเทอร์ของเทสกรอกโปรไฟล์ครบและเคยแข่งงานเดียวกับโปรเจกต์ จึงต้องติดอันดับ */

let mentor: MentorFixture;
const learners: TestAccount[] = [];

test.beforeAll(async () => {
  mentor = await createMentorFixture();
  await db.update(mentors).set({
    headline: 'Web Engineer | Hackathon Mentor', country: 'TH', languages: ['th'], background: 'Computer engineering',
    helpsWith: ['coding', 'mvp', 'pitch_deck'], learnerLevels: ['beginner'], teachingStyles: ['step_by_step'], formats: ['one_on_one'],
    availability: [{ day: 6, from: '09:00', to: '12:00' }], sessionsPerWeek: 20, sessionMinutes: [60], replyHours: 24, acceptsUrgent: true, mode: 'online',
  }).where(eq(mentors.id, mentor.mentorId));
  await db.insert(mentorSkills).values({ mentorId: mentor.mentorId, tag: 'react', level: 'expert' });
  await db.update(mentorExperiences).set({ kind: 'hackathon', role: 'developer' }).where(eq(mentorExperiences.mentorId, mentor.mentorId));
});
test.afterAll(async () => {
  const ids = learners.map((l) => l.id).concat('-');
  await db.delete(consultations).where(inArray(consultations.userId, ids));
  await db.delete(projects).where(inArray(projects.userId, ids));
  await db.delete(learnerProfiles).where(inArray(learnerProfiles.userId, ids));
  for (const learner of learners) await removeAccount(learner);
  await db.delete(mentorSkills).where(eq(mentorSkills.mentorId, mentor.mentorId));
  await db.delete(mentorExperiences).where(eq(mentorExperiences.mentorId, mentor.mentorId));
  await mentor.cleanup();
});

test('signed-out visitors are sent to sign in first', async ({ page }) => {
  await page.goto('/match');
  await expect(page).toHaveURL(/\/signin\?next=%2Fmatch$/);
});

test('a first-time learner answers nine screens, gets ranked mentors and starts a consultation', async ({ page }, info) => {
  const learner = await createAccount('member', { verified: true, name: 'Mew S.' });
  learners.push(learner);
  await signIn(page, learner, '/match');
  const next = page.getByRole('button', { name: 'ถัดไป' });
  const shot = (name: string) => page.screenshot({ path: `artifacts/match-${name}-${info.project.name}.png`, fullPage: true });

  // 1 เกี่ยวกับคุณ: ยังไม่เลือกแล้วกดถัดไป เห็นข้อความบอก
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('เล่าเกี่ยวกับ ตัวคุณ');
  await expect(page.getByText('1 / 9')).toBeVisible();
  await expect(page.getByText('Mew S.')).toBeVisible();
  await next.click();
  await expect(page.getByRole('alert').first()).toHaveText('เลือก 1 ข้อเพื่อไปต่อ');
  await page.getByRole('radio', { name: /มือใหม่/ }).click();
  await page.getByRole('button', { name: 'ภาษาไทย' }).click();
  await shot('1');
  await next.click();

  // 2 ความสนใจ
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('คุณสนใจ ด้านไหน?');
  await page.getByRole('checkbox', { name: 'Web / App' }).click();
  // จอแคบพับกลุ่มทักษะไว้ เปิดกลุ่มก่อนเลือก
  if ((page.viewportSize()?.width ?? 1440) <= 700) await page.getByRole('button', { name: 'Web / App', expanded: false }).click();
  await page.getByRole('button', { name: 'React' }).click();
  await next.click();

  // 3 จุดเริ่มต้น + ประเภทงานแข่ง
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ตอนนี้คุณ อยู่ตรงไหน?');
  await page.getByRole('radio', { name: /มีงานแข่งแล้ว/ }).click();
  await page.getByRole('radio', { name: 'Hackathon' }).click();
  await shot('3');
  await next.click();

  // 4 ชื่อโปรเจกต์ + งานแข่งจากรายการเติมคำ
  await page.getByRole('textbox', { name: 'ชื่อโปรเจกต์' }).fill('Smart farm sensor');
  await page.getByRole('combobox', { name: 'งานแข่งไหน?' }).fill(mentor.competition.name.slice(0, 20));
  await page.getByRole('option', { name: mentor.competition.name }).click();
  await expect(page.getByText(mentor.competition.name)).toBeVisible();
  await next.click();

  // 5 ขั้นของโปรเจกต์
  await page.getByRole('radio', { name: 'กำลังสร้างต้นแบบหรือวิเคราะห์' }).click();
  await next.click();

  // 6 เรื่องที่อยากให้ช่วย ระดับดึงจากโปรไฟล์
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('อยากให้ช่วย เรื่องไหน?');
  await expect(page.getByRole('radio', { name: 'มือใหม่' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Web / App' }).click();
  await shot('6');
  await next.click();

  // 7 สไตล์
  await page.getByRole('radio', { name: /สอนทีละขั้น/ }).click();
  await page.getByRole('radio', { name: 'เฉพาะฉัน (1-on-1)' }).click();
  await next.click();

  // 8 ช่วงเวลา ภาษา หมายเหตุ
  await page.getByRole('radio', { name: /ไม่รีบ/ }).click();
  await page.getByRole('radio', { name: 'ไทย', exact: true }).click();
  await page.getByRole('textbox', { name: /มีอะไรเพิ่มเติมไหม/ }).fill('ต้องทำ pitch deck ด้วย');
  await next.click();

  // 9 ตรวจคำตอบ: แท็กจากหมายเหตุลบได้
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('พร้อม หา Mentor แล้ว');
  await expect(page.getByText('Smart farm sensor')).toBeVisible();
  await expect(page.getByRole('button', { name: 'ลบ Pitch และการนำเสนอ' })).toBeVisible();
  await shot('9');
  await page.getByRole('button', { name: 'หา Mentor ให้ฉัน' }).click();

  // ผลจับคู่
  await expect(page).toHaveURL(/\/matches\/mrq/, { timeout: 15000 });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mentor ที่เหมาะกับคุณ');
  const card = page.locator('.mf-result', { hasText: mentor.name });
  await expect(card).toBeVisible();
  await expect(card).toContainText('เคยแข่งงานนี้');
  await expect(card).toContainText('React · Expert');
  await expect(card.getByRole('link', { name: `ดูโปรไฟล์ของ ${mentor.name}` })).toHaveAttribute('href', `/mentors/${mentor.mentorId}`);
  await shot('results');
  await card.getByRole('button', { name: `เริ่มปรึกษากับ ${mentor.name}` }).click();
  const dialog = page.getByRole('dialog', { name: `ติดต่อ ${mentor.name}` });
  await expect(dialog).toContainText('fixture.line');
  await dialog.getByRole('button', { name: 'ปิด' }).click();
  await expect(page.getByRole('status').filter({ hasText: `คุณกำลังปรึกษากับ ${mentor.name} อยู่` })).toBeVisible();

  // กลับมาอีกครั้ง: เลือกโปรเจกต์เดิมได้ ข้ามหน้าโปรไฟล์
  await page.goto('/match');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ขอคำแนะนำให้ โปรเจกต์ไหน?');
  await expect(page.getByRole('radio', { name: /Smart farm sensor/ })).toBeVisible();
  await page.getByRole('radio', { name: /Smart farm sensor/ }).click();
  await expect(page.getByText('1 / 5')).toBeVisible();
});

test('the flow has no automatic accessibility violations and no sideways scroll', async ({ page }) => {
  const learner = await createAccount('member', { verified: true });
  learners.push(learner);
  await signIn(page, learner, '/match');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test.describe('English', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test('reads in English and switches to Thai from the top bar', async ({ page }) => {
    const learner = await createAccount('member', { verified: true });
    learners.push(learner);
    // เข้าสู่ระบบด้วยคุกกี้ตรง ๆ หน้าเข้าสู่ระบบในเทสใช้คำไทย
    const session = await createSession(learner.id);
    await page.context().addCookies([{ name: 'cw_session', value: session.id, url: test.info().project.use.baseURL ?? 'http://127.0.0.1:5174' }]);
    await page.goto('/match');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tell us about you');
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
    await page.getByRole('button', { name: 'Switch to Thai' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('เล่าเกี่ยวกับ ตัวคุณ');
  });
});
