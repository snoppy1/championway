import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { scoreThemes } from '../src/data/focus';

test('matching uses evidence, caps keywords and respects disabled themes', () => {
  const input = { experience: 'BUSINESS business marketing business', best: 'business marketing', confirmed: ['business'], verified: ['business', 'business'], disabled: [] as string[] };
  const scores = scoreThemes(input);
  expect(scores.find(s => s.theme === 'business')).toMatchObject({ score: 13, active: true });
  expect(scoreThemes({ ...input, disabled: ['business'] }).find(s => s.theme === 'business')).toMatchObject({ score: 13, active: false });
  expect(scoreThemes({ ...input, experience: '', best: '', confirmed: [], verified: [] }).every(s => s.score === 0 && !s.active)).toBe(true);
  expect(scoreThemes(input)).toEqual(scores);
});

for (const timezoneId of ['UTC', 'Asia/Bangkok', 'America/New_York']) {
  test(`Thai slots, visible request context, unavailable match and appointment history (${timezoneId})`, async ({ browser, baseURL }, info) => {
    const context = await browser.newContext({ timezoneId, viewport: info.project.use.viewport });
    const page = await context.newPage();
    const user = { id: 'mentor-user', name: 'เมนเทอร์ทดสอบ', email: 'review@example.invalid', role: 'member', hasPassword: true, googleLinked: false };
    const slot = { id: 'slot-1', startsAt: '2027-10-01T03:00:00Z', endsAt: '2027-10-01T04:00:00Z' };
    const mentor = { id: 'review-mentor', name: user.name, avatar: 'ม', bio: 'ทดสอบ', experience: 'Business', best: 'Business', cannot: 'ไม่ทำแทน', topics: [], scores: [], awards: [], slots: [slot], confirmedThemes: [], disabledThemes: [] };
    const brief = 'ทีมต้องการคำปรึกษาด้านการแพทย์และการศึกษา\nช่วยทบทวนแนวคิดและการนำเสนอผลงานของทีม';
    let sent: { startsAt: string } | undefined;
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let payload: unknown = {};
      if (path === '/api/auth/me') payload = { user };
      else if (path === '/api/auth/providers') payload = { google: false };
      else if (path === '/api/journey/profile') payload = { user, applications: [], mentor, choices: [], slots: [], bookings: [{ title: 'ทีมทดสอบ', context: brief, status: 'pending', reason: '', ...slot, id: 'b1', eventName: 'เวทีทดสอบ', mentorName: user.name, ownerId: 'owner', mentorUserId: user.id, roomId: null }] };
      else if (path === '/api/competitions/options') payload = { items: [] };
      else if (path === '/api/journey/profile/slots') { sent = route.request().postDataJSON(); payload = { ok: true }; }
      else if (path === '/api/journey/mentors/review-mentor') payload = { mentor, match: null, competition: { slug: 'review-event', name: 'เวทีทดสอบ' } };
      else if (path === '/api/chats/room/messages') payload = { messages: [], hasMore: false };
      else if (path === '/api/chats/room') payload = { room: { id: 'room', title: 'ทีมทดสอบ', context: 'Old context', status: 'active', ownerId: 'owner', mentorUserId: user.id }, members: [{ id: user.id, name: user.name, readAt: null }], invites: [], appointments: [{ ...slot, id: 'b1', title: 'ทีมทดสอบ', context: brief, eventName: 'เวทีทดสอบ', status: 'confirmed' }, { ...slot, id: 'b0', title: 'นัดเดิม', context: 'Previous brief', eventName: 'เวทีทดสอบ', status: 'cancelled' }] };
      await route.fulfill({ json: payload });
    });
    try {
      await page.goto(`${baseURL}/profile`);
      await expect(page.locator('.booking-context')).toContainText('ทีมต้องการคำปรึกษา');
      await page.locator('#slot-start').fill('2027-10-01T10:00');
      await page.locator('.slot-form button').click();
      await expect.poll(() => sent?.startsAt).toBe('2027-10-01T03:00:00.000Z');
      await page.goto(`${baseURL}/mentors/review-mentor?competition=review-event`);
      await expect(page.getByText('เมนเทอร์ไม่พร้อมช่วยงานนี้ในขณะนี้', { exact: false })).toBeVisible();
      await expect(page.locator('.booking-form')).toHaveCount(0);
      await page.goto(`${baseURL}/chats/room`);
      await expect(page.locator('.chat-pinned')).toContainText('10:00');
      await expect(page.locator('.appointment-context').first()).toContainText('ทีมต้องการคำปรึกษา');
      await page.locator('.chat-pinned summary').focus();
      await page.keyboard.press('Enter');
      await expect(page.getByText('Previous brief')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
      if (timezoneId === 'UTC') await page.screenshot({ path: `artifacts/journey-fixed-${info.project.name}.png`, fullPage: true });
    } finally { await context.close(); }
  });
}
