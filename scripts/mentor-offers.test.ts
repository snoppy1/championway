import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { app } from '../server/app';
import { db, client } from '../server/db/client';
import {
  competitions, emailLog, mentorCompetitionChoices, mentorSubmissions, mentors, reviewEvents, sessions, users,
} from '../server/db/schema';
import { testDatabase } from '../server/lib/database-safety';
import { createSession } from '../server/lib/session';
import { mentorChecks } from '../server/routes/admin';

/* ใบสมัครเมนเทอร์ไม่มีราคากลางแล้ว ราคาอยู่กับแต่ละงานที่ติ๊ก หรือข้ามไว้ใส่ใน Mentor zone (ผู้ใช้ตัดสิน 4 ต.ค. 2569)
   ตอนอนุมัติ ราคาของแต่ละงานต้องไปอยู่ในงานที่รับปรึกษา และราคาบนโปรไฟล์คืองานที่ถูกที่สุด */

testDatabase(process.env);
const prefix = `offers-${randomUUID().slice(0, 8)}`;
const userIds: string[] = [];

async function account(role: 'member' | 'admin' = 'member') {
  const id = `${prefix}-u${userIds.length}`;
  await db.insert(users).values({ id, email: `${id}@championways.test`, name: `ผู้ใช้${userIds.length}`, role, emailVerifiedAt: new Date() });
  userIds.push(id);
  return { id, cookie: `cw_session=${(await createSession(id)).id}` };
}
const post = (path: string, cookie: string, body: unknown) => app.request(`/api${path}`, {
  method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const base = {
  firstName: 'ทดสอบ', lastName: 'ราคา', nickname: 'ทด', email: `${prefix}@championways.test`, occupation: 'ทำงานแล้ว',
  organization: 'ทีมทดสอบ', role: 'วิศวกร', experience: 'เคยชนะ', best: 'ช่วยตีโจทย์', cannot: 'ไม่ทำงานแทน',
  topics: ['ตีโจทย์และหาไอเดีย', 'Pitching และตอบคำถาม'], contactLine: 'mentor.line',
};

test('per-competition prices from the application become the mentor\'s offers on approval', async (t) => {
  const slugs = [`${prefix}-a`, `${prefix}-b`, `${prefix}-c`];
  await db.insert(competitions).values(slugs.map((slug, index) => ({
    id: `${slug}-id`, slug, name: `งาน ${index}`, description: 'ทดสอบ', type: 'contest' as const, org: 'ทีมทดสอบ', closesAt: '2099-01-01',
    region: 'online' as const, prizeValue: 0, prizeNote: 'ใบประกาศ', teamMin: 1, teamMax: 3, keywords: [],
    sourceUrl: 'https://example.test', source: 'editorial' as const, lastVerifiedAt: '2026-09-30',
  })));
  const applicant = await account();
  const admin = await account('admin');
  let submissionId = '';
  try {
    await t.test('a price without minutes (or the other way round) is rejected', async () => {
      const bad = await post('/submissions/mentor', applicant.cookie, { ...base, offers: [{ slug: slugs[0], price: 500, minutes: null }] });
      assert.equal(bad.status, 400);
    });

    await t.test('priced, skipped and unknown competitions are stored as offers', async () => {
      const response = await post('/submissions/mentor', applicant.cookie, {
        ...base,
        offers: [
          { slug: slugs[0], price: 600, minutes: 60 },
          { slug: slugs[1], price: 100, minutes: 30 },
          { slug: slugs[2], price: null, minutes: null },
          { slug: `${prefix}-missing`, price: 1, minutes: 1 },
        ],
      });
      assert.equal(response.status, 201);
      submissionId = (await response.json()).id;
      const [row] = await db.select().from(mentorSubmissions).where(eq(mentorSubmissions.id, submissionId));
      assert.equal(row.price, null);
      assert.equal(row.competitionOffers.length, 3);
      assert.deepEqual(row.competitionOffers.find((offer) => offer.competitionId === `${slugs[2]}-id`), { competitionId: `${slugs[2]}-id`, price: null, minutes: null });
    });

    await t.test('the open list carries categories and levels for grouping', async () => {
      const list = await (await app.request('/api/consult/open-competitions')).json();
      const item = list.items.find((row: { slug: string }) => row.slug === slugs[0]);
      assert.ok(item && Array.isArray(item.categories) && Array.isArray(item.levels) && item.type === 'contest');
      assert.equal(item.id, undefined);
    });

    await t.test('approval copies each price; the profile shows the cheapest per minute; skipped stays empty', async () => {
      const decided = await post(`/admin/mentor-submissions/${submissionId}/decision`, admin.cookie, { decision: 'publish', checks: mentorChecks });
      assert.equal(decided.status, 200, await decided.clone().text());
      const [row] = await db.select().from(mentorSubmissions).where(eq(mentorSubmissions.id, submissionId));
      const choices = await db.select().from(mentorCompetitionChoices).where(eq(mentorCompetitionChoices.mentorId, row.publishedMentorId!));
      const priceOf = (slug: string) => choices.find((choice) => choice.competitionId === `${slug}-id`);
      assert.deepEqual([priceOf(slugs[0])?.price, priceOf(slugs[0])?.minutes], [600, 60]);
      assert.deepEqual([priceOf(slugs[2])?.price, priceOf(slugs[2])?.minutes], [null, null]);
      const [mentor] = await db.select().from(mentors).where(eq(mentors.id, row.publishedMentorId!));
      // 600/60 = 10 บาทต่อนาที ถูกกว่า 100/30 ≈ 3.3 ไม่ได้ จึงเป็นงาน b
      assert.deepEqual([mentor.price, mentor.minutes], [100, 30]);
    });
  } finally {
    const [row] = submissionId ? await db.select().from(mentorSubmissions).where(eq(mentorSubmissions.id, submissionId)) : [];
    if (row?.publishedMentorId) await db.delete(mentors).where(eq(mentors.id, row.publishedMentorId));
    if (submissionId) {
      await db.delete(reviewEvents).where(eq(reviewEvents.targetId, submissionId));
      await db.delete(mentorSubmissions).where(eq(mentorSubmissions.id, submissionId));
    }
    await db.delete(competitions).where(inArray(competitions.slug, slugs));
    await db.delete(emailLog).where(eq(emailLog.to, base.email));
    await db.delete(sessions).where(inArray(sessions.userId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
    await client.end();
  }
});
