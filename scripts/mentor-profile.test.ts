import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq, inArray, like } from 'drizzle-orm';
import { app } from '../server/app';
import { db, client } from '../server/db/client';
import {
  competitionRequests, competitions, hackathonNames, mentorCompetitionChoices, mentorExperiences, mentorSkills, mentorSubmissions, mentors, sessions, staffAlerts, users,
} from '../server/db/schema';
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
  // บันทึกได้แม้ยังไม่ครบ (เมนเทอร์ที่ย้ายมาจากระบบเดิมทยอยกรอก) หมวดที่ว่างกลับมาเป็นหมวดที่ขาด
  const partial = await send('PUT', '/consult/zone/profile', owner.cookie, { ...fullProfile, skills: [], languages: [], headline: '' });
  assert.equal(partial.status, 200, await partial.clone().text());
  assert.deepEqual((await partial.json() as { missing: string[] }).missing, ['A', 'B', 'C']);
});

test('profile routes: no caching, no cross-site writes, errors in the page language', async () => {
  const owner = await account();
  await mentorOf(owner.id);
  const read = await send('GET', '/consult/zone/profile', owner.cookie);
  assert.equal(read.headers.get('cache-control'), 'private, no-store');
  const crossSite = await app.request('/api/consult/zone/profile', {
    method: 'PUT', headers: { cookie: owner.cookie, 'content-type': 'application/json', origin: 'https://evil.example' }, body: JSON.stringify(fullProfile),
  });
  assert.equal(crossSite.status, 403);
  const bad = (lang: string) => app.request('/api/consult/zone/profile', {
    method: 'PUT', headers: { cookie: owner.cookie, 'content-type': 'application/json', 'x-lang': lang }, body: JSON.stringify({ ...fullProfile, replyHours: 5 }),
  });
  assert.equal((await (await bad('en')).json()).error, 'Choose a reply time from the list.');
  assert.equal((await (await bad('th')).json()).error, 'เลือกเวลาตอบกลับจากรายการ');
  // ข้อความตั้งต้นของ zod (อังกฤษล้วน) ไม่หลุดออกไป
  const garbage = await app.request('/api/consult/zone/profile', {
    method: 'PUT', headers: { cookie: owner.cookie, 'content-type': 'application/json', 'x-lang': 'th' }, body: JSON.stringify({ ...fullProfile, acceptsUrgent: 'yes' }),
  });
  assert.equal((await garbage.json()).error, 'ข้อมูลไม่ถูกต้อง');
  const learner = await account();
  assert.equal((await (await app.request('/api/consult/zone/profile', { headers: { cookie: learner.cookie, 'x-lang': 'en' } })).json()).error, 'Only approved mentors can do this.');
});

test('experiences: typed names autocomplete, pending until checked, duplicates rejected', async () => {
  const owner = await account();
  const other = await account();
  await mentorOf(owner.id);
  await mentorOf(other.id);
  const slug = `${prefix}-cup`;
  await db.insert(competitions).values({
    id: `${prefix}-c1`, slug, name: `${prefix} Listed Cup`, description: 'x', type: 'contest', org: 'x', closesAt: '2099-01-01', region: 'online',
    prizeValue: 0, teamMin: 1, teamMax: 3, keywords: [], sourceUrl: 'https://example.test', source: 'editorial', lastVerifiedAt: '2026-01-01',
  });
  const base = { year: '2567', kind: 'hackathon', result: 'finalist', detail: '', role: 'developer', roleOther: '',
    responsibility: 'เขียน backend', evidenceUrl: 'https://example.test/proof', lessons: '' };

  // ต้องมีลิงก์ https ชื่อรางวัลเมื่อได้รางวัล และไม่ใช่เมนเทอร์ส่งไม่ได้
  assert.equal((await send('POST', '/consult/zone/experiences', owner.cookie, { ...base, name: `${prefix} Typed Hack`, evidenceUrl: 'ftp://x' })).status, 400);
  assert.equal((await send('POST', '/consult/zone/experiences', owner.cookie, { ...base, name: `${prefix} Typed Hack`, result: 'winner' })).status, 400);
  const learner = await account();
  assert.equal((await send('POST', '/consult/zone/experiences', learner.cookie, { ...base, name: `${prefix} Typed Hack` })).status, 403);

  const typed = await send('POST', '/consult/zone/experiences', owner.cookie, { ...base, name: `${prefix} Typed  Hack` });
  assert.equal(typed.status, 201, await typed.clone().text());
  // ชื่อเดิมต่างแค่ตัวพิมพ์/ช่องว่าง ปีเดียวกัน = ซ้ำ
  assert.equal((await send('POST', '/consult/zone/experiences', owner.cookie, { ...base, name: `${prefix} typed hack` })).status, 409);
  // งานที่มีในระบบเลือกด้วย slug หรือพิมพ์ชื่อตรงกันก็ผูกกับงานนั้น
  const listed = await send('POST', '/consult/zone/experiences', owner.cookie, { ...base, competitionSlug: slug, name: '' });
  assert.equal(listed.status, 201, await listed.clone().text());
  assert.equal((await send('POST', '/consult/zone/experiences', owner.cookie, { ...base, name: `${prefix} listed cup` })).status, 409);

  // คนถัดไปเห็นชื่อที่พิมพ์ไว้ในการเติมคำ ทั้งงานในระบบและชื่อที่พิมพ์
  const names = await (await send('GET', `/hackathon-names?q=${encodeURIComponent(prefix + ' typed')}`, other.cookie)).json() as { items: { name: string }[] };
  assert.deepEqual(names.items.map((n) => n.name), [`${prefix} Typed Hack`]);
  const both = await (await send('GET', `/hackathon-names?q=${encodeURIComponent(prefix)}`, other.cookie)).json() as { items: { name: string; slug: string | null }[] };
  assert.ok(both.items.some((n) => n.slug === slug));

  const mine = await (await send('GET', '/consult/zone/experiences', owner.cookie)).json() as { items: { id: string; status: string; competitionSlug: string | null }[] };
  assert.deepEqual(mine.items.map((i) => i.status), ['pending', 'pending']);

  // ประสบการณ์ที่รอตรวจยังใช้รับปรึกษางานนั้นไม่ได้
  assert.equal((await send('PUT', `/consult/zone/competitions/${slug}`, owner.cookie, { price: 0 })).status, 403);
  const state = await (await send('GET', `/consult/zone/competitions/${slug}`, owner.cookie)).json() as { state: string };
  assert.notEqual(state.state, 'eligible');
  const mentorsOf = await (await send('GET', `/consult/competitions/${slug}/mentors`, other.cookie)).json() as { risingStar: unknown[]; others: unknown[] };
  assert.equal(mentorsOf.risingStar.length + mentorsOf.others.length, 0);

  // ลบของคนอื่นไม่ได้ ลบของตัวเองที่รอตรวจได้
  assert.equal((await send('DELETE', `/consult/zone/experiences/${mine.items[0].id}`, other.cookie)).status, 404);
  assert.equal((await send('DELETE', `/consult/zone/experiences/${mine.items[0].id}`, owner.cookie)).status, 200);
});

