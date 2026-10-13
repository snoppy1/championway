# Mentor Profile v2 (A–F) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Approved mentors keep a full A–F profile (basic info, skill tags with levels, detailed competition experiences checked by admins, mentoring capability, availability), the public profile shows it with computed trust stats, and every mentor carries a `profileComplete` flag that Phase 2 matching will filter on.

**Architecture:** Fixed option lists and pure helpers live in `src/data/matching.ts` (the server already imports `src/data/*.js`). Migration 0028 adds columns to `mentors` and `mentor_experiences` and new tables `mentor_skills` and `hackathon_names`. Mentor zone gets a "Profile" tab (A/B/D/E) and an experiences list (C). New experiences are `pending` until an admin verifies them in a new admin queue. Only `verified` experiences count anywhere they counted before.

**Tech Stack:** React 19 + Vite, Hono, Drizzle ORM (Postgres/Neon), zod, node:test API tests, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-13-mentor-matching-design.md` (sections 2, 4.1, 6 Mentor zone/profile/admin rows, 9)

## Global Constraints

- All user-facing copy goes through `src/i18n/en.ts` (the source of truth for types) and `src/i18n/th.ts`. Admin pages are Thai-only (existing rule in `markdown/i18n.md`).
- Server relative imports end with `.js` (`scripts/check-server-imports.mjs` fails the build otherwise).
- Comments in code are Thai, matching the surrounding files. Commit messages are English.
- Hiring/chat/payment stays paused behind `HIRING_ENABLED`; this plan does not touch those paths.
- Mentors only mentor competitions they competed in. Existing experiences migrate as `verified`. New ones start as `pending`, and only `verified` rows count for badges, eligibility and ranking.
- Gender is optional; null never matches a gender-specific request (Phase 2 applies this).
- No secrets or `.env*` files in commits. Do not commit `artifacts/*.png`.
- Production is not touched. Migrations are run on the test DB only (`node scripts/test-environment.mjs migrate`), and on dev by the normal deploy.
- Deliberate scope cut, to report to the owner: the public **mentor application form is unchanged in Phase 1**. New applicants are approved as today and then complete A–F in Mentor zone, exactly like existing mentors. The spec row "Mentor application: Expanded to A–E" moves to a follow-up.

## Review Focus

1. **A mentor removes their last skill or language.** The profile save is rejected with a clear message. `profileComplete` turns false only through missing data, never through a crash. Task 3 tests `languages: []` and `skills: []`.
2. **The same competition is entered twice.** A second experience for the same competition and year returns 409, not a 500 from the unique index. The same holds for a typed name that differs only in case or spacing. Task 4 tests this.
3. **A pending experience is used as proof.** A `pending` experience must not unlock "mentor this competition" (`PUT /consult/zone/competitions/:slug`) or the competition-page experience badge. Task 4 tests this.
4. **Another user's experience is edited or decided.** A mentor can't delete another mentor's experience, and a non-admin can't decide one. Tasks 4 and 5 test this.
5. **Availability with `to` before `from`, or a bad time string.** Rejected with 400. Task 3 tests this.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/data/matching.ts` (new) | Option id lists (A/B/C/D/E), `MentorProfileV2` type, `profileComplete()`, `normalizeName()` |
| `server/db/schema.ts` | New columns and tables |
| `server/db/migrations/0028_mentor_profile_v2.sql` (generated + hand backfill) | DDL and backfill |
| `server/routes/mentor-profile.ts` (new) | `/api/consult/zone/profile`, `/api/consult/zone/experiences`, `/api/hackathon-names` |
| `server/routes/admin.ts` | `/api/admin/experiences` queue + decision |
| `server/routes/consult.ts` | Only-verified filters; public profile payload v2; `profileComplete` in `/zone` |
| `server/lib/mentor-stats.ts` (new) | Section F computed stats |
| `server/app.ts` | Mount the new route file |
| `src/i18n/en.ts`, `src/i18n/th.ts` | New `mentorProfileV2` section with option labels |
| `src/components/ProfileEditor.tsx` (new) | Mentor zone Profile tab form (A/B/D/E) |
| `src/components/ExperienceList.tsx` (new) | Mentor zone experiences list + add form (C) |
| `src/pages/MentorZone.tsx` | New tabs + completeness banner |
| `src/pages/admin/AdminExperiences.tsx` (new), `src/pages/admin/AdminLayout.tsx`, `src/main.tsx` | Admin queue |
| `src/pages/MentorProfile.tsx` | Public A–F sections |
| `src/styles.css` | Small styles for chips, the skill grid and the availability rows |
| `scripts/matching-data.test.ts`, `scripts/mentor-profile.test.ts` (new) | Tests |
| `tests/mentor-profile-v2.spec.ts` (new) | Browser tests |
| `scripts/test-environment.mjs` | Register the new API tests |

---

### Task 1: Shared option lists and pure helpers

**Files:**
- Create: `src/data/matching.ts`
- Test: `scripts/matching-data.test.ts`
- Modify: `scripts/test-environment.mjs` (add both new test files to `auth`)

**Interfaces:**
- Produces:
  - `skillTags`, `skillGroups`, `skillLevels`, `languages`, `genders`, `experienceKinds`, `experienceResults`, `teamRoles`, `helpsWith`, `learnerLevels`, `teachingStyles`, `formats`, `sessionLengths`, `replyHoursOptions`, `modes` (readonly tuples) plus their element types (`SkillTag`, `SkillLevel`, …)
  - `type Slot = { day: number; from: string; to: string }`
  - `type MentorProfileV2`
  - `profileComplete(p: MentorProfileV2, experienceCount: number): boolean`
  - `missingSections(p, experienceCount): ('A'|'B'|'C'|'D'|'E')[]`
  - `normalizeName(name: string): string`
  - `slotProblem(slot: Slot): string | null`

- [ ] **Step 1: Write the failing test**

```ts
// scripts/matching-data.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missingSections, normalizeName, profileComplete, slotProblem } from '../src/data/matching';
import type { MentorProfileV2 } from '../src/data/matching';

const full: MentorProfileV2 = {
  headline: 'AI Engineer | 3× Hackathon Mentor', country: 'TH', timeZone: 'Asia/Bangkok', languages: ['th'],
  background: 'Computer engineering', gender: null,
  skills: [{ tag: 'python', level: 'expert' }],
  helpsWith: ['coding'], learnerLevels: ['beginner'], teachingStyles: ['step_by_step'], formats: ['one_on_one'], deliverables: '',
  availability: [{ day: 6, from: '09:00', to: '12:00' }], sessionsPerWeek: 2, sessionMinutes: [60], acceptingRequests: true,
  replyHours: 24, acceptsUrgent: false, mode: 'online',
};

test('a full profile with one experience is complete', () => {
  assert.equal(profileComplete(full, 1), true);
  assert.deepEqual(missingSections(full, 1), []);
});

test('each missing section is reported', () => {
  assert.deepEqual(missingSections({ ...full, headline: ' ' }, 1), ['A']);
  assert.deepEqual(missingSections({ ...full, languages: [] }, 1), ['A']);
  assert.deepEqual(missingSections({ ...full, skills: [] }, 1), ['B']);
  assert.deepEqual(missingSections(full, 0), ['C']);
  assert.deepEqual(missingSections({ ...full, formats: [] }, 1), ['D']);
  assert.deepEqual(missingSections({ ...full, availability: [], sessionsPerWeek: null }, 1), ['E']);
  assert.equal(profileComplete({ ...full, replyHours: null }, 1), false);
});

test('names normalise case, spacing and Thai digits', () => {
  assert.equal(normalizeName('  Thailand   ICT  Awards ๒๕๖๗ '), 'thailand ict awards 2567');
  assert.equal(normalizeName('NSC'), normalizeName('nsc'));
});

test('slots need HH:MM and to after from', () => {
  assert.equal(slotProblem({ day: 1, from: '09:00', to: '10:00' }), null);
  assert.equal(slotProblem({ day: 1, from: '10:00', to: '09:00' }), 'order');
  assert.equal(slotProblem({ day: 7, from: '09:00', to: '10:00' }), 'day');
  assert.equal(slotProblem({ day: 1, from: '9am', to: '10:00' }), 'time');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test scripts/matching-data.test.ts`
Expected: FAIL, `Cannot find module '../src/data/matching'`

- [ ] **Step 3: Write the implementation**

```ts
// src/data/matching.ts
/* ตัวเลือกโปรไฟล์เมนเทอร์แบบใหม่ (หมวด A–F) และตัวช่วยที่ทั้งหน้าเว็บและเซิร์ฟเวอร์ใช้ร่วมกัน
   (spec docs/superpowers/specs/2026-10-13-mentor-matching-design.md) เก็บเป็น id ภาษาอังกฤษ ป้ายอยู่ใน i18n */

export const skillGroups = {
  programming: ['python', 'javascript', 'cpp', 'java'],
  webApp: ['react', 'nextjs', 'mobile'],
  aiMl: ['ml', 'llm', 'cv'],
  hardware: ['hardware_iot_robotics'],
  dataCloud: ['data_science', 'cybersecurity', 'cloud'],
  design: ['uiux', 'product_design'],
  business: ['business_model', 'startup', 'marketing'],
  pitch: ['pitching', 'presentation', 'storytelling'],
} as const;
export const skillTags = Object.values(skillGroups).flat() as SkillTag[];
export type SkillTag = (typeof skillGroups)[keyof typeof skillGroups][number];
export const skillLevels = ['intermediate', 'advanced', 'expert'] as const;
export type SkillLevel = (typeof skillLevels)[number];

export const languages = ['th', 'en'] as const;
export type Language = (typeof languages)[number];
export const genders = ['male', 'female'] as const;
export type Gender = (typeof genders)[number];

export const experienceKinds = ['hackathon', 'innovation', 'software', 'other'] as const;
export type ExperienceKind = (typeof experienceKinds)[number];
export const experienceResults = ['participant', 'finalist', 'winner', 'other'] as const;
export type ExperienceResult = (typeof experienceResults)[number];
export const teamRoles = ['developer', 'designer', 'leader', 'business', 'other'] as const;
export type TeamRole = (typeof teamRoles)[number];

export const helpsWith = ['idea_validation', 'coding', 'debugging', 'architecture', 'mvp', 'pitch_deck', 'presentation'] as const;
export type HelpsWith = (typeof helpsWith)[number];
export const learnerLevels = ['beginner', 'intermediate', 'advanced'] as const;
export type LearnerLevel = (typeof learnerLevels)[number];
export const teachingStyles = ['step_by_step', 'guided_questions', 'review', 'direct_feedback'] as const;
export type TeachingStyle = (typeof teachingStyles)[number];
export const formats = ['one_on_one', 'team', 'code_review'] as const;
export type Format = (typeof formats)[number];

export const sessionLengths = [30, 60, 90] as const;
export const replyHoursOptions = [6, 24, 72, 168] as const;
export const modes = ['online', 'onsite', 'both'] as const;
export type Mode = (typeof modes)[number];

export type Slot = { day: number; from: string; to: string };
export type MentorProfileV2 = {
  headline: string; country: string; timeZone: string; languages: Language[]; background: string; gender: Gender | null;
  skills: { tag: SkillTag; level: SkillLevel }[];
  helpsWith: HelpsWith[]; learnerLevels: LearnerLevel[]; teachingStyles: TeachingStyle[]; formats: Format[]; deliverables: string;
  availability: Slot[]; sessionsPerWeek: number | null; sessionMinutes: number[]; acceptingRequests: boolean;
  replyHours: number | null; acceptsUrgent: boolean; mode: Mode | null;
};

/** หมวดที่ยังกรอกไม่ครบ ว่าง = พร้อมถูกจับคู่ (หมวด F คำนวณเอง ไม่ต้องกรอก) */
export function missingSections(p: MentorProfileV2, experienceCount: number) {
  const missing: ('A' | 'B' | 'C' | 'D' | 'E')[] = [];
  if (!p.headline.trim() || !p.country || !p.background.trim() || p.languages.length === 0) missing.push('A');
  if (p.skills.length === 0) missing.push('B');
  if (experienceCount === 0) missing.push('C');
  if (!p.helpsWith.length || !p.learnerLevels.length || !p.teachingStyles.length || !p.formats.length) missing.push('D');
  if (!p.availability.length || !p.sessionsPerWeek || !p.sessionMinutes.length || !p.replyHours || !p.mode) missing.push('E');
  return missing;
}
export const profileComplete = (p: MentorProfileV2, experienceCount: number) => missingSections(p, experienceCount).length === 0;

const thaiDigits = '๐๑๒๓๔๕๖๗๘๙';
/** ชื่องานแข่งสำหรับเทียบซ้ำ: ตัวเล็ก ช่องว่างเดียว เลขไทยเป็นเลขอารบิก */
export function normalizeName(name: string) {
  return name.replace(/[๐-๙]/g, (d) => String(thaiDigits.indexOf(d))).toLowerCase().replace(/\s+/g, ' ').trim();
}

