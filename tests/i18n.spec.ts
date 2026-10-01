import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { competitions as demoCompetitions } from '../src/data/competitions';
import { createAccount, createHire, createMentorFixture, removeAccount, verifyEmail } from './helpers';
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
  // อักษรตัวเดียวเอาไว้ด้วยถ้าเป็นภาษาไทย เพราะวงกลมชื่อย่อของเมนเทอร์เป็นตัวอักษรแรกของชื่อที่เขียนมา
  return found.filter((text) => text.length > 1 || /[฀-๿]/.test(text));
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
  const content = await contentFrom(page, `/api/competitions/${slug}`, `/api/consult/competitions/${slug}/mentors`);
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
  const content = await contentFrom(page, '/api/consult/open-competitions');
  await page.goto('/mentors/apply');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your experience');
  await expectNoThai(page, content);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expectNoThai(page, content);
});

test('the mentor application follows the language toggle both ways and keeps what was typed', async ({ page }) => {
  const content = await contentFrom(page, '/api/consult/open-competitions');
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
  await expectNoThai(page, content);
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

    await page.goto('/consulting');
    await expect(page.getByRole('heading', { level: 1, name: 'Consulting' })).toBeVisible();
    await expect(page.getByText('No hires yet')).toBeVisible();
    await expectNoThai(page);

    // ยังไม่ยืนยันอีเมล: กล่องชวนยืนยัน และสถานะบนหน้าโปรไฟล์ ต้องเป็นอังกฤษทั้งหมด
    await expect(page.getByText('Verify your email to continue')).toBeVisible();
    await page.goto('/profile');
    await expect(page.getByText('Email not verified').first()).toBeVisible();
    await expectNoThai(page);

    await page.goto('/mentor-zone');
    await expect(page.getByRole('heading', { name: 'Mentor zone is for approved mentors' })).toBeVisible();
    await expectNoThai(page);
  } finally {
    await page.close();
    await removeAccount(member);
  }
});

test('a mentor profile that cannot be found has no Thai in English', async ({ page }) => {
  const content = await contentFrom(page, '/api/consult/mentors/no-such-mentor');
  await page.goto('/mentors/no-such-mentor');
  await expect(page.getByRole('heading', { level: 1, name: 'We could not find this mentor' })).toBeVisible();
  await expectNoThai(page, content);
});

/* หน้าใหม่ของการติดต่อเมนเทอร์ทุกสถานะ ใช้เมนเทอร์และเวทีทดสอบที่เป็นอังกฤษทั้งหมด (createMentorFixture)
   ภาษาไทยที่เหลือบนหน้าจึงมาจากข้อความของหน้าเว็บเท่านั้น ส่วนรายชื่อเมนเทอร์ตัวอย่างและเวทีจริงเป็นเนื้อหา ตัดออกก่อนตรวจ */
