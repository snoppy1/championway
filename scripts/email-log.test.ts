import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactTokens } from '../server/lib/email';

// อีเมลที่ส่งออกจริงต้องไม่เก็บลิงก์ใช้ครั้งเดียวไว้เต็ม ๆ ใน email_log
test('sent emails keep links but hide their one-time tokens in the log', () => {
  const body = 'ยืนยัน https://x.test/verify-email?token=abcDEF_123-xyz\nhttps://x.test/confirm?token=QWE-rty_9&lang=th';
  assert.equal(redactTokens(body), 'ยืนยัน https://x.test/verify-email?token=[ซ่อน]\nhttps://x.test/confirm?token=[ซ่อน]&lang=th');
});
