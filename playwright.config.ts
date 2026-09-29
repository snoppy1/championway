import { defineConfig } from '@playwright/test';

const baseURL = `http://127.0.0.1:${process.env.TEST_WEB_PORT ?? '5174'}`;

export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/global-setup.ts',
  fullyParallel: true,
  workers: 3,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    /* เว็บเปิดมาเป็นภาษาอังกฤษ แต่เทสชุดเดิมหาปุ่มและหัวข้อด้วยคำไทย จึงตั้งภาษาไทยไว้ก่อนทุกเทส
       ภาษาอังกฤษที่เป็นค่าตั้งต้นและการสลับภาษามีเทสของตัวเองใน tests/i18n.spec.ts
       ซึ่งล้างค่านี้ออกด้วย test.use({ storageState: … }) */
    storageState: { cookies: [], origins: [{ origin: baseURL, localStorage: [{ name: 'cw-lang', value: 'th' }] }] },
    browserName: 'chromium',
    channel: 'msedge',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'tablet', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
