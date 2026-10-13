import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missingSections, normalizeName, profileComplete, slotProblem } from '../src/data/matching';
import type { MentorProfileV2 } from '../src/data/matching';

/* ตัวเลือกและตัวเช็กโปรไฟล์เมนเทอร์แบบใหม่ (spec 2026-10-13 หมวด A–F) ไม่แตะฐานข้อมูล */

const full: MentorProfileV2 = {
  headline: 'AI Engineer | 3× Hackathon Mentor', country: 'TH', timeZone: 'Asia/Bangkok', languages: ['th'],
  background: 'Computer engineering', gender: null,
  skills: [{ tag: 'python', level: 'expert' }],
  helpsWith: ['coding'], learnerLevels: ['beginner'], teachingStyles: ['step_by_step'], formats: ['one_on_one'], deliverables: '',
  availability: [{ day: 6, from: '09:00', to: '12:00' }], sessionsPerWeek: 2, sessionMinutes: [60], acceptingRequests: true,
  replyHours: 24, acceptsUrgent: false, mode: 'online',
};

test('a full profile with one experience is complete', () => {
  assert.equal(profileComplete(full, 1), true);
  assert.deepEqual(missingSections(full, 1), []);
});

test('each missing section is reported', () => {
  assert.deepEqual(missingSections({ ...full, headline: ' ' }, 1), ['A']);
  assert.deepEqual(missingSections({ ...full, languages: [] }, 1), ['A']);
  assert.deepEqual(missingSections({ ...full, skills: [] }, 1), ['B']);
  assert.deepEqual(missingSections(full, 0), ['C']);
  assert.deepEqual(missingSections({ ...full, formats: [] }, 1), ['D']);
  assert.deepEqual(missingSections({ ...full, availability: [], sessionsPerWeek: null }, 1), ['E']);
  assert.equal(profileComplete({ ...full, replyHours: null }, 1), false);
});

test('names normalise case, spacing and Thai digits', () => {
  assert.equal(normalizeName('  Thailand   ICT  Awards ๒๕๖๗ '), 'thailand ict awards 2567');
  assert.equal(normalizeName('NSC'), normalizeName('nsc'));
});

test('slots need HH:MM and to after from', () => {
  assert.equal(slotProblem({ day: 1, from: '09:00', to: '10:00' }), null);
  assert.equal(slotProblem({ day: 1, from: '10:00', to: '09:00' }), 'order');
  assert.equal(slotProblem({ day: 7, from: '09:00', to: '10:00' }), 'day');
  assert.equal(slotProblem({ day: 1, from: '9am', to: '10:00' }), 'time');
});
