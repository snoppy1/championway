import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { inArray, like } from 'drizzle-orm';
import { app } from '../server/app';
import { db, client } from '../server/db/client';
import {
  competitions, consultations, emailLog, learnerProfiles, matchRequests, mentorExperiences, mentorSkills, mentorSubmissions, mentors, projects, sessions, users,
} from '../server/db/schema';
import { testDatabase } from '../server/lib/database-safety';
import { createSession } from '../server/lib/session';

/* หา Mentor ให้ฉัน (spec 2026-10-13 ข้อ 4.2, 5, 6): โปรไฟล์ผู้เรียน โปรเจกต์ คำขอจับคู่ ผล และเริ่มปรึกษา */

testDatabase(process.env);
const prefix = `ma-${randomUUID().slice(0, 8)}`;
const userIds: string[] = [];
const mentorIds: string[] = [];

async function account(verified = true) {
  const id = `${prefix}-u${userIds.length}`;
  await db.insert(users).values({ id, email: `${id}@championways.test`, name: `Learner ${userIds.length}`, emailVerifiedAt: verified ? new Date() : null });
  userIds.push(id);
  return { id, cookie: `cw_session=${(await createSession(id)).id}` };
}
const send = (method: string, path: string, cookie: string, body?: unknown) => app.request(`/api${path}`, {
  method, headers: { cookie, 'content-type': 'application/json', 'x-lang': 'en' }, body: body === undefined ? undefined : JSON.stringify(body),
});
const mentorProfile = {
  headline: 'Web Engineer | Hackathon Mentor', country: 'TH', timeZone: 'Asia/Bangkok', languages: ['th'], background: 'Computer engineering', gender: null,
  skills: [{ tag: 'react', level: 'expert' }], helpsWith: ['coding', 'mvp'], learnerLevels: ['beginner'], teachingStyles: ['step_by_step'], formats: ['one_on_one'],
  deliverables: '', availability: [{ day: 6, from: '09:00', to: '12:00' }], sessionsPerWeek: 3, sessionMinutes: [60], acceptingRequests: true,
  replyHours: 24, acceptsUrgent: true, mode: 'online',
};
async function mentor(competitionId: string) {
  const owner = await account();
  const id = `${prefix}-m${mentorIds.length}`;
  await db.insert(mentors).values({ id, name: `Mentor ${mentorIds.length}`, avatar: 'M', bio: 'x', replyTime: '1 day', topics: [], best: 'x', cannot: 'y', contactLine: `line-${id}` });
  await db.insert(mentorSubmissions).values({
    id: `${id}-ms`, status: 'published', userId: owner.id, publishedMentorId: id, firstName: 'M', lastName: 'T', nickname: 'M',
    email: `${owner.id}@championways.test`, phone: '', occupation: 'working', organization: 'x', role: 'x', experience: 'x', best: 'x', cannot: 'y', topics: [],
  });
  mentorIds.push(id);
  assert.equal((await send('PUT', '/consult/zone/profile', owner.cookie, mentorProfile)).status, 200);
  await db.insert(mentorExperiences).values({ id: `${id}-x`, mentorId: id, competitionId, name: 'Match Hackathon', result: 'winner', year: '2568', kind: 'hackathon', role: 'developer', status: 'verified' });
  return id;
}
const learnerProfile = { level: 'beginner', interestsFields: ['web'], skills: ['python'], languages: ['th'], country: 'TH', interests: '' };
const answers = { helpAreas: ['web_app'], skillLevel: 'beginner', style: 'step_by_step', format: 'one_on_one', urgency: 'flexible', language: 'th', gender: 'any', note: '', noteTags: [] };

after(async () => {
  await db.delete(consultations).where(inArray(consultations.userId, userIds.concat('-')));
  await db.delete(projects).where(inArray(projects.userId, userIds.concat('-')));
  await db.delete(learnerProfiles).where(inArray(learnerProfiles.userId, userIds.concat('-')));
  await db.delete(mentorSkills).where(inArray(mentorSkills.mentorId, mentorIds.concat('-')));
  await db.delete(mentorExperiences).where(inArray(mentorExperiences.mentorId, mentorIds.concat('-')));
  await db.delete(mentorSubmissions).where(like(mentorSubmissions.id, `${prefix}%`));
  await db.delete(mentors).where(inArray(mentors.id, mentorIds.concat('-')));
  await db.delete(competitions).where(like(competitions.id, `${prefix}%`));
  await db.delete(emailLog).where(like(emailLog.to, `${prefix}%`));
  await db.delete(sessions).where(inArray(sessions.userId, userIds.concat('-')));
  await db.delete(users).where(inArray(users.id, userIds.concat('-')));
  await client.end();
});

