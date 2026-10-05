import { relations, sql } from 'drizzle-orm';
import {
  boolean, check, date, index, integer, jsonb, pgEnum, pgTable, primaryKey, smallint, text, timestamp, uniqueIndex,
} from 'drizzle-orm/pg-core';

/* คำศัพท์ที่มีชุดตายตัวทำเป็น enum ในฐานข้อมูล ไม่ใช่ text เปล่า เพื่อให้ฐานข้อมูล
   ปฏิเสธค่าที่ไม่มีอยู่จริงเอง ไม่ต้องหวังพึ่งการตรวจในโค้ดอย่างเดียว
   ชุดค่าต้องตรงกับ src/data/competitions.ts เสมอ */

export const categoryEnum = pgEnum('category', [
  'writing', 'performing', 'film', 'education', 'academic', 'marketing', 'technology',
  'design', 'health', 'society', 'environment', 'food', 'business',
]);
export const levelEnum = pgEnum('level', ['primary', 'secondary', 'university', 'open']);
export const opportunityTypeEnum = pgEnum('opportunity_type', ['contest', 'camp', 'workshop', 'scholarship', 'internship']);
export const regionEnum = pgEnum('region', ['online', 'bangkok', 'central', 'north', 'northeast', 'east', 'south']);
export const rewardEnum = pgEnum('reward', ['certificate', 'trophy', 'publish', 'internship', 'partnership']);
export const sourceEnum = pgEnum('source', ['editorial', 'organiser', 'partner']);
export const submissionStatusEnum = pgEnum('submission_status', ['pending', 'info', 'published', 'rejected']);
export const userRoleEnum = pgEnum('user_role', ['member', 'reviewer', 'admin']);
export const decisionEnum = pgEnum('decision', ['publish', 'info', 'reject']);
export const targetEnum = pgEnum('review_target', ['competition', 'mentor']);

/* ผู้ใช้มีตารางเดียว ไม่แยกตามบทบาท ผู้จัดงานกับผู้สมัครเมนเทอร์คือสมาชิกที่ส่งใบเข้ามา
   บทบาทที่มีอำนาจคือ reviewer กับ admin ซึ่งตั้งให้ด้วยมือเท่านั้น ไม่มีทางสมัครเอาเอง */
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  /** ว่างได้ เพราะคนที่สมัครผ่าน Google ไม่มีรหัสผ่านในระบบเรา */
  passwordHash: text('password_hash'),
  /** sub ของ Google ใช้ผูกบัญชี ไม่ใช้อีเมลเพราะอีเมลเปลี่ยนได้ */
  googleId: text('google_id'),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  role: userRoleEnum('role').notNull().default('member'),
  /* โปรไฟล์ที่เจ้าตัวกรอกเอง ว่างได้ทุกช่อง เพราะคนที่เพิ่งสมัครยังไม่ได้กรอก
     ใช้คำเดียวกับใบสมัครเมนเทอร์ (สถานะ / ที่สังกัด / ชั้นปีหรือตำแหน่ง)
     วันหลังจะได้เอาไปเติมใบสมัครให้อัตโนมัติโดยไม่ต้องแปลงคำ */
  bio: text('bio'),
  occupation: text('occupation'),
  organization: text('organization'),
  position: text('position'),
  /* ใช้ enum เดียวกับระดับผู้เข้าแข่งของเวที เพื่อให้เทียบกันตรง ๆ ได้ในอนาคต
     ค่า open เป็นของเวทีที่รับทุกระดับ ไม่ใช่ของคน ฝั่งเซิร์ฟเวอร์จึงรับแค่สามค่าแรก */
  educationLevel: levelEnum('education_level'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('users_email_key').on(table.email),
  uniqueIndex('users_google_key').on(table.googleId),
]);

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('sessions_user_idx').on(table.userId)]);

/* ---------- เวทีที่เผยแพร่แล้ว ---------- */

