# ChampionWays pivot: competition mentor matching (hackathons and case competitions)

Date: 2026-10-13 · Status: draft for owner review

## 1. Why

Visitors compare ChampionWays with Contesterlife because the first thing they see is a list of competitions. ChampionWays is a platform that connects mentors who have won hackathons and case competitions with students who want to compete. The site is rebuilt around one path:

Home → **Ready to win the competition?** → basic profile (first time) → project + questions → matched mentors (several, ranked) → **Start Consult** (talk off the platform) → **Finish Consult** → star review.

Success: a first-time visitor understands what ChampionWays does within 5 seconds of landing, and can go from Home to a ranked list of mentors without reading a competition page.

## 2. Owner decisions (2026-10-13)

| # | Question | Decision |
|---|----------|----------|
| 1 | Existing competition system | Hide from menu and Home; keep data + API for autocomplete and the H score; old URLs redirect; stop auto-import. |
| 2 | Already-approved mentors | Migrate existing data automatically; Mentor zone banner asks them to complete the new sections; not shown in match results until complete; no admin re-review except for new experiences. |
| 3 | Typed competition names | A new name joins autocomplete at once (name only, no page). An experience counts toward H only after an admin checks its evidence ("รอตรวจ" until then). Names typed by learners are used for matching but never added to autocomplete. |
| 4 | Start / Finish Consult | Start shows contacts at once and emails the mentor a project summary. Finish → mentor confirms by email link (existing flow) → learner can review. Mentor "not me" = no review. |
| 5 | H score | Graded score, not a hard filter. Same competition verified = full + badge "เคยแข่งงานนี้". Everyone still appears; those who competed in it rank higher. |
| — | Engine | Rule-based formula computed when a request is sent, results stored as a snapshot. AI never scores. |
| 6 | AI (2026-10-20) | AI only turns free text into tags from the fixed lists, once at save time; the person sees and can edit the tags; the formula reads tags. AI-written card reasons come later. See 5.8. |
| 7 | Reply time without history (2026-10-20) | Declared `replyHours` until 3 consultations, then the slower of declared and measured median. See 5.6. |
| 8 | New mentors (2026-10-20) | No score boost. "Mentor ใหม่" badge; inside a near-tie they rank before mentors rated under 3.5 stars. See 5.7. |
| 9 | Rising Star (2026-10-20) | Never changes the %. Up to 2 labelled "Rising Star · แนะนำ" slots on top when % ≥ 60; first inside a near-tie (≤ 5 points); gold badge. See 5.7. |
| 10 | Scope (2026-10-20) | Hackathons **and** case competitions. CTA "Ready to win the competition?". Learners say which kind their competition is; mentors tag each experience with its kind; H prefers the same kind. See 4.1, 4.2, 5.3. |
| 11 | One mentor at a time (2026-10-20) | A project has at most one open consultation, so advice never conflicts. After Finish (waiting for the mentor) the learner may start with someone else. **Change mentor** ends an open consultation with a reason (`no_response`, `not_fit`, `other`) and no review. See 6.1. |
| 12 | Navigation (2026-10-20) | Sign-in area as on the current site, plus **My Projects** for signed-in users. No Match button in the nav: matching starts from the Landing CTA or My Projects → New project. See 7. |
| 13 | Landing copy and ranking (2026-10-20) | Copy never says every mentor is a winner (any verified result qualifies; awards are badges). The Landing ranking shows **paid Rising Star members only**, ranked by this month's reviews (existing monthly logic), periods This month / Last month, field filter derived from skill groups (business / technology / design). Mentor card topics come from `helpsWith`; price shows the mentor's own unit. |
| 14 | Mentor application (2026-10-21) | Extend the existing form, no new Design. Six steps: applicant details + A, skills (B), competition experience (C, same fields as Mentor zone; evidence file **or** https link), how you help (D), time (E) + one price per mentor + contacts, review. The profile must be complete to submit. On approval the mentor gets A–E and skills, experiences become `verified`, typed names join `hackathon_names`, and listed competitions they entered become `help` choices at that one price. Per-competition prices and old topics are gone from the form; old pending applications still publish the old way. Sign in / Sign up stay the existing pages. |
| 15 | Landing first (2026-10-21) | Owner asked for Landing v4 now, before matching ships. `/` is the Landing; header and footer follow it site-wide except Sign in / Sign up (AuthLayout unchanged). Until `/match` exists every **Ready to win the competition?** goes to `/mentors`; signed-in learners keep **Consulting** where My Projects will go. The competition explorer moves to `/explore` (old `/?q=` links redirect there); competition pages stay reachable but leave the menu. APIs: `/api/rising-star/newest` (cards) and `/api/rising-star/board?period=last` (ranking, members only, field from skill groups). |

