# Plan — Linking learners to classes, guardians, and ADM (LRN + school-issued codes)

> Status: draft for review. No code written yet.
> Scope: web first (admin / adviser / registry desks), mobile portal second.
> Author: planning session, 2026-11-28.

---

## 1. Problem

Today a learner's `User` account is connected to a class by **LRN matching only**, done once by
the administrator at account approval. Everything else (guardian links, ADM cases) depends on
that single moment.

Two concrete failures follow from it:

1. **Silent unplaced account.** `approveAccount` (`backend/src/services/auth/approval.service.ts:22`)
   only creates the `StudentProfile` when a `StudentRoster` row already exists for that LRN
   (`:46-63`). If the adviser has not enlisted the learner yet, approval activates the account and
   creates nothing. The student logs in, `loadPortalLearner` throws `STUDENT_NOT_FOUND`
   (`backend/src/lib/portalAccess.ts:28`), and the portal is empty. Nothing in the UI asks for a
   code, shows "waiting for your class", or tells the adviser to enlist them. If the adviser
   enlists **after** approval, nothing links the existing account either — a later enlistment
   simply creates a second, account-less roster row.
2. **Guardians can never link a child.** `ParentStudentLink` has **no write path in application
   code**. It is created only by seeds (`backend/prisma/seed.ts:229`,
   `seed-sample-five.ts:284`, `seed-100-topup.ts:228`, …) and read in
   `backend/src/lib/portalAccess.ts:102`. A parent registers (no child fields at all,
   `frontend/src/components/auth/RegisterForm.tsx`), gets approved, and the portal shows
   "No linked learners" forever. `listLinkedChildren` even filters `approvedBy: { not: null }`,
   so the approval column exists but nothing ever fills it.

Related finding while reading: **`/api/parent` is not mounted**. `backend/src/app.ts` imports and
mounts `/api/student` (`:119`) but has no parent mount, even though
`backend/src/modules/parent/portal.routes.ts` exists and the mobile portal calls
`/api/parent/*` (`mobile/lib/services/portal_service.dart:107-209`). That must be fixed before any
guardian work — see Phase 0.

ADM needs no separate linking: an ADM case is a `Referral` → `AdmLearnerProfile` attached to
`studentId` **or** `rosterId` (dual-identity pattern). `approveAccount` already re-points those
rows from `rosterId` → `studentId` (`approval.service.ts:85-107`). Once placement is reliable,
ADM follows it.

---

## 2. Goals / non-goals

**Goals**

- Every active student account is either **placed** (in a class for the selected school year),
  **pending placement** (waiting for a code), or **flagged to staff** — never silently empty.
- A school-issued code lets a learner (and their guardian) claim an existing enrolment record,
  mirroring how teachers claim `TeacherName.code` (`backend/src/services/teacher/directory.service.ts:74`)
  and how advisers claim `Section.adviserCode` (`backend/src/modules/academics/adviserCode.ts`).
- Guardians can link a child, with a registry-desk approval step.
- Existing fast path (LRN match at approval) keeps working.
- Every link action is audited and notifies the desk that owns the learner.

**Non-goals**

- Building a full web parent portal (only the registry desk review screen lives in web; guardian
  redemption UI lands in mobile, see §9).
- Replacing LRN as the identity key.
- Self-enrolment into arbitrary sections. A code only ever refers to a roster row a staff member
  already created.
