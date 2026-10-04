import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { app } from '../server/app';
import { db, client } from '../server/db/client';
import {
  competitions, emailLog, mentorAwards, mentorCompetitionChoices, mentorExperiences, mentorSubmissions, mentors, reviewEvents, sessions, users,
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
const award = (slug: string, wantsMentor: boolean, result = 'participant') => ({
  title: slug, competitionSlug: slug, result, detail: '', year: '2567', evidence: 'https://example.test/proof', wantsMentor,
});
const base = {
  firstName: 'ทดสอบ', lastName: 'ราคา', nickname: 'ทด', email: `${prefix}@championways.test`, occupation: 'ทำงานแล้ว',
  organization: 'ทีมทดสอบ', role: 'วิศวกร', experience: 'เคยชนะ', best: 'ช่วยตีโจทย์', cannot: 'ไม่ทำงานแทน',
  topics: ['ตีโจทย์และหาไอเดีย', 'Pitching และตอบคำถาม'], contactLine: 'mentor.line',
};

test('per-competition prices from the application become the mentor\'s offers on approval', async (t) => {
  const slugs = [`${prefix}-a`, `${prefix}-b`, `${prefix}-c`];
  await db.insert(competitions).values(slugs.map((slug, index) => ({
    id: `${slug}-id`, slug, name: `งาน ${index}`, description: 'ทดสอบ', type: 'contest' as const, kind: 'hackathon' as const, org: 'ทีมทดสอบ', closesAt: '2099-01-01',
    region: 'online' as const, prizeValue: 0, prizeNote: 'ใบประกาศ', teamMin: 1, teamMax: 3, keywords: [],
    sourceUrl: 'https://example.test', source: 'editorial' as const, lastVerifiedAt: '2026-09-30',
  })));
  const applicant = await account();
  const admin = await account('admin');
  let submissionId = '';
  try {
    await t.test('you need at least one competition you competed in; a paid price needs a unit', async () => {
      assert.equal((await post('/submissions/mentor', applicant.cookie, { ...base, awards: [] })).status, 400);
      const bad = await post('/submissions/mentor', applicant.cookie, {
        ...base, awards: [award(slugs[0], true)], offers: [{ slug: slugs[0], price: 500, unit: '' }],
      });
      assert.equal(bad.status, 400);
      // ติ๊กเป็นเมนเทอร์แล้วต้องมีราคา (ฟรีก็ได้)
      assert.equal((await post('/submissions/mentor', applicant.cookie, { ...base, awards: [award(slugs[0], true)], offers: [] })).status, 400);
      // ลิงก์หลักฐานต้องเป็น http(s) (Astra รีวิว 4 ต.ค. 2569)
      const unsafe = { ...award(slugs[0], false), evidence: 'javascript:alert(1)' };
      assert.equal((await post('/submissions/mentor', applicant.cookie, { ...base, awards: [unsafe] })).status, 400);
      // อักขระควบคุมที่เบราว์เซอร์ตัดทิ้ง (java<TAB>script:) ก็ไม่ผ่าน
      const sneaky = { ...award(slugs[0], false), evidence: 'java	script:alert(1)' };
      assert.equal((await post('/submissions/mentor', applicant.cookie, { ...base, awards: [sneaky] })).status, 400);
    });

    await t.test('only competitions you competed in and ticked get a price; typed competitions are kept as experience', async () => {
      const response = await post('/submissions/mentor', applicant.cookie, {
        ...base,
        awards: [
          award(slugs[0], true, 'winner'), award(slugs[1], true, 'participant'), award(slugs[2], false, 'finalist'),
          // ใส่เวทีเดิมปีเดิมซ้ำ ได้ประสบการณ์แถวเดียว
          award(slugs[2], false, 'finalist'),
          { title: 'เวทีที่ยังไม่มีในระบบ', competitionSlug: null, result: 'participant', year: '2565', evidence: 'https://example.test/x', wantsMentor: true },
        ],
        offers: [
          { slug: slugs[0], price: 600, unit: 'โปรเจกต์' },
          { slug: slugs[1], price: 0, unit: 'ไม่ควรเก็บ' },
          // ไม่ได้ติ๊กเวทีนี้ ราคาถูกทิ้ง
          { slug: slugs[2], price: 1, unit: 'ชั่วโมง' },
        ],
      });
      assert.equal(response.status, 201, await response.clone().text());
      submissionId = (await response.json()).id;
      const [row] = await db.select().from(mentorSubmissions).where(eq(mentorSubmissions.id, submissionId));
      assert.deepEqual(row.competitionOffers.map((offer) => [offer.competitionId, offer.price, offer.unit]).sort(),
        [[`${slugs[0]}-id`, 600, 'โปรเจกต์'], [`${slugs[1]}-id`, 0, '']]);
      const awards = await db.select().from(mentorAwards).where(eq(mentorAwards.submissionId, submissionId));
      assert.equal(awards.length, 5);
      assert.equal(awards.find((a) => a.title === 'เวทีที่ยังไม่มีในระบบ')?.wantsMentor, false);
    });

    await t.test('the open list can include closed competitions for picking past experience', async () => {
      const list = await (await app.request('/api/consult/open-competitions?all=1')).json();
      const item = list.items.find((row: { slug: string }) => row.slug === slugs[0]);
      assert.ok(item && Array.isArray(item.categories) && item.type === 'contest');
      assert.equal(item.id, undefined);
    });

    await t.test('approval copies each price and every experience; the profile shows the lowest price', async () => {
      const decided = await post(`/admin/mentor-submissions/${submissionId}/decision`, admin.cookie, { decision: 'publish', checks: mentorChecks });
      assert.equal(decided.status, 200, await decided.clone().text());
      const [row] = await db.select().from(mentorSubmissions).where(eq(mentorSubmissions.id, submissionId));
      const choices = await db.select().from(mentorCompetitionChoices).where(eq(mentorCompetitionChoices.mentorId, row.publishedMentorId!));
      const priceOf = (slug: string) => choices.find((choice) => choice.competitionId === `${slug}-id`);
      assert.deepEqual([priceOf(slugs[0])?.price, priceOf(slugs[0])?.unit], [600, 'โปรเจกต์']);
      assert.deepEqual([priceOf(slugs[1])?.price, priceOf(slugs[1])?.unit], [0, '']);
      assert.equal(priceOf(slugs[2]), undefined);
      const [mentor] = await db.select().from(mentors).where(eq(mentors.id, row.publishedMentorId!));
      assert.deepEqual([mentor.price, mentor.priceUnit], [0, '']);
      // ป้าย "ชนะ" ผูกกับเวทีที่ชนะเท่านั้น
      assert.equal(mentor.wonSlug, slugs[0]);
      const experiences = await db.select().from(mentorExperiences).where(eq(mentorExperiences.mentorId, row.publishedMentorId!));
      assert.equal(experiences.length, 4);
      assert.deepEqual(experiences.filter((e) => e.competitionId).map((e) => e.result).sort(), ['finalist', 'participant', 'winner']);
      // หน้าเวทีแสดงผลงานของเมนเทอร์ในเวทีนั้น
      const page = await (await app.request(`/api/consult/competitions/${slugs[0]}/mentors`)).json();
      const listed = [...page.risingStar, ...page.others].find((m: { id: string }) => m.id === row.publishedMentorId);
      assert.deepEqual([listed.experience, listed.consultations, listed.price], [{ result: 'winner', year: '2567' }, 0, 600]);
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