Unchanged constraints: hiring/chat/payment stay paused behind `HIRING_ENABLED`; mentors only mentor competitions they competed in (checked evidence); all copy TH/EN via dictionaries; Production deploy only when the owner asks, migrations first.

## 3. Delivery phases

Each phase is its own plan, ships to `dev` on its own, and leaves the site working.

1. **Mentor profile v2 (A–F)** — data, application form, Mentor zone editing, admin review, public profile.
2. **Learner profile + Projects + questions + matching engine + results.**
3. **Consult lifecycle** — Start/Finish wired to match results, mentor email summary, review, trust stats (F).
4. **New Home + navigation** — competition system leaves the menu; redirects; auto-import off.

Phase 4 goes last so the current site keeps working until the new path is complete.

## 4. Data model

Next migration number: 0030 (0028 profile v2, 0029 mentor application v2).

### 4.1 Mentor (fixed option lists live in `src/data/matching.ts`, shared with the server)

**A — Basic profile** (`mentors` new columns)
- existing: `name`, `photoUrl`, `bio` (intro + mentoring approach), contacts
- `headline` text (e.g. "AI Engineer | 3× Hackathon Mentor"), max 80
- `country` text (ISO code), `timeZone` text (IANA, default `Asia/Bangkok`)
- `languages` text[] — `th`, `en` (at least one)
- `background` text — education level or current field
- `gender` text nullable — `male` / `female` / null (optional; null never matches a gender-specific request)

**B — Technical expertise** — new table `mentor_skills (mentor_id, tag, level)`; `level` in `intermediate | advanced | expert`; unique (mentor_id, tag). Tags (fixed):
- Programming: `python`, `javascript`, `cpp`, `java`
- Web/App: `react`, `nextjs`, `mobile`
- AI/ML: `ml`, `llm`, `cv`
- `hardware_iot_robotics`
- `data_science`, `cybersecurity`, `cloud`
- `uiux`, `product_design`
- `business_model`, `startup`, `marketing`, `strategy`, `finance`
- `pitching`, `presentation`, `storytelling`

**C — Competition experience** — extend `mentor_experiences` (one row per competition entered; a mentor adds as many as they want)
- `competitionId` (existing, nullable) **or** new `hackathonNameId` → new table `hackathon_names (id, name, normalized, created_by, created_at)`, unique on `normalized`. Autocomplete searches `competitions.name` ∪ `hackathon_names.name`.
- `year` (existing), required
- `kind` new: `hackathon | case | innovation | software | other`, required
- `result`: existing `winner | finalist | participant` plus new `other`; `detail` holds the award name (required when `winner`) or the "other" text
- `role` new: `developer | designer | leader | business | other` (+ `roleOther` text)
- `responsibility` new text, required
- `evidenceUrl` new text, required (https); evidence files stay optional
- `lessons` new text, optional ("experience that can help the next teams")
- `status` new: `pending | verified | rejected`. Existing rows migrate as `verified` (they were checked under the old rule). Only `verified` rows count toward H and badges.

**D — Mentoring capability** (`mentors` new columns, all text[] of fixed values)
- `helpsWith`: `idea_validation`, `coding`, `debugging`, `architecture`, `mvp`, `pitch_deck`, `presentation`, `case_analysis`
- `learnerLevels`: `beginner`, `intermediate`, `advanced`
- `teachingStyles`: `step_by_step`, `guided_questions`, `review`, `direct_feedback`
- `formats`: `one_on_one`, `team`, `code_review`
- `deliverables` text (what the learner gets after a session)
- `cannot` (existing) = topics not taken

**E — Availability & commitment** (`mentors` new columns)
- `availability` jsonb — list of `{ day: 0–6, from: 'HH:MM', to: 'HH:MM' }` in the mentor's time zone
- `sessionsPerWeek` integer 1–20
- `sessionMinutes` integer[] ⊂ {30, 60, 90}
- `acceptingRequests` boolean (default true)
- `replyHours` integer — one of 6, 24, 72, 168 (replaces free-text `replyTime` for matching; `replyTime` kept for display of old data)
- `acceptsUrgent` boolean
- `mode`: `online | onsite | both`
- price: existing `price` / `priceUnit` (free or amount per free-text unit)