- Realtime subscriptions for codes (they are read with the desk's normal queries).

---

## 3. Current state (evidence)

| Connection | Mechanism today | Where |
| --- | --- | --- |
| Staff → teacher row | `TeacherName.code`, claimed once; also opens the term grant | `backend/src/services/teacher/directory.service.ts:74`, `prisma/schema.prisma:679` |
| Staff → advisory section | `Section.adviserCode` (`ADV-XXXXX`), minted on assignment, cleared on claim | `backend/src/modules/academics/adviserCode.ts`, `services/advisory/claim.service.ts:65` |
| Student → class | LRN → `StudentRoster` at approval only; profile copies grade/section | `services/auth/approval.service.ts:22-110` |
| Student → term section (read) | attendance row → roster by LRN+year → profile section | `lib/portalAccess.ts:183` |
| Parent → student | `ParentStudentLink(approvedBy?)`, **seeded only** | `lib/portalAccess.ts:102`, `prisma/schema.prisma:386` |
| ADM → learner | `Referral`/`AdmLearnerProfile` on `studentId XOR rosterId`, moved at approval | `approval.service.ts:85-107` |
| Roster creation | Only `enlistRoster` in app code (adviser flow) | `services/advisory/roster.service.ts:28-100` |

Key constraints:

- `StudentRoster` is unique per `(lrn, schoolYearId)` (`schema.prisma:546`) and is the school's
  authoritative per-year placement.
- `StudentProfile.lrn` is globally unique (`schema.prisma:346`).
- `Section` already carries `gradeLevel` + `schoolYearId` (`schema.prisma:472-497`), so grade-band
  and year guards are cheap.
- Pagination is 15/page; codes are metadata on existing list endpoints, so no new pagination.

---

## 4. Design summary

Two mechanisms, deliberately separated:

| Mechanism | Solves | Needs a code? |
| --- | --- | --- |
| **Auto-placement** — link an existing `StudentProfile` the moment its LRN is enlisted | Silent unplaced account; approval-before-enlistment ordering | No |
| **Learner link code** — `LNK-XXXXX` per roster row | Learner confirmation/placement when LRN matching could not decide; guardian linking | Yes |
| **Guardian link request** — parent redeems the learner code | `ParentStudentLink` creation with `approvedBy` | Yes (reuses learner code) |
| **ADM** | nothing new — follows placement | No |

The code is an **invitation/confirmation token**, not an identity. The roster row is always
created by a staff member (adviser enlist, or a future registry enrol screen). The code never
creates a learner out of thin air; it attaches an account/guardian to a row the school already
decided to create.

### 4.1 Placement states

Expose one derived state per student account per school year:

- `placed` — `StudentProfile.sectionId` set **or** a `StudentRoster` row exists for the year and
  `learnerSectionForTerm` resolves.
- `unplaced` — active account, no roster row for the active year, no profile section for it.
- `pending` — a guardian/link request or a code redemption is in flight (guardian side only).

Server-side helper `placementForStudent(studentId, yearId)` in `lib/portalAccess.ts` returns
`{ state, sectionId, sectionName, hasRosterRow, codeAvailable }`. Used by:
- `GET /api/student/me` (portal gate),
- the admin unplaced list (see §6.3 — not the pending queue),
- advisory roster rows (code chip).

**`GET /api/student/me` must become tolerant.** It currently calls `loadPortalLearner`
(`modules/student/portal.routes.ts:31`), which throws `STUDENT_NOT_FOUND` when the account has no
`StudentProfile` (`lib/portalAccess.ts:28`) — exactly the unplaced case the gate exists for. The
route must resolve the placement first and return `{ placement, learner: null, term, profile: null }`
(200) instead of 404; `getLearnerMe` already returns `null` and `listLearnerTerms` works without a
profile, so nothing else needs changing. All other portal routes (`/home`, `/grades`, …) keep their
current 404/409 behaviour — the client never calls them until placement succeeds.

---

## 5. Data model

### 5.1 `StudentRoster` gains the code

Mirrors `Section.adviserCode` (nullable, unique, minted by staff, revocable by rewriting):

```prisma
model StudentRoster {
  // …
  /// School-issued link code (e.g. LNK-7K2Q9). Shown to the adviser/registry desk
  /// and handed to the learner's family. Not consumed on first use: the learner
  /// redeems it for placement and each guardian redeems it for a link request.
  linkCode        String?   @unique
  linkCodeIssuedAt DateTime?
  linkCodeRevokedAt DateTime?
  // …
}
```

Why a column and not a table: the code's lifetime is exactly the roster row's lifetime
(one per learner per school year), which is also how `adviserCode` and `TeacherName.code` are
modelled. Rotation is a column rewrite; history lives in `AuditLog`.

**No new table for guardian requests.** `ParentStudentLink` already has
`approvedBy String?` and `@@unique([parentId, studentId])` (`schema.prisma:386-396`). A pending
request is a row with `approvedBy = null`; rejection deletes it. `listLinkedChildren` already
ignores unapproved rows, so no read path changes. `assertLearnerAccess` also requires
`approvedBy` (`lib/portalAccess.ts:83-92`), so a pending row can never expose a child's record.

**Archive rows stay on the old identity.** `AdviserArchivedStudent` stores `rosterId` or
`studentId` (`schema.prisma:725-737`), and `archivedAdvisoryLearnerIds` matches per identity
(`lib/learnerVisibility.ts:70-110`). Linking an account does not move an existing archive row, so a
learner the adviser archived as roster-only can reappear after placement. Accept and document, or
copy the archive row to `studentId` in the link transaction. Do not auto-unarchive.

### 5.2 Migration

Additive only:

```
backend/prisma/migrations/20261128090000_learner_link_code/migration.sql
  ALTER TABLE "StudentRoster" ADD COLUMN "linkCode" TEXT;
  ALTER TABLE "StudentRoster" ADD COLUMN "linkCodeIssuedAt" TIMESTAMP(3);
  ALTER TABLE "StudentRoster" ADD COLUMN "linkCodeRevokedAt" TIMESTAMP(3);
  CREATE UNIQUE INDEX "StudentRoster_linkCode_key" ON "StudentRoster"("linkCode");
```

(Last applied migration today is `20261127090000_subject_category_applied_specialized`; use that
timestamp or later.) Applied by hand (CI no longer runs `migrate deploy` — see `AGENTS.md` §9).
Then `npm run prisma:generate` and commit `backend/src/generated/prisma/` in the same commit. No
RLS/publication change: `StudentRoster` is not in the realtime publication, and `0001_rls.sql` only
references it inside the adviser-visibility helper (`:143`), so a new column needs no policy work.

Backfill: `npm run prisma:backfill-link-codes` — walks roster rows of the **active** school year
with `linkCode IS NULL`, mints with the shared helper, retries on unique clash, is idempotent and
dry-run by default (`--apply` to write). Older years stay `null`; their codes are dead anyway.

---

## 6. Backend

### 6.1 Shared helper `backend/src/modules/academics/learnerCode.ts`

```ts
export const LEARNER_CODE_PREFIX = "LNK-";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function mintLearnerCode(): string;          // LNK- + 5 chars
export function normalizeLearnerCode(c): string;    // trim + upper
export function matchesLearnerCode(stored, entered): boolean;
```

Same shape and alphabet as `adviserCode.ts` (no `I`, `O`, `0`, `1` — read over the phone).
`mintUniqueLearnerCode(prisma)` retries up to 5 times against the unique index, like
`mintUniqueAdviserCode` (`services/schedule/schedule.service.ts:853`).

### 6.2 Minting points

| Trigger | File | Behaviour |
| --- | --- | --- |
| Adviser enlists a learner | `services/advisory/roster.service.ts` (`enlistRoster`) | Set `linkCode`, `linkCodeIssuedAt` in the `create` data |
| Adviser/admin/registry asks for a code | new service functions | Mint when null; rotate when asked |
| Backfill | `scripts/backfill-link-codes.ts` | Idempotent |

`enlistRoster` also gains **auto-placement** (Phase 0 fix), with a narrow guard:

```ts
// after creating the roster row, inside the same transaction:
// An account may already exist for this LRN (approved before enlistment).
// Link it only when it is not placed yet — a typo'd LRN must never move an
// already-placed learner into this adviser's section.
const profile = await tx.studentProfile.findUnique({
  where: { lrn: input.lrn },
  select: { userId: true, gradeLevel: true, sectionId: true, section: { select: { schoolYearId: true } } },
});
const placedThisYear =
  profile?.section?.schoolYearId === yearId && profile.sectionId !== entry.sectionId;
if (placedThisYear) {
  // Keep today's behaviour: refuse rather than silently relocate.
  throw new AppError(409, "LRN_REGISTERED", "This LRN already has an account in another section");
}
if (profile) {
  await linkProfileToRoster(tx, profile.userId, input.lrn, entry);
}
```

`linkProfileToRoster(tx, studentId, lrn, roster)` is the extracted form of
`approval.service.ts:85-107`: set `sectionId` + `gradeLevel` on the profile, then re-point **exactly
these five tables** from every `StudentRoster` row of that LRN (`rosterId` → `studentId`):
`studentGrade`, `finalGrade`, `attendanceRecord`, `anecdotalRecord`, `referral`.

Do **not** extend the carryover to `Intervention`, `RiskSnapshot`,
`AdvisoryModuleSubmission` or `AdviserArchivedStudent`. Approval never moves them today, the roster
identity stays valid for those rows, and repointing submissions can violate
`@@unique([moduleId, studentId])` (`schema.prisma:1425`). Replicating today's five updates keeps
the change behaviour-neutral.

Extract it into `backend/src/services/learnerLink.ts` and call it from **both** approval and
enlistment so the carryover lives once. (This is the only refactor of existing behaviour; it is
covered by `backend/tests/auth-approval*` and new enlist tests.)

### 6.3 API surface

| Method + path | Roles | Purpose |
| --- | --- | --- |
| `GET /api/student/me` **(extended, now 200 when unplaced)** | student | `placement: { state, sectionId, sectionName }`; `learner: null` when unplaced |
| `POST /api/student/link` | student | redeem a learner code → place the account |
| `POST /api/parent/children/link` | parent | redeem a learner code → create a **pending** `ParentStudentLink` |
| `GET /api/parent/children/requests` | parent | pending/rejected link requests |
| `GET /api/parent/children` | parent | unchanged (approved only) |
| `GET /api/registrar/guardian-links` | registrar, record_keeper | pending guardian requests, banded by learner grade |
| `POST /api/registrar/guardian-links/:parentId/:studentId/approve` | registrar, record_keeper | set `approvedBy` |
| `POST /api/registrar/guardian-links/:parentId/:studentId/reject` | registrar, record_keeper | delete row |
| `GET /api/teacher/advisory/students` **(extended)** | adviser | each row gains `linkCode` (null → not minted) and `placementState` |
| `POST /api/teacher/advisory/students/:lrn/link-code` | adviser | mint-or-rotate the code for a roster row in the adviser's section (keyed by LRN — rows are `roster:<id>` or user ids, so LRN is the only stable handle) |
| `GET /api/<desk>/students` **(extended)** / `POST .../:lrn/link-code` | registry desks | `linkCode` on the band's profile list (`services/registry/accounts.service.ts:107`) |
| `GET /api/admin/learners/unplaced` **(new)** | admin | active student accounts with no placement for the active year — this cannot ride on `/account-approvals`, which is pending-only |
| `POST /api/admin/learners/:lrn/link-code` | admin | mint/rotate a code for the learner's roster row (or 409 if none) |

There is **no `/api/<desk>/accounts` endpoint** today. The registry desk's account view is
`GET /api/<desk>/account-breakdown` (grouped counts only, `services/registry/accounts.service.ts:72`)
plus `GET /api/<desk>/students` (per-profile rows). Codes therefore hang on `/students`; the grouped
breakdown gets no code column. If the desk must see roster-only learners (no account yet), that is a
new list endpoint — defer to Phase 2 and keep Phase 1 on the adviser + admin surfaces.

Mounted as: redeem routes inside `modules/student/portal.routes.ts` and
`modules/parent/portal.routes.ts`; guardian review inside a shared registry service (record-keeper
mounts the same router with its band, the way `adviser-access` does today —
`modules/record-keeper/record-keeper.routes.ts:131`, `modules/registrar/registrar.routes.ts:117`).

**Phase 0 prerequisite:** add `app.use("/api/parent", parentRoutes)` to `backend/src/app.ts`.

### 6.4 Student redemption algorithm (`POST /api/student/link`)

1. Normalize code; reject empty (`400 CODE_REQUIRED`).
2. `studentRoster.findUnique({ where: { linkCode } })`; miss → `404 CODE_NOT_FOUND`
   ("Check the code on your enrolment slip") — never reveal whether a roster/LRN exists.
3. `revokedAt` set → `409 CODE_REVOKED`; row's school year not `isActive` → `409 CODE_EXPIRED`.
4. LRN check. `User.lrn` is nullable and **not unique** (`schema.prisma:258`), and the API accepts a
   student registration without one (`auth.schemas.ts:30`) even though the form requires it:
   - `user.lrn` null → acceptable: set it from the roster row (audited), because the code proves the
     school invited this LRN and the account already passed admin approval.
   - `user.lrn` set and different → `409 CODE_LRN_MISMATCH`. The code cannot repair a wrong LRN;
     the administrator corrects the account (new small admin action, see §13) or the family
     re-registers. Never auto-correct an LRN from a code.
5. Load the profile:
   - none → create `StudentProfile` (lrn from roster, gradeLevel, sectionId, mascot from roster when
     unset), then `linkProfileToRoster`.
   - exists and already placed **in the same year** → `409 ALREADY_PLACED` (idempotent success when
     it is already this section).
   - exists with no placement for the year → `linkProfileToRoster`.
6. Audit, invalidate tags (`teacher`, `roster`, `registrar-accounts`, `overview`, `academics`),
   notify the section adviser + the student (message without the code — see §9).
7. Return the new placement for an immediate portal refresh.

Placement is **instant** (recommended): the code is learner-specific and the account's LRN must
match, so a leaked code is useless without an account under that exact LRN — and that account
already passed admin approval. A wrong *code* cannot misplace anybody; a wrong *roster row* (the
adviser enlisted the learner elsewhere) is the only real error, and **there is no section-move
operation in the app today** — `updateRosterStudent` edits name/LRN only
(`services/advisory/roster.service.ts:144-190`), and no route deletes or moves a roster row. So
Phase 2 needs either an admin/registry "move learner to section" action or an ops script; do not
pretend it exists in Phase 1.

### 6.5 Guardian link algorithm (`POST /api/parent/children/link`)

1–3. Same code lookup and year/revocation guards.
4. Resolve `StudentProfile` by `roster.lrn`; none → `409 STUDENT_NOT_REGISTERED`
   ("Ask your child to sign up with their LRN first").
5. `parentStudentLink.create({ parentId, studentId, relationship: "Guardian", approvedBy: null })`
   within a transaction; unique clash → `409 LINK_ALREADY_REQUESTED`.
6. Audit + notify the **registry desk banded by `StudentProfile.gradeLevel`** (G7–10 record keeper,
   G11–12 registrar) and the parent's own inbox ("Waiting for the registrar desk").
7. Registry approval sets `approvedBy`, notifies parent + learner; rejection deletes the row and
   notifies the parent with the reason.

Pending rows are invisible to the portal already (`approvedBy: { not: null }`), so a half-finished
request can never leak a child's data.

### 6.6 Limits

- Add a dedicated limiter in `middleware/rateLimit.ts` for `POST /student/link` and
  `POST /parent/children/link` (e.g. 10 per 15 min per IP + 10 per hour per user). There is **no
  limiter factory today** — the file exports a single global `authLimiter` (60 / 15 min), so a new
  `rateLimit({...})` export is required; do not reuse `authLimiter` (it would throttle login too).
- Max 3 pending guardian requests per parent per 24h.
- One active code per roster row (unique index); rotation overwrites in place.
- Codes are never logged in plaintext outside audit metadata; error messages and notifications never
  echo the code.

---

## 7. Web frontend

| Surface | File(s) | Change |
| --- | --- | --- |
| Admin pending approvals | `frontend/src/app/admin/users/pending/*`, `components/account-approvals/AccountApprovals.tsx` (or `components/registry/account-approvals/*`) | Row shows the learner code chip with copy and "Generate code" when the LRN has a roster row but none was minted. Unplaced learners are **not** here (this queue is `status: "pending"` only) — see the new admin unplaced lane |
| Admin unplaced learners | new `app/admin/users/unplaced/page.tsx` (or a filter on `app/admin/users/page.tsx`) | Active accounts with no placement for the active year; code chip, copy, "Notify adviser" |
| Admin accounts directory | `app/admin/users/components/accounts-table.tsx` | Code column + copy/rotate action |
| Adviser advisory list | `app/teacher/advisory/list/page.tsx` + its enlist dialog/components | Enlist success returns the code → show "Share this code" panel (copy, print slip); row action "Link code" (view/rotate) |
| Registry accounts | `app/record-keeper/*`, `app/registrar/*` — the `/students` list (the `/account-breakdown` report is grouped counts only) | "Guardian requests" panel (pending links, approve/reject with `MessageOverlay`), code column on `/students` |
| Student web portal | `app/student/layout.tsx`, `app/student/modules/page.tsx`, new `app/student/connect/page.tsx` | Client gate: when `placement.state !== "placed"`, render `/student/connect` (the layout is a client component; a server redirect cannot read placement). One 32px field + button, copy "Enter the code from your enrolment slip", "Still waiting? Ask your adviser" fallback. Follow teacher-shell conventions (`components/ui/*`, 1px borders, one accent) |
| Parent web portal | — | **Not built.** Guardian redemption ships in mobile; the web side is the registry review screen only (open decision D3) |

UI rules to follow: `components/ui/pill.tsx` for the code chip, `message-overlay.tsx` for
approve/reject confirmation, `components/shared/page-empty-callout.tsx` for the empty guardian
queue, no new confirm modals.

---

## 8. Mobile

| Surface | File(s) | Change |
| --- | --- | --- |
| Student first login | `mobile/lib/features/app_router.dart`, new `features/student/connect_page.dart`, `services/portal_service.dart` | Render the Connect screen **from the portal page wrapper / Overview**, not from the router `redirect`: `app_router.dart:270-296` is synchronous and only reads token/Hive, while placement is server data. `studentMeProvider` must parse the tolerant `/me` (`data['placement']`, `learner` may be null) and the shell switches to `ConnectPage` when `state != placed`. Submit → `POST /api/student/link` → invalidate portal providers → Overview |
| Parent add-child | `features/parent/*`, `services/portal_service.dart` | "Add a child" action in the child picker/drawer → code field → request; show "Waiting for approval" state; refresh on resume |
| Portal empty state | `ZEmpty` usage | Replace "No linked learners" with the actionable copy + Add child button (no fabricated data) |

Follow existing portal rules: `PortalShell`, `portalScopeProvider`, Hive `zentra.portal childId`
selection, `userMessage()` for errors (never raw codes). New strings go through the same message
helper; tests updated.

---

## 9. Notifications, audit, cache

- Types come from `lib/notify.ts` `TYPE_MAP` — add `student_roster:link` and
  `parent_student_link:{create,approve,reject}` entries; never pass raw strings.
- Notifications: adviser ("‹learner› linked their account"), registry desk ("New guardian link
  request for ‹learner›"), parent ("Link approved/rejected"), student ("You're now in ‹section›").
- **Never put the code value in a notification message.** `lib/push.ts` mirrors inbox text to FCM,
  so the code would land on a lock screen. Say "A link code was generated" without the value; codes
  are shown only in-app, to staff, and on the printed slip.
- Audit: `writeAudit` for mint, rotate, redeem, guardian request, approve, reject.
- Cache: `invalidateTags([...])` with the tags the lists already use
  (`APPROVAL_TAGS` in `approval.service.ts:11`; the advisory roster route caches with
  `[CACHE_TAGS.teacher, CACHE_TAGS.roster]` at `modules/teacher/students.routes.ts:66`, so minting or
  rotating must invalidate those or the desk keeps showing the old code). Read handlers stay
  cache-friendly (no writes on GET).
- No Supabase Realtime publication, no RLS change, no push-specific work (FCM mirrors inbox rows
  automatically via `lib/push.ts`).

---

## 10. School-year and rollover semantics

- Codes are **per school year**: a new year means new `StudentRoster` rows and new codes; last
  year's codes resolve to a non-active year and are rejected with `CODE_EXPIRED`.
- The plan works for a future year (`schoolYearId` on the row), so the admin can issue codes before
  a year activates — redemption then fails until the year is active. (Open decision D4.)
- Transfers: **there is no section-move operation in the app today.** `updateRosterStudent` edits
  name/LRN only (`services/advisory/roster.service.ts:144-190`); nothing deletes or moves a roster
  row, and the registry desk cannot reassign a learner. So a wrong placement needs a new
  admin/registry action or an ops script (Phase 2), and a code must never be able to move a learner
  between sections.

---

## 11. Edge cases

| Case | Behaviour |
| --- | --- |
| Student registers with a typo'd LRN | Code exists under the correct LRN → redemption rejects `CODE_LRN_MISMATCH`. There is **no LRN edit in the app today** (registry `/students` is read-only, admin only suspends): add a small admin "correct LRN" action, or suspend + re-register. Do **not** auto-correct LRNs from a code. |
| Student account has no LRN | Allowed at the API (`auth.schemas.ts:30`). Redemption sets `User.lrn` from the roster row, audited. |
| Two accounts claim the same LRN | `User.lrn` is not unique; the second approval already fails on `StudentProfile.lrn` unique. Redemption surfaces `ALREADY_PLACED`/duplicate — do not merge automatically. |
| Two siblings, one parent | Two codes, two `ParentStudentLink` rows; unique pair allows both |
| Parent redeems another family's code | No LRN/name matching is attempted; the registry sees the request and rejects it |
| Code leaked to a classmate | Useless for placement without an account under that LRN (admin-approved), and useless for guardianship because the link needs desk approval |
| Adviser enlists an LRN that already has an account | Auto-placement links it **only when unplaced**; if the profile already belongs to a section in the target year, keep `409 LRN_REGISTERED` (today's guard at `roster.service.ts:64-69`) so a typo cannot relocate a learner |
| SF10 placeholder account (`<lrn>@sf10-provisioned.local`) | Same as above; the helper `isSf10ProvisionedEmail` already exists at `roster.service.ts:31` |
| Archived learner | Code redemption places them; the `AdviserArchivedStudent` row stays on the old identity, so the learner can reappear on the desk. Document, or copy the archive row in the link transaction; never auto-unarchive |
| ADM learner | Placement via code is allowed; attendance exemption is unchanged (signature-driven) |
| Student already placed elsewhere this year | `409 ALREADY_PLACED`; there is no move operation yet (see §10) |

---

## 12. Testing

Backend (`backend/tests/`):

- `learner-link-code.test.ts` — mint format/uniqueness, normalize/case-insensitive match,
  redemption happy path, wrong LRN, null LRN (set from roster), expired year, revoked code, already
  placed, unknown code, rate limit, audit row written, 404 never leaks roster existence.
- `enlist-link.test.ts` — enlist after approval links the existing profile; enlist for an
  SF10-placeholder LRN links it; enlist for a profile **already placed this year** still throws
  `LRN_REGISTERED`; carryover touches exactly the five tables and once.
- `guardian-link.test.ts` — request → pending invisible to `/api/parent/children` and rejected by
  `assertLearnerAccess` → approve → visible; reject deletes; duplicate request 409; non-registered
  learner 409.
- `portal-access.test.ts` (extend) — `placementForStudent` states; `/api/student/me` returns 200 with
  `learner: null` for an unplaced account and the other portal routes still 404.
- `auth-login.test.ts` unchanged; `auth-approval*` updated if approval starts returning placement.

Frontend: no Playwright suite exists (`AGENTS.md` §2) — manual checks listed in §14.

Mobile: `mobile/test/student_connect_test.dart` (gate, submit, error copy, placed redirect),
`mobile/test/parent_children_test.dart` (add child, pending state, approved selection), plus
`flutter analyze`.

Commands: `backend → npm run typecheck && npm test`; `frontend → npx tsc --noEmit -p tsconfig.json && npm run lint`;
`mobile → flutter analyze && flutter test`.

---

## 13. Rollout phases

**Phase 0 — unblock + stop the bleeding** (small, ships alone)
1. Mount `/api/parent` in `app.ts` (`modules/parent/portal.routes.ts` is written but unreachable).
2. Extract `linkProfileToRoster` to `services/learnerLink.ts`; call it from `approveAccount` with the
   same five-table carryover.
3. Auto-placement in `enlistRoster`, **guarded**: link only when the profile has no placement for the
   target year; keep `409 LRN_REGISTERED` when it is already placed in another section.
4. `placementForStudent` + a tolerant `GET /api/student/me` (200, `learner: null` when unplaced) +
   the portal gate copy ("Waiting for your adviser to place you") + a new admin unplaced lane
   (it cannot ride on the pending queue).
5. Tests for 2–4.

**Phase 1 — learner codes**
6. Schema + migration + `prisma:generate` + backfill script.
7. Mint on enlist; expose on the adviser roster and the registry `/students` list + admin unplaced
   lane; rotate endpoints (keyed by LRN) + UI, with cache invalidation.
8. `POST /api/student/link` + web `/student/connect` + the mobile connect screen (page wrapper gate,
   not router redirect).
9. Admin "correct LRN" action (needed for the typo path; there is no edit today).

**Phase 2 — guardians**
10. `POST /api/parent/children/link`, requests endpoint, banded registry review endpoints.
11. Registry "Guardian requests" panel in both desks; mobile add-child.
12. Push/inbox labels for the new notification types (without the code value).
13. A section-move operation (admin/registry) or ops script, so a wrong placement can be corrected.

**Phase 3 — polish**
14. Print/share slip for the code (adviser enlist panel).
15. One-click code + copy from the admin unplaced lane.
16. Docs: `docs/guides/user-guide.md` (how a learner claims a class), `AGENTS.md` §7/§9 update.

Each phase is independently shippable; Phase 0 alone fixes the empty-portal bug.

---

## 14. Manual smoke checklist

1. Adviser enlists learner A (no account) → code visible; copy.
2. Learner A registers with the LRN → admin approves → student logs in → **placed**, Overview has
   section, schedule, grades "In progress".
3. Learner B registers **before** enlistment → approve → portal shows "waiting for placement" →
   adviser enlists → B's portal fills in on next load (no code used).
4. Learner C registers with a typo'd LRN → admin approves → unplaced → the **admin** corrects the
   LRN (Phase 1 action) → learner redeems the code → placed. Without the admin action the learner
   stays unplaced; the code cannot repair an LRN.
5. Guard: rotate the code → the old one returns `CODE_NOT_FOUND`; the new one works.
6. Parent registers → no children → adds child by code → registry sees the request → approve →
   parent portal lists the child and can switch to them.
7. Reject path → parent sees the reason; the child never appears.
8. Confirm an ADM learner's case (`/coordinator` and `/teacher/advisory/adm-cases`) is unaffected
   before/after placement.
9. Term/year switch: last year's code is rejected; this year's still works.

---

## 15. Open decisions (recommended default in bold)

| # | Decision | Options | Recommendation |
| --- | --- | --- | --- |
| D1 | Does approval keep auto-placing by LRN? | keep / require a code | **Keep.** It works today and is human-approved; the code is the recovery path and the guardian token. Requiring a code for every student adds friction with no security gain (the admin already checks the LRN). |
| D2 | Student redemption: instant or adviser-confirmed? | instant / confirm | **Instant**, guarded by LRN match + active year + single placement + audit. Note: there is no section-move operation yet, so a *wrong roster row* is corrected by a Phase 2 move action, not by the code. |
| D3 | Guardian redemption: instant or desk-approved? | instant / approve | **Desk-approved** (`approvedBy`), because `listLinkedChildren` already filters on it and a wrong guardian sees a child's full record. |
| D4 | Should codes work before the school year is active? | active only / allow early | **Active only** for redemption; codes are visible and can be printed early. |
| D5 | Parent web portal | build / mobile only | **Mobile only** in this plan; the web contribution is the registry review screen. |
| D6 | Code lifetime | year / term | **Year**, matching the roster row. Term-level codes would need a second table and solve nothing today. |
| D7 | Wrong LRN on an approved account | code repairs / admin edit / re-register | **Admin edit** (new small action). A code never rewrites an identity; re-registration is the fallback when the admin cannot reach the family. |

---

## 16. Risks

- **Privacy:** a guardian error exposes a child's grades/attendance. Mitigated by desk approval +
  `approvedBy` filtering + audit. Do not add an instant guardian path without a second factor.
- **Roster pollution / mis-placement:** a code can only touch its own roster row, so it cannot create
  learners or move sections. The blast radius of a leaked code is one learner's placement and a
  guardian request that a human reviews. The real risk is the *roster row itself* being wrong, and
  there is no move operation yet — add one before turning codes on.
- **Code leakage through push:** `lib/push.ts` mirrors inbox text to FCM. Never include the code in a
  notification; it would be visible on a lock screen.
- **Approval regression:** the `409 LRN_REGISTERED` guard in `enlistRoster` must stay for an
  already-placed learner; only the unplaced case links. Cover it with `enlist-link.test.ts` before
  touching the guard.
- **Carryover regression:** keep the five-table scope exactly; extending it to
  `AdvisoryModuleSubmission` can violate `@@unique([moduleId, studentId])` (`schema.prisma:1425`) and
  would move data approval deliberately leaves alone.
- **Term scope:** redemption must use the roster row's school year, not the caller's term headers
  (students never steer term — `canSteerTerm` in `backend/src/lib/roles.ts`).
- **Migration-by-hand:** the schema change is additive, but the client is committed — regenerate
  and commit `backend/src/generated/prisma/` in the same commit.
- **Doc drift:** update `AGENTS.md` §7 (auth/linking) and `docs/guides/user-guide.md` when Phase 1
  lands, otherwise the next session will re-derive this.

---

## 17. File map (create / edit)

**Create**
- `backend/src/modules/academics/learnerCode.ts`
- `backend/src/services/learnerLink.ts` (extracted carryover + placement state)
- `backend/src/services/parent/guardianLinks.service.ts`
- `backend/prisma/migrations/20261128090000_learner_link_code/migration.sql`
- `backend/scripts/backfill-link-codes.ts` (+ `package.json` script)
- `frontend/src/app/student/connect/page.tsx`
- `frontend/src/app/admin/users/unplaced/page.tsx` (or a filter on `users/page.tsx`)
- `mobile/lib/features/student/connect_page.dart`
- tests listed in §12

**Edit**
- `backend/prisma/schema.prisma`, `backend/src/app.ts` (mount `/api/parent`),
  `backend/src/modules/student/portal.routes.ts` (tolerant `/me` + redeem),
  `backend/src/modules/parent/portal.routes.ts`, `backend/src/modules/teacher/students.routes.ts`,
  `backend/src/modules/registrar/registrar.routes.ts`,
  `backend/src/modules/record-keeper/record-keeper.routes.ts`,
  `backend/src/modules/admin/admin.routes.ts` (+ new unplaced route),
  `backend/src/services/auth/approval.service.ts`, `backend/src/services/advisory/roster.service.ts`,
  `backend/src/lib/portalAccess.ts`, `backend/src/lib/notify.ts`,
  `backend/src/middleware/rateLimit.ts` (new redemption limiter)
- `frontend/src/app/admin/users/{pending,components}/*`, `frontend/src/app/teacher/advisory/list/*`,
  `frontend/src/app/{registrar,record-keeper}/**`, `frontend/src/services/**`
- `mobile/lib/features/app_router.dart`, `mobile/lib/services/portal_service.dart`,
  `mobile/lib/features/parent/*`
- `AGENTS.md`, `docs/guides/user-guide.md`

---

## 18. Revision log

**2026-11-28 — recheck against the code, corrections applied**

1. `GET /api/student/me` must be tolerant; `loadPortalLearner` 404s for the unplaced case
   (`modules/student/portal.routes.ts:31` → `lib/portalAccess.ts:28`).
2. Removed the "registry desk edits the account LRN" claim — no such operation exists. Added the
   admin LRN-correction action (Phase 1) and D7.
3. Narrowed auto-placement: link only when the profile is unplaced for the target year; keep
   `409 LRN_REGISTERED` otherwise, so a typo cannot relocate a learner.
4. Replaced `/api/<desk>/accounts` with the real surfaces (`/account-breakdown` = grouped counts,
   `/students` = rows), and moved the unplaced lane to its own admin endpoint — the pending queue is
   `status: "pending"` only (`services/auth/approval.service.ts:205,220`).
5. Removed the nonexistent "existing limiter factory"; a new limiter is required
   (`middleware/rateLimit.ts` exports only `authLimiter`).
6. Codes are never included in notification/push text (`lib/push.ts` mirrors inbox text to FCM).
7. Restricted the carryover to today's five tables; explicitly excluded `Intervention`,
   `RiskSnapshot`, `AdvisoryModuleSubmission`, `AdviserArchivedStudent` (unique-collision risk).
8. Documented that no section-move operation exists (`services/advisory/roster.service.ts:144-190`);
   correction is a Phase 2 action, not a code side effect.
9. Fixed the mobile gate location (page wrapper, not the synchronous router redirect at
   `app_router.dart:270-296`) and the LRN-keyed mint route (row ids are `roster:<id>` or user ids).
10. Noted archive-identity behaviour, `User.lrn` nullability/non-uniqueness, advisory cache
    invalidation, migration numbering, and confirmed no RLS/publication change is needed.

---

## 19. Implementation status (2026-11-28)

**Landed**

- `StudentRoster.linkCode` / `linkCodeIssuedAt` / `linkCodeRevokedAt` (schema + migration
  `20261128090000_learner_link_code`, applied by hand; client regenerated).
- `modules/academics/learnerCode.ts` (`LNK-XXXXX`, normalize/match, unique mint).
- `services/learnerLink.ts`: `linkProfileToRoster` (same five-table carryover as approval, now one
  implementation), `placementForStudent`, `redeemLearnerCode`.
- `approveAccount` delegates to `linkProfileToRoster` (behaviour-neutral).
- `enlistRoster`: mints the code, auto-links an existing **unplaced** profile for the LRN, refuses to
  relocate a learner already placed in that school year, returns `linkCode` in the response.
- Advisory roster rows (`/api/teacher/advisory/students`, both views) carry `linkCode`.
- `POST /api/teacher/advisory/students/:lrn/link-code` (rotate).
- `POST /api/student/link` (redeem; accepts a code without the `LNK-` prefix).
- `GET /api/student/me` is tolerant (200 + `placement`, `learner` may be null).
- Student + parent portal routers are mounted (`/api/student`, `/api/parent`) — they were
  unreachable before.
- Web `/student/connect` gate (layout redirect + code form) and `services/student/portal.service.ts`.
- Mobile `studentMeProvider` no longer crashes on `learner: null` (typed `NOT_PLACED` error).
- Tests: `backend/tests/learner-link-code.test.ts` (11 cases).

**Deferred (unchanged from the phases)**

- Guardian link requests + registry review (Phase 2).
- Admin "unplaced learners" endpoint/UI and admin LRN correction action.
- Adviser UI for the code chip / printed slip (the API returns it; the enlist dialog does not render
  it yet).
- Mobile connect screen (the API/provider are ready; the Flutter gate is not built).
- Section-move operation (no such operation exists in the app yet).

**Seed account check** — `student.seed@zentra.test` (LRN `136130990001`, G7) was linked through the
adviser enlistment path with `scripts/link-seed-learner.ts --section=Rizal`; the profile now points
at G7 · Rizal, the roster row exists with a code, and `/api/student/schedule` returns the four
published subjects (Aral Pan, English, Math, Science).