test('learner profile: sign-in, validation, save', async () => {
  assert.equal((await app.request('/api/learner/profile')).status, 401);
  const me = await account();
  const empty = await (await send('GET', '/learner/profile', me.cookie)).json() as { profile: unknown; user: { name: string } };
  assert.equal(empty.profile, null);
  assert.equal(empty.user.name, 'Learner 0');
  for (const bad of [{ ...learnerProfile, languages: [] }, { ...learnerProfile, interestsFields: [] }, { ...learnerProfile, level: 'pro' }, { ...learnerProfile, skills: ['cobol'] }]) {
    assert.equal((await send('PUT', '/learner/profile', me.cookie, bad)).status, 400);
  }
  assert.equal((await send('PUT', '/learner/profile', me.cookie, learnerProfile)).status, 200);
  assert.equal((await send('PUT', '/learner/profile', me.cookie, { ...learnerProfile, level: 'advanced' })).status, 200);
  const saved = await (await send('GET', '/learner/profile', me.cookie)).json() as { profile: { level: string } };
  assert.equal(saved.profile.level, 'advanced');
});

test('projects: a competition needs a kind and a name, owner only, and the list shows limits', async () => {
  const me = await account();
  const other = await account();
  const bad = await send('POST', '/projects', me.cookie, { name: 'Farm', start: 'has_competition', competitionKind: null, competitionSlug: null, competitionName: 'X', stage: 'idea' });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json() as { error: string }).error, 'Choose the kind of competition.');
  const created = await send('POST', '/projects', me.cookie, { name: 'Farm', start: 'has_idea', competitionKind: 'case', competitionSlug: null, competitionName: 'ignored', stage: 'idea' });
  assert.equal(created.status, 201);
  const { project } = await created.json() as { project: { id: string } };
  const list = await (await send('GET', '/projects', me.cookie)).json() as { items: { id: string; competitionKind: string | null; competitionName: string | null }[]; projectLimitReached: boolean; hasProfile: boolean };
  assert.equal(list.items[0].id, project.id);
  // ไม่มีงานแข่ง: ไม่เก็บประเภทหรือชื่อ
  assert.equal(list.items[0].competitionKind, null);
  assert.equal(list.items[0].competitionName, null);
  assert.equal(list.projectLimitReached, false);
  assert.equal(list.hasProfile, false);
  assert.equal((await send('PUT', `/projects/${project.id}`, other.cookie, { name: 'X', start: 'has_idea', competitionKind: null, competitionSlug: null, competitionName: '', stage: 'idea' })).status, 404);
  assert.equal((await send('DELETE', `/projects/${project.id}`, other.cookie)).status, 404);
  assert.equal((await send('DELETE', `/projects/${project.id}`, me.cookie)).status, 200);
});