**F — Trust & reputation** — computed, never typed: email verified; average stars + count (`mentor_reviews`); completed sessions (`consultations` confirmed); response rate = confirmed or denied ÷ (finished-by-learner + changed with reason `no_response`), and median days to respond; evidence links from verified experiences.

**Completeness** — `profileComplete(mentor)` (pure function, server and client): A (headline, languages ≥1, country, background), B (≥1 skill), C (≥1 experience, any status), D (helpsWith, learnerLevels, teachingStyles, formats ≥1 each), E (availability ≥1 slot, sessionsPerWeek, sessionMinutes ≥1, replyHours, mode). Incomplete → visible profile, excluded from matching, Mentor zone banner.

**Migration of existing mentors** — copy what exists (name, photo, bio, contacts, price, experiences as `verified` with `kind = hackathon`, `role = other`, `responsibility = ''`, `evidenceUrl = ''`). Empty required fields make them incomplete until they edit.

### 4.2 Learner

- `learner_profiles (user_id PK, level, interests_fields text[], skills text[], languages text[], country, interests text, updated_at)`
  - `level`: `beginner | intermediate | advanced`
  - `interests_fields`: `ai`, `web`, `hardware`, `design`, `data`, `security`, `business`, `other`
  - `skills`: same tag list as mentor B
  - name and photo come from `users`
- `projects (id, user_id, name, start: has_competition | has_idea | build_skills, competition_kind: hackathon | case | null, competition_id null, competition_name text, stage, created_at, updated_at)`
  - `competition_kind` is required when `start = has_competition` (asked right under Q1, before Q2)
  - `stage`: `idea | planning | prototype | improving | pitching`; labels fit both kinds: Just an idea / Researching & planning / Building (prototype or analysis) / Improving / Preparing pitch
  - `competition_name` is the typed name when there is no `competition_id`; it is matched against `hackathon_names.normalized` but never inserted there
- `match_requests (id, project_id, user_id, answers jsonb, created_at)` — answers to Q4–Q10:
  - `helpAreas` (multi): `ai_ml`, `web_app`, `hardware`, `uiux`, `business`, `idea_validation`, `debugging`, `pitch`, `teamwork`, `case_analysis`, `financial_modeling`
  - `skillLevel`: `beginner | intermediate | advanced`
  - `style`: `step_by_step | guided_questions | review | direct_feedback | mixed`
  - `format`: `one_on_one | team | either`
  - `urgency`: `48h | week | flexible`
  - `language`: `th | en | either`
  - `gender`: `any | male | female`
  - `note` text, optional (dates, budget)
  - Q1–Q3 are the project's `start`, competition and `stage`, copied into `answers` at send time so the snapshot is stable
- `match_results (request_id, mentor_id, rank, score, parts jsonb {S,H,G,T,A}, reasons text[], version)` — PK (request_id, mentor_id)
- `consultations.match_request_id` new nullable FK

Limits: 20 projects per user; 10 match requests per user per day.

## 5. Matching engine (`server/lib/matching.ts`, pure, version `v1`)

`Score = 0.30·S + 0.25·H + 0.20·G + 0.15·T + 0.10·A`, each part 0–1, shown as a whole-number percentage.

### 5.1 Hard filters (mentor excluded)
- not `profileComplete`, not `verified`, or `acceptingRequests = false`
- no shared language (`either` accepts `th` or `en`)
- request gender ≠ `any` and mentor gender ≠ requested
- open consultations started in the last 7 days ≥ `sessionsPerWeek` (full this week)

### 5.2 S — Skill fit (30%)
Each chosen help area is covered by mentor skill tags and/or capabilities:

| Help area | Covered by |
|---|---|
| ai_ml | skills ml, llm, cv, data_science |
| web_app | skills react, nextjs, mobile, javascript |
| hardware | skill hardware_iot_robotics |
| uiux | skills uiux, product_design |
| business | skills business_model, startup, marketing |
| idea_validation | capability idea_validation |
| debugging | capability debugging, or format code_review with any Programming/Web skill |
| pitch | skills pitching, presentation, storytelling, or capability pitch_deck / presentation |
| teamwork | capability architecture or mvp, or a verified experience with role leader |
| case_analysis | skill strategy, or capability case_analysis |
| financial_modeling | skill finance |

