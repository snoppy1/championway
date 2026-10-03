import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactTokens } from '../server/lib/email';

// อีเมลที่ส่งออกจริงต้องไม่เก็บลิงก์ใช้ครั้งเดียวไว้เต็ม ๆ ใน email_log
test('sent emails keep links but hide their one-time tokens in the log', () => {
  const body = 'ยืนยัน https://x.test/verify-email?token=abcDEF_123-xyz\nhttps://x.test/confirm?token=QWE-rty_9&lang=th';
  assert.equal(redactTokens(body), 'ยืนยัน https://x.test/verify-email?token=[ซ่อน]\nhttps://x.test/confirm?token=[ซ่อน]&lang=th');
});


test('emails also go out as HTML: link lines become buttons and user text is escaped', async () => {
  const { renderEmailHtml } = await import('../server/lib/email');
  const html = renderEmailHtml('<b>Ann</b> says hi & bye\nsee https://x.test/a?b=1&c=2 now\n\nhttps://x.test/verify-email?token=abc', 'https://x.test');
  assert.ok(html.includes('&lt;b&gt;Ann&lt;/b&gt; says hi &amp; bye'));
  assert.ok(!html.includes('<b>Ann'));
  assert.ok(html.includes('<a href="https://x.test/a?b=1&amp;c=2"'));
  assert.ok(html.includes('href="https://x.test/verify-email?token=abc"'));
  assert.ok(html.includes('Verify email'));
});

test('only our own links become links or buttons; URLs from user text stay plain text', async () => {
  const { renderEmailHtml } = await import('../server/lib/email');
  const html = renderEmailHtml('Name https://evil.example/verify-email\n\nhttps://evil.example/verify-email?token=x\n\nhttps://x.test.evil.example/confirm', 'https://x.test');
  assert.ok(!html.includes('<a '));
  assert.ok(!html.includes('Verify email'));
  assert.ok(html.includes('https://evil.example/verify-email'));
});
