import { relations } from 'drizzle-orm';
import {
  boolean, date, index, integer, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex,
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
  price: integer('price').notNull(),
  paidSlot: timestamp('paid_slot', { withTimezone: true }).notNull(),
  freeSlot: timestamp('free_slot', { withTimezone: true }).notNull(),
  publishedMentorId: text('published_mentor_id'),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
}, (table) => [index('mentor_submissions_status_idx').on(table.status, table.submittedAt)]);

export const mentorAwards = pgTable('mentor_awards', {
  id: text('id').primaryKey(),
  submissionId: text('submission_id').notNull().references(() => mentorSubmissions.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  /** ว่างได้ เพราะผู้สมัครอ้างเวทีที่ยังไม่มีในระบบได้ กรณีนั้นต้องตรวจด้วยมือ */
  competitionSlug: text('competition_slug'),
  year: text('year').notNull(),
  evidence: text('evidence').notNull(),
}, (table) => [index('mentor_awards_submission_idx').on(table.submissionId)]);

/* ---------- เมนเทอร์ที่ผ่านการตรวจแล้ว ---------- */

export const mentors = pgTable('mentors', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  avatar: text('avatar').notNull(),
  bio: text('bio').notNull(),
  replyTime: text('reply_time').notNull(),
  /** ตั้งได้เมื่อตรวจหลักฐานจริงแล้วเท่านั้น เป็นตัวกำหนดลำดับการจับคู่ */
  wonSlug: text('won_slug'),
  category: categoryEnum('category'),
  topics: integer('topics').array().notNull().default([]),
  price: integer('price').notNull(),
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
