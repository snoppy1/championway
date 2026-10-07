import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { mentorAwards, mentorCompetitionChoices, mentorMatchAudit, mentors, mentorSubmissions, reviewEvents } from '../db/schema.js';
import { requireUser, requireReviewer, type AppEnv } from '../lib/guards.js';
import { env } from '../lib/env.js';
import { scoreThemes, RULE_VERSION } from '../../src/data/focus.js';

export const journey = new Hono<AppEnv>();
journey.use('*', async (c, next) => {
  c.header('Cache-Control', 'private, no-store');
  const origin = c.req.header('origin');
  if (c.req.method !== 'GET' && origin && origin !== env.appOrigin) return c.json({ error: 'คำขอต้องมาจากเว็บนี้' }, 403);
  await next();
});
const fail = (message: string, status: 400 | 403 | 404 | 409 = 400): never => { throw new HTTPException(status, { message }); };
const themeList = z.array(z.enum(['innovation','business','education','medical'])).max(4).transform(x => [...new Set(x)]);
async function body<T>(c: { req: { json: () => Promise<unknown> } }, schema: z.ZodType<T>) {
  const p = schema.safeParse(await c.req.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง');
  return p.data;
}
async function approved(id?: string) {
  return db.select({ mentor: mentors, submission: mentorSubmissions }).from(mentors)
    .innerJoin(mentorSubmissions, and(eq(mentorSubmissions.publishedMentorId, mentors.id), eq(mentorSubmissions.status, 'published')))
    .where(and(sql`${mentorSubmissions.userId} is not null`, id ? eq(mentors.id,id) : undefined));
}
async function myMentor(userId: string) {
  const rows = await approved();
  return rows.find(r => r.submission.userId === userId) ?? fail('ต้องเป็นเมนเทอร์ที่ผ่านอนุมัติ',403);
}
async function mentorInfo(row: Awaited<ReturnType<typeof approved>>[number]) {
  const awards = await db.select().from(mentorAwards).where(eq(mentorAwards.submissionId,row.submission.id));
  const verified = [...new Set(awards.filter(a=>a.verifiedBy && a.verifiedAt).flatMap(a=>a.verifiedThemes))];
  const scores = scoreThemes({ experience: row.submission.experience, best: row.mentor.best, confirmed: row.mentor.confirmedThemes, disabled: row.mentor.disabledThemes, verified });
  // Refresh only on changed inputs/results; never write an audit on every poll.
  const [audit] = await db.select().from(mentorMatchAudit).where(eq(mentorMatchAudit.mentorId,row.mentor.id));
  if (!audit || audit.version !== RULE_VERSION || JSON.stringify(audit.scores) !== JSON.stringify(scores)) {
    await db.transaction(async tx => {
      // Keep the parent alive until the audit write finishes; a removed mentor is skipped.
      const [parent] = await tx.select({id:mentors.id}).from(mentors).where(eq(mentors.id,row.mentor.id)).for('key share');
      if (!parent) return;
      await tx.insert(mentorMatchAudit).values({mentorId:row.mentor.id,version:RULE_VERSION,scores}).onConflictDoUpdate({target:mentorMatchAudit.mentorId,set:{version:RULE_VERSION,scores,updatedAt:new Date()}});
    });
  }
  return { id:row.mentor.id, name:row.mentor.name, avatar:row.mentor.avatar, bio:row.mentor.bio, experience:row.submission.experience, best:row.mentor.best, cannot:row.mentor.cannot, topics:row.submission.topics, scores, awards:awards.filter(a=>a.verifiedBy && a.verifiedAt).map(a=>({title:a.title,year:a.year,themes:a.verifiedThemes})) };
}
/* รายชื่อเมนเทอร์ของงานและหน้าเมนเทอร์ย้ายไป routes/consult.ts แล้ว */

journey.get('/profile',requireUser, async c=>{
  const user=c.get('user')!;
  const rows=await db.select({id:mentorSubmissions.id,status:mentorSubmissions.status,submittedAt:mentorSubmissions.submittedAt}).from(mentorSubmissions).where(eq(mentorSubmissions.userId,user.id));
  // ใบที่ทีมงานขอข้อมูลเพิ่ม แนบข้อความที่ขอล่าสุดไปด้วย ผู้สมัครจะได้รู้ว่าต้องแก้อะไร (ผู้ใช้ขอ 7 ต.ค. 2569)
  const asked=rows.some(r=>r.status==='info')?await db.select({targetId:reviewEvents.targetId,note:reviewEvents.note}).from(reviewEvents)
    .where(and(eq(reviewEvents.target,'mentor'),eq(reviewEvents.decision,'info'),inArray(reviewEvents.targetId,rows.filter(r=>r.status==='info').map(r=>r.id)))).orderBy(desc(reviewEvents.createdAt)):[];
  const applications=rows.map(r=>({...r,note:r.status==='info'?asked.find(e=>e.targetId===r.id)?.note??'':''}));
  const row=(await approved()).find(r=>r.submission.userId===user.id);
  const choices=row?await db.select().from(mentorCompetitionChoices).where(eq(mentorCompetitionChoices.mentorId,row.mentor.id)):[];
  return c.json({user,applications,mentor:row?{...await mentorInfo(row),confirmedThemes:row.mentor.confirmedThemes,disabledThemes:row.mentor.disabledThemes}:null,choices});
});
journey.post('/profile/themes',requireUser,async c=>{
  const row=await myMentor(c.get('user')!.id);
  const p=await body(c,z.object({confirmed:themeList,disabled:themeList}));
  await db.update(mentors).set({confirmedThemes:p.confirmed.filter(t=>!p.disabled.includes(t)),disabledThemes:p.disabled}).where(eq(mentors.id,row.mentor.id));
  return c.json({ok:true});
});
/* เลือกงานที่รับปรึกษาย้ายไป Mentor zone (PUT /api/consult/zone/competitions/:slug) พร้อมราคา */
/* ช่องเวลา การจอง และห้องแชตปิดแล้ว นักเรียนติดต่อเมนเทอร์นอกเว็บผ่าน routes/consult.ts */
journey.post('/awards/:id/verify',requireReviewer,async c=>{
  const p=await body(c,z.object({themes:themeList}));
  const [a]=await db.update(mentorAwards).set({verifiedThemes:p.themes,verifiedBy:p.themes.length?c.get('user')!.id:null,verifiedAt:p.themes.length?new Date():null}).where(eq(mentorAwards.id,c.req.param('id'))).returning({id:mentorAwards.id});
  if(!a)return fail('ไม่พบหลักฐาน',404);return c.json({ok:true});
});
