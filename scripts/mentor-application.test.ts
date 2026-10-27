import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq, inArray, like } from 'drizzle-orm';
import { app } from '../server/app';
import { db, client } from '../server/db/client';
import {
  competitions, emailLog, hackathonNames, mentorAwards, mentorCompetitionChoices, mentorExperiences, mentorSkills, mentorSubmissions, mentors,
  reviewEvents, sessions, staffAlerts, users,
} from '../server/db/schema';
import { testDatabase } from '../server/lib/database-safety';
import { createSession } from '../server/lib/session';
import { mentorChecks } from '../server/routes/admin';
import { applicationAward, applicationProfile, fakeUploads, withUploads } from './fake-files';

/* ใบสมัครเมนเทอร์แบบใหม่ (spec 2026-10-13 ตัดสิน 21 ต.ค. 2569)
   ใบต้องมีโปรไฟล์หมวด A, B, D, E ครบ ราคาเดียวต่อเมนเทอร์ และประสบการณ์แบบละเอียด (ไฟล์หรือลิงก์หลักฐานอย่างใดอย่างหนึ่ง)
   อนุมัติแล้วเมนเทอร์ครบทุกหมวด ถูกจับคู่ได้ทันที ประสบการณ์ตรวจแล้ว ชื่องานนอกระบบเข้ารายชื่อเติมคำอัตโนมัติ
   และงานในระบบที่เคยแข่งกลายเป็นงานที่รับปรึกษาด้วยราคาเดียวนั้น */

testDatabase(process.env);
const prefix = `apply-${randomUUID().slice(0, 8)}`;
const userIds: string[] = [];

async function account(role: 'member' | 'admin' = 'member') {
  const id = `${prefix}-u${userIds.length}`;
  await db.insert(users).values({ id, email: `${id}@championways.test`, name: `ผู้ใช้${userIds.length}`, role, emailVerifiedAt: new Date() });
  userIds.push(id);
  return { id, cookie: `cw_session=${(await createSession(id)).id}` };
}
// ใบสมัครต้องแนบรูปโปรไฟล์ (scripts/fake-files.ts) ส่ง raw: true เพื่อทดสอบใบที่แนบไฟล์เอง
const send = async (method: string, path: string, cookie: string, body?: unknown, { raw = false, lang = 'th' } = {}) => app.request(`/api${path}`, {
  method, headers: { cookie, 'content-type': 'application/json', 'x-lang': lang },
  body: body === undefined ? undefined : JSON.stringify(!raw && path === '/submissions/mentor' ? await withUploads(cookie, body as { awards: object[] }) : body),
});
const base = {
  firstName: 'ทดสอบ', lastName: 'ใบใหม่', nickname: 'ทด', email: `${prefix}@championways.test`, occupation: 'ทำงานแล้ว',
  organization: 'ทีมทดสอบ', role: 'วิศวกร', experience: 'เคยแข่ง Hackathon และแข่งเคส', best: 'ช่วยตีโจทย์', cannot: 'ไม่ทำงานแทน',
  contactLine: 'mentor.line', profile: applicationProfile, price: { amount: 300, unit: 'ชั่วโมง' },
};

