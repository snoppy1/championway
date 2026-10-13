import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { inArray, like } from 'drizzle-orm';
import { app } from '../server/app';
import { db, client } from '../server/db/client';
import { competitions, hackathonNames, mentorExperiences, mentorSkills, mentorSubmissions, mentors, sessions, staffAlerts, users } from '../server/db/schema';
import { testDatabase } from '../server/lib/database-safety';
import { createSession } from '../server/lib/session';

/* โปรไฟล์เมนเทอร์แบบใหม่ (spec docs/superpowers/specs/2026-10-13-mentor-matching-design.md หมวด A–F) */

testDatabase(process.env);
const prefix = `mp-${randomUUID().slice(0, 8)}`;
const userIds: string[] = [];
const mentorIds: string[] = [];

async function account(role: 'member' | 'admin' = 'member') {
  const id = `${prefix}-u${userIds.length}`;
  await db.insert(users).values({ id, email: `${id}@championways.test`, name: `ผู้ใช้${userIds.length}`, role, emailVerifiedAt: new Date() });
  userIds.push(id);
  return { id, cookie: `cw_session=${(await createSession(id)).id}` };
}
async function mentorOf(userId: string) {
  const mentorId = `${prefix}-m${mentorIds.length}`;
  await db.insert(mentors).values({ id: mentorId, name: `เมนเทอร์ ${prefix}`, avatar: 'ม', bio: 'ทดสอบ', replyTime: '1 วัน', topics: [], best: 'x', cannot: 'y', verified: true });
  await db.insert(mentorSubmissions).values({
    id: `${mentorId}-ms`, status: 'published', userId, publishedMentorId: mentorId, firstName: 'ท', lastName: 'ส', nickname: 'ท',
    email: `${userId}@championways.test`, phone: '', occupation: 'working', organization: 'x', role: 'x', experience: 'x', best: 'x', cannot: 'y', topics: [],
  });
  mentorIds.push(mentorId);
  return mentorId;
}
const send = (method: string, path: string, cookie: string, body?: unknown) => app.request(`/api${path}`, {
  method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
});
const fullProfile = {
  headline: 'AI Engineer | 3× Hackathon Mentor', country: 'TH', timeZone: 'Asia/Bangkok', languages: ['th', 'en'],
  background: 'วิศวกรรมคอมพิวเตอร์', gender: null,
  skills: [{ tag: 'python', level: 'expert' }, { tag: 'react', level: 'advanced' }],
  helpsWith: ['coding', 'mvp'], learnerLevels: ['beginner', 'intermediate'], teachingStyles: ['step_by_step'], formats: ['one_on_one', 'team'],
  deliverables: 'สรุปสิ่งที่ต้องแก้', availability: [{ day: 6, from: '09:00', to: '12:00' }], sessionsPerWeek: 3, sessionMinutes: [60],
  acceptingRequests: true, replyHours: 24, acceptsUrgent: true, mode: 'online',
};

after(async () => {
  const mentorList = mentorIds.concat('-');
  await db.delete(mentorSkills).where(inArray(mentorSkills.mentorId, mentorList));
  await db.delete(mentorExperiences).where(inArray(mentorExperiences.mentorId, mentorList));
  await db.delete(hackathonNames).where(like(hackathonNames.name, `${prefix}%`));
  await db.delete(competitions).where(like(competitions.id, `${prefix}%`));
  await db.delete(mentorSubmissions).where(like(mentorSubmissions.id, `${prefix}%`));
  await db.delete(mentors).where(inArray(mentors.id, mentorList));
  await db.delete(staffAlerts).where(inArray(staffAlerts.actorId, userIds));
  await db.delete(sessions).where(inArray(sessions.userId, userIds));
  await db.delete(users).where(inArray(users.id, userIds));
  await client.end();
});

test('profile: only mentors, validation, save and completeness', async () => {
  const learner = await account();
  const owner = await account();
  await mentorOf(owner.id);

  assert.equal((await send('GET', '/consult/zone/profile', learner.cookie)).status, 403);
  const empty = await (await send('GET', '/consult/zone/profile', owner.cookie)).json() as { complete: boolean; missing: string[] };
  assert.equal(empty.complete, false);
  assert.deepEqual(empty.missing, ['A', 'B', 'C', 'D', 'E']);

  // ค่าที่ไม่อยู่ในรายการ ภาษาว่าง ช่วงเวลากลับหัว ถูกปฏิเสธ
  for (const bad of [
    { ...fullProfile, skills: [{ tag: 'cobol', level: 'expert' }] },
    { ...fullProfile, languages: [] },
    { ...fullProfile, availability: [{ day: 1, from: '10:00', to: '09:00' }] },
    { ...fullProfile, availability: [{ day: 1, from: '9am', to: '10:00' }] },
    { ...fullProfile, sessionMinutes: [45] },
    { ...fullProfile, replyHours: 5 },
    { ...fullProfile, country: 'Thailand' },
  ]) assert.equal((await send('PUT', '/consult/zone/profile', owner.cookie, bad)).status, 400, JSON.stringify(bad).slice(0, 120));

  const saved = await send('PUT', '/consult/zone/profile', owner.cookie, fullProfile);
  assert.equal(saved.status, 200, await saved.clone().text());
  const body = await saved.json() as { complete: boolean; missing: string[]; profile: typeof fullProfile };
  // ยังไม่มีประสบการณ์ หมวด C ขาด
  assert.deepEqual(body.missing, ['C']);
  assert.deepEqual(body.profile.skills.map((s) => s.tag).sort(), ['python', 'react']);

  // บันทึกซ้ำแทนที่ทักษะเดิมทั้งชุด (ไม่ซ้อน)
  const again = await (await send('PUT', '/consult/zone/profile', owner.cookie, { ...fullProfile, skills: [{ tag: 'llm', level: 'intermediate' }] })).json() as { profile: typeof fullProfile };
  assert.deepEqual(again.profile.skills, [{ tag: 'llm', level: 'intermediate' }]);
  assert.equal((await send('PUT', '/consult/zone/profile', owner.cookie, { ...fullProfile, skills: [] })).status, 400);
});
