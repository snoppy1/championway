import { expect, test } from '@playwright/test';
import { like } from 'drizzle-orm';
import { db } from '../server/db/client';
import { hackathonNames, mentorExperiences } from '../server/db/schema';
import { createAccount, createMentorFixture, removeAccount, signIn } from './helpers';

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

test('mentor adds a typed competition experience that waits for review', async ({ page }) => {
  const fixture = await createMentorFixture({ thai: true });
  const name = `Typed Hack ${fixture.mentorId}`;
  try {
    await signIn(page, fixture.owner, '/mentor-zone#experiences');
    const list = page.getByRole('region', { name: 'ประสบการณ์แข่งขัน' });
    // ประสบการณ์เดิมจาก fixture ตรวจแล้ว ลบเองไม่ได้
    await expect(list.getByText('ตรวจแล้ว').first()).toBeVisible();
    await expect(list.getByRole('button', { name: `ลบ ${fixture.competition.name}` })).toHaveCount(0);
    await list.getByRole('button', { name: 'เพิ่มงานแข่ง' }).click();
    const form = list.getByRole('form', { name: 'เพิ่มงานแข่ง' });
    await form.getByRole('combobox', { name: 'ชื่อสนามแข่งขัน *' }).fill(name);
    await form.getByLabel('ปีที่เข้าร่วม (พ.ศ.) *').fill('2567');
    await form.getByLabel('ประเภทการแข่งขัน *').selectOption('hackathon');
    await form.getByLabel('ผลการแข่งขัน *').selectOption('winner');
    await form.getByLabel('บทบาทในทีม *').selectOption('developer');
    await form.getByLabel('สิ่งที่รับผิดชอบในการแข่งขัน *').fill('เขียน backend');
    await form.getByLabel('ลิงก์หลักฐานการแข่งขัน *').fill('http://example.com/proof');
    await form.getByRole('button', { name: 'ส่งให้ทีมงานตรวจ' }).click();
    // ได้รางวัลต้องระบุรางวัล และลิงก์ต้องเป็น https
    await expect(form.getByRole('alert')).toContainText('ระบุรางวัลที่ได้');
    await form.getByLabel('รางวัลที่ได้ *').fill('รางวัลที่ 1');
    await form.getByRole('button', { name: 'ส่งให้ทีมงานตรวจ' }).click();
    await expect(form.getByRole('alert')).toContainText('https://');
    await form.getByLabel('ลิงก์หลักฐานการแข่งขัน *').fill('https://example.com/proof');
    await form.getByRole('button', { name: 'ส่งให้ทีมงานตรวจ' }).click();
    await expect(list.getByRole('status')).toContainText('ส่งแล้ว');
    const row = list.getByRole('listitem').filter({ hasText: name });
    await expect(row).toContainText('รอตรวจ');
    await expect(row).toContainText('ได้รับรางวัล (รางวัลที่ 1)');
    await page.screenshot({ path: `artifacts/mentor-zone-experiences-${test.info().project.name}.png`, fullPage: true });

    // ชื่อที่พิมพ์ไว้ขึ้นในการเติมคำครั้งถัดไป เลือกแล้วช่องได้ชื่อเต็ม
    await list.getByRole('button', { name: 'เพิ่มงานแข่ง' }).click();
    const box = list.getByRole('combobox', { name: 'ชื่อสนามแข่งขัน *' });
    await box.fill(name.slice(0, 14));
    await list.getByRole('option', { name }).click();
    await expect(box).toHaveValue(name);
    await list.getByRole('button', { name: 'ยกเลิก' }).click();

    // ลบรายการที่รอตรวจได้
    await row.getByRole('button', { name: `ลบ ${name}` }).click();
    await expect(list.getByRole('listitem').filter({ hasText: name })).toHaveCount(0);
  } finally {
    await fixture.cleanup();
    await db.delete(hackathonNames).where(like(hackathonNames.name, `Typed Hack ${fixture.mentorId}%`));
  }
});

test('a reviewer verifies one pending experience and rejects another with a reason', async ({ page }) => {
  const fixture = await createMentorFixture({ thai: true });
  const reviewer = await createAccount('reviewer');
  const good = `Admin Check ${fixture.mentorId}`;
  const bad = `Admin Reject ${fixture.mentorId}`;
  try {
    await db.insert(mentorExperiences).values([good, bad].map((name, index) => ({
      id: `${fixture.mentorId}-exp-x${index}`, mentorId: fixture.mentorId, name, year: '2566', result: 'finalist' as const, kind: 'hackathon' as const,
      role: 'developer' as const, responsibility: 'เขียน API', evidenceUrl: `https://example.com/e${index}`, status: 'pending' as const,
    })));
    await signIn(page, reviewer, '/admin/experiences');
    const row = page.getByRole('listitem').filter({ hasText: good });
    await expect(row.getByRole('link', { name: /example\.com\/e0/ })).toHaveAttribute('href', 'https://example.com/e0');
    await expect(row).toContainText('เขียน API');
    await row.getByRole('button', { name: 'หลักฐานถูกต้อง' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: good })).toHaveCount(0);

    const other = page.getByRole('listitem').filter({ hasText: bad });
    await other.getByRole('button', { name: 'ไม่ผ่าน' }).click();
    await expect(other.getByRole('alert')).toContainText('กรอกเหตุผล');
    await other.getByLabel('เหตุผลที่ไม่ผ่าน').fill('ลิงก์เปิดไม่ได้');
    await other.getByRole('button', { name: 'ไม่ผ่าน' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: bad })).toHaveCount(0);

    await page.getByRole('button', { name: 'ตรวจแล้ว' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: good })).toBeVisible();
    await page.getByRole('button', { name: 'ไม่ผ่าน', exact: true }).click();
    await expect(page.getByRole('listitem').filter({ hasText: bad })).toContainText('ลิงก์เปิดไม่ได้');
    await page.screenshot({ path: `artifacts/admin-experiences-${test.info().project.name}.png`, fullPage: true });
  } finally {
    await fixture.cleanup();
    await removeAccount(reviewer);
  }
});