test('admin verifies or rejects experiences; members cannot', async () => {
  const owner = await account();
  const member = await account();
  const admin = await account('admin');
  await mentorOf(owner.id);
  const created = await (await send('POST', '/consult/zone/experiences', owner.cookie, {
    name: `${prefix} Review Hack`, year: '2566', kind: 'hackathon', result: 'participant', detail: '', role: 'designer', roleOther: '',
    responsibility: 'ออกแบบหน้าจอ', evidenceUrl: 'https://example.test/p2', lessons: 'วางแผนเวลา',
  })).json() as { id: string };
  const second = await (await send('POST', '/consult/zone/experiences', owner.cookie, {
    name: `${prefix} Second Hack`, year: '2566', kind: 'other', result: 'other', detail: 'รางวัลขวัญใจ', role: 'other', roleOther: 'ผู้ประสานงาน',
    responsibility: 'ประสานทีม', evidenceUrl: 'https://example.test/p4', lessons: '',
  })).json() as { id: string };

  assert.equal((await send('GET', '/admin/experiences', member.cookie)).status, 403);
  assert.equal((await send('POST', `/admin/experiences/${created.id}/decision`, member.cookie, { decision: 'verify' })).status, 403);
  const queue = await (await send('GET', '/admin/experiences?status=pending', admin.cookie)).json() as { items: { id: string; evidenceUrl: string; mentorName: string }[] };
  const row = queue.items.find((i) => i.id === created.id)!;
  assert.equal(row.evidenceUrl, 'https://example.test/p2');
  assert.equal(row.mentorName, `เมนเทอร์ ${prefix}`);
  // ไม่ผ่านต้องมีเหตุผล
  assert.equal((await send('POST', `/admin/experiences/${created.id}/decision`, admin.cookie, { decision: 'reject', reason: '' })).status, 400);
  assert.equal((await send('POST', `/admin/experiences/${created.id}/decision`, admin.cookie, { decision: 'verify' })).status, 200);
  assert.equal((await send('POST', `/admin/experiences/${created.id}/decision`, admin.cookie, { decision: 'verify' })).status, 409);
  assert.equal((await send('POST', `/admin/experiences/${second.id}/decision`, admin.cookie, { decision: 'reject', reason: 'ลิงก์เปิดไม่ได้' })).status, 200);
  assert.equal((await send('POST', '/admin/experiences/nope/decision', admin.cookie, { decision: 'verify' })).status, 404);

  const [stored] = await db.select().from(mentorExperiences).where(eq(mentorExperiences.id, created.id));
  assert.deepEqual([stored.status, stored.reviewedBy], ['verified', admin.id]);
  // เมนเทอร์เห็นเหตุผลที่ไม่ผ่าน
  const mine = await (await send('GET', '/consult/zone/experiences', owner.cookie)).json() as { items: { id: string; status: string; reason: string }[] };
  const rejected = mine.items.find((i) => i.id === second.id)!;
  assert.deepEqual([rejected.status, rejected.reason], ['rejected', 'ลิงก์เปิดไม่ได้']);
  const verified = await (await send('GET', '/admin/experiences?status=verified', admin.cookie)).json() as { items: { id: string }[] };
  assert.ok(verified.items.some((i) => i.id === created.id));
});

