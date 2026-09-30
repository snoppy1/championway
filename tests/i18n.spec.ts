import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createAccount, removeAccount } from './helpers';
import type { TestAccount } from './helpers';

/* ภาษาตั้งต้นคืออังกฤษ ผู้ใช้สลับเป็นไทยได้ และเว็บจำตัวเลือกไว้
   เทสชุดอื่นตั้งภาษาไทยไว้ทั้งหมดใน playwright.config.ts ไฟล์นี้จึงล้างค่านั้นออกก่อน */
test.use({ storageState: { cookies: [], origins: [] } });

/* จอแคบซ่อนปุ่มภาษาไว้ในเมนูสามขีด เปิดเมนูก่อนถ้ามีปุ่มนี้ จอกว้างข้ามไปเอง */
async function openMenu(page: Page, label: string) {
  const toggle = page.getByRole('button', { name: label });
  if (await toggle.isVisible()) await toggle.click();
}

test('a first visit is in English, and the choice of Thai is remembered', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeAttached();

  await openMenu(page, 'Open menu');
  const language = page.getByRole('group', { name: 'Language' });
  await expect(language.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('link', { name: 'Explore competitions' }).first()).toBeVisible();

  await language.getByRole('button', { name: 'TH' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'th');
  await expect(page.getByRole('link', { name: 'สำรวจการแข่งขัน' }).first()).toBeVisible();

  // เปิดหน้าใหม่แล้วต้องยังเป็นภาษาไทย ไม่เด้งกลับเป็นอังกฤษ
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'th');
  await openMenu(page, 'เปิดเมนู');
  await expect(page.getByRole('group', { name: 'ภาษา' }).getByRole('button', { name: 'TH' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('group', { name: 'ภาษา' }).getByRole('button', { name: 'EN' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('the chosen language travels with API requests', async ({ page }) => {
  const sent: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/')) sent.push(request.headers()['x-lang'] ?? '');
  });
  await page.goto('/');
  await expect.poll(() => sent.length).toBeGreaterThan(0);
  expect(new Set(sent)).toEqual(new Set(['en']));
});

/* ---------- หน้าที่ย้ายมาใช้พจนานุกรมแล้ว: เปิดเป็นภาษาอังกฤษต้องไม่เหลือภาษาไทยในเนื้อหาหลัก ---------- */

/** เก็บข้อความทุกตัวใน JSON ที่ API ตอบ */
function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const item of value) strings(item, out);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) strings(item, out);
  return out;
}

/* เนื้อหาที่ทีมงานหรือผู้ใช้เขียนเอง (ชื่อและรายละเอียดเวที ประวัติเมนเทอร์) ไม่แปล แสดงตามที่เขียนมา
   และข้อความ error ที่เซิร์ฟเวอร์ตอบก็ยังเป็นภาษาไทยจนกว่าฝั่งเซิร์ฟเวอร์จะแปลตาม x-lang
   จึงดึงข้อความเหล่านั้นจาก API ตัวเดียวกับที่หน้าเว็บใช้ แล้วตัดออกก่อนตรวจว่าเหลือภาษาไทยของหน้าเว็บหรือไม่ */
async function contentFrom(page: Page, ...paths: string[]) {
  const found: string[] = [];
  for (const path of paths) {
    const response = await page.request.get(path);
    strings(await response.json().catch(() => null), found);
  }
  return found.filter((text) => text.length > 1);
}

async function expectNoThai(page: Page, content: string[] = []) {
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('main')).toBeVisible();
  const collected = await page.evaluate(() => {
    const main = document.querySelector('main')!;
    const attributes = [...main.querySelectorAll('[aria-label],[placeholder],[alt],[title]')]
      .flatMap((element) => ['aria-label', 'placeholder', 'alt', 'title'].map((name) => element.getAttribute(name) ?? ''));
    return [main.textContent ?? '', ...attributes, document.title].join('\n');
  });
  let text = collected;
  for (const known of [...content].sort((a, b) => b.length - a.length)) text = text.split(known).join(' ');
  const left = text.match(/.{0,40}[฀-๿]+.{0,40}/)?.[0] ?? null;
  expect(left, 'Thai text left on an English page').toBeNull();
}