export const competitions = pgTable('competitions', {
  kind: text('kind').$type<'hackathon' | 'case_competition'>(),
  themes: text('themes').array().notNull().default([]),
  id: text('id').primaryKey(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  type: opportunityTypeEnum('type').notNull(),
  org: text('org').notNull(),
  closesAt: date('closes_at').notNull(),
  opensAt: date('opens_at'),
  eventDate: date('event_date'),
  region: regionEnum('region').notNull(),
  venue: text('venue'),
  /** 0 คือไม่มีเงินรางวัล ป้ายที่แสดงคำนวณจากค่านี้ ไม่เก็บข้อความซ้ำ */
  prizeValue: integer('prize_value').notNull().default(0),
  prizeNote: text('prize_note'),
  fee: integer('fee'),
  teamMin: integer('team_min').notNull(),
  teamMax: integer('team_max').notNull(),
  featured: boolean('featured').notNull().default(false),
  keywords: text('keywords').array().notNull().default([]),
  sourceUrl: text('source_url').notNull().default(''),
  source: sourceEnum('source').notNull(),
  lastVerifiedAt: date('last_verified_at').notNull(),
  registerUrl: text('register_url'),
  /** ห้าส่วนนี้ทีมงานเขียนเอง ผู้จัดไม่ได้กรอกมา จึงว่างได้ */
  overview: text('overview'),
  audience: text('audience'),
  format: text('format').array().notNull().default([]),
  deliverables: text('deliverables').array().notNull().default([]),
  preparation: text('preparation').array().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('competitions_slug_key').on(table.slug),
  index('competitions_closes_idx').on(table.closesAt),
]);

/* หมวด ระดับ และรางวัลแยกเป็นตาราง ไม่ใช่คอลัมน์ JSON เพราะแผงตัวกรองต้องกรอง
   ด้วยสามอย่างนี้ตลอด ถ้าเก็บเป็น JSON จะต้องมาแกะในโค้ดซึ่งช้าและเขียนยากกว่า */

export const competitionCategories = pgTable('competition_categories', {
  competitionId: text('competition_id').notNull().references(() => competitions.id, { onDelete: 'cascade' }),
  category: categoryEnum('category').notNull(),
  /** ลำดับ 0 คือหมวดหลัก ใช้กับสีปกและป้ายบนการ์ด */
  position: integer('position').notNull(),
}, (table) => [
  primaryKey({ columns: [table.competitionId, table.category] }),
  index('competition_categories_cat_idx').on(table.category),
]);

export const competitionLevels = pgTable('competition_levels', {
  competitionId: text('competition_id').notNull().references(() => competitions.id, { onDelete: 'cascade' }),
  level: levelEnum('level').notNull(),
}, (table) => [primaryKey({ columns: [table.competitionId, table.level] })]);

export const competitionRewards = pgTable('competition_rewards', {
  competitionId: text('competition_id').notNull().references(() => competitions.id, { onDelete: 'cascade' }),
  reward: rewardEnum('reward').notNull(),
}, (table) => [primaryKey({ columns: [table.competitionId, table.reward] })]);

/* ---------- ใบที่ผู้จัดส่งเข้ามา ---------- */

export const competitionSubmissions = pgTable('competition_submissions', {
  kind: text('kind').$type<'hackathon' | 'case_competition'>(),
  themes: text('themes').array().notNull().default([]),
  id: text('id').primaryKey(),
  status: submissionStatusEnum('status').notNull().default('pending'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  /** ข้อมูลติดต่อใช้ตรวจสอบเท่านั้น ห้ามส่งออก API สาธารณะ */
  organizerName: text('organizer_name').notNull(),
  contactName: text('contact_name').notNull(),
  contactRole: text('contact_role').notNull(),
  contactEmail: text('contact_email').notNull(),
  contactPhone: text('contact_phone').notNull(),
  organizerUrl: text('organizer_url').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  type: opportunityTypeEnum('type').notNull(),
  teamMin: integer('team_min').notNull(),
  teamMax: integer('team_max').notNull(),
  opensAt: date('opens_at'),
  closesAt: date('closes_at').notNull(),
  eventDate: date('event_date'),
  region: regionEnum('region').notNull(),
  venue: text('venue'),
  prizeValue: integer('prize_value').notNull().default(0),
  prizeNote: text('prize_note'),
  fee: integer('fee'),
  sourceUrl: text('source_url').notNull(),
  registerUrl: text('register_url'),
  /** ตั้งเมื่อใบนี้ถูกเผยแพร่ เพื่อตามรอยกลับได้ว่าเวทีไหนมาจากใบไหน */
  publishedCompetitionId: text('published_competition_id').references(() => competitions.id, { onDelete: 'set null' }),
  /** ว่างได้สำหรับใบที่ทีมงานกรอกแทนผู้จัด */
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
}, (table) => [index('competition_submissions_status_idx').on(table.status, table.submittedAt)]);

export const submissionCategories = pgTable('submission_categories', {
  submissionId: text('submission_id').notNull().references(() => competitionSubmissions.id, { onDelete: 'cascade' }),
  category: categoryEnum('category').notNull(),
  position: integer('position').notNull(),
}, (table) => [primaryKey({ columns: [table.submissionId, table.category] })]);

export const submissionLevels = pgTable('submission_levels', {
  submissionId: text('submission_id').notNull().references(() => competitionSubmissions.id, { onDelete: 'cascade' }),
  level: levelEnum('level').notNull(),
}, (table) => [primaryKey({ columns: [table.submissionId, table.level] })]);

export const submissionRewards = pgTable('submission_rewards', {
  submissionId: text('submission_id').notNull().references(() => competitionSubmissions.id, { onDelete: 'cascade' }),
  reward: rewardEnum('reward').notNull(),
}, (table) => [primaryKey({ columns: [table.submissionId, table.reward] })]);

/* ---------- ใบสมัครเมนเทอร์ ---------- */

export const mentorSubmissions = pgTable('mentor_submissions', {
  id: text('id').primaryKey(),
  status: submissionStatusEnum('status').notNull().default('pending'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  nickname: text('nickname').notNull(),
  /** อีเมลกับเบอร์ใช้ตรวจสอบเท่านั้น ฟอร์มสมัครสัญญากับผู้สมัครไว้แล้ว */
  email: text('email').notNull(),
  phone: text('phone').notNull(),
  occupation: text('occupation').notNull(),
  organization: text('organization').notNull(),
  role: text('role').notNull(),
  experience: text('experience').notNull(),
  portfolio: text('portfolio').notNull().default(''),
  best: text('best').notNull(),
  cannot: text('cannot').notNull(),
  topics: text('topics').array().notNull().default([]),
  price: integer('price'),
  /** ราคาข้างบนคิดต่อกี่นาที เช่น 500 บาท / 60 นาที หรือ 10 บาท / 1 นาที */
  minutes: integer('minutes'),
  /* ช่องทางติดต่อที่นักเรียนเห็นหลังกด Contact Mentor ต้องมีอย่างน้อยหนึ่งช่อง
     แยกจาก email/phone ด้านบนซึ่งใช้ตรวจตัวตนเท่านั้นและห้ามแสดง */
  contactEmail: text('contact_email').notNull().default(''),
  contactLine: text('contact_line').notNull().default(''),
  contactPhone: text('contact_phone').notNull().default(''),
  contactInstagram: text('contact_instagram').notNull().default(''),
  contactLink: text('contact_link').notNull().default(''),
  /** งานแข่งที่ติ๊กไว้ตอนสมัคร จะกลายเป็นงานที่รับปรึกษาเมื่อใบสมัครผ่าน ไม่ติ๊กเลยก็ได้ */
  competitionIds: text('competition_ids').array().notNull().default([]),
  /** ราคาของแต่ละงานที่ติ๊กไว้ (ผู้ใช้ตัดสิน 4 ต.ค. 2569: ราคาขึ้นกับงาน ไม่มีราคากลาง)
      price/minutes เป็น null = ข้ามไว้ ไปใส่ทีหลังใน Mentor zone */
  competitionOffers: jsonb('competition_offers')
    .$type<{ competitionId: string; price: number | null; minutes?: number | null; unit?: string }[]>().notNull().default([]),
  paidSlot: timestamp('paid_slot', { withTimezone: true }),
  freeSlot: timestamp('free_slot', { withTimezone: true }),
  publishedMentorId: text('published_mentor_id'),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
}, (table) => [index('mentor_submissions_status_idx').on(table.status, table.submittedAt)]);

export const mentorAwards = pgTable('mentor_awards', {
  verifiedThemes: text('verified_themes').array().notNull().default([]),
  verifiedBy: text('verified_by').references(() => users.id),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  id: text('id').primaryKey(),
  submissionId: text('submission_id').notNull().references(() => mentorSubmissions.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  /** ว่างได้ เพราะผู้สมัครอ้างเวทีที่ยังไม่มีในระบบได้ กรณีนั้นต้องตรวจด้วยมือ */
  competitionSlug: text('competition_slug'),
  year: text('year').notNull(),
  evidence: text('evidence').notNull(),
  /* ประสบการณ์แข่งขัน (ผู้ใช้ตัดสิน 4 ต.ค. 2569): เป็นเมนเทอร์ของเวทีไหนได้ต้องเคยแข่งเวทีนั้นเอง ผลอะไรก็ได้
     ไม่รับโค้ชหรือกรรมการ รางวัลเป็นป้ายและคะแนนจัดอันดับ ไม่ใช่เงื่อนไข */
  result: text('result').$type<'winner' | 'finalist' | 'participant'>().notNull().default('winner'),
  /** รายละเอียดผล เช่น "รองชนะเลิศอันดับ 1" ไม่บังคับ */
  detail: text('detail').notNull().default(''),
  /** อยากเป็นเมนเทอร์ของเวทีนี้ ติ๊กได้เฉพาะเวทีที่มีในระบบ */
  wantsMentor: boolean('wants_mentor').notNull().default(false),
}, (table) => [
  index('mentor_awards_submission_idx').on(table.submissionId),
  check('mentor_awards_result_check', sql`${table.result} in ('winner', 'finalist', 'participant')`),
]);

/** ประสบการณ์แข่งขันของเมนเทอร์ที่ผ่านการตรวจแล้ว คัดลอกจากใบสมัครตอนอนุมัติ
    ใช้ทำป้ายบนหน้าเวที ("ชนะ 2567") คะแนนจัดอันดับ และเป็นเงื่อนไขว่ารับปรึกษาเวทีไหนได้ */
export const mentorExperiences = pgTable('mentor_experiences', {
  id: text('id').primaryKey(),
  mentorId: text('mentor_id').notNull().references(() => mentors.id, { onDelete: 'cascade' }),
  competitionId: text('competition_id').references(() => competitions.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  result: text('result').$type<'winner' | 'finalist' | 'participant'>().notNull(),
  year: text('year').notNull(),
  detail: text('detail').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('mentor_experiences_mentor_idx').on(table.mentorId),
  index('mentor_experiences_competition_idx').on(table.competitionId),
  // เวทีเดียวกันปีเดียวกันนับครั้งเดียว ใบสมัครที่ใส่ซ้ำหรือคำขอที่อนุมัติซ้ำจะไม่เกิดแถวซ้ำ (Astra รีวิว 4 ต.ค. 2569)
  uniqueIndex('mentor_experiences_once_key').on(table.mentorId, table.competitionId, table.year).where(sql`${table.competitionId} is not null`),
]);

/* ---------- เมนเทอร์ที่ผ่านการตรวจแล้ว ---------- */

export const mentors = pgTable('mentors', {
  confirmedThemes: text('confirmed_themes').array().notNull().default([]),
  disabledThemes: text('disabled_themes').array().notNull().default([]),
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  avatar: text('avatar').notNull(),
  bio: text('bio').notNull(),
  replyTime: text('reply_time').notNull(),
  /** ตั้งได้เมื่อตรวจหลักฐานจริงแล้วเท่านั้น เป็นตัวกำหนดลำดับการจับคู่ */
  wonSlug: text('won_slug'),
  category: categoryEnum('category'),
  topics: integer('topics').array().notNull().default([]),
  price: integer('price'),
  minutes: integer('minutes'),
  /** หน่วยของราคาบนโปรไฟล์ เช่น "ชั่วโมง" ว่าง = ฟรี หรือแถวเก่าที่ใช้นาที */
  priceUnit: text('price_unit').notNull().default(''),
  /* ช่องทางติดต่อ ว่างได้ทุกช่อง (หน้าเว็บแสดง "-")
     เปิดให้เฉพาะคนที่เข้าสู่ระบบและยืนยันอีเมลแล้ว */
  contactEmail: text('contact_email').notNull().default(''),
  contactLine: text('contact_line').notNull().default(''),
  contactPhone: text('contact_phone').notNull().default(''),
  contactInstagram: text('contact_instagram').notNull().default(''),
  contactLink: text('contact_link').notNull().default(''),
  best: text('best').notNull(),
  cannot: text('cannot').notNull(),
  firstSlotInDays: integer('first_slot_in_days').notNull().default(1),
  verified: boolean('verified').notNull().default(false),
  weeklyRank: integer('weekly_rank'),
  weeklyFocus: text('weekly_focus'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ---------- ร่องรอยการตรวจ ---------- */

/** ใบหนึ่งถูกตรวจได้หลายรอบ เช่น ขอข้อมูลเพิ่ม แล้วส่งกลับ แล้วตรวจใหม่
    จึงเป็นตารางแยก ไม่ใช่คอลัมน์ในใบ */
export const reviewEvents = pgTable('review_events', {
  id: text('id').primaryKey(),
  target: targetEnum('target').notNull(),
  targetId: text('target_id').notNull(),
  decision: decisionEnum('decision').notNull(),
  note: text('note').notNull().default(''),
  /** รายการตรวจที่ติ๊กไว้ตอนตัดสิน เก็บไว้เพื่อให้ย้อนดูได้ว่าตรวจอะไรไปบ้าง */
  checks: text('checks').array().notNull().default([]),
  reviewedBy: text('reviewed_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('review_events_target_idx').on(table.target, table.targetId)]);

/* ---------- ไฟล์และอีเมล ---------- */

/** ตอนนี้ path ชี้ไปโฟลเดอร์ในเครื่อง ตอนย้ายไป S3 จะเก็บ key แทนโดยไม่ต้องแก้ตาราง */
export const files = pgTable('files', {
  id: text('id').primaryKey(),
  ownerType: text('owner_type').notNull(),
  ownerId: text('owner_id').notNull(),
  path: text('path').notNull(),
  originalName: text('original_name').notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('files_owner_idx').on(table.ownerType, table.ownerId)]);

/** ตอนนี้ยังไม่ส่งอีเมลจริง บันทึกไว้ก่อนเพื่อให้ตรวจได้ว่าระบบจะส่งอะไรออกไป */
export const emailLog = pgTable('email_log', {
  id: text('id').primaryKey(),
  to: text('to').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  provider: text('provider').notNull().default('log'),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('email_log_to_idx').on(table.to)]);

/* ---------- relations ---------- */

export const chatRooms = pgTable('chat_rooms', {
  competitionId: text('competition_id').references(() => competitions.id, { onDelete: 'set null' }),
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  mentorUserId: text('mentor_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  mentorId: text('mentor_id').notNull().references(() => mentors.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  context: text('context').notNull(),
  status: text('status').notNull().default('pending'),
  meetingUrl: text('meeting_url').notNull().default(''),
  meetingAt: timestamp('meeting_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('chat_rooms_owner_idx').on(t.ownerId), index('chat_rooms_mentor_idx').on(t.mentorUserId)]);

export const chatMembers = pgTable('chat_members', {
  roomId: text('room_id').notNull().references(() => chatRooms.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  readAt: timestamp('read_at', { withTimezone: true }),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.roomId, t.userId] }), index('chat_members_user_idx').on(t.userId)]);

export const chatInvites = pgTable('chat_invites', {
  id: text('id').primaryKey(),
  roomId: text('room_id').notNull().references(() => chatRooms.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, t => [uniqueIndex('chat_invites_room_email_key').on(t.roomId, t.email), index('chat_invites_email_idx').on(t.email)]);

export const chatMessages = pgTable('chat_messages', {
  id: text('id').primaryKey(),
  roomId: text('room_id').notNull().references(() => chatRooms.id, { onDelete: 'cascade' }),
  senderId: text('sender_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  clientId: text('client_id').notNull(),
  body: text('body').notNull(),
  fileName: text('file_name'),
  fileMime: text('file_mime'),
  fileData: text('file_data'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('chat_messages_room_time_idx').on(t.roomId, t.createdAt), uniqueIndex('chat_messages_retry_key').on(t.roomId, t.senderId, t.clientId)]);

export const mentorCompetitionChoices = pgTable('mentor_competition_choices', {
  mentorId: text('mentor_id').notNull().references(() => mentors.id, { onDelete: 'cascade' }),
  competitionId: text('competition_id').notNull().references(() => competitions.id, { onDelete: 'cascade' }),
  choice: text('choice').notNull(),
  /** ค่าปรึกษาของงานนี้ 0 = ฟรี ว่างได้สำหรับแถวเก่าก่อนมีราคาต่องาน */
  price: integer('price'),
  /** แถวเก่าคิดเป็นนาที แถวใหม่ใช้ unit แทน */
  minutes: integer('minutes'),
  /** ราคาข้างบนคิดต่ออะไร เมนเทอร์พิมพ์เอง เช่น "ชั่วโมง" "โปรเจกต์" ว่าง = ฟรี หรือแถวเก่า */
  unit: text('unit').notNull().default(''),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.mentorId, t.competitionId] })]);

export const mentorSlots = pgTable('mentor_slots', {
  id: text('id').primaryKey(),
  mentorId: text('mentor_id').notNull().references(() => mentors.id, { onDelete: 'cascade' }),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  cancelled: boolean('cancelled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('mentor_slots_time_idx').on(t.mentorId, t.startsAt)]);

export const bookings = pgTable('bookings', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull().references(() => users.id),
  mentorId: text('mentor_id').notNull().references(() => mentors.id),
  mentorUserId: text('mentor_user_id').notNull().references(() => users.id),
  competitionId: text('competition_id').notNull().references(() => competitions.id),
  slotId: text('slot_id').notNull().references(() => mentorSlots.id),
  roomId: text('room_id').references(() => chatRooms.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  context: text('context').notNull(),
  status: text('status').notNull().default('pending'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  reason: text('reason').notNull().default(''),
  updatedBy: text('updated_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('bookings_owner_idx').on(t.ownerId), index('bookings_mentor_idx').on(t.mentorId)]);

export const bookingEvents = pgTable('booking_events', {
  id: text('id').primaryKey(),
  bookingId: text('booking_id').notNull().references(() => bookings.id),
  actorId: text('actor_id').notNull().references(() => users.id),
  action: text('action').notNull(),
  reason: text('reason').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ---------- Rising Star ---------- */

/* หนึ่งแถวคือหนึ่งช่วงที่เมนเทอร์เป็นสมาชิก Rising Star เก็บเป็นช่วงแทนธงเปิด/ปิด เพราะ
   - Hall of Fame ของเดือนก่อน ๆ ต้องนับเฉพาะคนที่เป็นสมาชิก "ในเดือนนั้น" ไม่ใช่ตอนนี้
   - หนึ่งช่วงตรงกับหนึ่งรอบบิลของ Stripe พอต่อระบบจ่ายเงินแล้วแค่เพิ่มแถวจาก webhook
   source บอกที่มาของช่วง: stripe (จ่ายจริง), manual (ทีมงานให้เอง), demo (ข้อมูลตัวอย่าง) */
export const risingStarPeriods = pgTable('rising_star_periods', {
  id: text('id').primaryKey(),
  mentorId: text('mentor_id').notNull().references(() => mentors.id, { onDelete: 'cascade' }),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  source: text('source').notNull(),
  /** id ของ invoice (บัตร ต่ออายุเอง) หรือ checkout session (PromptPay จ่ายทีละเดือน) ใน Stripe
      unique กัน webhook ที่ Stripe ส่งซ้ำไม่ให้นับเดือนซ้ำ */
  externalId: text('external_id'),
  /** PaymentIntent ที่จ่ายช่วงนี้ ใช้หาช่วงที่ต้องยกเลิกเมื่อคืนเงินหรือถูก dispute */
  paymentRef: text('payment_ref'),
  /** ส่งอีเมลเตือนว่าใกล้หมดแล้ว (เฉพาะช่วงที่ไม่ต่ออายุเอง) */
  remindedAt: timestamp('reminded_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index('rising_star_periods_mentor_idx').on(t.mentorId, t.endsAt),
  uniqueIndex('rising_star_periods_external_key').on(t.externalId).where(sql`${t.externalId} is not null`),
]);

/* ---------- Stripe (ค่าสมาชิก Rising Star เมนเทอร์จ่ายให้เรา) ----------

   เราเป็นผู้ขายเอง ไม่ได้ถือเงินแทนใคร จึงไม่ต้องใช้ Connect
   บัตร: subscription รายเดือน ต่ออายุเอง ทุก invoice ที่จ่ายแล้วกลายเป็นหนึ่งช่วงใน rising_star_periods
   PromptPay: Stripe ต่ออายุเองไม่ได้ จึงจ่ายครั้งละหนึ่งเดือน ต่อท้ายช่วงเดิม แล้วเตือนทางอีเมลก่อนหมด
   ตัดเงินไม่ผ่าน = ไม่มีช่วงใหม่ หลุดอันดับเมื่อช่วงเดิมหมด (ผู้ใช้ตัดสิน 3 ต.ค. 2569) */

/** หนึ่งบัญชีผู้ใช้ต่อหนึ่ง customer ใน Stripe */
export const billingCustomers = pgTable('billing_customers', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  customerId: text('customer_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex('billing_customers_customer_key').on(t.customerId)]);

/** สถานะ subscription แบบบัตรล่าสุดที่ webhook บอก ใช้แสดงปุ่ม "จัดการ" และกันสมัครซ้ำ */
export const risingStarSubscriptions = pgTable('rising_star_subscriptions', {
  id: text('id').primaryKey(),
  mentorId: text('mentor_id').notNull().references(() => mentors.id, { onDelete: 'cascade' }),
  status: text('status').notNull(),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  /** created ของ event ล่าสุดที่ใช้ อันที่มาช้ากว่าจะไม่ทับอันใหม่ */
  eventCreated: integer('event_created').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('rising_star_subscriptions_mentor_idx').on(t.mentorId)]);

/** PaymentIntent ที่ถูกคืนเงินเต็มหรือถูก dispute ถ้า event คืนเงินมาก่อน event จ่ายเงิน จะไม่ให้สมาชิกจากเงินก้อนนี้ */
export const billingRevocations = pgTable('billing_revocations', {
  paymentRef: text('payment_ref').primaryKey(),
  reason: text('reason').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** event ที่ประมวลผลแล้ว Stripe ส่งซ้ำได้ เจอ id เดิมให้ข้าม */
export const stripeEvents = pgTable('stripe_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ---------- จ้างเมนเทอร์ ----------

   ขั้นตอน (ผู้ใช้ตัดสิน 1 ต.ค. 2569 แทนการติดต่อนอกเว็บ)
   นักเรียนส่งคำขอจ้าง (งานแข่ง จำนวนชั่วโมง เวลาที่อยากนัด สิ่งที่อยากให้ช่วย)
   → เมนเทอร์กดรับหรือปฏิเสธ → รับแล้วห้องแชตเปิด (ส่งไฟล์ได้)
   → นักเรียนกดเสร็จงาน → รีวิวได้หนึ่งครั้ง
   รอบถัดไปจะเพิ่มการจ่ายเงินผ่าน Stripe ระหว่าง "รับ" กับ "เปิดแชต" และห้องวิดีโอตามชั่วโมงที่จ้าง

   ชื่อตารางยังเป็น consultations เพราะรีวิวอ้างถึงตารางนี้อยู่แล้ว หนึ่งแถวคือการจ้างหนึ่งครั้ง
   status: requested → accepted (รอนักเรียนจ่ายเงิน) → paid (จ่ายแล้ว แชตเปิด) → completed
           requested → declined (เมนเทอร์ปฏิเสธ)
           requested / accepted → cancelled (นักเรียนยกเลิกก่อนจ่ายเงิน)
           paid → cancelled ได้ทางเดียวคือทีมงานตัดสินคืนเงินหลังนักเรียนแจ้งปัญหา (disputedAt)

   โหมดติดต่อนอกเว็บ (ใช้อยู่ตอนนี้ ผู้ใช้ตัดสิน 2 ต.ค. 2569 พักการจ้างกับแชตไว้ก่อน ดู lib/flow.ts)
   contacted (กด Contact Mentor) → claimed (กด I received guidance) → completed (เมนเทอร์ยืนยัน รีวิวได้)
                                                             ↘ denied (เมนเทอร์บอกว่าไม่เคยคุยกัน ทีมงานดู) */
export const consultations = pgTable('consultations', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  mentorId: text('mentor_id').notNull().references(() => mentors.id, { onDelete: 'cascade' }),
  competitionId: text('competition_id').references(() => competitions.id, { onDelete: 'set null' }),
  status: text('status').$type<'contacted' | 'claimed' | 'denied' | 'requested' | 'accepted' | 'paid' | 'declined' | 'cancelled' | 'completed'>().notNull().default('requested'),
  /** เวลาที่จ้างเป็นนาที และราคารวมเป็นบาท คิดจากราคาต่องานของเมนเทอร์ตอนส่งคำขอ ไม่เปลี่ยนตามราคาใหม่ */
  minutes: integer('minutes').notNull().default(60),
  price: integer('price').notNull().default(0),
  preferredAt: timestamp('preferred_at', { withTimezone: true }),
  note: text('note').notNull().default(''),
  /** เหตุผลตอนปฏิเสธหรือยกเลิก */
  reason: text('reason').notNull().default(''),
  roomId: text('room_id').references(() => chatRooms.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  /** นักเรียนแจ้งปัญหา เงินถูกพักไว้จนทีมงานตัดสิน ระบบจะไม่โอนอัตโนมัติ */
  disputedAt: timestamp('disputed_at', { withTimezone: true }),
  disputeReason: text('dispute_reason').notNull().default(''),
  /** จากรุ่นติดต่อนอกเว็บ (30 ก.ย. 2569) เก็บไว้เป็นประวัติ ไม่ใช้แล้ว */
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  /** ส่งอีเมลเตือนเมนเทอร์ให้ยืนยันไปแล้วเมื่อไร (เตือนครั้งเดียวหลัง 3 วัน) */
  remindedAt: timestamp('reminded_at', { withTimezone: true }),
}, t => [
  index('consultations_user_idx').on(t.userId, t.createdAt),
  index('consultations_mentor_idx').on(t.mentorId, t.status),
  // ค้างได้ทีละหนึ่งงานต่อคู่นักเรียนกับเมนเทอร์ กดจ้างซ้ำไม่สร้างแถวใหม่
  uniqueIndex('consultations_open_key').on(t.userId, t.mentorId).where(sql`status in ('contacted', 'claimed', 'requested', 'accepted', 'paid')`),
  check('consultations_status_check', sql`status in ('contacted', 'claimed', 'denied', 'requested', 'accepted', 'paid', 'declined', 'cancelled', 'completed')`),
]);

/** ลิงก์ยืนยันในอีเมลถึงเมนเทอร์ ("ใช่ ยืนยัน" / "ไม่ใช่") กดได้โดยไม่ต้องล็อกอิน
    เก็บแค่ hash ใช้ได้ครั้งเดียว มีวันหมดอายุ และผูกกับรายการเดียว (routes/consult.ts) */
export const consultationConfirmTokens = pgTable('consultation_confirm_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  consultationId: text('consultation_id').notNull().references(() => consultations.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('consultation_confirm_tokens_consultation_idx').on(t.consultationId)]);

/* ---------- เงินของการจ้าง ----------

   เงินผ่านเว็บแบบพักไว้ก่อน (ผู้ใช้ตัดสิน 1 ต.ค. 2569)
   นักเรียนจ่ายให้เว็บ → เว็บพักเงิน → นักเรียนกดเสร็จงาน หรือเงียบเกิน 3 วันหลังนัด → โอนให้เมนเทอร์
   ยังไม่หักค่าคอม ยอดโอนเท่ากับยอดที่นักเรียนจ่าย
   ผู้ให้บริการรับจ่ายเงินแยกไว้ใน server/lib/payments (ตอนนี้ทดลอง Opn Payments, มีตัวจำลองไว้ใช้ตอนพัฒนา) */

/** การจ่ายเงินหนึ่งครั้งของการจ้าง สร้างตอนนักเรียนกดจ่าย จ่ายสำเร็จเมื่อผู้ให้บริการยืนยันกลับมา */
export const hirePayments = pgTable('hire_payments', {
  id: text('id').primaryKey(),
  hireId: text('hire_id').notNull().references(() => consultations.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  /** id ของรายการฝั่งผู้ให้บริการ ใช้จับคู่ตอนได้ webhook และตอนคืนเงิน */
  providerRef: text('provider_ref'),
  amount: integer('amount').notNull(),
  currency: text('currency').notNull().default('thb'),
  status: text('status').$type<'pending' | 'paid' | 'failed' | 'refunded'>().notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  refundedAt: timestamp('refunded_at', { withTimezone: true }),
}, t => [
  index('hire_payments_hire_idx').on(t.hireId),
  uniqueIndex('hire_payments_provider_ref_key').on(t.provider, t.providerRef),
  // นับเป็นเงินของงานได้รายการเดียว ถ้าจ่ายซ้ำจากอีกแท็บ รายการที่สองถูกคืนเงินอัตโนมัติ (lib/hire-money.ts)
  uniqueIndex('hire_payments_one_paid_key').on(t.hireId).where(sql`status = 'paid'`),
  check('hire_payments_status_check', sql`status in ('pending', 'paid', 'failed', 'refunded')`),
]);

/** ยอดที่ต้องโอนให้เมนเทอร์ หนึ่งแถวต่อการจ้างที่จ่ายแล้ว
    due: ครบเงื่อนไขแล้ว รอโอน · held: นักเรียนแจ้งปัญหา รอทีมงานตัดสิน
    paid: โอนแล้ว · cancelled: ทีมงานตัดสินคืนเงินนักเรียน */
export const mentorPayouts = pgTable('mentor_payouts', {
  id: text('id').primaryKey(),
  hireId: text('hire_id').notNull().references(() => consultations.id, { onDelete: 'cascade' }),
  mentorId: text('mentor_id').notNull().references(() => mentors.id, { onDelete: 'cascade' }),
  amount: integer('amount').notNull(),
  status: text('status').$type<'due' | 'held' | 'paid' | 'cancelled'>().notNull().default('due'),
  /** ช่องทางที่โอนจริง: ผ่านผู้ให้บริการ หรือทีมงานโอนเองแล้วกดบันทึก */
  method: text('method'),
  providerRef: text('provider_ref'),
  note: text('note').notNull().default(''),
  decidedBy: text('decided_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
}, t => [
  uniqueIndex('mentor_payouts_hire_key').on(t.hireId),
  index('mentor_payouts_status_idx').on(t.status, t.createdAt),
  check('mentor_payouts_status_check', sql`status in ('due', 'held', 'paid', 'cancelled')`),
]);

/** บัญชีรับเงินของเมนเทอร์ เลขบัญชีเก็บแบบเข้ารหัส (server/lib/secret-box.ts) เห็นเต็มได้เฉพาะทีมงาน
    เจ้าตัวเห็นแค่ 4 ตัวท้าย ผู้ให้บริการตรวจบัญชีแล้วจะได้ providerRecipientId */
export const mentorPayoutAccounts = pgTable('mentor_payout_accounts', {
  mentorId: text('mentor_id').primaryKey().references(() => mentors.id, { onDelete: 'cascade' }),
  accountName: text('account_name').notNull(),
  bankCode: text('bank_code').notNull(),
  accountNumberEncrypted: text('account_number_encrypted').notNull(),
  accountLast4: text('account_last4').notNull(),
  providerRecipientId: text('provider_recipient_id'),
  status: text('status').$type<'pending' | 'verified' | 'failed'>().notNull().default('pending'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, () => [check('mentor_payout_accounts_status_check', sql`status in ('pending', 'verified', 'failed')`)]);

/** รีวิวหนึ่งอันต่อการจ้างที่เสร็จแล้วหนึ่งครั้ง Rising Star ใช้ค่าเฉลี่ยดาวของรีวิวที่เขียนในเดือนนั้น
    แอดมินซ่อนรีวิวที่น่าสงสัยได้ รีวิวที่ซ่อนไม่นับคะแนน */
export const mentorReviews = pgTable('mentor_reviews', {
  id: text('id').primaryKey(),
  consultationId: text('consultation_id').notNull().references(() => consultations.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  mentorId: text('mentor_id').notNull().references(() => mentors.id, { onDelete: 'cascade' }),
  stars: smallint('stars').notNull(),
  comment: text('comment').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  hiddenAt: timestamp('hidden_at', { withTimezone: true }),
  hiddenBy: text('hidden_by').references(() => users.id, { onDelete: 'set null' }),
}, t => [
  uniqueIndex('mentor_reviews_consultation_key').on(t.consultationId),
  index('mentor_reviews_mentor_idx').on(t.mentorId, t.createdAt),
  check('mentor_reviews_stars_check', sql`stars between 1 and 5`),
]);

/** ลิงก์ยืนยันอีเมลสำหรับบัญชีที่สมัครด้วยรหัสผ่าน เก็บแค่ค่า hash ของ token ใช้ได้ครั้งเดียว
    ผูกกับอีเมล ณ ตอนส่ง ถ้าเปลี่ยนอีเมลหลังจากนั้น ลิงก์เก่าใช้ไม่ได้ */
export const emailVerifications = pgTable('email_verifications', {
  tokenHash: text('token_hash').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('email_verifications_user_idx').on(t.userId, t.createdAt)]);

/** เมนเทอร์ขอเพิ่มงานแข่งที่อยากรับปรึกษา ทีมงานสร้างเวทีเองจากหน้าจัดการ แล้วผูกคำขอกับเวทีนั้น
    ตอนอนุมัติ เมนเทอร์จะถูกใส่เป็นผู้รับปรึกษางานนั้นพร้อมราคาที่ขอไว้ */
export const competitionRequests = pgTable('competition_requests', {
  id: text('id').primaryKey(),
  mentorId: text('mentor_id').notNull().references(() => mentors.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  url: text('url').notNull(),
  details: text('details').notNull().default(''),
  price: integer('price').notNull(),
  /** คำขอเก่าคิดเป็นนาที คำขอใหม่ใช้ unit */
  minutes: integer('minutes'),
  unit: text('unit').notNull().default(''),
  /* เป็นเมนเทอร์ได้เฉพาะเวทีที่เคยแข่ง คำขอจึงต้องบอกผลที่ได้ ปี และหลักฐาน อนุมัติแล้วกลายเป็นประสบการณ์ด้วย */
  result: text('result').$type<'winner' | 'finalist' | 'participant'>(),
  year: text('year').notNull().default(''),
  evidence: text('evidence').notNull().default(''),
  status: text('status').$type<'pending' | 'approved' | 'rejected'>().notNull().default('pending'),
  reason: text('reason').notNull().default(''),
  competitionId: text('competition_id').references(() => competitions.id, { onDelete: 'set null' }),
  decidedBy: text('decided_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
}, t => [
  index('competition_requests_status_idx').on(t.status, t.createdAt),
  check('competition_requests_status_check', sql`status in ('pending', 'approved', 'rejected')`),
]);

export const mentorMatchAudit = pgTable('mentor_match_audit', {
  mentorId: text('mentor_id').primaryKey().references(() => mentors.id, { onDelete: 'cascade' }),
  version: text('version').notNull(),
  scores: jsonb('scores').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const competitionRelations = relations(competitions, ({ many }) => ({
  categories: many(competitionCategories),
  levels: many(competitionLevels),
  rewards: many(competitionRewards),
}));

export const competitionCategoryRelations = relations(competitionCategories, ({ one }) => ({
  competition: one(competitions, { fields: [competitionCategories.competitionId], references: [competitions.id] }),
}));

export const competitionLevelRelations = relations(competitionLevels, ({ one }) => ({
  competition: one(competitions, { fields: [competitionLevels.competitionId], references: [competitions.id] }),
}));

export const competitionRewardRelations = relations(competitionRewards, ({ one }) => ({
  competition: one(competitions, { fields: [competitionRewards.competitionId], references: [competitions.id] }),
}));

export const submissionRelations = relations(competitionSubmissions, ({ many }) => ({
  categories: many(submissionCategories),
  levels: many(submissionLevels),
  rewards: many(submissionRewards),
}));

export const submissionCategoryRelations = relations(submissionCategories, ({ one }) => ({
  submission: one(competitionSubmissions, { fields: [submissionCategories.submissionId], references: [competitionSubmissions.id] }),
}));

export const submissionLevelRelations = relations(submissionLevels, ({ one }) => ({
  submission: one(competitionSubmissions, { fields: [submissionLevels.submissionId], references: [competitionSubmissions.id] }),
}));

export const submissionRewardRelations = relations(submissionRewards, ({ one }) => ({
  submission: one(competitionSubmissions, { fields: [submissionRewards.submissionId], references: [competitionSubmissions.id] }),
}));

export const mentorSubmissionRelations = relations(mentorSubmissions, ({ many }) => ({
  awards: many(mentorAwards),
}));

export const mentorAwardRelations = relations(mentorAwards, ({ one }) => ({
  submission: one(mentorSubmissions, { fields: [mentorAwards.submissionId], references: [mentorSubmissions.id] }),
}));

/** การแจ้งทีมงานทางอีเมลเมื่อมีเรื่องใหม่รอตรวจ (lib/staff-notify.ts) หนึ่งแถวต่อหนึ่งเรื่อง ไม่มีแถว = ค่าเริ่มต้น (เปิด แจ้ง admin ทุกคน) */
export const staffNotifications = pgTable('staff_notifications', {
  kind: text('kind').primaryKey(),
  enabled: boolean('enabled').notNull().default(true),
  audience: text('audience').$type<'all' | 'selected'>().notNull().default('all'),
  recipientIds: text('recipient_ids').array().notNull().default([]),
  updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [check('staff_notifications_audience_check', sql`${t.audience} in ('all', 'selected')`)]);

/** ประวัติการแจ้งทีมงาน ใช้จำกัดจำนวนอีเมล คนเดียวส่งรัว ๆ จะไม่ทำให้ทีมงานโดนอีเมลถล่ม (Astra รีวิว 5 ต.ค. 2569) */
export const staffAlerts = pgTable('staff_alerts', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  actorId: text('actor_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('staff_alerts_kind_idx').on(t.kind, t.createdAt), index('staff_alerts_actor_idx').on(t.actorId, t.kind, t.createdAt)]);

/* ---------- กันเดารหัสผ่าน ---------- */

/** การเข้าสู่ระบบที่ผิด และการสมัครสมาชิก นับต่ออีเมลและต่อ IP เพื่อจำกัดความถี่ (lib/rate-limit.ts)
    เก็บแค่ค่าแฮชของอีเมลหรือ IP ไม่เก็บค่าจริง และลบแถวที่เก่ากว่าหนึ่งวันทิ้ง */
export const authAttempts = pgTable('auth_attempts', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  keyHash: text('key_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('auth_attempts_key_idx').on(t.kind, t.keyHash, t.createdAt)]);

/* ---------- ดึงงานแข่งอัตโนมัติ ---------- */

/** แหล่งที่ดึงอัตโนมัติ เปิดปิดได้ในหน้าแอดมิน ยังไม่มีแถว = ปิด (lib/import/run.ts) */
export const competitionImportSources = pgTable('competition_import_sources', {
  id: text('id').primaryKey(),
  enabled: boolean('enabled').notNull().default(false),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  lastError: text('last_error'),
  lastFound: integer('last_found').notNull().default(0),
  updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** ประกาศที่ดึงมาหนึ่งรายการ พร้อมร่างที่ AI กรอกให้ รอแอดมินรับหรือปฏิเสธ
    url ไม่ซ้ำ ประกาศเดิมจึงไม่กลับเข้าคิวอีก แม้เคยถูกปฏิเสธไปแล้ว */
export const competitionImports = pgTable('competition_imports', {
  id: text('id').primaryKey(),
  origin: text('origin').notNull(),
  url: text('url'),
  title: text('title').notNull(),
  status: text('status').notNull().default('processing'),
  itemKind: text('item_kind'),
  draft: jsonb('draft'),
  uncertain: text('uncertain').array().notNull().default([]),
  note: text('note'),
  error: text('error'),
  duplicateOf: text('duplicate_of').references(() => competitions.id, { onDelete: 'set null' }),
  competitionId: text('competition_id').references(() => competitions.id, { onDelete: 'set null' }),
  rejectReason: text('reject_reason'),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  decidedBy: text('decided_by').references(() => users.id, { onDelete: 'set null' }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex('competition_imports_url_idx').on(t.url),
  index('competition_imports_status_idx').on(t.status, t.createdAt),
  check('competition_imports_status_check', sql`${t.status} in ('processing', 'pending', 'skipped', 'accepted', 'rejected', 'failed')`),
]);
