import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestResult, mentorScore } from '../server/lib/mentor-rank';

/* ลำดับในหน้าเวที: รีวิว 50% (ดึงเข้าหาค่ากลาง) + ครั้งที่ปรึกษาสำเร็จ 25% + ผลงานในเวทีนี้ 25% */

const score = (average: number | null, reviews: number, consultations: number, result: 'winner' | 'finalist' | 'participant' | null) =>
  mentorScore({ average, reviews, consultations, result });

test('one perfect review does not beat a long record of good reviews', () => {
  assert.ok(score(4.7, 30, 0, null) > score(5, 1, 0, null));
});

test('with equal reviews, a winner ranks above a finalist above a participant', () => {
  assert.ok(score(4.5, 5, 3, 'winner') > score(4.5, 5, 3, 'finalist'));
  assert.ok(score(4.5, 5, 3, 'finalist') > score(4.5, 5, 3, 'participant'));
  assert.ok(score(4.5, 5, 3, 'participant') > score(4.5, 5, 3, null));
});

test('consultations help but level off, so a newcomer with a strong result can still show up near the top', () => {
  assert.ok(score(4.5, 5, 10, 'participant') > score(4.5, 5, 0, 'participant'));
  assert.equal(score(4.5, 5, 20, null), score(4.5, 5, 500, null));
  assert.ok(score(null, 0, 0, 'winner') > score(3.6, 4, 2, 'participant'));
});

test('bestResult keeps the best result, newest year first on ties', () => {
  assert.deepEqual(bestResult([{ result: 'participant', year: '2568' }, { result: 'winner', year: '2565' }]), { result: 'winner', year: '2565' });
  assert.deepEqual(bestResult([{ result: 'finalist', year: '2566' }, { result: 'finalist', year: '2568' }]), { result: 'finalist', year: '2568' });
  assert.equal(bestResult([]), null);
});
