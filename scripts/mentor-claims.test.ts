import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq, inArray, like } from 'drizzle-orm';
import { app } from '../server/app';
import { db, client } from '../server/db/client';
import {
  competitionRequests, competitionSubmissions, competitions, files, mentorCompetitionChoices, mentorExperiences, mentorSubmissions, mentors,
  reviewEvents, sessions, staffAlerts, emailLog, users,
} from '../server/db/schema';
import { testDatabase } from '../server/lib/database-safety';
import { createSession } from '../server/lib/session';
import { fakeUploads } from './fake-files';

/* ผู้ใช้ขอ 9 ต.ค. 2569
   - เมนเทอร์ขอรับปรึกษาเวทีที่มีในระบบด้วยหลักฐาน (/zone/claims) ทีมงานอนุมัติโดยไม่ต้องเลือกเวที
   - เวทีที่ยังไม่มีในระบบส่งผ่านฟอร์มเต็ม (/submissions/competition/mentor) เผยแพร่แล้วเมนเทอร์รับปรึกษาเวทีนั้นทันที */

testDatabase(process.env);
const prefix = `claim-${randomUUID().slice(0, 8)}`;
const userIds: string[] = [];
const closesAt = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

async function account(role: 'member' | 'admin' = 'member') {
  const id = `${prefix}-u${userIds.length}`;
  await db.insert(users).values({ id, email: `${id}@championways.test`, name: `ผู้ใช้${userIds.length}`, role, emailVerifiedAt: new Date() });
  userIds.push(id);
  return { id, cookie: `cw_session=${(await createSession(id)).id}` };
}
const send = (method: string, path: string, cookie: string, body?: unknown) => app.request(`/api${path}`, {
  method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
});
async function mentorOf(userId: string) {
  const mentorId = `${prefix}-m${userId.slice(-1)}`;
  await db.insert(mentors).values({ id: mentorId, name: `เมนเทอร์ ${prefix}`, avatar: 'ม', bio: 'ทดสอบ', replyTime: '1 วัน', topics: [], best: 'x', cannot: 'y', verified: true });
  await db.insert(mentorSubmissions).values({
    id: `${prefix}-ms-${userId.slice(-1)}`, status: 'published', userId, publishedMentorId: mentorId, firstName: 'ท', lastName: 'ส', nickname: 'ท',
    email: `${userId}@championways.test`, phone: '', occupation: 'working', organization: 'x', role: 'x', experience: 'x', best: 'x', cannot: 'y', topics: [],
  });
  return mentorId;
}
const competitionBody = (name: string) => ({
  kind: 'hackathon', themes: ['innovation'], organizerName: 'ชมรมทดสอบ', name, description: 'เวทีทดสอบ', type: 'contest',
  categories: ['technology'], levels: ['university'], rewards: [], teamMin: 1, teamMax: 4, closesAt, region: 'online',
  prizeValue: 0, prizeNote: 'เกียรติบัตร', sourceUrl: 'https://example.test/cup', fileIds: [],
});

