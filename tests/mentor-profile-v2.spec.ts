import { expect, test } from '@playwright/test';
import { createMentorFixture, signIn } from './helpers';

/* โปรไฟล์เมนเทอร์แบบใหม่ หมวด A–F (spec docs/superpowers/specs/2026-10-13-mentor-matching-design.md) */

test('mentor completes profile sections A, B, D, E from Mentor zone', async ({ page }) => {
  const fixture = await createMentorFixture({ thai: true });
  try {
    await signIn(page, fixture.owner, '/mentor-zone#profile');
    await expect(page.getByRole('form', { name: 'โปรไฟล์' })).toBeVisible();
    await page.screenshot({ path: `artifacts/mentor-zone-profile-empty-${test.info().project.name}.png` });
    // แถบเตือนบอกหมวดที่ยังขาด (fixture มีประสบการณ์ที่ตรวจแล้ว หมวด C จึงครบ)
    const banner = page.getByRole('status').filter({ hasText: 'กรอกโปรไฟล์ให้ครบเพื่อเริ่มถูกจับคู่' });
    await expect(banner).toContainText('ข้อมูลพื้นฐาน');
    await expect(banner).not.toContainText('ประสบการณ์แข่งขัน');
    const form = page.getByRole('form', { name: 'โปรไฟล์' });
    await form.getByLabel('Headline').fill('AI Engineer | 3× Hackathon Mentor');
    await form.getByLabel('ประเทศ').selectOption('TH');
    await form.getByLabel('ระดับการศึกษา หรือสายงานปัจจุบัน').fill('วิศวกรรมคอมพิวเตอร์');
    await form.getByRole('checkbox', { name: 'ภาษาไทย' }).check();
    await form.getByLabel('ระดับ Python').selectOption('expert');
    await form.getByRole('checkbox', { name: 'Coding' }).check();
    await form.getByRole('group', { name: 'กลุ่มผู้เรียนที่ถนัด' }).getByRole('checkbox', { name: 'Beginner' }).check();
    await form.getByRole('checkbox', { name: 'สอนทีละขั้น' }).check();
    await form.getByRole('checkbox', { name: '1-on-1' }).check();
    await form.getByRole('button', { name: 'เพิ่มช่วงเวลา' }).click();
    await form.getByLabel('จำนวน Session ต่อสัปดาห์').fill('3');
    await form.getByRole('checkbox', { name: '60 นาที' }).check();
    await form.getByLabel('เวลาตอบกลับโดยประมาณ').selectOption('24');
    await form.getByLabel('รูปแบบ', { exact: true }).selectOption('online');
    await form.getByRole('button', { name: 'บันทึกโปรไฟล์' }).click();
    await expect(form.getByRole('status')).toContainText('บันทึกโปรไฟล์แล้ว');
    await expect(banner).toHaveCount(0);
    await page.screenshot({ path: `artifacts/mentor-zone-profile-${test.info().project.name}.png`, fullPage: true });
    await page.reload();
    await expect(page.getByRole('form', { name: 'โปรไฟล์' }).getByLabel('Headline')).toHaveValue('AI Engineer | 3× Hackathon Mentor');
  } finally {
    await fixture.cleanup();
  }
});

test('the profile form shows the server error when a required choice is missing', async ({ page }) => {
  const fixture = await createMentorFixture({ thai: true });
  try {
    await signIn(page, fixture.owner, '/mentor-zone#profile');
    const form = page.getByRole('form', { name: 'โปรไฟล์' });
    await form.getByRole('button', { name: 'บันทึกโปรไฟล์' }).click();
    await expect(form.getByRole('alert')).toContainText('เลือกภาษาที่ให้คำปรึกษาอย่างน้อยหนึ่งภาษา');
  } finally {
    await fixture.cleanup();
  }
});