Coverage per area = best of: skill level Expert 1.0, Advanced 0.85, Intermediate 0.6; capability-only 0.7. If the learner is `advanced`, an Intermediate skill counts 0.4. S = mean over chosen areas.

### 5.3 H — Competition experience (25%), verified experiences only
- The request names a competition (`competition_id`, or a typed name equal to a `hackathon_names` entry after normalising) and the mentor has a verified experience in it → **1.0**, reason "เคยแข่งงานนี้".
- Otherwise the best experience: base 0.5 if its `kind` equals the request's competition kind (`hackathon` when the learner has no competition yet), else 0.3; +0.2 winner, +0.1 finalist; +0.1 if the role fits a help area (developer ↔ web_app/ai_ml/debugging, designer ↔ uiux, business ↔ business/pitch, leader ↔ teamwork); capped at 0.8.
- The learner has no competition (`has_idea` / `build_skills`): same rule, but the cap is 1.0 and the same-kind base is 0.6.
- No verified experience → 0.

### 5.4 G — Goal & project fit (20%)

| Stage | Wanted capabilities |
|---|---|
| idea | idea_validation |
| planning | idea_validation, architecture (or uiux skill) |
| prototype | coding, mvp, architecture, debugging |
| improving | debugging, architecture (or format code_review) |
| pitching | pitch_deck, presentation |

For a case competition, `prototype` and `improving` want `case_analysis` (plus `pitch_deck` for improving) instead of the coding capabilities.

G = 0 with no match, else 0.5 + 0.5 × (matched ÷ wanted). For `build_skills` the stage is treated as `prototype`.

### 5.5 T — Teaching style fit (15%)
- T = 0.5·style + 0.3·level + 0.2·format
- style: the mentor lists the requested style → 1; `mixed` → 1 with ≥2 styles, 0.6 with 1
- level: mentor `learnerLevels` contains the learner's level → 1, else 0
- format: `either` → 1; one_on_one/team listed → 1, else 0

### 5.6 A — Availability & language (10%)
- A = 0.6·urgency + 0.4·language
- urgency `48h`: acceptsUrgent and replyHours ≤ 24 → 1; acceptsUrgent → 0.6; else 0.1. `week`: replyHours ≤ 72 → 1, else 0.5. `flexible` → 1.
- replyHours used here is the **effective** reply time: the mentor's declared value while they have fewer than 3 consultations; from 3 on, the slower of declared and the measured median (Start Consult → the mentor's first response/confirmation). Over-promising is corrected; answering faster than declared costs nothing. New mentors are never penalised for having no history.
- language: exact match → 1; `either` with a mentor who speaks one of them → 1

### 5.7 Output and ordering
- The % shown is always the formula result. Paid status never changes it.
- **Rising Star slots:** up to 2 cards on top labelled "Rising Star · แนะนำ" (a disclosed paid placement). Only active Rising Star members who passed every hard filter and scored **≥ 60%** qualify, the best two by score. With none qualifying, no slot is shown.
- **Main list:** the remaining mentors, top 10 by score. Mentors whose scores are within **5 points** of each other count as a near-tie and are ordered: Rising Star → new mentor (no reviews yet) → average stars → completed sessions → newer verified experience. A new mentor goes ahead of mentors rated under 3.5 stars inside a near-tie, not ahead of better-rated ones.
- Badges on cards: gold star for Rising Star (existing design), "Mentor ใหม่" for mentors with no reviews yet.
- Starting values 2 slots / 60% / 5 points are constants in `server/lib/matching.ts`, tuned later from real data.
- Each result stores parts and up to 3 reasons (the strongest parts), e.g. "เคยแข่งงานนี้", "React · Expert", "ตอบภายใน 24 ชม."
- No eligible mentor → empty state with "แก้คำตอบ" (edit the answers) and a link to browse all mentors.

### 5.8 AI as a tagger (not a scorer)
- Free text (the learner's request note, the mentor's bio, deliverables and lessons) is sent to Claude **once, when it is saved**. Claude must answer through a tool whose schema only allows ids from the fixed lists in `src/data/matching.ts` (help areas, skill tags, stages).
- The extracted tags are stored next to the answers with `source: 'ai'`, and shown to the owner ("เราเข้าใจว่าคุณต้องการ: AI/ML · Web · Pitch") to remove or add before they count. Matching reads only stored tags, so the same answers always give the same result, and no AI call happens per match.
- When the AI call fails or is turned off, the request still works from the ticked options alone.
- Later: AI rewrites the stored reasons into one short sentence per card. The % and the order still come from the formula.