test('claims for listed competitions and full requests for unlisted ones', async () => {
  const owner = await account();
  const learner = await account();
  const admin = await account('admin');
  const mentorId = await mentorOf(owner.id);
  const slug = `${prefix}-cup`;
  await db.insert(competitions).values({
    id: `${prefix}-c1`, slug, name: `${prefix} Cup`, description: 'x', type: 'contest', org: 'x', closesAt, region: 'online',
    prizeValue: 0, teamMin: 1, teamMax: 3, keywords: [], sourceUrl: 'https://example.test', source: 'editorial', lastVerifiedAt: closesAt,
  });
  try {
    // สถานะบนหน้าเวที: คนที่ไม่ใช่เมนเทอร์ได้ mentor: false เมนเทอร์ที่ยังไม่มีผลงานได้ none
    assert.deepEqual(await (await send('GET', `/consult/zone/competitions/${slug}`, learner.cookie)).json(), { mentor: false });
    assert.equal((await (await send('GET', `/consult/zone/competitions/${slug}`, owner.cookie)).json() as { state: string }).state, 'none');
    // ยังรับปรึกษาตรง ๆ ไม่ได้ ต้องมีผลงานที่ตรวจแล้ว
    assert.equal((await send('PUT', `/consult/zone/competitions/${slug}`, owner.cookie, { price: 0 })).status, 403);

    const [proof] = await fakeUploads(owner.id, 1, 'application/pdf');
    const [strangerProof] = await fakeUploads(learner.id, 1, 'application/pdf');
    const claim = { slug, result: 'finalist', year: '2567', price: 200, unit: 'ชั่วโมง' };
    // คนที่ไม่ใช่เมนเทอร์ส่งไม่ได้ ไม่มีไฟล์ไม่ได้ ใช้ไฟล์ของคนอื่นไม่ได้
    assert.equal((await send('POST', '/consult/zone/claims', learner.cookie, { ...claim, evidenceFileIds: [strangerProof] })).status, 403);
    assert.equal((await send('POST', '/consult/zone/claims', owner.cookie, { ...claim, evidenceFileIds: [] })).status, 400);
    assert.equal((await send('POST', '/consult/zone/claims', owner.cookie, { ...claim, evidenceFileIds: [strangerProof] })).status, 400);
    const sent = await send('POST', '/consult/zone/claims', owner.cookie, { ...claim, evidenceFileIds: [proof] });
    assert.equal(sent.status, 201, await sent.clone().text());
    const { id } = await sent.json() as { id: string };
    // ส่งซ้ำเวทีเดิมระหว่างรอตรวจไม่ได้
    const [again] = await fakeUploads(owner.id, 1, 'application/pdf');
    assert.equal((await send('POST', '/consult/zone/claims', owner.cookie, { ...claim, evidenceFileIds: [again] })).status, 409);
    assert.equal((await (await send('GET', `/consult/zone/competitions/${slug}`, owner.cookie)).json() as { state: string }).state, 'pending');
    const [file] = await db.select().from(files).where(eq(files.id, proof));
    assert.deepEqual([file.ownerType, file.ownerId], ['competition_request_evidence', id]);

    // ทีมงานเห็นไฟล์หลักฐาน อนุมัติได้โดยไม่ต้องใส่ slug
    const queue = await (await send('GET', '/admin/competition-requests', admin.cookie)).json() as { items: { id: string; competitionSlug: string; evidenceFiles: { id: string }[] }[] };
    const row = queue.items.find((item) => item.id === id)!;
    assert.equal(row.competitionSlug, slug);
    assert.deepEqual(row.evidenceFiles.map((f) => f.id), [proof]);
    assert.equal((await send('POST', `/admin/competition-requests/${id}/decision`, admin.cookie, { decision: 'approve' })).status, 200);
    const state = await (await send('GET', `/consult/zone/competitions/${slug}`, owner.cookie)).json() as { state: string; price: number; unit: string };
    assert.deepEqual([state.state, state.price, state.unit], ['helping', 200, 'ชั่วโมง']);

    // เวทีที่ยังไม่มีในระบบ: ฟอร์มเต็มของเมนเทอร์
    const [proofB, poster] = await fakeUploads(owner.id, 2);
    const full = { ...competitionBody(`${prefix} ใหม่`), result: 'winner', year: '2566', evidenceFileIds: [proofB], fileIds: [poster], price: 0, unit: '' };
    assert.equal((await send('POST', '/submissions/competition/mentor', learner.cookie, full)).status, 403);
    assert.equal((await send('POST', '/submissions/competition/mentor', owner.cookie, { ...full, evidenceFileIds: [] })).status, 400);
    const created = await send('POST', '/submissions/competition/mentor', owner.cookie, full);
    assert.equal(created.status, 201, await created.clone().text());
    const { id: submissionId } = await created.json() as { id: string };
    // หลักฐานแยกจากโปสเตอร์ โปสเตอร์ยังเป็นไฟล์ของใบ (ใช้เป็นภาพเวที)
    const owned = await db.select().from(files).where(inArray(files.id, [proofB, poster]));
    assert.equal(owned.find((f) => f.id === proofB)!.ownerType, 'competition_submission_evidence');
    assert.equal(owned.find((f) => f.id === poster)!.ownerType, 'competition_submission');

    const review = await (await send('GET', `/admin/competition-submissions/${submissionId}`, admin.cookie)).json() as { submission: { mentorName: string; evidence: { id: string }[] }; checks: string[] };
    assert.equal(review.submission.mentorName, `เมนเทอร์ ${prefix}`);
    assert.deepEqual(review.submission.evidence.map((f) => f.id), [proofB]);
    assert.equal(review.checks.length, 7);
    // ต้องติ๊กข้อตรวจหลักฐานด้วย
    assert.equal((await send('POST', `/admin/competition-submissions/${submissionId}/decision`, admin.cookie, { decision: 'publish', checks: review.checks.slice(0, 6) })).status, 422);
    assert.equal((await send('POST', `/admin/competition-submissions/${submissionId}/decision`, admin.cookie, { decision: 'publish', checks: review.checks })).status, 200);
    const [published] = await db.select().from(competitionSubmissions).where(eq(competitionSubmissions.id, submissionId));
    const [choice] = await db.select().from(mentorCompetitionChoices).where(eq(mentorCompetitionChoices.competitionId, published.publishedCompetitionId!));
    assert.deepEqual([choice.mentorId, choice.price], [mentorId, 0]);
    const [experience] = await db.select().from(mentorExperiences).where(eq(mentorExperiences.competitionId, published.publishedCompetitionId!));
    assert.deepEqual([experience.mentorId, experience.result, experience.year], [mentorId, 'winner', '2566']);

    // Mentor zone แสดงใบนี้ใน "คำขอของฉัน" เป็นอนุมัติแล้ว
    const zone = await (await send('GET', '/consult/zone', owner.cookie)).json() as { requests: { id: string; status: string }[] };
    assert.equal(zone.requests.find((r) => r.id === submissionId)?.status, 'approved');
  } finally {
    const subs = await db.select({ id: competitionSubmissions.id, cid: competitionSubmissions.publishedCompetitionId }).from(competitionSubmissions).where(eq(competitionSubmissions.mentorId, mentorId));
    await db.delete(reviewEvents).where(inArray(reviewEvents.targetId, subs.map((s) => s.id).concat('-')));
    await db.delete(competitionSubmissions).where(inArray(competitionSubmissions.id, subs.map((s) => s.id).concat('-')));
    const reqs = await db.select({ id: competitionRequests.id }).from(competitionRequests).where(eq(competitionRequests.mentorId, mentorId));
    await db.delete(files).where(inArray(files.ownerId, reqs.map((r) => r.id).concat('-')));
    await db.delete(competitionRequests).where(eq(competitionRequests.mentorId, mentorId));
    await db.delete(mentorSubmissions).where(like(mentorSubmissions.id, `${prefix}-%`));
    await db.delete(mentors).where(eq(mentors.id, mentorId));
    await db.delete(competitions).where(inArray(competitions.id, [`${prefix}-c1`, ...subs.map((s) => s.cid).filter((v): v is string => Boolean(v))]));
    await db.delete(files).where(inArray(files.ownerId, [...userIds, ...subs.map((s) => s.id)]));
    await db.delete(staffAlerts).where(inArray(staffAlerts.actorId, userIds));
    await db.delete(emailLog).where(like(emailLog.to, `${prefix}%`));
    await db.delete(sessions).where(inArray(sessions.userId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
    await client.end();
  }
});