async function signInEnglish(page: Page, account: TestAccount, next: string) {
  await page.goto(`/signin?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/signin'));
}

test('the home page and its filters have no Thai in English', async ({ page }) => {
  const content = await contentFrom(page, '/api/competitions?perPage=100', '/api/competitions?sort=new&perPage=6');
  await page.goto('/');
  await expect(page.locator('.competition-card').first()).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Latest competitions' })).toBeVisible();
  await expectNoThai(page, content);

  // แผงตัวกรองอยู่ในหน้าเสมอ (ปิดอยู่) เปิดแล้วต้องเห็นเป็นอังกฤษเช่นกัน
  await page.getByRole('button', { name: 'Filters' }).click();
  await expect(page.getByRole('heading', { name: 'Filters' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Type of opportunity' })).toBeVisible();
  await expectNoThai(page, content);
});

test('a competition page has no Thai in English', async ({ page }) => {
  const { items } = await (await page.request.get('/api/competitions?perPage=1')).json() as { items: { slug: string }[] };
  const slug = items[0].slug;
  const content = await contentFrom(page, `/api/competitions/${slug}`, `/api/journey/competitions/${slug}/mentors`);
  await page.goto(`/competitions/${slug}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Get to know this competition in a minute' })).toBeVisible();
  await expectNoThai(page, content);
});

test('the not-found competition page has no Thai in English', async ({ page }) => {
  await page.goto('/competitions/no-such-competition');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const content = await contentFrom(page, '/api/competitions/no-such-competition');
  await expectNoThai(page, content);
});

test('the sign-in and sign-up pages have no Thai in English', async ({ page }) => {
  await page.goto('/signin');
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  await expectNoThai(page);
  await page.goto('/signup');
  await expect(page.getByRole('heading', { level: 1, name: 'Sign up' })).toBeVisible();
  await expectNoThai(page);
});

test('the organizer pages have no Thai in English, including validation messages', async ({ page }) => {
  await page.goto('/organizers');
  await expect(page.getByRole('heading', { level: 1, name: 'List your competition for free' })).toBeVisible();
  await expectNoThai(page);

  await page.goto('/organizers/submit');
  await expect(page.getByRole('heading', { level: 1, name: 'List your competition' })).toBeVisible();
  await expectNoThai(page);
  // ทุกขั้นอยู่ใน DOM พร้อมกัน จึงตรวจครบแล้ว ที่เหลือคือข้อความเตือนที่โผล่ตอนกรอกไม่ครบ
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Enter the organization name' })).toBeVisible();
  await expectNoThai(page);
});

test('the mentor application has no Thai in English, including validation messages', async ({ page }) => {
  await page.goto('/mentors/apply');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your experience');
  await expectNoThai(page);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expectNoThai(page);
});

