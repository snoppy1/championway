import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eligible, rank, scoreMentor, WEIGHTS } from '../server/lib/matching';
import type { MatchMentor, MatchRequest } from '../server/lib/matching';
import { suggestTags } from '../src/data/note-keywords';

/* สูตรจับคู่ v1 (spec 2026-10-13 ข้อ 5) ฟังก์ชันล้วน ไม่แตะฐานข้อมูล */

const mentor = (over: Partial<MatchMentor> = {}): MatchMentor => ({
  id: 'm1', complete: true, verified: true, acceptingRequests: true, languages: ['th'], gender: null, sessionsPerWeek: 3, openThisWeek: 0,
  skills: [{ tag: 'react', level: 'expert' }], helpsWith: ['coding', 'mvp'], learnerLevels: ['beginner'], teachingStyles: ['step_by_step'],
  formats: ['one_on_one'], replyHours: 24, acceptsUrgent: true,
  experiences: [{ competitionId: 'c1', hackathonNameId: null, normalizedName: 'iecu hackathon', kind: 'hackathon', result: 'winner', role: 'developer', year: '2568' }],
  reviews: 0, average: null, completedSessions: 0, ...over,
});
const request = (over: Partial<MatchRequest> = {}): MatchRequest => ({
  start: 'has_competition', competitionKind: 'hackathon', stage: 'prototype', competitionId: 'c1', hackathonNameId: null, competitionName: '',
  helpAreas: ['web_app'], skillLevel: 'beginner', style: 'step_by_step', format: 'one_on_one', urgency: 'flexible', language: 'th', gender: 'any', ...over,
});

test('weights add up to one', () => {
  assert.equal(Object.values(WEIGHTS).reduce((a, b) => a + b, 0).toFixed(6), '1.000000');
});

test('a mentor who fits every part scores close to 100 and says they competed in this event', () => {
  const result = scoreMentor(mentor(), request());
  assert.equal(result.parts.S, 1);
  assert.equal(result.parts.H, 1);
  assert.equal(result.parts.T, 1);
  assert.equal(result.parts.A, 1);
  assert.equal(result.parts.G, 0.75); // coding + mvp จาก 4 ข้อของขั้น prototype
  assert.equal(result.score, 95);
  assert.deepEqual(result.reasons[0], { code: 'skill', tag: 'react', level: 'expert' });
  assert.ok(result.reasons.some((r) => r.code === 'event'));
  assert.ok(result.reasons.length <= 3);
});

test('hard filters: incomplete, unverified, paused, no shared language, wrong gender, full this week', () => {
  const r = request();
  assert.equal(eligible(mentor(), r), true);
  assert.equal(eligible(mentor({ complete: false }), r), false);
  assert.equal(eligible(mentor({ verified: false }), r), false);
  assert.equal(eligible(mentor({ acceptingRequests: false }), r), false);
  assert.equal(eligible(mentor({ languages: ['en'] }), r), false);
  assert.equal(eligible(mentor({ languages: ['en'] }), request({ language: 'either' })), true);
  assert.equal(eligible(mentor(), request({ gender: 'female' })), false);
  assert.equal(eligible(mentor({ gender: 'female' }), request({ gender: 'female' })), true);
  assert.equal(eligible(mentor({ openThisWeek: 3 }), r), true);
  // คิวสัปดาห์นี้เต็ม ตัดออกเฉพาะคำขอที่ต้องคุยภายในสัปดาห์นี้
  assert.equal(eligible(mentor({ openThisWeek: 3 }), request({ urgency: 'week' })), false);
  assert.equal(eligible(mentor({ openThisWeek: 3 }), request({ urgency: '48h' })), false);
});

test('skill fit: levels, capability only, and advanced learners count intermediate skills less', () => {
  const r = request({ helpAreas: ['web_app'] });
  assert.equal(scoreMentor(mentor({ skills: [{ tag: 'react', level: 'advanced' }] }), r).parts.S, 0.85);
  assert.equal(scoreMentor(mentor({ skills: [{ tag: 'react', level: 'intermediate' }] }), r).parts.S, 0.6);
  assert.equal(scoreMentor(mentor({ skills: [{ tag: 'react', level: 'intermediate' }] }), request({ skillLevel: 'advanced' })).parts.S, 0.4);
  assert.equal(scoreMentor(mentor({ helpsWith: ['idea_validation'] }), request({ helpAreas: ['idea_validation'] })).parts.S, 0.7);
  // สองเรื่อง ได้เรื่องเดียว = ค่าเฉลี่ย
  assert.equal(scoreMentor(mentor(), request({ helpAreas: ['web_app', 'hardware'] })).parts.S, 0.5);
});

