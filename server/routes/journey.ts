import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { bookings, bookingEvents, chatMembers, chatRooms, competitions, mentorAwards, mentorCompetitionChoices, mentorMatchAudit, mentors, mentorSlots, mentorSubmissions } from '../db/schema.js';
import { requireUser, requireReviewer, type AppEnv } from '../lib/guards.js';
import { newId } from '../lib/id.js';
import { env } from '../lib/env.js';
import { scoreThemes, RULE_VERSION, themes } from '../../src/data/focus.js';

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
const liveBooking = sql`(${bookings.status} = 'confirmed' OR (${bookings.status} = 'pending' AND ${bookings.expiresAt} > clock_timestamp()))`;
async function freeSlots(mentorId: string) {
  return db.select().from(mentorSlots).where(and(eq(mentorSlots.mentorId,mentorId),eq(mentorSlots.cancelled,false),sql`${mentorSlots.startsAt} > clock_timestamp()`,sql`NOT EXISTS (SELECT 1 FROM bookings b JOIN mentor_slots held ON held.id = b.slot_id WHERE b.mentor_id = ${mentorSlots.mentorId} AND held.starts_at < ${mentorSlots.endsAt} AND held.ends_at > ${mentorSlots.startsAt} AND (b.status = 'confirmed' OR (b.status = 'pending' AND b.expires_at > clock_timestamp())))`)).orderBy(mentorSlots.startsAt);
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
  return { id:row.mentor.id, name:row.mentor.name, avatar:row.mentor.avatar, bio:row.mentor.bio, experience:row.submission.experience, best:row.mentor.best, cannot:row.mentor.cannot, topics:row.submission.topics, scores, awards:awards.filter(a=>a.verifiedBy && a.verifiedAt).map(a=>({title:a.title,year:a.year,themes:a.verifiedThemes})), slots:await freeSlots(row.mentor.id) };
}
async function event(slug: string) {
  const [event] = await db.select().from(competitions).where(and(eq(competitions.slug,slug),sql`${competitions.kind} is not null`,sql`cardinality(${competitions.themes}) > 0`));
  return event ?? fail('ไม่พบงานที่จัดประเภทแล้ว',404);
}
async function eligible(mentorId: string, competitionId: string, eventThemes: string[]) {
  const [row] = await approved(mentorId); if (!row) return null;
  const [choice] = await db.select().from(mentorCompetitionChoices).where(and(eq(mentorCompetitionChoices.mentorId,mentorId),eq(mentorCompetitionChoices.competitionId,competitionId)));
  if (choice?.choice === 'exclude') return null;
  const info = await mentorInfo(row);
  const matching = info.scores.filter(s=>s.active && eventThemes.includes(s.theme));
  if (choice?.choice !== 'help' && !matching.length) return null;
  return { ...info, direct:choice?.choice === 'help', matchCount:matching.length, matchScore:matching.reduce((n,s)=>n+s.score,0), reasons:[...(choice?.choice === 'help' ? ['เลือกช่วยงานนี้'] : []), ...matching.map(s=>`${s.reasons.some(r=>r.startsWith('ผลงาน'))?'ผลงานที่ตรวจแล้วตรงหมวด':'ความถนัดตรงหมวด'}${themes[s.theme]}`)] };
}
journey.get('/competitions/:slug/mentors', async c => {
  const e = await event(c.req.param('slug'));
  const rows = await approved();
  const items = (await Promise.all(rows.map(r=>eligible(r.mentor.id,e.id,e.themes)))).filter((x): x is NonNullable<typeof x> => !!x && x.slots.length>0);
  items.sort((a,b)=>Number(b.direct)-Number(a.direct)||b.matchCount-a.matchCount||b.matchScore-a.matchScore||a.slots[0].startsAt.getTime()-b.slots[0].startsAt.getTime()||a.id.localeCompare(b.id));
  return c.json({items});
});
journey.get('/mentors/:id', async c => {
  const [row] = await approved(c.req.param('id')); if (!row) return fail('ไม่พบเมนเทอร์',404);
  const slug = c.req.query('competition');
  if (slug) { const e=await event(slug); return c.json({mentor:await mentorInfo(row),match:await eligible(row.mentor.id,e.id,e.themes),competition:{id:e.id,slug:e.slug,name:e.name}}); }
  return c.json({mentor:await mentorInfo(row),match:null,competition:null});
});