## 6. Pages and routes

| Route | Purpose |
|---|---|
| `/` | New Home (Landing from Claude Design): CTA **Ready to win the competition?**, how it works (4 steps), new mentors, Rising Star ranking |
| `/match` | Entry: signed out → sign-in with `next`; no learner profile → profile step; else pick a project or create one |
| `/match/profile` | Learner basic profile (A), also editable from Profile |
| `/projects` | **My Projects**: projects, each with its open consultation (at most one), its saved matches ("My matches") and history; **New project** starts the match flow |
| `/projects/new`, `/projects/:id` | Create/edit project (Q1–Q3) |
| `/projects/:id/match` | Questions Q4–Q10, short and one screen per group, with little text |
| `/matches/:requestId` | Results: mentor cards (photo, headline, % match, reasons, price), profile link, **Start Consult** per mentor; disabled while the project has an open consultation |
| `/mentors/:id` | Profile shows A, B, C (verified + pending), D, E summary, F stats |
| Mentor zone | New tab "โปรไฟล์" for A/B/D/E; experiences tab for C (add → admin evidence check); completeness banner |
| Mentor application | `/mentors/apply`, six steps covering A–E (decision 14); approval makes a complete, matchable mentor |
| Admin | Experience evidence queue (extends the existing request queue); the competition admin stays for the names list |

API (all under `/api`): `GET/PUT /learner/profile`; `GET/POST /projects`, `GET/PUT/DELETE /projects/:id`; `POST /projects/:id/match` → `{ requestId }`; `GET /matches/:requestId`; `POST /matches/:requestId/start/:mentorId` → creates the consultation (status `contacted`), returns contacts, emails the mentor a summary of the project and answers (never the learner's email); `GET/PUT /consult/zone/profile`; `POST /consult/zone/experiences`; `GET /hackathon-names?q=`.

Finish Consult and reviews reuse the existing `consultations` claim → mentor email confirm → `mentor_reviews`.

### 6.1 One open consultation per project
- `POST /matches/:requestId/start/:mentorId` returns 409 when the project already has a consultation in status `contacted` (started, not finished). The results page disables the other Start buttons with "You're consulting X. Finish first to start with someone new."
- Finish moves it out of `contacted`, so a new Start is allowed while the mentor has not confirmed yet.
- `POST /consultations/:id/change { reason: no_response | not_fit | other, note? }` (learner, only while `contacted`) closes it as `changed`: no mentor email, no review. `no_response` counts against the mentor's response rate.
- A rated review is per mentor: each consultation is finished, confirmed and reviewed on its own. A team consultation is one consultation; the project owner finishes and reviews it.

## 7. Phase 4 specifics

- Navigation keeps the current sign-in area (Sign in / Sign up; signed in: name → Profile, Admin for reviewers, Sign out) and adds **My Projects** for signed-in users with a count of things to do (open consultations not finished, confirmed ones not reviewed). Mentor zone for mentors. No Match button in the nav. Explore, Organisers, Library and Saved leave the menu.
- `/explore` → `/`; `/competitions/:slug` → `/mentors`; `/organizers*` → `/`.
- Auto-import cron is disabled (the code stays). Admin competition pages stay.

## 8. Errors and edge cases

- A mentor edits their profile after a match → the stored snapshot is unchanged; Start Consult re-checks only `acceptingRequests` and the open-consult limit.
- A mentor is removed → their results show as unavailable.
- Start twice with the same mentor → the existing unique open-consult index returns the same row.
- Learner deletes a project → its requests and results are deleted; consultations keep `match_request_id = null`.
- Typed competition name normalising: lowercase, trimmed, collapsed spaces, Thai/Arabic digits unified.

## 9. Testing

- `scripts/matching.test.ts`: unit tests per part (S/H/G/T/A), hard filters, tie-breaks, weights summing to the total.
- API tests for profile/projects/match/start, ownership (a user can't read another user's request), limits.
- Playwright: the full path Home → profile → project → questions → results → Start → Finish → mentor confirm → review, desktop + mobile, TH + EN; Mentor zone profile completion; admin experience check.
- `npm run build`, `npx tsc -p . --noEmit`.

## 10. Out of scope (v1)

AI ranking (never); AI-written card reasons (after v1, see 5.8); in-platform chat and payment (paused); calendar booking against `availability`; learner-to-learner team matching.