test('competition fit: same event 1.0, otherwise same kind + result + role, capped', () => {
  const other = request({ competitionId: 'c2' });
  // hackathon 0.5 + winner 0.2 + developer/web_app 0.1 = 0.8 (เพดาน)
  assert.equal(scoreMentor(mentor(), other).parts.H, 0.8);
  assert.equal(scoreMentor(mentor(), request({ competitionId: 'c2', competitionKind: 'case' })).parts.H, 0.6);
  assert.equal(scoreMentor(mentor({ experiences: [] }), other).parts.H, 0);
  // ชื่อที่พิมพ์เองตรงกับชื่องานของเมนเทอร์หลังทำให้เป็นรูปเดียวกัน
  assert.equal(scoreMentor(mentor(), request({ competitionId: null, competitionName: 'iecu hackathon' })).parts.H, 1);
  // ยังไม่มีงานแข่ง: ฐาน 0.6 เพดาน 1.0
  assert.equal(scoreMentor(mentor(), request({ start: 'has_idea', competitionKind: null, competitionId: null })).parts.H, 0.9);
});

test('goal fit follows the stage, and a case competition wants case analysis', () => {
  assert.equal(scoreMentor(mentor({ helpsWith: ['idea_validation'] }), request({ stage: 'idea' })).parts.G, 1);
  assert.equal(scoreMentor(mentor({ helpsWith: ['coding'] }), request({ stage: 'pitching' })).parts.G, 0);
  assert.equal(scoreMentor(mentor({ helpsWith: ['case_analysis'] }), request({ competitionKind: 'case', stage: 'prototype' })).parts.G, 1);
  // อยากพัฒนาทักษะ = ขั้น prototype
  assert.equal(scoreMentor(mentor({ helpsWith: ['coding', 'mvp', 'architecture', 'debugging'] }), request({ start: 'build_skills', stage: 'idea' })).parts.G, 1);
});

test('teaching style fit and availability', () => {
  assert.equal(scoreMentor(mentor({ teachingStyles: ['review'] }), request()).parts.T, 0.5);
  assert.equal(scoreMentor(mentor({ teachingStyles: ['review'] }), request({ style: 'mixed' })).parts.T, 0.8);
  assert.equal(scoreMentor(mentor(), request({ format: 'team' })).parts.T, 0.8);
  assert.equal(scoreMentor(mentor(), request({ urgency: '48h' })).parts.A, 1);
  assert.equal(scoreMentor(mentor({ acceptsUrgent: false }), request({ urgency: '48h' })).parts.A, 0.46);
  assert.equal(scoreMentor(mentor({ replyHours: 168 }), request({ urgency: 'week' })).parts.A, 0.7);
  assert.equal(scoreMentor(mentor({ replyHours: 72 }), request({ urgency: 'month' })).parts.A, 1);
  assert.equal(scoreMentor(mentor({ replyHours: 168 }), request({ urgency: 'month' })).parts.A, 0.88);
  assert.equal(scoreMentor(mentor({ openThisWeek: 3 }), request({ urgency: 'month' })).parts.A, 0.76);
});

test('near ties put better-rated mentors first, new mentors only ahead of those under 3.5 stars', () => {
  const r = request();
  const list = rank([
    mentor({ id: 'low', reviews: 4, average: 3 }),
    mentor({ id: 'new' }),
    mentor({ id: 'good', reviews: 2, average: 4.8 }),
    mentor({ id: 'far', skills: [], helpsWith: [], experiences: [] }),
  ], r);
  assert.deepEqual(list.map((x) => x.mentorId), ['good', 'new', 'low', 'far']);
  assert.equal(list[1].isNew, true);
});

test('rank keeps at most ten', () => {
  const many = Array.from({ length: 14 }, (_, i) => mentor({ id: `m${String(i).padStart(2, '0')}` }));
  assert.equal(rank(many, request()).length, 10);
});

test('note keywords suggest help areas in Thai and English', () => {
  assert.deepEqual(suggestTags(''), []);
  assert.deepEqual(suggestTags('ต้องทำเว็บกับ pitch deck'), ['web_app', 'pitch']);
  assert.ok(suggestTags('need help with our ML model').includes('ai_ml'));
});