async function bookingList(userId: string) {
  const rows=await db.select({booking:bookings,slot:mentorSlots,eventName:competitions.name,mentorName:mentors.name}).from(bookings).innerJoin(mentorSlots,eq(bookings.slotId,mentorSlots.id)).innerJoin(competitions,eq(bookings.competitionId,competitions.id)).innerJoin(mentors,eq(bookings.mentorId,mentors.id)).where(sql`${bookings.ownerId} = ${userId} OR ${bookings.mentorUserId} = ${userId}`).orderBy(mentorSlots.startsAt);
  const [{now}] = await db.select({now:sql<string>`clock_timestamp()`}).from(sql`(select 1) t`);
  return rows.map(r=>({...r.booking,startsAt:r.slot.startsAt,endsAt:r.slot.endsAt,eventName:r.eventName,mentorName:r.mentorName,status:r.booking.status==='pending' && r.booking.expiresAt<=new Date(now)?'expired':r.booking.status==='confirmed' && r.slot.endsAt<=new Date(now)?'elapsed':r.booking.status}));
}
journey.get('/profile',requireUser, async c=>{
  const user=c.get('user')!;
  const applications=await db.select({id:mentorSubmissions.id,status:mentorSubmissions.status,submittedAt:mentorSubmissions.submittedAt}).from(mentorSubmissions).where(eq(mentorSubmissions.userId,user.id));
  const row=(await approved()).find(r=>r.submission.userId===user.id);
  const choices=row?await db.select().from(mentorCompetitionChoices).where(eq(mentorCompetitionChoices.mentorId,row.mentor.id)):[];
  const slots=row?await db.select().from(mentorSlots).where(and(eq(mentorSlots.mentorId,row.mentor.id),eq(mentorSlots.cancelled,false),sql`${mentorSlots.startsAt} > clock_timestamp()`)).orderBy(mentorSlots.startsAt):[];
  return c.json({user,applications,mentor:row?{...await mentorInfo(row),confirmedThemes:row.mentor.confirmedThemes,disabledThemes:row.mentor.disabledThemes}:null,choices,slots,bookings:await bookingList(user.id)});
});
journey.post('/profile/themes',requireUser,async c=>{
  const row=await myMentor(c.get('user')!.id);
  const p=await body(c,z.object({confirmed:themeList,disabled:themeList}));
  await db.update(mentors).set({confirmedThemes:p.confirmed.filter(t=>!p.disabled.includes(t)),disabledThemes:p.disabled}).where(eq(mentors.id,row.mentor.id));
  return c.json({ok:true});
});
journey.post('/profile/choices',requireUser,async c=>{
  const row=await myMentor(c.get('user')!.id);
  const p=await body(c,z.object({slug:z.string(),choice:z.enum(['help','exclude','auto'])})); const e=await event(p.slug);
  await db.transaction(async tx=>{await tx.select().from(mentors).where(eq(mentors.id,row.mentor.id)).for('update');
    await tx.insert(mentorCompetitionChoices).values({mentorId:row.mentor.id,competitionId:e.id,choice:p.choice}).onConflictDoUpdate({target:[mentorCompetitionChoices.mentorId,mentorCompetitionChoices.competitionId],set:{choice:p.choice,updatedAt:new Date()}});
  });return c.json({ok:true});
});
journey.post('/profile/slots',requireUser,async c=>{
  const row=await myMentor(c.get('user')!.id); const p=await body(c,z.object({startsAt:z.string().datetime({offset:true})}));
  const start=new Date(p.startsAt),end=new Date(start.getTime()+3600000);
  await db.transaction(async tx=>{
    await tx.select().from(mentors).where(eq(mentors.id,row.mentor.id)).for('update');
    const [clock]=await tx.execute(sql`SELECT clock_timestamp() as now`);
    if(start<=new Date(String(clock.now))) return fail('เลือกเวลาในอนาคต');
    const clashes=await tx.select().from(mentorSlots).where(and(eq(mentorSlots.mentorId,row.mentor.id),eq(mentorSlots.cancelled,false),sql`${mentorSlots.startsAt} < ${end.toISOString()} AND ${mentorSlots.endsAt} > ${start.toISOString()}`));
    if(clashes.length) return fail('เวลานี้ทับกับช่องเวลาที่เปิดไว้',409);
    await tx.insert(mentorSlots).values({id:newId('slot'),mentorId:row.mentor.id,startsAt:start,endsAt:end});
  });return c.json({ok:true},201);
});
journey.delete('/profile/slots/:id',requireUser,async c=>{
  const row=await myMentor(c.get('user')!.id);
  await db.transaction(async tx=>{await tx.select().from(mentors).where(eq(mentors.id,row.mentor.id)).for('update');
    const active=await tx.select().from(bookings).where(and(eq(bookings.slotId,c.req.param('id')),liveBooking));
    if(active.length)return fail('มีคำขอหรือนัดในช่องนี้ ต้องยกเลิกนัดก่อน',409);
    await tx.update(mentorSlots).set({cancelled:true}).where(and(eq(mentorSlots.id,c.req.param('id')),eq(mentorSlots.mentorId,row.mentor.id)));
  });return c.json({ok:true});
});
journey.post('/bookings',requireUser,async c=>{
  const p=await body(c,z.object({mentorId:z.string(),competition:z.string(),slotId:z.string(),title:z.string().trim().min(1).max(80),context:z.string().trim().min(1).max(1500)}));
  const e=await event(p.competition);const user=c.get('user')!;
  const [row]=await approved(p.mentorId);if(!row)return fail('เมนเทอร์ยังไม่พร้อมรับคำขอ',409);
  if(row.submission.userId===user.id)return fail('ไม่สามารถจองตัวเองได้');
  const match=await eligible(p.mentorId,e.id,e.themes);if(!match)return fail('เมนเทอร์ไม่พร้อมช่วยงานนี้',409);
  const id=newId('book');
  await db.transaction(async tx=>{
    await tx.select().from(mentors).where(eq(mentors.id,p.mentorId)).for('update');
    const [choice]=await tx.select().from(mentorCompetitionChoices).where(and(eq(mentorCompetitionChoices.mentorId,p.mentorId),eq(mentorCompetitionChoices.competitionId,e.id)));
    if(choice?.choice==='exclude')return fail('เมนเทอร์ไม่รับงานนี้',409);
    const [slot]=await tx.select().from(mentorSlots).where(and(eq(mentorSlots.id,p.slotId),eq(mentorSlots.mentorId,p.mentorId),eq(mentorSlots.cancelled,false),sql`${mentorSlots.startsAt}>clock_timestamp()`));
    if(!slot)return fail('ช่องเวลานี้ไม่ว่างแล้ว',409);
    const active=await tx.select().from(bookings).where(and(eq(bookings.mentorId,p.mentorId),liveBooking));
    if(active.some(b=>b.slotId===p.slotId))return fail('มีทีมอื่นขอจองเวลานี้แล้ว',409);
    const overlaps=await tx.select({id:bookings.id}).from(bookings).innerJoin(mentorSlots,eq(bookings.slotId,mentorSlots.id))
      .where(and(eq(bookings.mentorId,p.mentorId),liveBooking,sql`${mentorSlots.startsAt}<${slot.endsAt.toISOString()} AND ${mentorSlots.endsAt}>${slot.startsAt.toISOString()}`));
    if(overlaps.length)return fail('เวลานี้ทับกับคำขอหรือนัดอื่นแล้ว',409);
    if(active.some(b=>b.status==='pending'&&b.ownerId===user.id&&b.competitionId===e.id))return fail('มีคำขอรอยืนยันสำหรับงานนี้แล้ว',409);
    await tx.insert(bookings).values({id,ownerId:user.id,mentorId:p.mentorId,mentorUserId:row.submission.userId!,competitionId:e.id,slotId:slot.id,title:p.title,context:p.context,updatedBy:user.id,expiresAt:sql`least(clock_timestamp()+interval '24 hours', ${slot.startsAt.toISOString()}::timestamptz)`});
    await tx.insert(bookingEvents).values({id:newId('be'),bookingId:id,actorId:user.id,action:'requested'});
  });return c.json({id},201);
});
journey.post('/bookings/:id/respond',requireUser,async c=>{
  const p=await body(c,z.object({action:z.enum(['accept','decline','cancel']),reason:z.string().trim().max(1000).default(''),noConflict:z.boolean().optional()}));
  const user=c.get('user')!;let roomId:string|null=null;
  await db.transaction(async tx=>{
    const [initial]=await tx.select().from(bookings).where(eq(bookings.id,c.req.param('id')));if(!initial)return fail('ไม่พบนัด',404);
    if(![initial.ownerId,initial.mentorUserId].includes(user.id))return fail('ไม่มีสิทธิ์',403);
    await tx.select().from(mentors).where(eq(mentors.id,initial.mentorId)).for('update');
    const [b]=await tx.select().from(bookings).where(eq(bookings.id,initial.id)).for('update');
    const [slot]=await tx.select().from(mentorSlots).where(eq(mentorSlots.id,b.slotId));
    const [clock]=await tx.execute(sql`SELECT clock_timestamp() as now`);const now=new Date(String(clock.now));
    if(p.action==='accept' && b.status==='confirmed' && user.id===b.mentorUserId){roomId=b.roomId;return;}
    if(slot.startsAt<=now || !['pending','confirmed'].includes(b.status) || (b.status==='pending'&&b.expiresAt<=now))return fail('คำขอหมดอายุหรือดำเนินการแล้ว',409);
    if(p.action!=='cancel'&&(user.id!==b.mentorUserId||b.status!=='pending'))return fail('เมนเทอร์เท่านั้นที่ตอบคำขอได้',403);
    if(p.action!=='accept'&&!p.reason)return fail('กรอกเหตุผล');
    if(p.action==='accept'){
      if(!p.noConflict)return fail('ต้องยืนยันว่าไม่ได้เป็นกรรมการตัดสินทีมนี้');
      const [approval]=await tx.select().from(mentorSubmissions).where(and(eq(mentorSubmissions.publishedMentorId,b.mentorId),eq(mentorSubmissions.userId,user.id),eq(mentorSubmissions.status,'published')));
      const [choice]=await tx.select().from(mentorCompetitionChoices).where(and(eq(mentorCompetitionChoices.mentorId,b.mentorId),eq(mentorCompetitionChoices.competitionId,b.competitionId)));
      if(!approval||choice?.choice==='exclude'||slot.cancelled)return fail('เมนเทอร์ไม่พร้อมรับงานนี้',409);
      const clash=await tx.select().from(bookings).innerJoin(mentorSlots,eq(bookings.slotId,mentorSlots.id)).where(and(eq(bookings.mentorId,b.mentorId),eq(bookings.status,'confirmed'),sql`${mentorSlots.startsAt}<${slot.endsAt.toISOString()} AND ${mentorSlots.endsAt}>${slot.startsAt.toISOString()}`));
      if(clash.length)return fail('มีนัดยืนยันที่ทับซ้อน',409);
      const [room]=await tx.select().from(chatRooms).where(and(eq(chatRooms.ownerId,b.ownerId),eq(chatRooms.mentorId,b.mentorId),eq(chatRooms.competitionId,b.competitionId),eq(chatRooms.status,'active')));
      roomId=room?.id??newId('room');
      if(!room){await tx.insert(chatRooms).values({id:roomId,ownerId:b.ownerId,mentorUserId:b.mentorUserId,mentorId:b.mentorId,competitionId:b.competitionId,title:b.title,context:b.context,status:'active'});await tx.insert(chatMembers).values([{roomId,userId:b.ownerId},{roomId,userId:b.mentorUserId}]);}
    }
    await tx.update(bookings).set({status:p.action==='accept'?'confirmed':p.action==='decline'?'declined':'cancelled',reason:p.reason,roomId:roomId??b.roomId,updatedBy:user.id,updatedAt:now}).where(eq(bookings.id,b.id));
    await tx.insert(bookingEvents).values({id:newId('be'),bookingId:b.id,actorId:user.id,action:p.action,reason:p.reason});
  });return c.json({ok:true,roomId});
});
journey.post('/awards/:id/verify',requireReviewer,async c=>{
  const p=await body(c,z.object({themes:themeList}));
  const [a]=await db.update(mentorAwards).set({verifiedThemes:p.themes,verifiedBy:p.themes.length?c.get('user')!.id:null,verifiedAt:p.themes.length?new Date():null}).where(eq(mentorAwards.id,c.req.param('id'))).returning({id:mentorAwards.id});
  if(!a)return fail('ไม่พบหลักฐาน',404);return c.json({ok:true});
});