test('the hire flow, chat, consulting, mentor zone and verify pages have no Thai in English', async ({ page }) => {
  const fixture = await createMentorFixture();
  const learner = await createAccount('member', { verified: false });
  const ploy = await createAccount('member', { verified: true, name: 'Ploy Student' });
  const { id: waitingId } = await createHire(fixture, ploy, 'requested', { note: 'Please review my business plan.' });
  try {
    // ยังไม่เข้าสู่ระบบ
    await page.goto(`/mentors/${fixture.mentorId}?competition=${fixture.competition.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: fixture.name })).toBeVisible();
    await expect(page.getByText('Sign in to hire this mentor.')).toBeVisible();
    await expect(page.getByText('No reviews yet. Reviews appear after a student marks a hire as done and writes one.')).toBeVisible();
    await expectNoThai(page);

    // เข้าสู่ระบบแล้วแต่ยังไม่ยืนยันอีเมล
    await signInEnglish(page, learner, `/mentors/${fixture.mentorId}`);
    await expect(page.getByText('Verify your email to continue')).toBeVisible();
    await page.getByRole('button', { name: 'Send verification email' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'We sent a link to' })).toBeVisible();
    await page.getByRole('button', { name: 'Send verification email' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'We just sent one.' })).toBeVisible();
    await expectNoThai(page);

    // ยืนยันแล้ว: ฟอร์มจ้าง ข้อความตรวจฟอร์ม และสถานะหลังส่ง
    await verifyEmail(learner);
    await page.reload();
    const hire = page.getByRole('region', { name: 'Hire this mentor' });
    await expect(hire.getByRole('button', { name: 'Send request' })).toBeVisible();
    await expect(hire.getByText('Total', { exact: true })).toBeVisible();
    await expectNoThai(page);
    await hire.getByLabel('Hours').fill('0');
    await hire.getByRole('button', { name: 'Send request' }).click();
    await expect(hire.getByText('Choose a whole number of hours from 1 to 10.')).toBeVisible();
    await hire.getByLabel('Hours').fill('2');
    await hire.getByRole('button', { name: 'Send request' }).click();
    await expect(hire.getByText('Tell the mentor what you need help with.')).toBeVisible();
    await expectNoThai(page);
    await hire.getByLabel('What do you need help with?').fill('Help me rehearse my pitch.');
    await hire.getByRole('button', { name: 'Send request' }).click();
    await expect(hire.getByText('Waiting for the mentor to accept.')).toBeVisible();
    await expect(hire.locator('.cx-steps')).toContainText('1 Request · 2 Mentor accepts · 3 Chat · 4 Mark as done · 5 Review');
    await expectNoThai(page);

    // Consulting: รายการ รายละเอียด ถามก่อนยกเลิก ยังไม่มีแชต
    await page.goto('/consulting');
    await expect(page.getByRole('heading', { level: 1, name: 'Consulting' })).toBeVisible();
    await page.locator('.hw__row').first().click();
    await expect(page.getByRole('heading', { level: 2, name: fixture.name })).toBeVisible();
    await expect(page.getByText('The chat opens when the mentor accepts.')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel hire' }).click();
    await expect(page.getByText('Cancel this hire?')).toBeVisible();
    await expectNoThai(page);
    await page.getByRole('button', { name: 'Keep it' }).click();

    // เมนเทอร์: คำขอที่รอ (ฟอร์มปฏิเสธ) รับงานแล้วแชตเปิด
    await page.context().clearCookies();
    await signInEnglish(page, fixture.owner, `/mentor-zone#hire-${waitingId}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Mentor zone' })).toBeVisible();
    const zoneContent = await contentFrom(page, '/api/consult/zone');
    await expect(page.getByRole('heading', { name: 'Hire requests (2)' })).toBeVisible();
    await expectNoThai(page, zoneContent);
    const card = page.locator(`#hire-${waitingId}`);
    await card.getByRole('button', { name: 'Decline the hire request from Ploy' }).click();
    await card.getByRole('button', { name: 'Send decline' }).click();
    await expect(card.getByText('Write a short reason so the student knows why.')).toBeVisible();
    await expectNoThai(page, zoneContent);
    await card.getByRole('button', { name: 'Back' }).click();
    await card.getByRole('button', { name: 'Accept the hire request from Ploy' }).click();
    await expect(page.getByText('Accepted. The chat is open.')).toBeVisible();
    const rows = page.getByRole('region', { name: 'Hires and chats' }).locator('.hw__row');
    if (await rows.first().isVisible()) await rows.first().click();
    const chat = page.getByRole('region', { name: /^Chat with/ });
    await expect(chat.getByText('No messages yet. Say hello and share what you want to work on.')).toBeVisible();
    await chat.getByRole('textbox', { name: 'Message' }).fill('Hello, send me the plan.');
    await chat.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(chat.getByText('Hello, send me the plan.')).toBeVisible();
    await expectNoThai(page, zoneContent);

    // นักเรียนที่จบงานแล้ว: เสร็จงาน → รีวิว → รีวิวแล้ว (ใช้บัญชีที่ยืนยันแล้วกับห้องที่เตรียมไว้)
    const finisher = await createAccount('member', { verified: true });
    const done = await createHire(fixture, finisher, 'accepted', { note: 'Last check of my slides.' });
    await page.context().clearCookies();
    await signInEnglish(page, finisher, `/consulting#hire-${done.id}`);
    await expect(page.getByRole('button', { name: 'Mark as done' })).toBeVisible();
    await page.getByRole('button', { name: 'Mark as done' }).click();
    await expect(page.getByText(/^Mark this hire as done\?/)).toBeVisible();
    await expectNoThai(page);
    await page.getByRole('button', { name: 'Yes, mark as done' }).click();
    await page.getByRole('button', { name: 'Write a review' }).click();
    await page.getByRole('button', { name: 'Submit review' }).click();
    await expect(page.getByText('Choose 1 to 5 stars before you submit.')).toBeVisible();
    await expectNoThai(page);
    await page.locator('.cx-star').nth(4).click();
    await page.getByLabel('Comment (optional)').fill('Very clear advice.');
    await page.getByRole('button', { name: 'Submit review' }).click();
    await expect(page.getByText('You reviewed this hire. Thank you.')).toBeVisible();
    await expectNoThai(page);
    await removeAccount(finisher);

    // หน้าเวทีและแท็บเมนเทอร์ที่พร้อมให้ปรึกษา (ชื่อเมนเทอร์ตัวอย่างและเวทีเป็นเนื้อหา)
    const demoSlug = demoCompetitions[0].slug;
    const tabContent = await contentFrom(page, `/api/competitions/${demoSlug}`, `/api/consult/competitions/${demoSlug}/mentors`);
    await page.goto(`/competitions/${demoSlug}#mentors`);
    await expect(page.getByRole('tab', { name: 'Available mentors' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { level: 3, name: 'Rising Star mentors' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Other mentors' })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Hire / }).first()).toBeVisible();
    await expect(page.locator('.rs-row__meta').first()).toContainText('reviews');
    await expectNoThai(page, tabContent);
    // เวทีสุดท้ายของข้อมูลตัวอย่างไม่มีเมนเทอร์คนไหนเลือก
    const emptySlug = demoCompetitions[demoCompetitions.length - 1].slug;
    const emptyContent = await contentFrom(page, `/api/competitions/${emptySlug}`);
    await page.goto(`/competitions/${emptySlug}#mentors`);
    await expect(page.getByRole('heading', { name: 'No mentor has chosen this competition yet.' })).toBeVisible();
    await expectNoThai(page, emptyContent);
  } finally {
    await page.close();
    await removeAccount(learner);
    await removeAccount(ploy);
    await fixture.cleanup();
  }
});

test('the Hall of Fame and the email verification pages have no Thai in English', async ({ page }) => {
  const content = await contentFrom(page, '/api/rising-star');
  await page.goto('/mentors');
  await expect(page.getByRole('heading', { level: 1, name: 'Rising Star Hall of Fame' })).toBeVisible();
  await expect(page.locator('.rs-rank-row__count').first()).toContainText('reviews');
  await expect(page.locator('.main-nav a[href="/mentors"]')).toHaveText('Hall of Fame');
  await expectNoThai(page, content);

  await page.goto('/verify-email');
  await expect(page.getByRole('heading', { level: 1, name: 'This link is incomplete' })).toBeVisible();
  await expectNoThai(page);
  await page.goto('/verify-email?token=not-a-real-token-at-all-0000');
  await expect(page.getByRole('heading', { level: 1, name: 'This link did not work' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in to get a new link' })).toBeVisible();
  await expectNoThai(page);
});