test('the new mentor application: validation, approval, and a mentor who can be matched at once', async (t) => {
  const listed = `${prefix}-listed`;
  await db.insert(competitions).values({
    id: `${listed}-id`, slug: listed, name: `${prefix} งานในระบบ`, description: 'ทดสอบ', type: 'contest', kind: 'hackathon', org: 'ทีมทดสอบ', closesAt: '2099-01-01',
    region: 'online', prizeValue: 0, prizeNote: 'ใบประกาศ', teamMin: 1, teamMax: 3, keywords: [],
    sourceUrl: 'https://example.test', source: 'editorial', lastVerifiedAt: '2026-09-30',
  });
  const typedName = `${prefix} Case Cup`;
  const applicant = await account();
  const admin = await account('admin');
  let submissionId = '';
  try {
    await t.test('rejects incomplete profiles, bad prices, bad evidence and missing award names; messages follow the page language', async () => {
      const post = (body: object, lang = 'th') => send('POST', '/submissions/mentor', applicant.cookie, { ...base, awards: [applicationAward()], ...body }, { lang });
      assert.equal((await post({ awards: [] })).status, 400);
      // โปรไฟล์ยังขาดหมวด B (ไม่มีทักษะ)
      const noSkills = await post({ profile: { ...applicationProfile, skills: [] } }, 'en');
      assert.equal(noSkills.status, 400);
      assert.equal((await noSkills.json()).error, 'Fill in every part of your profile.');
      const noSkillsTh = await post({ profile: { ...applicationProfile, skills: [] } });
      assert.equal((await noSkillsTh.json()).error, 'กรอกโปรไฟล์ให้ครบทุกหมวด');
      // ราคาคิดเงินต้องบอกหน่วย
      const noUnit = await post({ price: { amount: 500, unit: '' } }, 'en');
      assert.equal((await noUnit.json()).error, 'Say what the price is per, for example per hour or per project.');
      // ชนะต้องบอกชื่อรางวัล บทบาทอื่นต้องบอกว่าอะไร ต้องบอกสิ่งที่รับผิดชอบ
      assert.equal((await post({ awards: [applicationAward({ result: 'winner' })] })).status, 400);
      assert.equal((await post({ awards: [applicationAward({ role: 'other' })] })).status, 400);
      assert.equal((await post({ awards: [applicationAward({ responsibility: '' })] })).status, 400);
      // ประสบการณ์ที่ส่งต่อให้ทีมรุ่นต่อไปบังคับกรอก
      const noLessons = await post({ awards: [applicationAward({ lessons: '' })] }, 'en');
      assert.equal((await noLessons.json()).error, 'Say what you can pass on to the next teams.');
      assert.equal((await post({ awards: [applicationAward({ kind: 'sports' })] })).status, 400);
      // ปีในอนาคตไม่ได้
      assert.equal((await post({ awards: [applicationAward({ year: '2599' })] })).status, 400);
      // ลิงก์หลักฐานต้องเป็น https (กันลิงก์อันตรายในหน้า admin)
      assert.equal((await post({ awards: [applicationAward({ evidence: 'javascript:alert(1)' })] })).status, 400);
      assert.equal((await post({ awards: [applicationAward({ evidence: 'java\tscript:alert(1)' })] })).status, 400);
      assert.equal((await post({ awards: [applicationAward({ evidence: 'http://example.test/x' })] })).status, 400);
      // ไม่มีทั้งไฟล์และลิงก์
      const [photo] = await fakeUploads(applicant.id, 1);
      const none = await send('POST', '/submissions/mentor', applicant.cookie,
        { ...base, photoFileId: photo, awards: [applicationAward({ evidence: '' })] }, { raw: true, lang: 'en' });
      assert.equal((await none.json()).error, 'Add an evidence file or link for every competition.');
      // ไฟล์ต้องเป็นของผู้สมัครเอง รูปโปรไฟล์ต้องเป็นรูปภาพ
      const [theirs] = await fakeUploads(admin.id, 1);
      assert.equal((await send('POST', '/submissions/mentor', applicant.cookie,
        { ...base, photoFileId: photo, awards: [applicationAward({ evidenceFileIds: [theirs] })] }, { raw: true })).status, 400);
      const [pdf] = await fakeUploads(applicant.id, 1, 'application/pdf');
      assert.equal((await send('POST', '/submissions/mentor', applicant.cookie,
        { ...base, photoFileId: pdf, awards: [applicationAward()] }, { raw: true })).status, 400);
    });

    await t.test('stores the profile, one price and detailed experiences', async () => {
      const response = await send('POST', '/submissions/mentor', applicant.cookie, {
        ...base,
        awards: [
          applicationAward({ title: `${prefix} งานในระบบ`, competitionSlug: listed, result: 'winner', detail: 'ชนะเลิศ', role: 'leader' }),
          // งานนอกระบบ หลักฐานเป็นลิงก์อย่างเดียวก็ได้
          applicationAward({ title: typedName, kind: 'case', result: 'other', detail: 'Top 5', role: 'other', roleOther: 'Analyst', lessons: 'วางโครงก่อนทำสไลด์' }),
        ],
      });
      assert.equal(response.status, 201, await response.clone().text());
      submissionId = (await response.json()).id;
      const [row] = await db.select().from(mentorSubmissions).where(eq(mentorSubmissions.id, submissionId));
      assert.deepEqual([row.price, row.priceUnit, row.minutes, row.profile?.headline], [300, 'ชั่วโมง', null, applicationProfile.headline]);
      assert.deepEqual(row.competitionIds, [`${listed}-id`]);
      const awards = await db.select().from(mentorAwards).where(eq(mentorAwards.submissionId, submissionId));
      const typed = awards.find((award) => award.title === typedName)!;
      assert.deepEqual([typed.kind, typed.result, typed.role, typed.roleOther, typed.lessons, typed.wantsMentor], ['case', 'other', 'other', 'Analyst', 'วางโครงก่อนทำสไลด์', false]);
      // ชื่องานนอกระบบเข้ารายชื่อทันทีที่ส่งใบ (แค่ชื่อ) ผู้สมัครคนถัดไปค้นเจอ (เจ้าของสั่ง 28 ต.ค. 2569)
      assert.equal((await db.select().from(hackathonNames).where(eq(hackathonNames.name, typedName))).length, 1);
    });

    await t.test('the admin sees the profile; approval makes a complete, matchable mentor', async () => {
      const detail = await (await send('GET', `/admin/mentor-submissions/${submissionId}`, admin.cookie)).json();
      assert.equal(detail.submission.profile.skills.length, 2);
      assert.equal(detail.submission.priceUnit, 'ชั่วโมง');

      const decided = await send('POST', `/admin/mentor-submissions/${submissionId}/decision`, admin.cookie, { decision: 'publish', checks: mentorChecks });
      assert.equal(decided.status, 200, await decided.clone().text());
      const [row] = await db.select().from(mentorSubmissions).where(eq(mentorSubmissions.id, submissionId));
      const mentorId = row.publishedMentorId!;
      const [mentor] = await db.select().from(mentors).where(eq(mentors.id, mentorId));
      assert.deepEqual([mentor.headline, mentor.country, mentor.price, mentor.priceUnit, mentor.acceptingRequests, mentor.replyHours, mentor.mode],
        [applicationProfile.headline, 'TH', 300, 'ชั่วโมง', true, 24, 'online']);
      assert.deepEqual(mentor.helpsWith, ['coding', 'case_analysis']);
      const skills = await db.select().from(mentorSkills).where(eq(mentorSkills.mentorId, mentorId));
      assert.deepEqual(skills.map((skill) => `${skill.tag}:${skill.level}`).sort(), ['react:expert', 'strategy:advanced']);

      // ประสบการณ์ผ่านการตรวจพร้อมใบ ช่องละเอียดตามมาครบ งานนอกระบบผูกกับรายชื่อเติมคำอัตโนมัติ
      const experiences = await db.select().from(mentorExperiences).where(eq(mentorExperiences.mentorId, mentorId));
      assert.equal(experiences.length, 2);
      assert.ok(experiences.every((exp) => exp.status === 'verified' && exp.reviewedBy === admin.id));
      const inSystem = experiences.find((exp) => exp.competitionId === `${listed}-id`)!;
      assert.deepEqual([inSystem.result, inSystem.detail, inSystem.role, inSystem.evidenceUrl], ['winner', 'ชนะเลิศ', 'leader', 'https://example.test/proof']);
      const typed = experiences.find((exp) => exp.hackathonNameId)!;
      assert.deepEqual([typed.name, typed.kind, typed.competitionId], [typedName, 'case', null]);
      const suggest = await (await send('GET', `/hackathon-names?q=${encodeURIComponent(typedName)}`, applicant.cookie)).json() as { items: { name: string }[] };
      assert.ok(suggest.items.some((item) => item.name === typedName));

      // งานในระบบที่เคยแข่งกลายเป็นงานที่รับปรึกษา ด้วยราคาเดียวของเมนเทอร์
      const choices = await db.select().from(mentorCompetitionChoices).where(eq(mentorCompetitionChoices.mentorId, mentorId));
      assert.deepEqual(choices.map((choice) => [choice.competitionId, choice.price, choice.unit]), [[`${listed}-id`, 300, 'ชั่วโมง']]);

      // Mentor zone ไม่มีแถบเตือนกรอกไม่ครบ
      const zone = await (await send('GET', '/consult/zone/profile', applicant.cookie)).json() as { complete: boolean; missing: string[] };
      assert.deepEqual([zone.complete, zone.missing], [true, []]);
      // หน้าโปรไฟล์สาธารณะแสดงโปรไฟล์และประสบการณ์ที่ตรวจแล้ว ไม่มีเพศ
      const page = await (await app.request(`/api/consult/mentors/${mentorId}`)).json();
      assert.equal(page.profile.headline, applicationProfile.headline);
      assert.equal(page.profile.gender, undefined);
      assert.equal(page.experiences.length, 2);
    });
  } finally {
    const [row] = submissionId ? await db.select().from(mentorSubmissions).where(eq(mentorSubmissions.id, submissionId)) : [];
    if (row?.publishedMentorId) await db.delete(mentors).where(eq(mentors.id, row.publishedMentorId));
    if (submissionId) {
      await db.delete(reviewEvents).where(eq(reviewEvents.targetId, submissionId));
      await db.delete(mentorSubmissions).where(eq(mentorSubmissions.id, submissionId));
    }
    await db.delete(hackathonNames).where(like(hackathonNames.name, `${prefix}%`));
    await db.delete(competitions).where(eq(competitions.slug, listed));
    await db.delete(emailLog).where(eq(emailLog.to, base.email));
    await db.delete(staffAlerts).where(inArray(staffAlerts.actorId, userIds));
    await db.delete(sessions).where(inArray(sessions.userId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
    await client.end();
  }
});