const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
/** ช่วงเวลาว่างหนึ่งช่วง ตอบชื่อปัญหาหรือ null */
export function slotProblem(slot: Slot): 'day' | 'time' | 'order' | null {
  if (!Number.isInteger(slot.day) || slot.day < 0 || slot.day > 6) return 'day';
  if (!hhmm.test(slot.from) || !hhmm.test(slot.to)) return 'time';
  if (slot.to <= slot.from) return 'order';
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --import tsx --test scripts/matching-data.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Register the tests and commit**

In `scripts/test-environment.mjs`, append `'scripts/matching-data.test.ts', 'scripts/mentor-profile.test.ts'` to the end of the `auth` array. `mentor-profile.test.ts` is created in Task 3; until then run single files directly.

```bash
git add src/data/matching.ts scripts/matching-data.test.ts scripts/test-environment.mjs
git commit -m "feat: shared mentor profile v2 option lists and completeness check"
```

---

### Task 2: Schema and migration 0028

**Files:**
- Modify: `server/db/schema.ts` (`mentors` at ~283, `mentorExperiences` at ~265; new tables after `mentorExperiences`)
- Create: `server/db/migrations/0028_mentor_profile_v2.sql` (generated) + `meta/` snapshot

**Interfaces:**
- Produces:
  - Drizzle tables `mentorSkills`, `hackathonNames`
  - New `mentors` fields: `headline`, `country`, `timeZone`, `languages`, `background`, `gender`, `helpsWith`, `learnerLevels`, `teachingStyles`, `formats`, `deliverables`, `availability`, `sessionsPerWeek`, `sessionMinutes`, `acceptingRequests`, `replyHours`, `acceptsUrgent`, `mode`
  - New `mentorExperiences` fields: `hackathonNameId`, `kind`, `role`, `roleOther`, `responsibility`, `evidenceUrl`, `lessons`, `status`, `reviewedBy`, `reviewedAt`, `reason`

- [ ] **Step 1: Edit the schema**

In `mentors`, before `createdAt`, add:

```ts
  /* โปรไฟล์แบบใหม่ หมวด A, D, E (spec 2026-10-13) ว่างได้ทุกช่องเพราะเมนเทอร์เดิมยังไม่ได้กรอก
     กรอกครบแล้วถึงจะถูกจับคู่ (src/data/matching.ts profileComplete) */
  headline: text('headline').notNull().default(''),
  country: text('country').notNull().default(''),
  timeZone: text('time_zone').notNull().default('Asia/Bangkok'),
  languages: text('languages').array().notNull().default([]),
  background: text('background').notNull().default(''),
  /** ไม่บังคับ ว่าง = ไม่ถูกจับคู่กับคำขอที่ระบุเพศ */
  gender: text('gender').$type<'male' | 'female'>(),
  helpsWith: text('helps_with').array().notNull().default([]),
  learnerLevels: text('learner_levels').array().notNull().default([]),
  teachingStyles: text('teaching_styles').array().notNull().default([]),
  formats: text('formats').array().notNull().default([]),
  deliverables: text('deliverables').notNull().default(''),
  /** ช่วงเวลาว่างตามเวลาของเมนเทอร์ [{ day: 0-6 (อาทิตย์ = 0), from: 'HH:MM', to: 'HH:MM' }] */
  availability: jsonb('availability').$type<{ day: number; from: string; to: string }[]>().notNull().default([]),
  sessionsPerWeek: integer('sessions_per_week'),
  sessionMinutes: integer('session_minutes').array().notNull().default([]),
  acceptingRequests: boolean('accepting_requests').notNull().default(true),
  replyHours: integer('reply_hours'),
  acceptsUrgent: boolean('accepts_urgent').notNull().default(false),
  mode: text('mode').$type<'online' | 'onsite' | 'both'>(),
```

Replace the `mentorExperiences` table with:

```ts
export const mentorExperiences = pgTable('mentor_experiences', {
  id: text('id').primaryKey(),
  mentorId: text('mentor_id').notNull().references(() => mentors.id, { onDelete: 'cascade' }),
  competitionId: text('competition_id').references(() => competitions.id, { onDelete: 'set null' }),
  /** งานที่ยังไม่มีหน้าในระบบ ชี้ไปรายชื่อที่ใช้เติมคำอัตโนมัติ (มีอย่างใดอย่างหนึ่งกับ competitionId) */
  hackathonNameId: text('hackathon_name_id').references(() => hackathonNames.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  result: text('result').$type<'winner' | 'finalist' | 'participant' | 'other'>().notNull(),
  year: text('year').notNull(),
  /** ชื่อรางวัล (ต้องมีเมื่อ winner) หรือคำอธิบายผลแบบ "อื่น ๆ" */
  detail: text('detail').notNull().default(''),
  kind: text('kind').$type<'hackathon' | 'innovation' | 'software' | 'other'>().notNull().default('hackathon'),
  role: text('role').$type<'developer' | 'designer' | 'leader' | 'business' | 'other'>().notNull().default('other'),
  roleOther: text('role_other').notNull().default(''),
  responsibility: text('responsibility').notNull().default(''),
  evidenceUrl: text('evidence_url').notNull().default(''),
  lessons: text('lessons').notNull().default(''),
  /* แถวเดิมทุกแถวผ่านการตรวจมาแล้ว ค่าเริ่มต้นจึงเป็น verified (ทางเดิมที่ insert ตอนอนุมัติยังถูก)
     ประสบการณ์ที่เมนเทอร์เพิ่มเองใน Mentor zone ต้องใส่ pending เอง นับคะแนนเฉพาะ verified */
  status: text('status').$type<'pending' | 'verified' | 'rejected'>().notNull().default('verified'),
  reviewedBy: text('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reason: text('reason').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('mentor_experiences_mentor_idx').on(table.mentorId),
  index('mentor_experiences_competition_idx').on(table.competitionId),
  index('mentor_experiences_status_idx').on(table.status, table.createdAt),
  // เวทีเดียวกันปีเดียวกันนับครั้งเดียว ใบสมัครที่ใส่ซ้ำหรือคำขอที่อนุมัติซ้ำจะไม่เกิดแถวซ้ำ (Astra รีวิว 4 ต.ค. 2569)
  uniqueIndex('mentor_experiences_once_key').on(table.mentorId, table.competitionId, table.year).where(sql`${table.competitionId} is not null`),
  uniqueIndex('mentor_experiences_name_once_key').on(table.mentorId, table.hackathonNameId, table.year).where(sql`${table.hackathonNameId} is not null`),
  check('mentor_experiences_status_check', sql`${table.status} in ('pending', 'verified', 'rejected')`),
]);

/** ชื่องานแข่งที่เมนเทอร์พิมพ์เองเพราะยังไม่มีในระบบ ใช้เติมคำอัตโนมัติให้คนถัดไป ไม่สร้างหน้างานแข่ง
    ชื่อที่ผู้ใช้ทั่วไปพิมพ์ไม่ถูกเพิ่มที่นี่ (กันชื่อมั่ว) */
export const hackathonNames = pgTable('hackathon_names', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  normalized: text('normalized').notNull(),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('hackathon_names_normalized_key').on(table.normalized)]);

/** หมวด B: ทักษะเป็น tag จากรายการตายตัว พร้อมระดับ */
export const mentorSkills = pgTable('mentor_skills', {
  mentorId: text('mentor_id').notNull().references(() => mentors.id, { onDelete: 'cascade' }),
  tag: text('tag').notNull(),
  level: text('level').$type<'intermediate' | 'advanced' | 'expert'>().notNull(),
}, (table) => [
  primaryKey({ columns: [table.mentorId, table.tag] }),
  check('mentor_skills_level_check', sql`${table.level} in ('intermediate', 'advanced', 'expert')`),
]);
```

Make sure `primaryKey` is in the `drizzle-orm/pg-core` import at the top of `schema.ts` (add it if missing). `hackathonNames` is referenced before it is declared, but Drizzle `references(() => …)` is lazy, so that is fine.

- [ ] **Step 2: Generate the migration**

Run: `npx drizzle-kit generate --name mentor_profile_v2`
Expected: creates `server/db/migrations/0028_mentor_profile_v2.sql` plus `meta/0028_snapshot.json`. Open the SQL and confirm it only adds columns, tables, indexes and checks; nothing drops.

- [ ] **Step 3: Apply to the test DB and typecheck**

Run: `node scripts/test-environment.mjs migrate && npx tsc -p . --noEmit`
Expected: migration applied, no type errors.

- [ ] **Step 4: Run the existing API tests (regression)**

Run: `node scripts/test-environment.mjs auth`
Expected: all pass (existing inserts get `status = 'verified'` by default).

- [ ] **Step 5: Commit**

```bash
git add server/db/schema.ts server/db/migrations/0028_mentor_profile_v2.sql server/db/migrations/meta
git commit -m "feat: schema for mentor profile v2, skills, typed competition names and experience review status"
```

---

### Task 3: Mentor zone profile API (A, B, D, E)

**Files:**
- Create: `server/routes/mentor-profile.ts`
- Modify: `server/app.ts` (mount), `server/routes/consult.ts` (export `ownMentor` and `fail`/`parse` helpers or copy the small ones)
- Test: `scripts/mentor-profile.test.ts`

**Interfaces:**
- Consumes: `profileComplete`, `missingSections`, `slotProblem` and the option lists (Task 1); `mentorSkills`, `mentorExperiences.status` (Task 2)
- Produces:
  - `GET /api/consult/zone/profile` → `{ profile: MentorProfileV2, missing: string[], complete: boolean }`, or 403 when not a mentor
  - `PUT /api/consult/zone/profile` (body = `MentorProfileV2`) → the same shape
  - `export const mentorProfile: Hono<AppEnv>`
  - `export async function loadProfileV2(mentorId: string): Promise<{ profile: MentorProfileV2; missing: …; complete: boolean }>`

- [ ] **Step 1: Write the failing test**

```ts
// scripts/mentor-profile.test.ts
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq, inArray, like } from 'drizzle-orm';
import { app } from '../server/app';
import { db, client } from '../server/db/client';
import { competitions, hackathonNames, mentorExperiences, mentorSkills, mentorSubmissions, mentors, sessions, users } from '../server/db/schema';
import { testDatabase } from '../server/lib/database-safety';
import { createSession } from '../server/lib/session';

/* โปรไฟล์เมนเทอร์แบบใหม่ (spec 2026-10-13 หมวด A–F) */
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
export const fullProfile = {
  headline: 'AI Engineer | 3× Hackathon Mentor', country: 'TH', timeZone: 'Asia/Bangkok', languages: ['th', 'en'],
  background: 'วิศวกรรมคอมพิวเตอร์', gender: null,
  skills: [{ tag: 'python', level: 'expert' }, { tag: 'react', level: 'advanced' }],
  helpsWith: ['coding', 'mvp'], learnerLevels: ['beginner', 'intermediate'], teachingStyles: ['step_by_step'], formats: ['one_on_one', 'team'],
  deliverables: 'สรุปสิ่งที่ต้องแก้', availability: [{ day: 6, from: '09:00', to: '12:00' }], sessionsPerWeek: 3, sessionMinutes: [60],
  acceptingRequests: true, replyHours: 24, acceptsUrgent: true, mode: 'online',
};

after(async () => {
  await db.delete(mentorSkills).where(inArray(mentorSkills.mentorId, mentorIds.concat('-')));
  await db.delete(mentorExperiences).where(inArray(mentorExperiences.mentorId, mentorIds.concat('-')));
  await db.delete(hackathonNames).where(like(hackathonNames.name, `${prefix}%`));
  await db.delete(competitions).where(like(competitions.id, `${prefix}%`));
  await db.delete(mentorSubmissions).where(like(mentorSubmissions.id, `${prefix}%`));
  await db.delete(mentors).where(inArray(mentors.id, mentorIds.concat('-')));
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
  ]) assert.equal((await send('PUT', '/consult/zone/profile', owner.cookie, bad)).status, 400, JSON.stringify(bad).slice(0, 80));

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/test-environment.mjs auth -- --test-name-pattern="profile:"`. If arg passthrough is awkward, temporarily run with env loaded: `APP_ENV=test node --env-file=.env.local --import tsx --test scripts/mentor-profile.test.ts`.
Expected: FAIL, 404 on `/consult/zone/profile`

- [ ] **Step 3: Write the route file**

```ts
// server/routes/mentor-profile.ts
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { mentorExperiences, mentorSkills, mentors, mentorSubmissions } from '../db/schema.js';
import { requireUser, type AppEnv } from '../lib/guards.js';
import { env } from '../lib/env.js';
import {
  formats, genders, helpsWith, languages, learnerLevels, missingSections, modes, replyHoursOptions, sessionLengths, skillLevels, skillTags, slotProblem, teachingStyles,
} from '../../src/data/matching.js';
import type { MentorProfileV2 } from '../../src/data/matching.js';

/* โปรไฟล์เมนเทอร์แบบใหม่ หมวด A, B, D, E (หมวด C อยู่ใน /zone/experiences หมวด F คำนวณเอง)
   spec docs/superpowers/specs/2026-10-13-mentor-matching-design.md */

export const mentorProfile = new Hono<AppEnv>();
mentorProfile.use('*', async (c, next) => {
  c.header('Cache-Control', 'private, no-store');
  const origin = c.req.header('origin');
  if (c.req.method !== 'GET' && origin && origin !== env.appOrigin) return c.json({ error: 'คำขอต้องมาจากเว็บนี้' }, 403);
  await next();
});

type Status = 400 | 403 | 404 | 409;
export const fail = (message: string, status: Status = 400): never => { throw new HTTPException(status, { message }); };
export async function parse<T>(c: { req: { json: () => Promise<unknown> } }, schema: z.ZodType<T>) {
  const result = schema.safeParse(await c.req.json().catch(() => null));
  if (!result.success) return fail(result.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง');
  return result.data;
}
export async function requireMentor(userId: string) {
  const [row] = await db.select({ mentor: mentors }).from(mentors)
    .innerJoin(mentorSubmissions, and(eq(mentorSubmissions.publishedMentorId, mentors.id), eq(mentorSubmissions.status, 'published')))
    .where(eq(mentorSubmissions.userId, userId)).limit(1);
  return row?.mentor ?? fail('ต้องเป็นเมนเทอร์ที่ผ่านอนุมัติ', 403);
}

const unique = <T extends string | number>(list: readonly T[]) => z.array(z.enum(list.map(String) as [string, ...string[]]))
  .refine((v) => new Set(v).size === v.length, 'มีตัวเลือกซ้ำ') as unknown as z.ZodType<T[]>;
const pick = <T extends readonly string[]>(list: T, message: string) => z.array(z.enum(list as unknown as [string, ...string[]]))
  .min(1, message).refine((v) => new Set(v).size === v.length, 'มีตัวเลือกซ้ำ');

const profileBody = z.object({
  headline: z.string().trim().max(80),
  country: z.string().trim().regex(/^[A-Z]{2}$|^$/, 'เลือกประเทศ'),
  timeZone: z.string().trim().min(1).max(60),
  languages: pick(languages, 'เลือกภาษาที่ให้คำปรึกษาอย่างน้อยหนึ่งภาษา'),
  background: z.string().trim().max(200),
  gender: z.enum(genders).nullable(),
  skills: z.array(z.object({ tag: z.enum(skillTags as [string, ...string[]]), level: z.enum(skillLevels) }))
    .min(1, 'เลือกทักษะอย่างน้อยหนึ่งอย่าง').max(20)
    .refine((v) => new Set(v.map((s) => s.tag)).size === v.length, 'ทักษะซ้ำ'),
  helpsWith: z.array(z.enum(helpsWith)).max(helpsWith.length),
  learnerLevels: z.array(z.enum(learnerLevels)).max(learnerLevels.length),
  teachingStyles: z.array(z.enum(teachingStyles)).max(teachingStyles.length),
  formats: z.array(z.enum(formats)).max(formats.length),
  deliverables: z.string().trim().max(500),
  availability: z.array(z.object({ day: z.number().int(), from: z.string(), to: z.string() }))
    .max(21).refine((v) => v.every((slot) => slotProblem(slot) === null), 'ช่วงเวลาว่างไม่ถูกต้อง (ใช้ HH:MM และเวลาจบต้องหลังเวลาเริ่ม)'),
  sessionsPerWeek: z.number().int().min(1).max(20).nullable(),
  sessionMinutes: z.array(z.number().int()).refine((v) => v.every((m) => (sessionLengths as readonly number[]).includes(m)), 'เวลาต่อ Session เลือกได้ 30, 60 หรือ 90 นาที'),
  acceptingRequests: z.boolean(),
  replyHours: z.number().int().nullable().refine((v) => v === null || (replyHoursOptions as readonly number[]).includes(v), 'เลือกเวลาตอบกลับจากรายการ'),
  acceptsUrgent: z.boolean(),
  mode: z.enum(modes).nullable(),
});
void unique;

export async function loadProfileV2(mentorId: string) {
  const [m] = await db.select().from(mentors).where(eq(mentors.id, mentorId));
  const skills = await db.select({ tag: mentorSkills.tag, level: mentorSkills.level }).from(mentorSkills).where(eq(mentorSkills.mentorId, mentorId)).orderBy(mentorSkills.tag);
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(mentorExperiences)
    .where(and(eq(mentorExperiences.mentorId, mentorId), sql`${mentorExperiences.status} <> 'rejected'`));
  const profile: MentorProfileV2 = {
    headline: m.headline, country: m.country, timeZone: m.timeZone, languages: m.languages as MentorProfileV2['languages'], background: m.background, gender: m.gender ?? null,
    skills: skills as MentorProfileV2['skills'],
    helpsWith: m.helpsWith as MentorProfileV2['helpsWith'], learnerLevels: m.learnerLevels as MentorProfileV2['learnerLevels'],
    teachingStyles: m.teachingStyles as MentorProfileV2['teachingStyles'], formats: m.formats as MentorProfileV2['formats'], deliverables: m.deliverables,
    availability: m.availability, sessionsPerWeek: m.sessionsPerWeek, sessionMinutes: m.sessionMinutes, acceptingRequests: m.acceptingRequests,
    replyHours: m.replyHours, acceptsUrgent: m.acceptsUrgent, mode: m.mode ?? null,
  };
  const missing = missingSections(profile, count);
  return { profile, missing, complete: missing.length === 0 };
}

mentorProfile.get('/consult/zone/profile', requireUser, async (c) => {
  const mentor = await requireMentor(c.get('user')!.id);
  return c.json(await loadProfileV2(mentor.id));
});

mentorProfile.put('/consult/zone/profile', requireUser, async (c) => {
  const mentor = await requireMentor(c.get('user')!.id);
  const body = await parse(c, profileBody);
  await db.transaction(async (tx) => {
    const { skills, ...columns } = body;
    await tx.update(mentors).set(columns).where(eq(mentors.id, mentor.id));
    // แทนที่ทักษะทั้งชุด ฟอร์มส่งมาครบทุกครั้ง
    await tx.delete(mentorSkills).where(eq(mentorSkills.mentorId, mentor.id));
    await tx.insert(mentorSkills).values(skills.map((s) => ({ mentorId: mentor.id, tag: s.tag, level: s.level })));
  });
  return c.json(await loadProfileV2(mentor.id));
});
```

Remove the unused `unique` helper and its `void unique;` line if lint complains; they are not needed. In `server/app.ts`, mount it next to the consult routes. Read how `consult` is mounted (e.g. `app.route('/api/consult', consult)`) and add `app.route('/api', mentorProfile)` **before** the consult mount, so `/api/consult/zone/profile` is matched by this router first:

```ts
import { mentorProfile } from './routes/mentor-profile.js';
// ...
app.route('/api', mentorProfile);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node scripts/test-environment.mjs auth`
Expected: the `profile:` test passes, all others still pass.

- [ ] **Step 5: Commit**

```bash
git add server/routes/mentor-profile.ts server/app.ts scripts/mentor-profile.test.ts
git commit -m "feat: mentor zone profile API for sections A, B, D and E"
```

---

### Task 4: Experiences API (C) and competition-name autocomplete

**Files:**
- Modify: `server/routes/mentor-profile.ts`, `server/routes/consult.ts` (only-verified filters at lines ~145, 300, 304, 375, 408, 438)
- Test: `scripts/mentor-profile.test.ts` (new test)

**Interfaces:**
- Consumes: `requireMentor`, `parse`, `fail` (Task 3); `normalizeName`, `experienceKinds`, `experienceResults`, `teamRoles` (Task 1)
- Produces:
  - `GET /api/consult/zone/experiences` → `{ items: ExperienceRow[] }`
  - `POST /api/consult/zone/experiences` → 201 `{ id }`, or 409 on a duplicate
  - `DELETE /api/consult/zone/experiences/:id` → 200; only `pending`/`rejected` rows of the caller
  - `GET /api/hackathon-names?q=` → `{ items: { id: string | null; slug: string | null; name: string }[] }` (max 8; competitions have `slug`, typed names have `id`)
  - `type ExperienceRow = { id; name; competitionSlug: string | null; year; kind; result; detail; role; roleOther; responsibility; evidenceUrl; lessons; status; reason; createdAt }`

- [ ] **Step 1: Write the failing test** (append to `scripts/mentor-profile.test.ts`)

```ts
test('experiences: typed names autocomplete, pending until checked, duplicates rejected', async () => {
  const owner = await account();
  const other = await account();
  const mentorId = await mentorOf(owner.id);
  await mentorOf(other.id);
  const slug = `${prefix}-cup`;
  await db.insert(competitions).values({
    id: `${prefix}-c1`, slug, name: `${prefix} Listed Cup`, description: 'x', type: 'contest', org: 'x', closesAt: '2099-01-01', region: 'online',
    prizeValue: 0, teamMin: 1, teamMax: 3, keywords: [], sourceUrl: 'https://example.test', source: 'editorial', lastVerifiedAt: '2026-01-01',
  });
  const base = { year: '2567', kind: 'hackathon', result: 'finalist', detail: '', role: 'developer', roleOther: '',
    responsibility: 'เขียน backend', evidenceUrl: 'https://example.test/proof', lessons: '' };

  // ต้องมีลิงก์ https และชื่อรางวัลเมื่อได้รางวัล
  assert.equal((await send('POST', '/consult/zone/experiences', owner.cookie, { ...base, name: `${prefix} Typed Hack`, evidenceUrl: 'ftp://x' })).status, 400);
  assert.equal((await send('POST', '/consult/zone/experiences', owner.cookie, { ...base, name: `${prefix} Typed Hack`, result: 'winner' })).status, 400);

  const typed = await send('POST', '/consult/zone/experiences', owner.cookie, { ...base, name: `${prefix} Typed  Hack` });
  assert.equal(typed.status, 201, await typed.clone().text());
  // ชื่อเดิมต่างแค่ตัวพิมพ์/ช่องว่าง ปีเดียวกัน = ซ้ำ
  assert.equal((await send('POST', '/consult/zone/experiences', owner.cookie, { ...base, name: `${prefix} typed hack` })).status, 409);
  // งานที่มีในระบบเลือกด้วย slug
  const listed = await send('POST', '/consult/zone/experiences', owner.cookie, { ...base, competitionSlug: slug, name: '' });
  assert.equal(listed.status, 201, await listed.clone().text());
  assert.equal((await send('POST', '/consult/zone/experiences', owner.cookie, { ...base, competitionSlug: slug, name: '' })).status, 409);

  // คนถัดไปเห็นชื่อที่พิมพ์ไว้ในการเติมคำ
  const names = await (await send('GET', `/hackathon-names?q=${encodeURIComponent(prefix + ' typed')}`, other.cookie)).json() as { items: { name: string }[] };
  assert.deepEqual(names.items.map((n) => n.name), [`${prefix} Typed Hack`]);
  const both = await (await send('GET', `/hackathon-names?q=${encodeURIComponent(prefix)}`, other.cookie)).json() as { items: { name: string; slug: string | null }[] };
  assert.ok(both.items.some((n) => n.slug === slug));

  const mine = await (await send('GET', '/consult/zone/experiences', owner.cookie)).json() as { items: { id: string; status: string }[] };
  assert.deepEqual(mine.items.map((i) => i.status), ['pending', 'pending']);

  // ประสบการณ์ที่รอตรวจยังใช้รับปรึกษางานนั้นไม่ได้
  assert.equal((await send('PUT', `/consult/zone/competitions/${slug}`, owner.cookie, { price: 0 })).status, 403);
  const state = await (await send('GET', `/consult/zone/competitions/${slug}`, owner.cookie)).json() as { state: string };
  assert.notEqual(state.state, 'eligible');

  // ลบของคนอื่นไม่ได้ ลบของตัวเองที่รอตรวจได้
  assert.equal((await send('DELETE', `/consult/zone/experiences/${mine.items[0].id}`, other.cookie)).status, 404);
  assert.equal((await send('DELETE', `/consult/zone/experiences/${mine.items[0].id}`, owner.cookie)).status, 200);
  void mentorId;
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/test-environment.mjs auth`
Expected: FAIL, 404 on `/consult/zone/experiences`

- [ ] **Step 3: Implement the routes** (append to `server/routes/mentor-profile.ts`; extend imports with `competitions, hackathonNames, mentorExperiences, staffAlerts?` — only what is used — plus `desc, ilike, or, inArray`, `newId` from `../lib/id.js`, `notifyStaff` from `../lib/staff-notify.js`)

```ts
const experienceBody = z.object({
  competitionSlug: z.string().trim().max(200).optional(),
  name: z.string().trim().max(200).default(''),
  year: z.string().regex(/^25\d\d$/, 'ปีที่เข้าร่วมเป็น พ.ศ. 4 หลัก'),
  kind: z.enum(experienceKinds),
  result: z.enum(experienceResults),
  detail: z.string().trim().max(200).default(''),
  role: z.enum(teamRoles),
  roleOther: z.string().trim().max(80).default(''),
  responsibility: z.string().trim().min(1, 'บอกสิ่งที่รับผิดชอบในการแข่งขัน').max(1000),
  evidenceUrl: z.string().trim().max(500).refine((v) => /^https:\/\/\S+$/i.test(v), 'ลิงก์หลักฐานต้องขึ้นต้นด้วย https://'),
  lessons: z.string().trim().max(1000).default(''),
}).refine((v) => v.competitionSlug || v.name.length > 0, 'ใส่ชื่องานแข่ง')
  .refine((v) => v.result !== 'winner' || v.detail.length > 0, 'ระบุรางวัลที่ได้')
  .refine((v) => v.result !== 'other' || v.detail.length > 0, 'อธิบายผลการแข่งขัน')
  .refine((v) => v.role !== 'other' || v.roleOther.length > 0, 'ระบุบทบาทในทีม');

const experienceJson = (row: typeof mentorExperiences.$inferSelect, slug: string | null) => ({
  id: row.id, name: row.name, competitionSlug: slug, year: row.year, kind: row.kind, result: row.result, detail: row.detail,
  role: row.role, roleOther: row.roleOther, responsibility: row.responsibility, evidenceUrl: row.evidenceUrl, lessons: row.lessons,
  status: row.status, reason: row.reason, createdAt: row.createdAt,
});

mentorProfile.get('/consult/zone/experiences', requireUser, async (c) => {
  const mentor = await requireMentor(c.get('user')!.id);
  const rows = await db.select({ row: mentorExperiences, slug: competitions.slug }).from(mentorExperiences)
    .leftJoin(competitions, eq(competitions.id, mentorExperiences.competitionId))
    .where(eq(mentorExperiences.mentorId, mentor.id)).orderBy(desc(mentorExperiences.createdAt));
  return c.json({ items: rows.map(({ row, slug }) => experienceJson(row, slug)) });
});

mentorProfile.post('/consult/zone/experiences', requireUser, async (c) => {
  const user = c.get('user')!;
  const mentor = await requireMentor(user.id);
  const body = await parse(c, experienceBody);
  const [{ waiting }] = await db.select({ waiting: sql<number>`count(*)::int` }).from(mentorExperiences)
    .where(and(eq(mentorExperiences.mentorId, mentor.id), eq(mentorExperiences.status, 'pending')));
  if (waiting >= 10) return fail('มีประสบการณ์รอตรวจครบ 10 รายการแล้ว รอทีมงานตรวจก่อน', 409);

  let competitionId: string | null = null;
  let hackathonNameId: string | null = null;
  let name = body.name;
  if (body.competitionSlug) {
    const [event] = await db.select({ id: competitions.id, name: competitions.name }).from(competitions).where(eq(competitions.slug, body.competitionSlug));
    if (!event) return fail('ไม่พบงานแข่งนี้', 404);
    competitionId = event.id;
    name = event.name;
  } else {
    // ชื่อที่ตรงกับงานในระบบ (หลัง normalize) ผูกกับงานนั้นแทน ไม่สร้างชื่อซ้ำ
    const normalized = normalizeName(name);
    const [event] = await db.select({ id: competitions.id, name: competitions.name }).from(competitions)
      .where(sql`regexp_replace(lower(trim(${competitions.name})), '\\s+', ' ', 'g') = ${normalized}`).limit(1);
    if (event) { competitionId = event.id; name = event.name; }
    else {
      await db.insert(hackathonNames).values({ id: newId('hkn'), name: name.replace(/\s+/g, ' '), normalized, createdBy: user.id }).onConflictDoNothing();
      const [row] = await db.select().from(hackathonNames).where(eq(hackathonNames.normalized, normalized));
      hackathonNameId = row.id;
      name = row.name;
    }
  }
  const id = newId('exp');
  const [created] = await db.insert(mentorExperiences).values({
    id, mentorId: mentor.id, competitionId, hackathonNameId, name, year: body.year, kind: body.kind, result: body.result, detail: body.detail,
    role: body.role, roleOther: body.role === 'other' ? body.roleOther : '', responsibility: body.responsibility, evidenceUrl: body.evidenceUrl,
    lessons: body.lessons, status: 'pending',
  }).onConflictDoNothing().returning({ id: mentorExperiences.id });
  if (!created) return fail('มีงานนี้ในปีนี้อยู่แล้ว', 409);
  await notifyStaff('mentor_experience', { actorId: user.id, title: `เมนเทอร์ ${mentor.name} เพิ่มประสบการณ์ ${name} ${body.year}`, path: '/admin/experiences' });
  return c.json({ id }, 201);
});

mentorProfile.delete('/consult/zone/experiences/:id', requireUser, async (c) => {
  const mentor = await requireMentor(c.get('user')!.id);
  // ลบได้เฉพาะที่ยังไม่ผ่านการตรวจ ที่ตรวจแล้วเป็นหลักฐานของคะแนนและป้าย ต้องให้ทีมงานจัดการ
  const [gone] = await db.delete(mentorExperiences)
    .where(and(eq(mentorExperiences.id, c.req.param('id')), eq(mentorExperiences.mentorId, mentor.id), inArray(mentorExperiences.status, ['pending', 'rejected'])))
    .returning({ id: mentorExperiences.id });
  if (!gone) return fail('ไม่พบรายการนี้', 404);
  return c.json({ ok: true });
});

mentorProfile.get('/hackathon-names', async (c) => {
  const q = normalizeName(c.req.query('q') ?? '').slice(0, 80);
  if (q.length < 2) return c.json({ items: [] });
  const like = `%${q.replace(/[%_\\]/g, (ch) => `\\${ch}`)}%`;
  const [listed, typed] = await Promise.all([
    db.select({ slug: competitions.slug, name: competitions.name }).from(competitions).where(ilike(competitions.name, like)).limit(8),
    db.select({ id: hackathonNames.id, name: hackathonNames.name }).from(hackathonNames).where(ilike(hackathonNames.normalized, like)).limit(8),
  ]);
  return c.json({ items: [...listed.map((r) => ({ id: null, slug: r.slug, name: r.name })), ...typed.map((r) => ({ id: r.id, slug: null, name: r.name }))].slice(0, 8) });
});
```

`notifyStaff` takes a kind key. Open `server/lib/staff-notify.ts`, add `'mentor_experience'` to its kind list with Thai label `'ประสบการณ์เมนเทอร์รอตรวจ'`, and copy the exact call signature used in `consult.ts` `/zone/claims` (adjust the call above to match it).

Then make every existing reader count only verified rows. In `server/routes/consult.ts`:
- line ~146: add `eq(mentorExperiences.status, 'verified')` to the `where`
- lines ~300 and ~304 (raw SQL): add `and me.status = 'verified'`
- lines ~375–376, ~408–409, ~438–439: add `eq(mentorExperiences.status, 'verified')` to each `and(...)`

Search `server/lib/mentor-rank.ts` and `server/routes/rising-star.ts` for `mentor_experiences`/`mentorExperiences` and add the same filter wherever rows are read.

- [ ] **Step 4: Run the tests**

Run: `node scripts/test-environment.mjs auth`
Expected: all pass, including `mentor-claims` and `consult-api`.

- [ ] **Step 5: Commit**

```bash
git add server/routes/mentor-profile.ts server/routes/consult.ts server/lib scripts/mentor-profile.test.ts
git commit -m "feat: mentors add detailed competition experiences that wait for evidence review; typed names feed autocomplete"
```

---

### Task 5: Admin experience review API

**Files:**
- Modify: `server/routes/admin.ts`
- Test: `scripts/mentor-profile.test.ts`

**Interfaces:**
- Produces:
  - `GET /api/admin/experiences?status=pending|verified|rejected|all` → `{ items: (ExperienceRow & { mentorId: string; mentorName: string })[] }`
  - `POST /api/admin/experiences/:id/decision` with `{ decision: 'verify' } | { decision: 'reject', reason: string }` → 200, 404 if missing, 409 if not pending
  - On verify: sets `status`, `reviewedBy`, `reviewedAt`. It does **not** auto-add a `help` choice (the mentor picks competitions in Mentor zone as today).

- [ ] **Step 1: Write the failing test** (append)

```ts
test('admin verifies or rejects experiences; members cannot', async () => {
  const owner = await account();
  const member = await account();
  const admin = await account('admin');
  await mentorOf(owner.id);
  const created = await (await send('POST', '/consult/zone/experiences', owner.cookie, {
    name: `${prefix} Review Hack`, year: '2566', kind: 'hackathon', result: 'participant', detail: '', role: 'designer', roleOther: '',
    responsibility: 'ออกแบบหน้าจอ', evidenceUrl: 'https://example.test/p2', lessons: 'วางแผนเวลา',
  })).json() as { id: string };

  assert.equal((await send('GET', '/admin/experiences', member.cookie)).status, 403);
  assert.equal((await send('POST', `/admin/experiences/${created.id}/decision`, member.cookie, { decision: 'verify' })).status, 403);
  const queue = await (await send('GET', '/admin/experiences?status=pending', admin.cookie)).json() as { items: { id: string; evidenceUrl: string; mentorName: string }[] };
  const row = queue.items.find((i) => i.id === created.id)!;
  assert.equal(row.evidenceUrl, 'https://example.test/p2');
  assert.equal((await send('POST', `/admin/experiences/${created.id}/decision`, admin.cookie, { decision: 'reject', reason: '' })).status, 400);
  assert.equal((await send('POST', `/admin/experiences/${created.id}/decision`, admin.cookie, { decision: 'verify' })).status, 200);
  assert.equal((await send('POST', `/admin/experiences/${created.id}/decision`, admin.cookie, { decision: 'verify' })).status, 409);
  const [stored] = await db.select().from(mentorExperiences).where(eq(mentorExperiences.id, created.id));
  assert.deepEqual([stored.status, stored.reviewedBy], ['verified', admin.id]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node scripts/test-environment.mjs auth`
Expected: FAIL (404)

- [ ] **Step 3: Implement in `server/routes/admin.ts`** (add `hackathonNames` is not needed; `mentors` and `mentorExperiences` are already imported — confirm `mentors` is; add it if not)

```ts
/* ---------- ประสบการณ์แข่งขันที่เมนเทอร์เพิ่มเอง (spec 2026-10-13 หมวด C) ---------- */

admin.get('/experiences', async (c) => {
  const status = c.req.query('status') ?? 'pending';
  const rows = await db.select({ row: mentorExperiences, slug: competitions.slug, mentorName: mentors.name }).from(mentorExperiences)
    .innerJoin(mentors, eq(mentors.id, mentorExperiences.mentorId))
    .leftJoin(competitions, eq(competitions.id, mentorExperiences.competitionId))
    .where(status === 'all' ? undefined : eq(mentorExperiences.status, status as 'pending'))
    .orderBy(desc(mentorExperiences.createdAt)).limit(200);
  return c.json({ items: rows.map(({ row, slug, mentorName }) => ({
    id: row.id, mentorId: row.mentorId, mentorName, name: row.name, competitionSlug: slug, year: row.year, kind: row.kind, result: row.result,
    detail: row.detail, role: row.role, roleOther: row.roleOther, responsibility: row.responsibility, evidenceUrl: row.evidenceUrl,
    lessons: row.lessons, status: row.status, reason: row.reason, createdAt: row.createdAt,
  })) });
});

admin.post('/experiences/:id/decision', async (c) => {
  const user = c.get('user')!;
  const parsed = z.discriminatedUnion('decision', [
    z.object({ decision: z.literal('verify') }),
    z.object({ decision: z.literal('reject'), reason: z.string().trim().min(1, 'บอกเหตุผลให้เมนเทอร์') .max(500) }),
  ]).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' });
  const body = parsed.data;
  const [row] = await db.select({ id: mentorExperiences.id, status: mentorExperiences.status }).from(mentorExperiences).where(eq(mentorExperiences.id, c.req.param('id')));
  if (!row) throw new HTTPException(404, { message: 'ไม่พบรายการนี้' });
  const [done] = await db.update(mentorExperiences)
    .set({ status: body.decision === 'verify' ? 'verified' : 'rejected', reason: body.decision === 'reject' ? body.reason : '', reviewedBy: user.id, reviewedAt: new Date() })
    .where(and(eq(mentorExperiences.id, row.id), eq(mentorExperiences.status, 'pending'))).returning({ id: mentorExperiences.id });
  if (!done) throw new HTTPException(409, { message: 'รายการนี้ตรวจไปแล้ว' });
  return c.json({ ok: true });
});
```

The `admin.use('*', requireReviewer)` at the top already blocks members with 403. Check that it does by reading `requireReviewer` in `server/lib/guards.ts`. If it returns 401/404 instead, change the two test expectations to match.

- [ ] **Step 4: Run tests** — `node scripts/test-environment.mjs auth` → PASS

- [ ] **Step 5: Commit**

```bash
git add server/routes/admin.ts scripts/mentor-profile.test.ts
git commit -m "feat: admin queue to verify or reject mentor experiences"
```

---

### Task 6: Public profile payload v2, trust stats (F), completeness in /zone

**Files:**
- Create: `server/lib/mentor-stats.ts`
- Modify: `server/routes/consult.ts` (`/mentors/:id` ~173, `/zone` ~286)
- Test: `scripts/mentor-profile.test.ts`

**Interfaces:**
- Consumes: `loadProfileV2` (Task 3)
- Produces:
  - `mentorStats(mentorId): Promise<{ emailVerified: boolean; completedSessions: number; responseRate: number | null; evidenceLinks: number }>`
  - `GET /consult/mentors/:id` adds `profile: MentorProfileV2` (gender omitted from public output), `experiences: ExperienceRow[]` (verified + pending only, no `reason`, no `evidenceUrl` for pending) and `stats`
  - `GET /consult/zone` adds `profileComplete: boolean` and `profileMissing: string[]`

- [ ] **Step 1: Write the failing test** (append)

```ts
test('public profile shows sections A–F without private fields', async () => {
  const owner = await account();
  const visitor = await account();
  const mentorId = await mentorOf(owner.id);
  await send('PUT', '/consult/zone/profile', owner.cookie, { ...fullProfile, gender: 'female' });
  await send('POST', '/consult/zone/experiences', owner.cookie, {
    name: `${prefix} Public Hack`, year: '2565', kind: 'software', result: 'winner', detail: 'รางวัลที่ 1', role: 'leader', roleOther: '',
    responsibility: 'นำทีม', evidenceUrl: 'https://example.test/p3', lessons: '',
  });
  const page = await (await send('GET', `/consult/mentors/${mentorId}`, visitor.cookie)).json() as {
    profile: Record<string, unknown>; experiences: { status: string; evidenceUrl?: string }[]; stats: { completedSessions: number; responseRate: number | null };
  };
  assert.equal(page.profile.headline, fullProfile.headline);
  assert.equal('gender' in page.profile, false);
  assert.equal(page.experiences[0].status, 'pending');
  assert.equal(page.experiences[0].evidenceUrl, undefined);
  assert.deepEqual([page.stats.completedSessions, page.stats.responseRate], [0, null]);

  const zone = await (await send('GET', '/consult/zone', owner.cookie)).json() as { profileComplete: boolean; profileMissing: string[] };
  // มีประสบการณ์ (รอตรวจ) แล้ว นับว่ากรอกหมวด C ครบ
  assert.deepEqual([zone.profileComplete, zone.profileMissing], [true, []]);
});
```

- [ ] **Step 2: Run to verify it fails** — expected FAIL (`profile` undefined)

- [ ] **Step 3: Implement**

```ts
// server/lib/mentor-stats.ts
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { consultations, mentorExperiences, mentorSubmissions, users } from '../db/schema.js';

/* หมวด F ความน่าเชื่อถือ คำนวณจากข้อมูลจริง เมนเทอร์กรอกเองไม่ได้
   อัตราตอบรับ = งานที่เมนเทอร์ตอบแล้ว (ยืนยันหรือปฏิเสธ) ÷ งานที่ผู้ใช้กดว่าได้รับคำปรึกษา ยังไม่มีงาน = null */
export async function mentorStats(mentorId: string) {
  const [owner] = await db.select({ verifiedAt: users.emailVerifiedAt }).from(mentorSubmissions)
    .innerJoin(users, eq(users.id, mentorSubmissions.userId))
    .where(and(eq(mentorSubmissions.publishedMentorId, mentorId), eq(mentorSubmissions.status, 'published'))).limit(1);
  const [counts] = await db.select({
    completed: sql<number>`count(*) filter (where ${consultations.status} = 'completed')::int`,
    answered: sql<number>`count(*) filter (where ${consultations.status} in ('completed', 'denied'))::int`,
    asked: sql<number>`count(*) filter (where ${consultations.status} in ('claimed', 'completed', 'denied'))::int`,
  }).from(consultations).where(and(eq(consultations.mentorId, mentorId), inArray(consultations.status, ['claimed', 'completed', 'denied'])));
  const [{ links }] = await db.select({ links: sql<number>`count(*)::int` }).from(mentorExperiences)
    .where(and(eq(mentorExperiences.mentorId, mentorId), eq(mentorExperiences.status, 'verified'), sql`${mentorExperiences.evidenceUrl} <> ''`));
  return {
    emailVerified: Boolean(owner?.verifiedAt),
    completedSessions: counts?.completed ?? 0,
    responseRate: counts && counts.asked > 0 ? Math.round((counts.answered / counts.asked) * 100) : null,
    evidenceLinks: links,
  };
}
```

In `consult.get('/mentors/:id')`, add to the `Promise.all` and to the JSON response:

```ts
// imports at top of consult.ts
import { loadProfileV2 } from './mentor-profile.js';
import { mentorStats } from '../lib/mentor-stats.js';

// inside the handler, after `const m = row.mentor;`
const [v2, stats, experienceRows] = await Promise.all([
  loadProfileV2(m.id),
  mentorStats(m.id),
  db.select({ row: mentorExperiences, slug: competitions.slug }).from(mentorExperiences)
    .leftJoin(competitions, eq(competitions.id, mentorExperiences.competitionId))
    .where(and(eq(mentorExperiences.mentorId, m.id), inArray(mentorExperiences.status, ['verified', 'pending'])))
    .orderBy(desc(mentorExperiences.year)),
]);
const { gender: _gender, ...publicProfile } = v2.profile;

// in the c.json({...}) object
profile: publicProfile,
experiences: experienceRows.map(({ row, slug }) => ({
  id: row.id, name: row.name, competitionSlug: slug, year: row.year, kind: row.kind, result: row.result, detail: row.detail,
  role: row.role, roleOther: row.roleOther, responsibility: row.responsibility, lessons: row.lessons, status: row.status,
  // ลิงก์หลักฐานเปิดเฉพาะรายการที่ทีมงานตรวจแล้ว
  ...(row.status === 'verified' ? { evidenceUrl: row.evidenceUrl } : {}),
})),
stats,
```

In `consult.get('/zone')`, after `if (!mentor) return …`, add `const v2 = await loadProfileV2(mentor.id);` and put `profileComplete: v2.complete, profileMissing: v2.missing,` in the response object.

Watch for a circular import: `mentor-profile.ts` must not import from `consult.ts` (it does not in this plan).

- [ ] **Step 4: Run tests** — `node scripts/test-environment.mjs auth` → PASS

- [ ] **Step 5: Commit**

```bash
git add server/lib/mentor-stats.ts server/routes/consult.ts scripts/mentor-profile.test.ts
git commit -m "feat: public mentor profile carries sections A-F and computed trust stats"
```

---

### Task 7: i18n labels

**Files:**
- Modify: `src/i18n/en.ts` (add a top-level `mentorProfileV2` key after `mentorZone`), `src/i18n/th.ts` (same keys)

**Interfaces:**
- Produces: `t.mentorProfileV2` with option-label maps keyed by the ids in `src/data/matching.ts` and the form/section copy used in Tasks 8–11.

- [ ] **Step 1: Add the English block**

```ts
  mentorProfileV2: {
    tab: 'Profile',
    experiencesTab: 'Experience',
    bannerTitle: 'Complete your profile to start getting matched',
    bannerText: (sections: string) => `Still missing: ${sections}. Your public page stays visible meanwhile.`,
    sectionNames: { A: 'Basic profile', B: 'Technical expertise', C: 'Competition experience', D: 'Mentoring capability', E: 'Availability' },
    save: 'Save profile', saving: 'Saving…', saved: 'Profile saved',
    headline: 'Headline', headlineHint: 'For example: AI Engineer | 3× Hackathon Mentor',
    country: 'Country', timeZone: 'Time zone', languages: 'Languages you mentor in', background: 'Education or current field',
    gender: 'Gender (optional)', genderHint: 'Only used when a student asks for a specific gender. Never shown publicly.', genderNone: 'Prefer not to say',
    skills: 'Skills', skillsHint: 'Pick the skills you can help with and your level for each.', skillLevel: (skill: string) => `Level for ${skill}`,
    notSelected: 'Not selected',
    helpsWith: 'What you can help with', learnerLevels: 'Students you work best with', teachingStyles: 'How you teach', formats: 'Consultation formats',
    deliverables: 'What students get after a session', cannot: 'Topics you don’t take',
    availability: 'When you’re available', addSlot: 'Add a time', removeSlot: 'Remove this time', day: 'Day', from: 'From', to: 'To',
    sessionsPerWeek: 'Sessions per week', sessionMinutes: 'Session length', minutes: (n: number) => `${n} min`,
    acceptingRequests: 'Accepting new requests', replyHours: 'Usual reply time', acceptsUrgent: 'Can take urgent requests before a competition',
    mode: 'Format', replyOptions: { 6: 'Within 6 hours', 24: 'Within 1 day', 72: 'Within 3 days', 168: 'Within a week' } as Record<number, string>,
    days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    skillGroups: { programming: 'Programming', webApp: 'Web / App', aiMl: 'AI / ML', hardware: 'Hardware / IoT / Robotics', dataCloud: 'Data / Security / Cloud', design: 'UI/UX / Product design', business: 'Business / Startup / Marketing', pitch: 'Pitching / Presentation' },
    skillNames: { python: 'Python', javascript: 'JavaScript', cpp: 'C++', java: 'Java', react: 'React', nextjs: 'Next.js', mobile: 'Mobile app', ml: 'Machine learning', llm: 'LLM', cv: 'Computer vision', hardware_iot_robotics: 'Hardware / IoT / Robotics', data_science: 'Data science', cybersecurity: 'Cybersecurity', cloud: 'Cloud', uiux: 'UI/UX', product_design: 'Product design', business_model: 'Business model', startup: 'Startup', marketing: 'Marketing', pitching: 'Pitching', presentation: 'Presentation', storytelling: 'Storytelling' },
    levelNames: { intermediate: 'Intermediate', advanced: 'Advanced', expert: 'Expert' },
    languageNames: { th: 'Thai', en: 'English' },
    genderNames: { male: 'Male', female: 'Female' },
    helpsWithNames: { idea_validation: 'Idea validation', coding: 'Coding', debugging: 'Debugging', architecture: 'Architecture', mvp: 'MVP', pitch_deck: 'Pitch deck', presentation: 'Presentation' },
    learnerLevelNames: { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' },
    teachingStyleNames: { step_by_step: 'Step by step', guided_questions: 'Guiding questions', review: 'Reviewing work', direct_feedback: 'Direct feedback' },
    formatNames: { one_on_one: '1-on-1', team: 'Team mentoring', code_review: 'Code review' },
    modeNames: { online: 'Online', onsite: 'On-site', both: 'Both' },
    countries: { TH: 'Thailand', SG: 'Singapore', MY: 'Malaysia', VN: 'Vietnam', ID: 'Indonesia', PH: 'Philippines', JP: 'Japan', US: 'United States', GB: 'United Kingdom', ZZ: 'Other' } as Record<string, string>,
    // ประสบการณ์ (หมวด C)
    experiencesTitle: 'Competition experience', experiencesLead: 'Add every competition you took part in. New entries count after our team checks the evidence link.',
    addExperience: 'Add a competition', competitionName: 'Competition name', competitionNameHint: 'Pick from the list, or type the full name if it isn’t there.',
    year: 'Year (B.E.)', kind: 'Competition type', result: 'Result', resultDetail: 'Award', resultOther: 'Describe the result',
    role: 'Your role in the team', roleOther: 'Describe your role', responsibility: 'What you were responsible for', evidenceUrl: 'Evidence link',
    evidenceHint: 'A public link: results page, certificate, post or repository.', lessons: 'What you can pass on to the next teams (optional)',
    sendExperience: 'Send for review', experienceSent: 'Sent. It counts once our team checks the evidence.', removeExperience: (name: string) => `Remove ${name}`,
    experiencesEmpty: 'No competitions yet.',
    statusNames: { pending: 'Waiting for review', verified: 'Checked', rejected: 'Not accepted' },
    kindNames: { hackathon: 'Hackathon', innovation: 'Innovation / invention', software: 'Software / programming', other: 'Other related competition' },
    resultNames: { participant: 'Participant', finalist: 'Finalist', winner: 'Award winner', other: 'Other result' },
    roleNames: { developer: 'Developer / programmer', designer: 'Designer / UI/UX', leader: 'Team leader / project manager', business: 'Business / pitching', other: 'Other' },
    // หน้าโปรไฟล์สาธารณะ
    publicSkills: 'Skills', publicHelps: 'Mentoring', publicAvailability: 'Availability', publicTrust: 'Trust',
    statEmail: 'Email verified', statSessions: (n: number) => `${n} completed sessions`, statResponse: (n: number) => `${n}% response rate`,
    statResponseNone: 'No response data yet', statEvidence: (n: number) => `${n} checked evidence links`,
    pendingNote: 'Waiting for review',
    errors: { required: 'Fill in the required fields', network: 'Could not save. Please try again.' },
  },
```

- [ ] **Step 2: Add the Thai block** with the same keys:

```ts
  mentorProfileV2: {
    tab: 'โปรไฟล์',
    experiencesTab: 'ประสบการณ์',
    bannerTitle: 'กรอกโปรไฟล์ให้ครบเพื่อเริ่มถูกจับคู่',
    bannerText: (sections: string) => `ยังขาด: ${sections} ระหว่างนี้หน้าโปรไฟล์ของคุณยังแสดงตามปกติ`,
    sectionNames: { A: 'ข้อมูลพื้นฐาน', B: 'ความเชี่ยวชาญ', C: 'ประสบการณ์แข่งขัน', D: 'การให้คำปรึกษา', E: 'เวลาว่าง' },
    save: 'บันทึกโปรไฟล์', saving: 'กำลังบันทึก…', saved: 'บันทึกโปรไฟล์แล้ว',
    headline: 'Headline', headlineHint: 'เช่น AI Engineer | 3× Hackathon Mentor',
    country: 'ประเทศ', timeZone: 'Time zone', languages: 'ภาษาที่ให้คำปรึกษา', background: 'ระดับการศึกษา หรือสายงานปัจจุบัน',
    gender: 'เพศ (ไม่บังคับ)', genderHint: 'ใช้เฉพาะเมื่อผู้เรียนขอเพศของ Mentor ไม่แสดงบนหน้าโปรไฟล์', genderNone: 'ไม่ระบุ',
    skills: 'ทักษะ', skillsHint: 'เลือกทักษะที่ช่วยได้ และระดับของแต่ละทักษะ', skillLevel: (skill: string) => `ระดับ ${skill}`,
    notSelected: 'ไม่เลือก',
    helpsWith: 'ช่วยอะไรได้บ้าง', learnerLevels: 'กลุ่มผู้เรียนที่ถนัด', teachingStyles: 'รูปแบบการสอน', formats: 'รูปแบบการให้คำปรึกษา',
    deliverables: 'สิ่งที่ผู้เรียนได้รับหลัง Session', cannot: 'หัวข้อที่ไม่รับให้คำปรึกษา',
    availability: 'วันและเวลาที่สะดวก', addSlot: 'เพิ่มช่วงเวลา', removeSlot: 'ลบช่วงเวลานี้', day: 'วัน', from: 'ตั้งแต่', to: 'ถึง',
    sessionsPerWeek: 'จำนวน Session ต่อสัปดาห์', sessionMinutes: 'เวลาต่อ Session', minutes: (n: number) => `${n} นาที`,
    acceptingRequests: 'รับคำขอใหม่อยู่', replyHours: 'เวลาตอบกลับโดยประมาณ', acceptsUrgent: 'รับงานด่วนก่อนวันแข่งได้',
    mode: 'รูปแบบ', replyOptions: { 6: 'ภายใน 6 ชั่วโมง', 24: 'ภายใน 1 วัน', 72: 'ภายใน 3 วัน', 168: 'ภายใน 1 สัปดาห์' } as Record<number, string>,
    days: ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'],
    skillGroups: { programming: 'Programming', webApp: 'Web / App', aiMl: 'AI / ML', hardware: 'Hardware / IoT / Robotics', dataCloud: 'Data / Security / Cloud', design: 'UI/UX / Product Design', business: 'Business / Startup / Marketing', pitch: 'Pitching / Presentation' },
    skillNames: { python: 'Python', javascript: 'JavaScript', cpp: 'C++', java: 'Java', react: 'React', nextjs: 'Next.js', mobile: 'Mobile App', ml: 'Machine Learning', llm: 'LLM', cv: 'Computer Vision', hardware_iot_robotics: 'Hardware / IoT / Robotics', data_science: 'Data Science', cybersecurity: 'Cybersecurity', cloud: 'Cloud', uiux: 'UI/UX', product_design: 'Product Design', business_model: 'Business Model', startup: 'Startup', marketing: 'Marketing', pitching: 'Pitching', presentation: 'Presentation', storytelling: 'Storytelling' },
    levelNames: { intermediate: 'Intermediate', advanced: 'Advanced', expert: 'Expert' },
    languageNames: { th: 'ภาษาไทย', en: 'ภาษาอังกฤษ' },
    genderNames: { male: 'ชาย', female: 'หญิง' },
    helpsWithNames: { idea_validation: 'Idea Validation', coding: 'Coding', debugging: 'Debugging', architecture: 'Architecture', mvp: 'MVP', pitch_deck: 'Pitch Deck', presentation: 'Presentation' },
    learnerLevelNames: { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' },
    teachingStyleNames: { step_by_step: 'สอนทีละขั้น', guided_questions: 'ถามนำให้คิด', review: 'Review งาน', direct_feedback: 'ให้ Feedback ตรง ๆ' },
    formatNames: { one_on_one: '1-on-1', team: 'Team Mentoring', code_review: 'Code Review' },
    modeNames: { online: 'ออนไลน์', onsite: 'ออนไซต์', both: 'ได้ทั้งคู่' },
    countries: { TH: 'ไทย', SG: 'สิงคโปร์', MY: 'มาเลเซีย', VN: 'เวียดนาม', ID: 'อินโดนีเซีย', PH: 'ฟิลิปปินส์', JP: 'ญี่ปุ่น', US: 'สหรัฐอเมริกา', GB: 'สหราชอาณาจักร', ZZ: 'อื่น ๆ' } as Record<string, string>,
    experiencesTitle: 'ประสบการณ์แข่งขัน', experiencesLead: 'เพิ่มทุกงานที่เคยแข่ง รายการใหม่จะนับหลังทีมงานตรวจลิงก์หลักฐานแล้ว',
    addExperience: 'เพิ่มงานแข่ง', competitionName: 'ชื่อสนามแข่งขัน', competitionNameHint: 'เลือกจากรายการ หรือพิมพ์ชื่อเต็มถ้ายังไม่มี',
    year: 'ปีที่เข้าร่วม (พ.ศ.)', kind: 'ประเภทการแข่งขัน', result: 'ผลการแข่งขัน', resultDetail: 'รางวัลที่ได้', resultOther: 'อธิบายผลการแข่งขัน',
    role: 'บทบาทในทีม', roleOther: 'ระบุบทบาท', responsibility: 'สิ่งที่รับผิดชอบในการแข่งขัน', evidenceUrl: 'ลิงก์หลักฐานการแข่งขัน',
    evidenceHint: 'ลิงก์ที่เปิดดูได้ เช่น หน้าประกาศผล เกียรติบัตร โพสต์ หรือ repository', lessons: 'ประสบการณ์ที่นำมาช่วยผู้เข้าแข่งขันรุ่นต่อไปได้ (ไม่บังคับ)',
    sendExperience: 'ส่งให้ทีมงานตรวจ', experienceSent: 'ส่งแล้ว จะนับหลังทีมงานตรวจหลักฐาน', removeExperience: (name: string) => `ลบ ${name}`,
    experiencesEmpty: 'ยังไม่มีงานแข่ง',
    statusNames: { pending: 'รอตรวจ', verified: 'ตรวจแล้ว', rejected: 'ไม่ผ่าน' },
    kindNames: { hackathon: 'Hackathon', innovation: 'Innovation / Invention Competition', software: 'Software / Programming Competition', other: 'การแข่งขันประเภทอื่นที่เกี่ยวข้อง' },
    resultNames: { participant: 'ผู้เข้าร่วมการแข่งขัน', finalist: 'เข้ารอบชิงชนะเลิศ / Finalist', winner: 'ได้รับรางวัล', other: 'ผลการแข่งขันอื่น ๆ' },
    roleNames: { developer: 'Developer / Programmer', designer: 'Designer / UI/UX', leader: 'Team Leader / Project Manager', business: 'Business / Pitching', other: 'อื่น ๆ' },
    publicSkills: 'ทักษะ', publicHelps: 'การให้คำปรึกษา', publicAvailability: 'เวลาว่าง', publicTrust: 'ความน่าเชื่อถือ',
    statEmail: 'ยืนยันอีเมลแล้ว', statSessions: (n: number) => `ปรึกษาเสร็จ ${n} ครั้ง`, statResponse: (n: number) => `อัตราตอบรับ ${n}%`,
    statResponseNone: 'ยังไม่มีข้อมูลการตอบรับ', statEvidence: (n: number) => `ลิงก์หลักฐานที่ตรวจแล้ว ${n} รายการ`,
    pendingNote: 'รอตรวจ',
    errors: { required: 'กรอกช่องที่จำเป็นให้ครบ', network: 'บันทึกไม่สำเร็จ ลองอีกครั้ง' },
  },
```

- [ ] **Step 3: Check** — run `npx tsc -p . --noEmit && npm run check:i18n`. Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/en.ts src/i18n/th.ts
git commit -m "feat: TH/EN copy for mentor profile v2"
```

---

### Task 8: Mentor zone Profile tab (A/B/D/E) and completeness banner

**Files:**
- Create: `src/components/ProfileEditor.tsx`
- Modify: `src/pages/MentorZone.tsx` (ZoneTab type ~557, tabs ~643, panels ~651–668, hash effect ~592), `src/styles.css`
- Test: `tests/mentor-profile-v2.spec.ts`

**Interfaces:**
- Consumes: `GET/PUT /consult/zone/profile`; `t.mentorProfileV2`; the option lists; `profileComplete`/`profileMissing` from `/consult/zone`
- Produces: `ProfileEditor({ onSaved }: { onSaved: () => void })`; ZoneTab ids `'profile'` and `'experiences'`; hash `#profile` opens the profile tab

- [ ] **Step 1: Write the failing browser test**

```ts
// tests/mentor-profile-v2.spec.ts
import { expect, test } from '@playwright/test';
import { closeDb, createMentorFixture, signIn } from './helpers';

test.afterAll(closeDb);

test('mentor completes profile sections A, B, D, E from Mentor zone', async ({ page }) => {
  const fixture = await createMentorFixture({ thai: true });
  try {
    await signIn(page, fixture.owner, '/mentor-zone#profile');
    // แถบเตือนบอกหมวดที่ยังขาด
    const banner = page.getByRole('status').filter({ hasText: 'กรอกโปรไฟล์ให้ครบเพื่อเริ่มถูกจับคู่' });
    await expect(banner).toContainText('ข้อมูลพื้นฐาน');
    const form = page.getByRole('form', { name: 'โปรไฟล์' });
    await form.getByLabel('Headline').fill('AI Engineer | 3× Hackathon Mentor');
    await form.getByLabel('ประเทศ').selectOption('TH');
    await form.getByLabel('ระดับการศึกษา หรือสายงานปัจจุบัน').fill('วิศวกรรมคอมพิวเตอร์');
    await form.getByRole('checkbox', { name: 'ภาษาไทย' }).check();
    await form.getByLabel('ระดับ Python').selectOption('expert');
    await form.getByRole('checkbox', { name: 'Coding' }).check();
    await form.getByRole('checkbox', { name: 'Beginner' }).check();
    await form.getByRole('checkbox', { name: 'สอนทีละขั้น' }).check();
    await form.getByRole('checkbox', { name: '1-on-1' }).check();
    await form.getByRole('button', { name: 'เพิ่มช่วงเวลา' }).click();
    await form.getByLabel('จำนวน Session ต่อสัปดาห์').fill('3');
    await form.getByRole('checkbox', { name: '60 นาที' }).check();
    await form.getByLabel('เวลาตอบกลับโดยประมาณ').selectOption('24');
    await form.getByLabel('รูปแบบ', { exact: true }).selectOption('online');
    await form.getByRole('button', { name: 'บันทึกโปรไฟล์' }).click();
    await expect(form.getByRole('status')).toContainText('บันทึกโปรไฟล์แล้ว');
    // fixture มีประสบการณ์ที่ตรวจแล้ว → ครบทุกหมวด แถบเตือนหายไป
    await expect(banner).toHaveCount(0);
    await page.reload();
    await expect(form.getByLabel('Headline')).toHaveValue('AI Engineer | 3× Hackathon Mentor');
  } finally {
    await fixture.remove();
  }
});
```

Check the cleanup name returned by `createMentorFixture` in `tests/helpers.ts` (lines 63–122) and use it; the snippet above assumes `remove`. Also add `await db.delete(mentorSkills).where(eq(mentorSkills.mentorId, mentorId))` to that cleanup before the mentor is deleted. The FK cascades, but be explicit if the helper deletes in a transaction-free order.

- [ ] **Step 2: Run to verify it fails**

Run: `node scripts/test-environment.mjs test tests/mentor-profile-v2.spec.ts --project=desktop` (check `playwright.config.ts` for the exact project names)
Expected: FAIL, the form "โปรไฟล์" is not found.

- [ ] **Step 3: Build `ProfileEditor`**

```tsx
// src/components/ProfileEditor.tsx
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { useI18n } from '../i18n';
import { ApiError, put } from '../lib/api';
import { useApi } from '../lib/useApi';
import {
  formats, genders, helpsWith, languages, learnerLevels, modes, replyHoursOptions, sessionLengths, skillGroups, skillLevels, teachingStyles,
} from '../data/matching';
import type { MentorProfileV2, SkillLevel, SkillTag } from '../data/matching';

/* แท็บ "โปรไฟล์" ใน Mentor zone หมวด A, B, D, E (spec 2026-10-13) หมวด C อยู่แท็บประสบการณ์ หมวด F คำนวณเอง */

type Payload = { profile: MentorProfileV2; missing: string[]; complete: boolean };
const countries = ['TH', 'SG', 'MY', 'VN', 'ID', 'PH', 'JP', 'US', 'GB', 'ZZ'];

function Checks<T extends string | number>({ legend, options, value, label, onChange }: {
  legend: string; options: readonly T[]; value: T[]; label: (id: T) => string; onChange: (next: T[]) => void;
}) {
  return <fieldset className="pv2-checks">
    <legend>{legend}</legend>
    {options.map((id) => <label key={String(id)} className="pv2-chip">
      <input type="checkbox" checked={value.includes(id)}
        onChange={(e) => onChange(e.target.checked ? [...value, id] : value.filter((v) => v !== id))} />
      <span>{label(id)}</span>
    </label>)}
  </fieldset>;
}

export function ProfileEditor({ onSaved }: { onSaved: () => void }) {
  const { t } = useI18n();
  const s = t.mentorProfileV2;
  const { data, reload } = useApi<Payload>('/consult/zone/profile');
  const [draft, setDraft] = useState<MentorProfileV2 | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  useEffect(() => { if (data && !draft) setDraft(data.profile); }, [data, draft]);
  if (!draft) return <p className="side-note" role="status">…</p>;

  const set = <K extends keyof MentorProfileV2>(key: K, value: MentorProfileV2[K]) => { setMessage(null); setDraft({ ...draft, [key]: value }); };
  const levelOf = (tag: SkillTag) => draft.skills.find((sk) => sk.tag === tag)?.level ?? '';
  const setLevel = (tag: SkillTag, level: SkillLevel | '') => set('skills', level
    ? [...draft.skills.filter((sk) => sk.tag !== tag), { tag, level }]
    : draft.skills.filter((sk) => sk.tag !== tag));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const saved = await put<Payload>('/consult/zone/profile', draft);
      setDraft(saved.profile);
      setMessage({ kind: 'ok', text: s.saved });
      reload();
      onSaved();
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof ApiError ? error.message : s.errors.network });
    } finally { setBusy(false); }
  }

  return <form className="cw-form pv2-form" aria-label={s.tab} onSubmit={submit} noValidate>
    <section aria-labelledby="pv2-a"><h3 id="pv2-a">{s.sectionNames.A}</h3>
      <label>{s.headline}<input value={draft.headline} maxLength={80} onChange={(e) => set('headline', e.target.value)} /><small>{s.headlineHint}</small></label>
      <div className="grid">
        <label>{s.country}<select value={draft.country} onChange={(e) => set('country', e.target.value)}>
          <option value="">—</option>{countries.map((code) => <option key={code} value={code}>{s.countries[code]}</option>)}
        </select></label>
        <label>{s.timeZone}<input value={draft.timeZone} onChange={(e) => set('timeZone', e.target.value)} /></label>
      </div>
      <Checks legend={s.languages} options={languages} value={draft.languages} label={(id) => s.languageNames[id]} onChange={(v) => set('languages', v)} />
      <label>{s.background}<input value={draft.background} maxLength={200} onChange={(e) => set('background', e.target.value)} /></label>
      <label>{s.gender}<select value={draft.gender ?? ''} onChange={(e) => set('gender', (e.target.value || null) as MentorProfileV2['gender'])}>
        <option value="">{s.genderNone}</option>{genders.map((g) => <option key={g} value={g}>{s.genderNames[g]}</option>)}
      </select><small>{s.genderHint}</small></label>
    </section>

    <section aria-labelledby="pv2-b"><h3 id="pv2-b">{s.sectionNames.B}</h3><p className="muted">{s.skillsHint}</p>
      {Object.entries(skillGroups).map(([group, tags]) => <fieldset key={group} className="pv2-skill-group">
        <legend>{s.skillGroups[group as keyof typeof skillGroups]}</legend>
        {(tags as readonly SkillTag[]).map((tag) => <label key={tag} className="pv2-skill">
          <span>{s.skillNames[tag]}</span>
          <select aria-label={s.skillLevel(s.skillNames[tag])} value={levelOf(tag)} onChange={(e) => setLevel(tag, e.target.value as SkillLevel | '')}>
            <option value="">{s.notSelected}</option>{skillLevels.map((l) => <option key={l} value={l}>{s.levelNames[l]}</option>)}
          </select>
        </label>)}
      </fieldset>)}
    </section>

    <section aria-labelledby="pv2-d"><h3 id="pv2-d">{s.sectionNames.D}</h3>
      <Checks legend={s.helpsWith} options={helpsWith} value={draft.helpsWith} label={(id) => s.helpsWithNames[id]} onChange={(v) => set('helpsWith', v)} />
      <Checks legend={s.learnerLevels} options={learnerLevels} value={draft.learnerLevels} label={(id) => s.learnerLevelNames[id]} onChange={(v) => set('learnerLevels', v)} />
      <Checks legend={s.teachingStyles} options={teachingStyles} value={draft.teachingStyles} label={(id) => s.teachingStyleNames[id]} onChange={(v) => set('teachingStyles', v)} />
      <Checks legend={s.formats} options={formats} value={draft.formats} label={(id) => s.formatNames[id]} onChange={(v) => set('formats', v)} />
      <label>{s.deliverables}<textarea value={draft.deliverables} maxLength={500} onChange={(e) => set('deliverables', e.target.value)} /></label>
    </section>

    <section aria-labelledby="pv2-e"><h3 id="pv2-e">{s.sectionNames.E}</h3>
      <fieldset className="pv2-slots"><legend>{s.availability}</legend>
        {draft.availability.map((slot, index) => <div key={index} className="pv2-slot">
          <label>{s.day}<select value={slot.day} onChange={(e) => set('availability', draft.availability.map((v, i) => i === index ? { ...v, day: Number(e.target.value) } : v))}>
            {s.days.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></label>
          <label>{s.from}<input type="time" value={slot.from} onChange={(e) => set('availability', draft.availability.map((v, i) => i === index ? { ...v, from: e.target.value } : v))} /></label>
          <label>{s.to}<input type="time" value={slot.to} onChange={(e) => set('availability', draft.availability.map((v, i) => i === index ? { ...v, to: e.target.value } : v))} /></label>
          <button type="button" className="pv2-icon" aria-label={s.removeSlot} onClick={() => set('availability', draft.availability.filter((_, i) => i !== index))}><X size={16} aria-hidden="true" /></button>
        </div>)}
        <button type="button" className="secondary-button" onClick={() => set('availability', [...draft.availability, { day: 6, from: '09:00', to: '12:00' }])}><Plus size={16} aria-hidden="true" />{s.addSlot}</button>
      </fieldset>
      <div className="grid">
        <label>{s.sessionsPerWeek}<input type="number" min={1} max={20} value={draft.sessionsPerWeek ?? ''} onChange={(e) => set('sessionsPerWeek', e.target.value ? Number(e.target.value) : null)} /></label>
        <label>{s.replyHours}<select value={draft.replyHours ?? ''} onChange={(e) => set('replyHours', e.target.value ? Number(e.target.value) : null)}>
          <option value="">—</option>{replyHoursOptions.map((h) => <option key={h} value={h}>{s.replyOptions[h]}</option>)}</select></label>
        <label>{s.mode}<select value={draft.mode ?? ''} onChange={(e) => set('mode', (e.target.value || null) as MentorProfileV2['mode'])}>
          <option value="">—</option>{modes.map((m) => <option key={m} value={m}>{s.modeNames[m]}</option>)}</select></label>
      </div>
      <Checks legend={s.sessionMinutes} options={sessionLengths} value={draft.sessionMinutes as (typeof sessionLengths)[number][]} label={(n) => s.minutes(n)} onChange={(v) => set('sessionMinutes', v)} />
      <label className="pv2-toggle"><input type="checkbox" checked={draft.acceptingRequests} onChange={(e) => set('acceptingRequests', e.target.checked)} />{s.acceptingRequests}</label>
      <label className="pv2-toggle"><input type="checkbox" checked={draft.acceptsUrgent} onChange={(e) => set('acceptsUrgent', e.target.checked)} />{s.acceptsUrgent}</label>
    </section>

    {message && <p role={message.kind === 'ok' ? 'status' : 'alert'} className={message.kind === 'ok' ? 'note' : 'form-error'}>{message.text}</p>}
    <button type="submit" className="primary-button" disabled={busy}>{busy ? s.saving : s.save}</button>
  </form>;
}
```

Check that `put` exists in `src/lib/api.ts`; if only `post` exists, add `put` next to it with the same shape (method `PUT`).

- [ ] **Step 4: Wire into MentorZone**

In `src/pages/MentorZone.tsx`:
- `type ZoneTab = 'requests' | 'chats' | 'payouts' | 'competitions' | 'profile' | 'experiences';`
- In the hash effect, before the `#competitions` line: `if (hash === '#profile') { setTab('profile'); return; }` and `if (hash === '#experiences') { setTab('experiences'); return; }`
- Tabs list: append `{ id: 'profile' as ZoneTab, label: t.mentorProfileV2.tab }, { id: 'experiences' as ZoneTab, label: t.mentorProfileV2.experiencesTab },`
- Panels: add
```tsx
<div role="tabpanel" id={panelId('zone', 'profile')} aria-labelledby={tabId('zone', 'profile')} hidden={current !== 'profile'} className="cx-zone-panel">
  {current === 'profile' && <ProfileEditor onSaved={reload} />}
</div>
<div role="tabpanel" id={panelId('zone', 'experiences')} aria-labelledby={tabId('zone', 'experiences')} hidden={current !== 'experiences'} className="cx-zone-panel">
  {current === 'experiences' && <ExperienceList onChanged={reload} />}
</div>
```
(`ExperienceList` is created in Task 9. Until then, leave the experiences panel out and add it in Task 9.)
- Banner, right above `<Tabs …>`, when `data.profileComplete === false`:
```tsx
{data.profileComplete === false && <div className="note pv2-banner" role="status">
  <strong>{t.mentorProfileV2.bannerTitle}</strong>
  <p>{t.mentorProfileV2.bannerText(data.profileMissing.map((k) => t.mentorProfileV2.sectionNames[k as 'A']).join(', '))}</p>
</div>}
```
- Add `profileComplete: boolean; profileMissing: string[]` to the zone payload type in this file.

- [ ] **Step 5: Styles** (append to `src/styles.css`; reuse existing tokens such as `--space-*` and the colour variables already used by `.cx-pill`)

```css
/* โปรไฟล์เมนเทอร์แบบใหม่ (Mentor zone แท็บโปรไฟล์) */
.pv2-form section { display: grid; gap: var(--space-3, 12px); padding-block: var(--space-4, 16px); border-top: 1px solid var(--line, #e5e5ea); }
.pv2-form section:first-of-type { border-top: 0; }
.pv2-checks { display: flex; flex-wrap: wrap; gap: 8px; border: 0; padding: 0; margin: 0; }
.pv2-checks legend { width: 100%; margin-bottom: 6px; font-weight: 600; }
.cw-form .pv2-chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border: 1px solid var(--line, #d9d9e0); border-radius: 999px; font-weight: 500; cursor: pointer; }
.cw-form .pv2-chip:has(input:checked) { border-color: var(--purple, #6d28d9); background: color-mix(in srgb, var(--purple, #6d28d9) 10%, transparent); }
.cw-form .pv2-chip input { width: auto; margin: 0; }
.pv2-skill-group { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; border: 0; padding: 0; margin: 0; }
.pv2-skill-group legend { font-weight: 600; margin-bottom: 4px; }
.cw-form .pv2-skill { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-weight: 500; }
.cw-form .pv2-skill select { width: auto; min-width: 9rem; }
.pv2-slot { display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 8px; align-items: end; }
.cw-form .pv2-icon { width: 40px; height: 40px; padding: 0; display: grid; place-items: center; }
.cw-form .pv2-toggle { display: flex; align-items: center; gap: 8px; font-weight: 500; }
.cw-form .pv2-toggle input { width: auto; }
.pv2-banner { margin-bottom: var(--space-4, 16px); }
@media (max-width: 560px) { .pv2-slot { grid-template-columns: 1fr 1fr; } }
```

Before writing these, check the real token names in `src/styles.css` (`grep -n "^\s*--" src/styles.css | head -40`) and replace the fallback names with the existing ones.

- [ ] **Step 6: Run the browser test** — `node scripts/test-environment.mjs test tests/mentor-profile-v2.spec.ts` → PASS. Take desktop and mobile screenshots (`page.screenshot({ path: 'artifacts/mentor-profile-v2-desktop.png', fullPage: true })`) and look at them.

- [ ] **Step 7: Commit**

```bash
git add src/components/ProfileEditor.tsx src/pages/MentorZone.tsx src/styles.css src/lib/api.ts tests/mentor-profile-v2.spec.ts tests/helpers.ts src/i18n
git commit -m "feat: Mentor zone profile tab for sections A, B, D, E with a completeness banner"
```

---

### Task 9: Mentor zone experiences tab (C) with autocomplete

**Files:**
- Create: `src/components/ExperienceList.tsx`
- Modify: `src/pages/MentorZone.tsx` (add the experiences panel from Task 8 Step 4)
- Test: `tests/mentor-profile-v2.spec.ts`

**Interfaces:**
- Consumes: `GET/POST/DELETE /consult/zone/experiences`, `GET /hackathon-names?q=`
- Produces: `ExperienceList({ onChanged }: { onChanged: () => void })`

- [ ] **Step 1: Write the failing test** (append)

```ts
test('mentor adds a typed competition experience that waits for review', async ({ page }) => {
  const fixture = await createMentorFixture({ thai: true });
  const name = `Typed Hack ${Date.now()}`;
  try {
    await signIn(page, fixture.owner, '/mentor-zone#experiences');
    const list = page.getByRole('region', { name: 'ประสบการณ์แข่งขัน' });
    // ประสบการณ์เดิมจาก fixture แสดงว่าตรวจแล้ว
    await expect(list.getByText('ตรวจแล้ว').first()).toBeVisible();
    await list.getByRole('button', { name: 'เพิ่มงานแข่ง' }).click();
    const form = list.getByRole('form', { name: 'เพิ่มงานแข่ง' });
    await form.getByRole('combobox', { name: 'ชื่อสนามแข่งขัน' }).fill(name);
    await form.getByLabel('ปีที่เข้าร่วม (พ.ศ.)').fill('2567');
    await form.getByLabel('ประเภทการแข่งขัน').selectOption('hackathon');
    await form.getByLabel('ผลการแข่งขัน').selectOption('winner');
    await form.getByLabel('บทบาทในทีม').selectOption('developer');
    await form.getByLabel('สิ่งที่รับผิดชอบในการแข่งขัน').fill('เขียน backend');
    await form.getByLabel('ลิงก์หลักฐานการแข่งขัน').fill('https://example.com/proof');
    await form.getByRole('button', { name: 'ส่งให้ทีมงานตรวจ' }).click();
    // ได้รางวัลต้องระบุรางวัล
    await expect(form.getByRole('alert')).toContainText('ระบุรางวัลที่ได้');
    await form.getByLabel('รางวัลที่ได้').fill('รางวัลที่ 1');
    await form.getByRole('button', { name: 'ส่งให้ทีมงานตรวจ' }).click();
    await expect(list.getByRole('status')).toContainText('ส่งแล้ว');
    const row = list.locator('li').filter({ hasText: name });
    await expect(row).toContainText('รอตรวจ');
    // ชื่อที่พิมพ์ไว้ขึ้นในการเติมคำครั้งถัดไป
    await list.getByRole('button', { name: 'เพิ่มงานแข่ง' }).click();
    await list.getByRole('combobox', { name: 'ชื่อสนามแข่งขัน' }).fill(name.slice(0, 10));
    await expect(list.getByRole('option', { name })).toBeVisible();
  } finally {
    await fixture.remove();
  }
});
```

Add to the fixture cleanup: `await db.delete(mentorExperiences).where(eq(mentorExperiences.mentorId, mentorId))` (already cascades), plus `await db.delete(hackathonNames).where(like(hackathonNames.name, 'Typed Hack %'))` in this test's `finally`. Import `db` and `hackathonNames` from the server modules the same way `tests/helpers.ts` does.

- [ ] **Step 2: Run to verify it fails** — expected FAIL (region not found)

- [ ] **Step 3: Build the component**

```tsx
// src/components/ExperienceList.tsx
import { useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { useI18n } from '../i18n';
import { ApiError, del, get, post } from '../lib/api';
import { useApi } from '../lib/useApi';
import { experienceKinds, experienceResults, teamRoles } from '../data/matching';
import type { ExperienceKind, ExperienceResult, TeamRole } from '../data/matching';

/* แท็บ "ประสบการณ์" ใน Mentor zone หมวด C (spec 2026-10-13) ชื่องานเลือกจากรายการหรือพิมพ์เอง รายการใหม่รอทีมงานตรวจ */

export type ExperienceRow = {
  id: string; name: string; competitionSlug: string | null; year: string; kind: ExperienceKind; result: ExperienceResult; detail: string;
  role: TeamRole; roleOther: string; responsibility: string; evidenceUrl: string; lessons: string;
  status: 'pending' | 'verified' | 'rejected'; reason: string; createdAt: string;
};
type Suggestion = { id: string | null; slug: string | null; name: string };
const blank = { name: '', slug: '' as string, year: '', kind: '' as ExperienceKind | '', result: '' as ExperienceResult | '', detail: '', role: '' as TeamRole | '', roleOther: '', responsibility: '', evidenceUrl: '', lessons: '' };

function NameField({ value, onChange, label, hint }: { value: string; onChange: (name: string, slug: string) => void; label: string; hint: string }) {
  const id = useId();
  const [items, setItems] = useState<Suggestion[]>([]);
  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) { setItems([]); return; }
    const timer = setTimeout(() => {
      get<{ items: Suggestion[] }>(`/hackathon-names?q=${encodeURIComponent(q)}`).then((r) => setItems(r.items)).catch(() => setItems([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [value]);
  const open = items.length > 0 && !items.some((i) => i.name === value);
  return <div className="pv2-combo">
    <label htmlFor={id}>{label}</label>
    <input id={id} role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list" value={value}
      maxLength={200} onChange={(e) => onChange(e.target.value, '')} />
    <small>{hint}</small>
    {open && <ul id={`${id}-list`} role="listbox" className="pv2-combo__list">
      {items.map((item) => <li key={item.slug ?? item.id} role="option" aria-selected="false" tabIndex={-1}
        onMouseDown={(e) => { e.preventDefault(); onChange(item.name, item.slug ?? ''); }}
        onKeyDown={(e) => { if (e.key === 'Enter') onChange(item.name, item.slug ?? ''); }}>{item.name}</li>)}
    </ul>}
  </div>;
}

export function ExperienceList({ onChanged }: { onChanged: () => void }) {
  const { t } = useI18n();
  const s = t.mentorProfileV2;
  const { data, reload } = useApi<{ items: ExperienceRow[] }>('/consult/zone/experiences');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const set = (patch: Partial<typeof blank>) => { setError(''); setForm({ ...form, ...patch }); };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await post('/consult/zone/experiences', {
        competitionSlug: form.slug || undefined, name: form.slug ? '' : form.name, year: form.year, kind: form.kind, result: form.result,
        detail: form.detail, role: form.role, roleOther: form.roleOther, responsibility: form.responsibility, evidenceUrl: form.evidenceUrl, lessons: form.lessons,
      });
      setForm(blank); setAdding(false); setNotice(s.experienceSent); reload(); onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : s.errors.network);
    } finally { setBusy(false); }
  }
  async function remove(row: ExperienceRow) {
    await del(`/consult/zone/experiences/${row.id}`).catch(() => undefined);
    reload(); onChanged();
  }

  return <section className="panel" aria-labelledby="pv2-exp-title">
    <h2 id="pv2-exp-title">{s.experiencesTitle}</h2>
    <p className="cx-lead">{s.experiencesLead}</p>
    {notice && <p className="note" role="status">{notice}</p>}
    {data && data.items.length === 0 && <p className="muted">{s.experiencesEmpty}</p>}
    <ul className="cx-list">
      {data?.items.map((row) => <li key={row.id}>
        <div>
          <p className="cx-list__title">{row.name} · {row.year}
            <span className={`cx-pill pv2-status is-${row.status}`}>{s.statusNames[row.status]}</span></p>
          <p className="cx-hint">{s.kindNames[row.kind]} · {s.resultNames[row.result]}{row.detail ? ` (${row.detail})` : ''} · {s.roleNames[row.role]}</p>
          {row.status === 'rejected' && row.reason && <p className="form-error">{row.reason}</p>}
        </div>
        {row.status !== 'verified' && <button type="button" className="pv2-icon" aria-label={s.removeExperience(row.name)} onClick={() => remove(row)}><Trash2 size={16} aria-hidden="true" /></button>}
      </li>)}
    </ul>
    {!adding ? <button type="button" className="secondary-button" onClick={() => { setNotice(''); setAdding(true); }}>{s.addExperience}</button>
      : <form className="cw-form pv2-form" aria-label={s.addExperience} onSubmit={submit} noValidate>
        <NameField value={form.name} label={`${s.competitionName} *`} hint={s.competitionNameHint} onChange={(name, slug) => set({ name, slug })} />
        <div className="grid">
          <label>{s.year} *<input inputMode="numeric" maxLength={4} value={form.year} onChange={(e) => set({ year: e.target.value.replace(/\D/g, '') })} /></label>
          <label>{s.kind} *<select value={form.kind} onChange={(e) => set({ kind: e.target.value as ExperienceKind })}>
            <option value="">—</option>{experienceKinds.map((k) => <option key={k} value={k}>{s.kindNames[k]}</option>)}</select></label>
        </div>
        <label>{s.result} *<select value={form.result} onChange={(e) => set({ result: e.target.value as ExperienceResult })}>
          <option value="">—</option>{experienceResults.map((r) => <option key={r} value={r}>{s.resultNames[r]}</option>)}</select></label>
        {form.result === 'winner' && <label>{s.resultDetail}<input value={form.detail} maxLength={200} onChange={(e) => set({ detail: e.target.value })} /></label>}
        {form.result === 'other' && <label>{s.resultOther}<input value={form.detail} maxLength={200} onChange={(e) => set({ detail: e.target.value })} /></label>}
        <label>{s.role} *<select value={form.role} onChange={(e) => set({ role: e.target.value as TeamRole })}>
          <option value="">—</option>{teamRoles.map((r) => <option key={r} value={r}>{s.roleNames[r]}</option>)}</select></label>
        {form.role === 'other' && <label>{s.roleOther}<input value={form.roleOther} maxLength={80} onChange={(e) => set({ roleOther: e.target.value })} /></label>}
        <label>{s.responsibility} *<textarea value={form.responsibility} maxLength={1000} onChange={(e) => set({ responsibility: e.target.value })} /></label>
        <label>{s.evidenceUrl} *<input type="url" value={form.evidenceUrl} maxLength={500} onChange={(e) => set({ evidenceUrl: e.target.value })} /><small>{s.evidenceHint}</small></label>
        <label>{s.lessons}<textarea value={form.lessons} maxLength={1000} onChange={(e) => set({ lessons: e.target.value })} /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="primary-button" disabled={busy}>{s.sendExperience}</button>
      </form>}
  </section>;
}
```

The server's zod messages are Thai only, so in English the alert would be Thai. Before submitting, validate on the client with the same rules and `t` messages:
- empty required fields → `s.errors.required`
- winner without detail → add `s.errors.awardRequired` ('Name the award' / 'ระบุรางวัลที่ได้')
- non-https link → add `s.errors.https` ('The evidence link must start with https://' / 'ลิงก์หลักฐานต้องขึ้นต้นด้วย https://')

Add these keys to both dictionaries. Check that `get`/`del` exist in `src/lib/api.ts`; add them next to `post` if missing.

Styles (append to `src/styles.css`):

```css
.pv2-combo { position: relative; display: grid; gap: 4px; }
.pv2-combo__list { position: absolute; top: 100%; left: 0; right: 0; z-index: 5; margin: 4px 0 0; padding: 4px; list-style: none; background: var(--surface, #fff); border: 1px solid var(--line, #d9d9e0); border-radius: 10px; box-shadow: 0 8px 24px rgb(0 0 0 / .08); }
.pv2-combo__list li { padding: 8px 10px; border-radius: 8px; cursor: pointer; }
.pv2-combo__list li:hover, .pv2-combo__list li:focus { background: color-mix(in srgb, var(--purple, #6d28d9) 8%, transparent); }
.pv2-status { margin-inline-start: 8px; }
.pv2-status.is-verified { background: #e7f6ec; color: #17663a; }
.pv2-status.is-rejected { background: #fdecec; color: #a12a2a; }
```

- [ ] **Step 4: Add the panel** in MentorZone (Task 8 Step 4 snippet) and `import { ExperienceList } from '../components/ExperienceList';`

- [ ] **Step 5: Run** — `node scripts/test-environment.mjs test tests/mentor-profile-v2.spec.ts` → PASS. Screenshot desktop and mobile.

- [ ] **Step 6: Commit**

```bash
git add src/components/ExperienceList.tsx src/pages/MentorZone.tsx src/styles.css src/lib/api.ts src/i18n tests/mentor-profile-v2.spec.ts
git commit -m "feat: Mentor zone experiences tab with competition-name autocomplete"
```

---

### Task 10: Admin experience queue page

**Files:**
- Create: `src/pages/admin/AdminExperiences.tsx`
- Modify: `src/pages/admin/AdminLayout.tsx` (nav link after "requests"), `src/main.tsx` (route `{ path: 'experiences', element: <AdminExperienceQueue /> }` next to `requests`)
- Test: `tests/mentor-profile-v2.spec.ts`

**Interfaces:**
- Consumes: `GET /admin/experiences?status=`, `POST /admin/experiences/:id/decision`
- Produces: `export function AdminExperienceQueue()`

- [ ] **Step 1: Write the failing test** (append; use whatever admin-account helper `tests/admin.spec.ts` uses — read it and copy the setup)

```ts
test('admin verifies a pending experience', async ({ page }) => {
  const fixture = await createMentorFixture({ thai: true });
  const admin = await createAccount('admin'); // match the helper signature in tests/helpers.ts
  const name = `Admin Check ${Date.now()}`;
  try {
    await db.insert(mentorExperiences).values({
      id: `${fixture.mentorId}-exp-x`, mentorId: fixture.mentorId, name, year: '2566', result: 'finalist', kind: 'hackathon', role: 'developer',
      responsibility: 'x', evidenceUrl: 'https://example.com/e', status: 'pending',
    });
    await signIn(page, admin, '/admin/experiences');
    const row = page.locator('li').filter({ hasText: name });
    await expect(row.getByRole('link', { name: /https:\/\/example.com\/e/ })).toBeVisible();
    await row.getByRole('button', { name: 'หลักฐานถูกต้อง' }).click();
    await expect(row).toHaveCount(0);
    await page.getByRole('button', { name: 'ตรวจแล้ว' }).click();
    await expect(page.locator('li').filter({ hasText: name })).toBeVisible();
  } finally {
    await removeAccount(admin);
    await fixture.remove();
  }
});
```

- [ ] **Step 2: Run to verify it fails** — expected FAIL (404 page)

- [ ] **Step 3: Build the page** (Thai only, following `AdminRequests.tsx` conventions)

```tsx
// src/pages/admin/AdminExperiences.tsx
import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { formatDate } from '../../data/competitions';
import { ApiError, post } from '../../lib/api';
import { useApi } from '../../lib/useApi';

/* คิวตรวจประสบการณ์แข่งขันที่เมนเทอร์เพิ่มเองใน Mentor zone (spec 2026-10-13 หมวด C)
   ตรวจลิงก์หลักฐานแล้วกด "หลักฐานถูกต้อง" รายการนั้นจึงนับคะแนนจับคู่และป้ายบนโปรไฟล์ ไม่ผ่านต้องบอกเหตุผล */

type Status = 'pending' | 'verified' | 'rejected';
type Item = {
  id: string; mentorId: string; mentorName: string; name: string; competitionSlug: string | null; year: string; kind: string; result: string;
  detail: string; role: string; roleOther: string; responsibility: string; evidenceUrl: string; lessons: string; status: Status; reason: string; createdAt: string;
};
const filters: { id: Status | 'all'; label: string }[] = [
  { id: 'pending', label: 'รอตรวจ' }, { id: 'verified', label: 'ตรวจแล้ว' }, { id: 'rejected', label: 'ไม่ผ่าน' }, { id: 'all', label: 'ทั้งหมด' },
];
const resultLabel: Record<string, string> = { participant: 'ผู้เข้าร่วม', finalist: 'Finalist', winner: 'ได้รับรางวัล', other: 'อื่น ๆ' };
const roleLabel: Record<string, string> = { developer: 'Developer', designer: 'Designer', leader: 'Team Leader', business: 'Business / Pitching', other: 'อื่น ๆ' };

function Decide({ item, onDone }: { item: Item; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function send(body: object) {
    setBusy(true); setMessage('');
    try { await post(`/admin/experiences/${item.id}/decision`, body); onDone(); }
    catch (error) { setMessage(error instanceof ApiError ? error.message : 'ส่งไม่สำเร็จ'); }
    finally { setBusy(false); }
  }
  return <div className="admin-decision">
    <button type="button" className="primary-button" disabled={busy} onClick={() => send({ decision: 'verify' })}>หลักฐานถูกต้อง</button>
    <label>เหตุผลที่ไม่ผ่าน<input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></label>
    <button type="button" className="secondary-button" disabled={busy} onClick={() => send({ decision: 'reject', reason })}>ไม่ผ่าน</button>
    {message && <p className="form-error" role="alert">{message}</p>}
  </div>;
}

export function AdminExperienceQueue() {
  const [status, setStatus] = useState<Status | 'all'>('pending');
  const { data, reload } = useApi<{ items: Item[] }>(`/admin/experiences?status=${status}`);
  return <section className="admin-page" aria-labelledby="exp-title">
    <h1 id="exp-title">ประสบการณ์เมนเทอร์</h1>
    <p className="muted">เมนเทอร์เพิ่มงานที่เคยแข่งเองใน Mentor zone เปิดลิงก์หลักฐานดูว่าชื่อเมนเทอร์อยู่ในผลจริง แล้วกดหลักฐานถูกต้อง</p>
    <div className="admin-filters" role="group" aria-label="สถานะ">
      {filters.map((f) => <button key={f.id} type="button" aria-pressed={status === f.id} onClick={() => setStatus(f.id)}>{f.label}</button>)}
    </div>
    {data?.items.length === 0 && <p className="muted">ไม่มีรายการ</p>}
    <ul className="admin-queue">
      {data?.items.map((item) => <li key={item.id} className="admin-card">
        <h2>{item.name} · {item.year}</h2>
        <p>{item.mentorName} · {resultLabel[item.result]}{item.detail ? ` (${item.detail})` : ''} · {roleLabel[item.role]}{item.roleOther ? ` (${item.roleOther})` : ''}</p>
        <p>สิ่งที่รับผิดชอบ: {item.responsibility}</p>
        {item.lessons && <p>ประสบการณ์ที่ส่งต่อได้: {item.lessons}</p>}
        <p><a href={item.evidenceUrl} target="_blank" rel="noreferrer noopener">{item.evidenceUrl}<ArrowUpRight size={14} aria-hidden="true" /></a></p>
        <p className="muted">ส่งเมื่อ {formatDate(item.createdAt, 'th')}</p>
        {item.status === 'pending' ? <Decide item={item} onDone={reload} /> : item.reason && <p>เหตุผล: {item.reason}</p>}
      </li>)}
    </ul>
  </section>;
}
```

Match the class names (`admin-page`, `admin-filters`, `admin-queue`, `admin-card`, `admin-decision`) to those actually used in `AdminRequests.tsx`. Read its JSX and reuse its classes, so no new admin CSS is needed. Add the nav link `<NavLink to="/admin/experiences">ประสบการณ์เมนเทอร์</NavLink>` after the requests link in `AdminLayout.tsx`.

- [ ] **Step 4: Run** — browser test → PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/AdminExperiences.tsx src/pages/admin/AdminLayout.tsx src/main.tsx tests/mentor-profile-v2.spec.ts
git commit -m "feat: admin page to verify mentor competition experiences"
```

---

### Task 11: Public mentor profile shows A–F

**Files:**
- Modify: `src/pages/MentorProfile.tsx` (`Payload` type and the `cx-main` sections ~270–310), `src/styles.css`
- Test: `tests/mentor-profile-v2.spec.ts`

**Interfaces:**
- Consumes: `profile`, `experiences`, `stats` from `GET /consult/mentors/:id` (Task 6)

- [ ] **Step 1: Write the failing test** (append)

```ts
test('public profile shows headline, skills, experiences and trust stats', async ({ page }) => {
  const fixture = await createMentorFixture({ thai: true });
  try {
    await db.update(mentors).set({ headline: 'AI Engineer | Mentor', languages: ['th'], helpsWith: ['coding'], teachingStyles: ['step_by_step'], formats: ['one_on_one'], learnerLevels: ['beginner'], replyHours: 24, mode: 'online', gender: 'female' })
      .where(eq(mentors.id, fixture.mentorId));
    await db.insert(mentorSkills).values({ mentorId: fixture.mentorId, tag: 'python', level: 'expert' });
    await page.goto(`/mentors/${fixture.mentorId}`);
    await expect(page.getByText('AI Engineer | Mentor')).toBeVisible();
    const skills = page.getByRole('region', { name: 'ทักษะ' });
    await expect(skills).toContainText('Python · Expert');
    await expect(page.getByRole('region', { name: 'การให้คำปรึกษา' })).toContainText('สอนทีละขั้น');
    await expect(page.getByRole('region', { name: 'ประสบการณ์แข่งขัน' })).toContainText('ตรวจแล้ว');
    await expect(page.getByRole('region', { name: 'ความน่าเชื่อถือ' })).toContainText('ยืนยันอีเมลแล้ว');
    // เพศไม่แสดงบนหน้าโปรไฟล์
    await expect(page.getByText('หญิง')).toHaveCount(0);
  } finally {
    await fixture.remove();
  }
});
```

- [ ] **Step 2: Run to verify it fails**

- [ ] **Step 3: Implement**

Extend `Payload` (find its declaration near the top of `MentorProfile.tsx`):

```ts
import type { MentorProfileV2 } from '../data/matching';
import type { ExperienceRow } from '../components/ExperienceList';
// in Payload:
profile: Omit<MentorProfileV2, 'gender'>;
experiences: (Omit<ExperienceRow, 'evidenceUrl' | 'reason' | 'createdAt'> & { evidenceUrl?: string })[];
stats: { emailVerified: boolean; completedSessions: number; responseRate: number | null; evidenceLinks: number };
```

Under `<h1>{mentor.name}</h1>` add `{data.profile.headline && <p className="cx-hero__headline">{data.profile.headline}</p>}`.

Replace the first `cx-main` section (the "about" section) with these four sections, and keep the competitions and reviews sections after them:

```tsx
const v = t.mentorProfileV2;
// ...
<section className="panel" aria-labelledby="about-title">
  <h2 id="about-title">{s.experience}</h2>
  <p className="cx-prose">{mentor.bio}</p>
  {data.profile.background && <p className="cx-hint">{data.profile.background}</p>}
  {data.profile.skills.length > 0 && <section aria-labelledby="skills-title">
    <h3 id="skills-title">{v.publicSkills}</h3>
    <ul className="pv2-tags">{data.profile.skills.map((sk) => <li key={sk.tag}>{v.skillNames[sk.tag]} · {v.levelNames[sk.level]}</li>)}</ul>
  </section>}
</section>

<section className="panel" aria-labelledby="mentoring-title">
  <h2 id="mentoring-title">{v.publicHelps}</h2>
  <ul className="pv2-tags">
    {data.profile.helpsWith.map((id) => <li key={id}>{v.helpsWithNames[id]}</li>)}
    {data.profile.teachingStyles.map((id) => <li key={id}>{v.teachingStyleNames[id]}</li>)}
    {data.profile.formats.map((id) => <li key={id}>{v.formatNames[id]}</li>)}
  </ul>
  {data.profile.deliverables && <><h3>{v.deliverables}</h3><p className="cx-prose">{data.profile.deliverables}</p></>}
  <h3>{s.cannotHelp}</h3><p className="cx-prose">{mentor.cannot}</p>
  <h3>{v.publicAvailability}</h3>
  <p className="cx-prose">
    {[data.profile.languages.map((l) => v.languageNames[l]).join(', '),
      data.profile.replyHours ? v.replyOptions[data.profile.replyHours] : '',
      data.profile.mode ? v.modeNames[data.profile.mode] : '',
      data.profile.sessionMinutes.map((n) => v.minutes(n)).join(' / ')].filter(Boolean).join(' · ')}
  </p>
</section>

<section className="panel" aria-labelledby="exp-title">
  <h2 id="exp-title">{v.experiencesTitle}</h2>
  {data.experiences.length === 0 ? <p className="cx-lead">{v.experiencesEmpty}</p> : <ul className="cx-list">
    {data.experiences.map((row) => <li key={row.id}><div>
      <p className="cx-list__title">{row.name} · {row.year}<span className={`cx-pill pv2-status is-${row.status}`}>{v.statusNames[row.status]}</span></p>
      <p className="cx-hint">{v.kindNames[row.kind]} · {v.resultNames[row.result]}{row.detail ? ` (${row.detail})` : ''} · {v.roleNames[row.role]}</p>
      {row.responsibility && <p className="cx-prose">{row.responsibility}</p>}
      {row.lessons && <p className="cx-prose">{row.lessons}</p>}
      {row.evidenceUrl && <a href={row.evidenceUrl} target="_blank" rel="noreferrer noopener">{v.evidenceUrl}</a>}
    </div></li>)}
  </ul>}
</section>

<section className="panel" aria-labelledby="trust-title">
  <h2 id="trust-title">{v.publicTrust}</h2>
  <ul className="pv2-tags">
    {data.stats.emailVerified && <li>{v.statEmail}</li>}
    <li>{v.statSessions(data.stats.completedSessions)}</li>
    <li>{data.stats.responseRate === null ? v.statResponseNone : v.statResponse(data.stats.responseRate)}</li>
    {data.stats.evidenceLinks > 0 && <li>{v.statEvidence(data.stats.evidenceLinks)}</li>}
  </ul>
</section>
```

The old `mentor.experience` (free text from the application) is no longer shown. It is replaced by structured experiences, and `bio` is the "introduction and approach". The skills block is a nested `<section>` labelled "ทักษะ", so it is exposed as a region.

Styles:

```css
.cx-hero__headline { margin: 2px 0 6px; font-weight: 600; color: var(--muted-ink, #44445a); }
.pv2-tags { display: flex; flex-wrap: wrap; gap: 6px; padding: 0; margin: 0 0 var(--space-3, 12px); list-style: none; }
.pv2-tags li { padding: 4px 10px; border-radius: 999px; background: color-mix(in srgb, var(--purple, #6d28d9) 8%, transparent); font-size: .9rem; }
```

- [ ] **Step 4: Run** — the new test passes. Run the existing profile-page tests too (`node scripts/test-environment.mjs test tests/consult.spec.ts tests/rising-star.spec.ts`) and update any assertion that relied on the removed free-text experience paragraph.

- [ ] **Step 5: Screenshots** — desktop and mobile, TH and EN, of `/mentors/:id` and `/mentor-zone#profile`. Check that nothing scrolls horizontally on mobile (`expectNoSideScroll` helper if present in `tests/helpers.ts`).

- [ ] **Step 6: Commit**

```bash
git add src/pages/MentorProfile.tsx src/styles.css tests/mentor-profile-v2.spec.ts
git commit -m "feat: public mentor profile shows skills, mentoring, experiences and trust stats"
```

---

### Task 12: Full verification, WORKLOG, push

**Files:**
- Modify: `markdown/WORKLOG.md`

- [ ] **Step 1: Full checks**

```bash
npx tsc -p . --noEmit
npm run check:i18n
node scripts/test-environment.mjs auth
node scripts/test-environment.mjs test
npm run build
```
Expected: all pass. Report any failure with its output; do not skip tests.

- [ ] **Step 2: WORKLOG entry** (append)

```markdown
## 2026-10-13 — Mentor profile v2 (pivot phase 1 of 4)

- Spec: docs/superpowers/specs/2026-10-13-mentor-matching-design.md. Plan: docs/superpowers/plans/2026-10-13-mentor-profile-v2.md.
- Migration **0028**:
  - `mentors` gains A/D/E fields: headline, country, time zone, languages, background, optional gender (never public), helpsWith, learner levels, teaching styles, formats, deliverables, availability slots, sessions/week, session lengths, accepting, reply hours, urgent, mode.
  - New `mentor_skills` (tag + level) and `hackathon_names` (typed competition names for autocomplete).
  - `mentor_experiences` gains kind, role, responsibility, evidence link, lessons and status (existing rows = verified).
- Only `verified` experiences count for eligibility, badges and ranking.
- Mentor zone:
  - "โปรไฟล์" tab (A/B/D/E) and "ประสบการณ์" tab (C, autocomplete, sent as pending).
  - A banner lists missing sections; `/consult/zone` returns `profileComplete`/`profileMissing`.
- Admin: /admin/experiences queue to verify or reject.
- Public profile: headline, skills, mentoring, availability, structured experiences (evidence link only once checked), trust stats (email verified, completed sessions, response rate, checked evidence links).
- Not changed: the mentor application form. New mentors complete A–F after approval.
- Production needs migration 0028 before main is pushed.
```

- [ ] **Step 3: Commit and push to dev**

```bash
git add markdown/WORKLOG.md
git commit -m "docs: log mentor profile v2"
git push origin dev
```