test('the mentor application follows the language toggle both ways and keeps what was typed', async ({ page }) => {
  await page.goto('/mentors/apply');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your experience');
  await page.getByLabel('First name *', { exact: true }).fill('Mali');

  await openMenu(page, 'Open menu');
  await page.getByRole('group', { name: 'Language' }).getByRole('button', { name: 'TH' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('ประสบการณ์ของคุณ');
  await expect(page.getByLabel('ชื่อจริง *', { exact: true })).toHaveValue('Mali');
  await expect(page.locator('html')).toHaveAttribute('lang', 'th');

  await openMenu(page, 'เปิดเมนู');
  await page.getByRole('group', { name: 'ภาษา' }).getByRole('button', { name: 'EN' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your experience');
  await expect(page.getByLabel('First name *', { exact: true })).toHaveValue('Mali');
  await expectNoThai(page);
});

test('the signed-in pages have no Thai in English', async ({ page }) => {
  const member = await createAccount('member');
  try {
    await signInEnglish(page, member, '/profile');
    await expect(page.getByRole('link', { name: 'Edit profile' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Apply to be a mentor' })).toBeVisible();
    await expectNoThai(page);

    await page.goto('/profile/edit');
    await expect(page.getByRole('heading', { level: 1, name: 'My details' })).toBeVisible();
    await expectNoThai(page);

    await page.goto('/chats');
    await expect(page.getByRole('heading', { level: 1, name: 'My chats' })).toBeVisible();
    await expect(page.getByText('No conversations yet')).toBeVisible();
    await expectNoThai(page);
  } finally {
    await page.close();
    await removeAccount(member);
  }
});

test('a mentor profile that cannot be found has no Thai in English', async ({ page }) => {
  const content = await contentFrom(page, '/api/journey/mentors/no-such-mentor');
  await page.goto('/mentors/no-such-mentor');
  await expect(page.getByRole('heading', { level: 1, name: 'We could not find this mentor' })).toBeVisible();
  await expectNoThai(page, content);
});

/* หน้าของเมนเทอร์ (เครื่องมือในโปรไฟล์ โปรไฟล์สาธารณะที่มีแบบจอง ห้องแชตที่มีนัด และเมนเทอร์ที่แนะนำในหน้าเวที)
   เข้าถึงจากบัญชีทดสอบธรรมดาไม่ได้ จึงใช้ข้อมูลจำลองที่เป็นภาษาอังกฤษทั้งหมด
   ภาษาไทยที่เหลือบนหน้าจึงมาจากข้อความของหน้าเว็บเท่านั้น */
test('the mentor tools, booking form, chat room and matches have no Thai in English', async ({ page }) => {
  const user = {
    id: 'user-1', name: 'Alex Mentor', email: 'alex@example.invalid', role: 'member',
    avatarUrl: 'https://example.invalid/alex.png', bio: 'I like hackathons.', occupation: 'นักศึกษา',
    organization: 'Example University', position: 'Year 3', educationLevel: 'university',
    hasPassword: false, googleLinked: true,
  };
  const slot = { id: 'slot-1', startsAt: '2027-10-01T03:00:00Z', endsAt: '2027-10-01T04:00:00Z' };
  const mentor = {
    id: 'mentor-1', name: 'Alex Mentor', avatar: 'A', bio: 'Helps teams plan.', experience: 'Led three teams.',
    best: 'Scoping projects.', cannot: 'Writing code for you.', topics: [],
    scores: [
      { theme: 'business', score: 9, active: true, disabled: false, reasons: [{ code: 'verified', points: 6 }, { code: 'confirmed', points: 3 }] },
      { theme: 'innovation', score: 3, active: false, disabled: true, reasons: [{ code: 'experience', points: 1 }, { code: 'scope', points: 2 }] },
      { theme: 'medical', score: 0, active: false, disabled: false, reasons: [] },
    ],
    awards: [{ title: 'Example Cup', year: 2568, themes: ['business'] }],
    confirmedThemes: ['business'], disabledThemes: ['innovation'], slots: [slot],
  };
  const booking = {
    ...slot, id: 'booking-1', title: 'Team One', context: 'We need help with our pitch.', status: 'pending', reason: '',
    expiresAt: '2027-09-30T03:00:00Z', eventName: 'Event One', mentorName: 'Alex Mentor',
    ownerId: 'owner-1', mentorUserId: user.id, roomId: 'room-1',
  };
  const matchReasons = [{ code: 'chose' }, { code: 'verified', theme: 'business' }, { code: 'aptitude', theme: 'medical' }];
  const room = { id: 'room-1', title: 'Team One', context: 'Our brief', status: 'active', ownerId: user.id, mentorUserId: 'mentor-user' };
  const at = '2027-10-01T03:00:00Z';

  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (payload: unknown) => route.fulfill({ json: payload });
    if (path === '/api/auth/me') return json({ user });
    if (path === '/api/auth/providers') return json({ google: true });
    if (path === '/api/journey/profile') {
      return json({
        user, applications: [{ id: 'app-1', status: 'info', submittedAt: at }], mentor,
        choices: [], slots: [slot], bookings: [booking, { ...booking, id: 'booking-2', status: 'declined', reason: 'Busy', mentorUserId: 'someone', roomId: null }],
      });
    }
    if (path === '/api/competitions/options') return json({ items: [{ id: 'c1', slug: 'event-one', name: 'Event One' }] });
    if (path === '/api/journey/mentors/mentor-1') return json({ mentor, match: { direct: true, reasons: matchReasons }, competition: { slug: 'event-one', name: 'Event One' } });
    if (path.startsWith('/api/journey/competitions/') && path.endsWith('/mentors')) {
      return json({ items: [{ id: 'mentor-1', name: 'Alex Mentor', avatar: 'A', bio: 'Helps teams plan.', direct: true, reasons: matchReasons, scores: [{ theme: 'business', active: true }], slots: [slot] }] });
    }
    if (path === '/api/chats') return json({ rooms: [{ ...room, status: 'pending' }, { ...room, id: 'room-2', title: 'Team Two', status: 'declined' }], invites: [{ id: 'invite-1', title: 'Team Three', expiresAt: at }] });
    if (path === '/api/chats/room-1/messages') {
      return json({
        hasMore: true,
        messages: [
          { id: 'm1', senderId: user.id, name: user.name, body: 'Hello team', fileName: null, fileMime: null, createdAt: at },
          { id: 'm2', senderId: 'mentor-user', name: 'Sam Mentor', body: 'Here is the plan', fileName: 'plan.pdf', fileMime: 'application/pdf', createdAt: at },
        ],
      });
    }
    if (path === '/api/chats/room-1') {
      return json({
        room,
        members: [{ id: user.id, name: user.name, readAt: at }, { id: 'mentor-user', name: 'Sam Mentor', readAt: at }, { id: 'member-3', name: 'Kim Member', readAt: null }],
        invites: [{ id: 'invite-2', email: 'friend@example.invalid', expiresAt: at }],
        appointments: [
          { id: 'a1', title: 'Team One', context: 'Our brief', eventName: 'Event One', startsAt: at, endsAt: '2027-10-01T04:00:00Z', status: 'confirmed' },
          { id: 'a2', title: 'Team One', context: 'Older brief', eventName: 'Event One', startsAt: '2027-09-01T03:00:00Z', endsAt: '2027-09-01T04:00:00Z', status: 'cancelled' },
        ],
      });
    }
    return route.fallback();
  });

  // หน้าเข้าสู่ระบบตอนเปิดปุ่ม Google
  await page.goto('/signin?next=%2F');
  await expect(page.getByRole('link', { name: 'Sign in with Google' })).toBeVisible();
  await expectNoThai(page);

  await page.goto('/profile');
  await expect(page.getByRole('heading', { level: 1, name: 'Alex Mentor' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Strengths used for matching' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Open time slots' })).toBeVisible();
  await expect(page.getByText('Waiting for the mentor to confirm')).toBeVisible();
  await expectNoThai(page);

  await page.goto('/profile/edit');
  await expect(page.getByRole('heading', { level: 1, name: 'My details' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove photo' })).toBeVisible();
  await expectNoThai(page);

  await page.goto('/mentors/mentor-1?competition=event-one');
  await expect(page.getByRole('heading', { name: 'Request a 60-minute conversation' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Why we recommend this mentor for this competition' })).toBeVisible();
  await expect(page.getByLabel('Team name *')).toBeVisible();
  await expectNoThai(page);

  await page.goto('/chats');
  await expect(page.getByRole('heading', { name: 'Group invitations' })).toBeVisible();
  await expectNoThai(page);

  await page.goto('/chats/room-1');
  await expect(page.getByRole('heading', { level: 1, name: 'Team One' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Group members' })).toBeVisible();
  await expect(page.getByText('Read by 1')).toBeVisible();
  await expectNoThai(page);

  const { items } = await (await page.request.get('/api/competitions?perPage=1')).json() as { items: { slug: string }[] };
  const content = await contentFrom(page, `/api/competitions/${items[0].slug}`);
  await page.goto(`/competitions/${items[0].slug}`);
  await expect(page.getByRole('heading', { name: 'Mentors for this competition' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View profile and request a booking' })).toBeVisible();
  await expectNoThai(page, content);
});