test('approving a competition request verifies the same competition and year already waiting in Mentor zone', async () => {
  const owner = await account();
  const admin = await account('admin');
  const mentorId = await mentorOf(owner.id);
  const slug = `${prefix}-claim`;
  await db.insert(competitions).values({
    id: `${prefix}-c2`, slug, name: `${prefix} Claim Cup`, description: 'x', type: 'contest', org: 'x', closesAt: '2099-01-01', region: 'online',
    prizeValue: 0, teamMin: 1, teamMax: 3, keywords: [], sourceUrl: 'https://example.test', source: 'editorial', lastVerifiedAt: '2026-01-01',
  });
  const waiting = await send('POST', '/consult/zone/experiences', owner.cookie, {
    competitionSlug: slug, name: '', year: '2566', kind: 'hackathon', result: 'finalist', detail: '', role: 'developer', roleOther: '',
    responsibility: 'เขียนโค้ด', evidenceUrl: 'https://example.test/p5', lessons: '',
  });
  assert.equal(waiting.status, 201, await waiting.clone().text());
  const requestId = `${prefix}-req`;
  await db.insert(competitionRequests).values({
    id: requestId, mentorId, userId: owner.id, name: `${prefix} Claim Cup`, url: '', price: 0, competitionId: `${prefix}-c2`, result: 'finalist', year: '2566',
  });
  const decided = await send('POST', `/admin/competition-requests/${requestId}/decision`, admin.cookie, { decision: 'approve' });
  assert.equal(decided.status, 200, await decided.clone().text());
  const rows = await db.select().from(mentorExperiences).where(eq(mentorExperiences.mentorId, mentorId));
  assert.deepEqual(rows.map((row) => [row.status, row.reviewedBy]), [['verified', admin.id]]);
  await db.delete(mentorCompetitionChoices).where(eq(mentorCompetitionChoices.mentorId, mentorId));
  await db.delete(competitionRequests).where(eq(competitionRequests.id, requestId));
});

test('public profile shows sections A–F without private fields', async () => {
  const owner = await account();
  const visitor = await account();
  const admin = await account('admin');
  const mentorId = await mentorOf(owner.id);
  await send('PUT', '/consult/zone/profile', owner.cookie, { ...fullProfile, gender: 'female' });
  const pending = await (await send('POST', '/consult/zone/experiences', owner.cookie, {
    name: `${prefix} Public Hack`, year: '2565', kind: 'software', result: 'winner', detail: 'รางวัลที่ 1', role: 'leader', roleOther: '',
    responsibility: 'นำทีม', evidenceUrl: 'https://example.test/p3', lessons: '',
  })).json() as { id: string };
  const checked = await (await send('POST', '/consult/zone/experiences', owner.cookie, {
    name: `${prefix} Checked Hack`, year: '2564', kind: 'hackathon', result: 'finalist', detail: '', role: 'developer', roleOther: '',
    responsibility: 'เขียนโค้ด', evidenceUrl: 'https://example.test/p5', lessons: '',
  })).json() as { id: string };
  await send('POST', `/admin/experiences/${checked.id}/decision`, admin.cookie, { decision: 'verify' });

  type Page = {
    profile: Record<string, unknown>; experiences: { id: string; status: string; evidenceUrl?: string; reason?: string }[];
    stats: { emailVerified: boolean; completedSessions: number; responseRate: number | null; evidenceLinks: number };
  };
  const page = await (await send('GET', `/consult/mentors/${mentorId}`, visitor.cookie)).json() as Page;
  assert.equal(page.profile.headline, fullProfile.headline);
  // เพศไม่ออกนอกระบบ
  assert.equal('gender' in page.profile, false);
  const shownPending = page.experiences.find((e) => e.id === pending.id)!;
  assert.equal(shownPending.status, 'pending');
  // ลิงก์หลักฐานเปิดเฉพาะรายการที่ตรวจแล้ว
  assert.equal(shownPending.evidenceUrl, undefined);
  assert.equal(page.experiences.find((e) => e.id === checked.id)!.evidenceUrl, 'https://example.test/p5');
  assert.equal('reason' in shownPending, false);
  assert.deepEqual(page.stats, { emailVerified: true, completedSessions: 0, responseRate: null, evidenceLinks: 1 });

  const zone = await (await send('GET', '/consult/zone', owner.cookie)).json() as { profileComplete: boolean; profileMissing: string[] };
  assert.deepEqual([zone.profileComplete, zone.profileMissing], [true, []]);
});