test('match: ranks a complete mentor who entered the same event, stores the result, and starts one consultation per project', async () => {
  const competitionId = `${prefix}-c`;
  await db.insert(competitions).values({
    id: competitionId, slug: `${prefix}-hack`, name: `${prefix} Hackathon`, description: 'x', type: 'contest', org: 'x', closesAt: '2099-01-01',
    region: 'online', teamMin: 1, teamMax: 5, source: 'editorial', lastVerifiedAt: '2026-10-01',
  });
  const first = await mentor(competitionId);
  const second = await mentor(competitionId);
  const me = await account();
  const project = await (await send('POST', '/projects', me.cookie, {
    name: 'Farm sensor', start: 'has_competition', competitionKind: 'hackathon', competitionSlug: `${prefix}-hack`, competitionName: '', stage: 'prototype',
  })).json() as { project: { id: string } };

  // ต้องมีโปรไฟล์ผู้เรียนก่อน
  assert.equal((await send('POST', `/projects/${project.project.id}/match`, me.cookie, answers)).status, 409);
  await send('PUT', '/learner/profile', me.cookie, learnerProfile);
  assert.equal((await send('POST', `/projects/${project.project.id}/match`, me.cookie, { ...answers, helpAreas: [] })).status, 400);
  const sent = await send('POST', `/projects/${project.project.id}/match`, me.cookie, answers);
  assert.equal(sent.status, 201);
  const { requestId } = await sent.json() as { requestId: string };

  const stranger = await account();
  assert.equal((await send('GET', `/matches/${requestId}`, stranger.cookie)).status, 404);
  const view = await (await send('GET', `/matches/${requestId}`, me.cookie)).json() as {
    results: { score: number; reasons: { code: string }[]; mentor: { id: string; isNew: boolean } }[]; open: unknown; request: { answers: { projectName: string } };
  };
  const mine = view.results.filter((r) => r.mentor.id === first || r.mentor.id === second);
  assert.equal(mine.length, 2);
  assert.ok(mine[0].score >= 90, `score ${mine[0].score}`);
  assert.ok(mine[0].reasons.some((r) => r.code === 'event'));
  assert.equal(mine[0].mentor.isNew, true);
  assert.equal(view.request.answers.projectName, 'Farm sensor');
  assert.equal(view.open, null);
  // ไม่มีช่องทางติดต่อในผล
  assert.ok(!JSON.stringify(view).includes('line-'));

  // ยังไม่ยืนยันอีเมล เริ่มปรึกษาไม่ได้
  const unverified = await account(false);
  await send('PUT', '/learner/profile', unverified.cookie, learnerProfile);
  const p2 = await (await send('POST', '/projects', unverified.cookie, { name: 'Y', start: 'has_idea', competitionKind: null, competitionSlug: null, competitionName: '', stage: 'idea' })).json() as { project: { id: string } };
  const r2 = await (await send('POST', `/projects/${p2.project.id}/match`, unverified.cookie, answers)).json() as { requestId: string };
  assert.equal((await send('POST', `/matches/${r2.requestId}/start/${first}`, unverified.cookie)).status, 403);

  const started = await send('POST', `/matches/${requestId}/start/${first}`, me.cookie);
  assert.equal(started.status, 201);
  const body = await started.json() as { contacts: { line: string } };
  assert.equal(body.contacts.line, `line-${first}`);
  // กดซ้ำกับคนเดิมได้รายการเดิม กับอีกคนไม่ได้จนกว่าจะจบ
  assert.equal((await send('POST', `/matches/${requestId}/start/${first}`, me.cookie)).status, 200);
  const blocked = await send('POST', `/matches/${requestId}/start/${second}`, me.cookie);
  assert.equal(blocked.status, 409);
  assert.equal((await blocked.json() as { code: string }).code, 'openConsult');
  const after = await (await send('GET', `/matches/${requestId}`, me.cookie)).json() as { open: { mentorId: string } };
  assert.equal(after.open.mentorId, first);
  // เมนเทอร์ที่ไม่อยู่ในผลนี้
  assert.equal((await send('POST', `/matches/${requestId}/start/nobody`, me.cookie)).status, 404);
});

test('match: ten requests a day', async () => {
  const me = await account();
  await send('PUT', '/learner/profile', me.cookie, learnerProfile);
  const p = await (await send('POST', '/projects', me.cookie, { name: 'Z', start: 'build_skills', competitionKind: null, competitionSlug: null, competitionName: '', stage: 'idea' })).json() as { project: { id: string } };
  await db.insert(matchRequests).values(Array.from({ length: 10 }, (_, i) => ({ id: `${prefix}-r${i}`, projectId: p.project.id, userId: me.id, answers: {} })));
  const res = await send('POST', `/projects/${p.project.id}/match`, me.cookie, answers);
  assert.equal(res.status, 429);
  assert.equal((await res.json() as { code: string }).code, 'requestLimit');
  const list = await (await send('GET', '/projects', me.cookie)).json() as { requestLimitReached: boolean };
  assert.equal(list.requestLimitReached, true);
});
