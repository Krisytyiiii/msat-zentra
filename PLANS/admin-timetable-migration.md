# Admin Timetable Migration — remove scheduling from teachers

> Written 2026-11-20. Moves the timetable configuration workspace out of the
> teacher shell, deletes the Master Teacher designation, and makes the admin
> desk the single owner of school-day configuration and section grids.

---

## 0. Decisions (locked)

| Question | Decision |
|---|---|
| New owner of timetable configuration | **Admin shell** — `/admin/academics/schedule` + `/api/admin/schedule/*` |
| Master Teacher designation | **Removed entirely** (both band seats, settings card, guards, flags) |
| Approval flow | **None.** Admin sets `DRAFT` / `PUBLISHED` directly. No submit-to-principal step |
| Teacher timetable surfaces | **All removed** — workspace, template, week grid, adviser Class Schedule, code-link gate |
| Teacher class list | `/teacher/classes` stays as a plain **My Classes** list (subject × section), no day/period grid |
| Teacher term opening | Replaced: publishing a section creates the `TeacherTermGrant` (no claim codes) |
| Admin term scope | Admin becomes **term-steering** with a term picker so next-term grids can be prepared |

### What "published" means

`SectionTimetableEntry.status`:

- `DRAFT` — admin-only. Invisible to teachers.
- `APPROVED` — **published**. Teacher class lists, grading, lock-grades and
  attendance resolve from `APPROVED` rows (`resolveTeacherClassPairs`).
- `SUBMITTED` — legacy. Stops being written; migrate existing rows to `APPROVED`.

---

## 1. Current state (verified)

### Where the editor lives today

| Surface | Path | Who |
|---|---|---|
| Workspace (grid, catalogs, day config, submit/unlock) | `frontend/src/app/teacher/schedule/` | master teacher |
| Template desk | `frontend/src/app/teacher/schedule/template/[[...section]]/` | master teacher |
| Grid + code-link gate ("My Classes") | `frontend/src/app/teacher/classes/components/MyTimetable.tsx` | subject teacher / adviser |
| Adviser Class Schedule | `frontend/src/app/teacher/advisory/schedule/page.tsx` | adviser |
| Review / approve | `frontend/src/app/principal/academics/schedule/` | principal |

### Backend

- `backend/src/modules/teacher/timetable.routes.ts` — `GET /schedule`,
  `/schedule/config|conflicts|subjects|teachers`, `POST /schedule`,
  `/schedule/entries`, `/schedule/submit`, `/schedule/unlock`,
  `DELETE /schedule/entries*`, `/schedule/:id`. All `requireRole("subject_teacher","adviser")`
  plus `requireMasterTeacher` in the services.
- `backend/src/modules/teacher/directory.routes.ts` — `/schedule/teachers`,
  `/schedule/teachers/me`, `term-grant`, `claim`, `verify-attendance`,
  `DELETE /schedule/teachers/me`.
- `backend/src/modules/academics/academics-schedule.routes.ts` — principal
  `/schedule/sections`, `/schedule/submissions`, `/schedule/review`.
- Services: `services/teacher/timetable.{config,entries,write,read}.service.ts`.
- Guards: `modules/teacher/teacher.schedule-guards.ts` (`masterTeacherBands`,
  `requireMasterTeacher`, `resolveScheduleTarget` band check).
- Fanout: `notifyMastersScheduleChanged` in `modules/teacher/teacher.fanout.ts`.
- Settings: `PATCH /api/teacher/settings/master-teacher` +
  `services/teacher/settings.service.ts` seat logic.

### Data / models

- `StaffProfile.isMasterTeacher` (G7–10), `StaffProfile.isMasterTeacherSenior` (G11–12).
- `ScheduleConfig` (one row per term: start time, period length, lunch, recesses).
- `SectionTimetableEntry` (`@@unique([sectionId, termId, day, period])`, status,
  `teacherNameId`, submit/review columns).
- `TeacherName` (display name + claim `code` + optional `userId` login link)
  and `TeacherTermGrant` (`userId × termId`, `via`, `attendanceVerifiedAt`).

### Teacher features that read the timetable

| Feature | Endpoint today | After |
|---|---|---|
| Per-subject attendance pairs + meetup days | `/api/teacher/schedule/my-slots`, `/teachers/me` | new `GET /api/teacher/my-load` |
| Reports teaching load | `/api/teacher/schedule/my-slots` | new `GET /api/teacher/my-load` |
| Grading / lock-grades class list | `resolveTeacherClassPairs` (server-side) | unchanged |
| Term gate (`TeacherTermGrant`) | claim code / adviser entry | created on publish |

---

## 2. Phase 1 — Backend

### 1.1 New admin module

Create `backend/src/modules/admin/schedule.routes.ts`:

- Router-level `requireAuth, requireRole("admin")` (same pattern as `admin.routes.ts`).
- Mount in `backend/src/app.ts`: `app.use("/api/admin/schedule", adminScheduleRoutes);`
- Term context: `resolveActiveTermId(req)` + `req.termScope` (admin is term-steering after 1.8).

Endpoints:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/sections` | section board + status rollup + entry counts |
| `GET` | `/config` | school-day shape for the selected term |
| `PATCH` | `/config` | start time, period mins, lunch, recesses |
| `GET` | `/conflicts` | workload / clash check |
| `GET` | `/subjects` | subject catalog |
| `POST` | `/subjects` / `DELETE /subjects/:id` | catalog CRUD |
| `GET` | `/teachers` | teacher-name catalog (+ linked login, code) |
| `POST` | `/teachers` / `DELETE /teachers/:id` / `DELETE /teachers` | catalog CRUD |
| `POST` | `/entries` | write one slot (existing `writeEntry` rules) |
| `DELETE` | `/entries` / `/entries/all` / `/entries/clear-all` | clear slot / section / workspace |
| `PATCH` | `/status` | `{ sectionId?, status: "DRAFT" \| "PUBLISHED" }` |

### 1.2 Service relocation

Move `backend/src/services/teacher/timetable.*.service.ts` to
`backend/src/services/schedule/` with an actor type:

```ts
export interface ScheduleActor {
  userId: string;
  role: string;          // "admin"
  termId: string | null;
  schoolYearId: string | null;
}
```

Changes while moving:

- Delete `requireMasterTeacher`, `masterTeacherBands`, `allowedGradesFor`.
- `resolveScheduleTarget`: keep section/subject existence + grade-match checks;
  drop the band check (admin covers G7–12).
- Remove `ctxOf`/`termCtxOf` coupling to teacher routes.
- Audit reasons: `"Administrator …"` instead of `"Master Teacher …"`.
- Swap `notifyMastersScheduleChanged(...)` for a fanout to the section's claimed
  teachers plus the principal (`fanoutNotification` + existing `TYPE_MAP` types;
  add a schedule-changed type if one does not exist).

### 1.3 Draft / publish replaces submit / unlock

- Delete `submitTimetable` and `unlockSection` handlers.
- Add `setTimetableStatus(actor, { sectionId?, status })`:
  - `PUBLISHED` → `updateMany({ status: { in: ["DRAFT","SUBMITTED"] } }, { status: "APPROVED" })`;
  - `DRAFT` → `updateMany({ status: "APPROVED" }, { status: "DRAFT" })`.
  - Invalidate tags and fan out to affected teachers.
  - On publish, create the term grants (1.5).
- `writeEntry` on an `APPROVED` slot keeps throwing `SCHEDULE_LOCKED`, but the
  message becomes "Unpublish the section before editing" (no unlock route).

### 1.4 Assignment ownership fix

`assignSubject` / publish must not store the scheduler as the class teacher.
When a slot's `TeacherName.userId` exists, upsert:

```ts
prisma.teacherSubjectAssignment.upsert({ ... }) // teacherId = teacherName.userId
```

Keep `ensureSubjectAssignment` / `cleanupOrphanAssignment`, switched to the
claimed teacher id.

### 1.5 Term grant on publish (replaces claim codes)

For each distinct `TeacherName.userId` in the published section:

```ts
prisma.teacherTermGrant.upsert({
  where: { userId_termId: { userId, termId } },
  update: { via: "publish", teacherNameId },
  create: { userId, termId, via: "publish", teacherNameId, attendanceVerifiedAt: new Date() },
});
```

Notes:

- `TeacherTermGrant.via` is currently `"code" | "adviser"` — extend to accept
  `"publish"` (string column: check the schema type before writing the migration).
- A `TeacherName` row with no `userId` cannot grant anything — the admin catalog
  needs a "link login" control (reuse `GET /api/admin/users` + a small PATCH).

### 1.6 Delete teacher editor routes

- `modules/teacher/timetable.routes.ts` — delete the whole file and its mount.
- `modules/teacher/directory.routes.ts` — delete `claim`, `verify-attendance`,
  `term-grant`, `teachers/me`, `DELETE teachers/me`, and the `teachers` catalog;
  keep the file only if something else lives there (it doesn't, so delete).
- `teacher.schemas.ts` — drop `claimCodeSchema`, `verifyCodeSchema`,
  `scheduleConfigBodySchema`, `entrySchema`, `submitSchema`, `unlockSchema`,
  `teacherNameSchema`, `subjectSchema`, `scheduleAssignSchema` once unused.

### 1.7 New teacher data endpoint

`GET /api/teacher/my-load` (`modules/teacher/myLoad.routes.ts` or inside the
remaining teacher router):

```ts
{
  classes: [{ subjectId, subjectName, subjectCode, sectionId, sectionName, gradeLevel, learnerCount }],
  meetupDays: { [key: `${subjectId}:${sectionId}`]: number[] } // 1=Mon..5=Fri
}
```

- Source: `APPROVED` (fallback `SUBMITTED`) entries for the logged-in
  `TeacherName.userId`, plus the same prior-term fallback as
  `resolveTeacherClassPairs`.
- Cache-tag with `teacher` + `attendance`; invalidate on publish.
- Attendance falls back to Mon–Fri when a pair has no days.

### 1.8 Admin term steering

- `backend/src/lib/roles.ts`: add `"admin"` to `TERM_STEERING_ROLES`.
- `backend/src/modules/academics/academics-catalog.routes.ts`:
  `requireRole("principal")` → `requireRole("principal", "admin")` on
  `GET /assign/school-years` (the frontend term picker source).
- No new cache invalidation needed (admin only reads the calendar).

### 1.9 Principal desk

- Delete the review endpoints in `academics-schedule.routes.ts`
  (`/schedule/submissions`, `/schedule/review`).
- Keep `GET /schedule/sections` and the principal pages as **read-only**
  (status pills only, no approve/reject buttons), or delete the pages outright
  if unused. Recommended: keep read-only visibility.

### 1.10 Master Teacher teardown (backend)

- Delete `PATCH /api/teacher/settings/master-teacher` and the seat logic in
  `services/teacher/settings.service.ts`.
- Remove `isMasterTeacher` / `isMasterTeacherSenior` from
  `services/teacher/overview.service.ts`, `directory.service.ts`,
  `reports.service.ts` payloads and their `*.types.ts`.
- Delete `modules/teacher/teacher.schedule-guards.ts` `masterTeacher*` helpers
  (keep `gradeBandOf` if other code imports it — check `academics`).
- Delete `notifyMastersScheduleChanged` from `teacher.fanout.ts`.

### 1.11 Cache invalidation contract

Every admin schedule write invalidates:

```
["teacher", "schedule", "academics", "principal", "attendance", "grades", "overview"]
```

Publish/unpublish additionally invalidates `["attendance", "grades"]` because
teacher class lists derive from entry status.

---

## 3. Phase 2 — Schema, data, tests

### 3.1 Schema

- Drop `StaffProfile.isMasterTeacher`, `StaffProfile.isMasterTeacherSenior`.
- Keep `TimetableStatus` values; `SUBMITTED` becomes legacy-only.
- Extend `TeacherTermGrant.via` to allow `"publish"`.
- Regenerate the committed client: `npm run prisma:generate` in `backend/`.

### 3.2 Migration file

`backend/prisma/migrations/<timestamp>_admin_timetable/migration.sql`:

```sql
-- Master Teacher designation is retired.
ALTER TABLE "StaffProfile"
  DROP COLUMN IF EXISTS "isMasterTeacher",
  DROP COLUMN IF EXISTS "isMasterTeacherSenior";

-- Legacy submitted grids become published so teachers keep their classes.
UPDATE "SectionTimetableEntry" SET "status" = 'APPROVED' WHERE "status" = 'SUBMITTED';

-- Grants for already-published sections (no claim codes any more).
INSERT INTO "TeacherTermGrant" ("id", "userId", "termId", "via", "teacherNameId", "attendanceVerifiedAt")
SELECT gen_random_uuid(), tn."userId", e."termId", 'publish', tn."id", now()
FROM "SectionTimetableEntry" e
JOIN "TeacherName" tn ON tn."id" = e."teacherNameId"
WHERE e."status" = 'APPROVED' AND tn."userId" IS NOT NULL
GROUP BY tn."userId", e."termId", tn."id"
ON CONFLICT ("userId", "termId") DO NOTHING;
```

Migration is applied **by hand** (CI does not run `migrate deploy` — see
`AGENTS.md` § Gotchas). Verify the exact `TeacherTermGrant` unique constraint
name before running the `ON CONFLICT` clause.

### 3.3 Seeds

- `backend/prisma/seed-sample-five.ts` — remove `isMasterTeacher: true`.
- `backend/prisma/seed-roles-only.ts` — confirm no flag writes (it should be clean).
- Any other seed: `grep -r isMasterTeacher backend/prisma`.

### 3.4 Tests

- Delete `backend/tests/teacher-master-teacher.test.ts`.
- Add `backend/tests/admin-schedule.test.ts`:
  - non-admin roles get `403` on `/api/admin/schedule/*`;
  - teacher editor routes now `404`;
  - `PATCH /status` PUBLISHED flips entries and creates one grant per claimed teacher;
  - `DRAFT` publish round-trip.
- Re-run `npm test` (known flake: `ocform01.test.ts` under full-suite load).

---

## 4. Phase 3 — Frontend admin shell

### 4.1 Move the workspace

```
frontend/src/app/teacher/schedule/**        ->  frontend/src/app/admin/academics/schedule/**
frontend/src/app/teacher/schedule/template  ->  frontend/src/app/admin/academics/schedule/template
```

- Replace `TeacherPageHeader`, `ScheduleGutter`, teacher live-query helpers
  with admin equivalents (`AdminPageHeader` if present, otherwise the shared
  `PageHeader`).
- Rename copy: "Master Teacher" → "Administrator"; "send for principal review"
  → "publish".

### 4.2 Admin nav

- `frontend/src/components/admin-sidebar.tsx`: add group **Academics** with
  **Timetable** (`/admin/academics/schedule`) and **Templates**.
- Update the admin global search `NAV` export.
- Verify route-match helper covers the new nested paths.

### 4.3 Term picker

- Wrap the timetable page in `TermProvider` (same as principal pages).
- Add a scope picker on the page (school year + term), stored per admin user in
  `localStorage` via `termStorage`; the API client already sends `x-term-id`
  for term-steering roles once frontend `canSteerTermRole` includes admin.
- `frontend/src/lib/auth/roles.ts`: add `"admin"` to the steering check.

### 4.4 Editor UX

- Section kanban: each section shows `DRAFT` / `PUBLISHED` pill + toggle, plus
  workspace actions "Publish all" / "Back to draft".
- Remove submit kanban, unlock kanban, review-note banners.
- Keep catalogs (subjects, teacher names, day config) as-is, retitled.
- Data refresh: `refetchInterval: 20_000`, `refetchOnWindowFocus: true`
  (admin has no realtime channel).
- Teacher-name catalog gains a "Linked login" column + link control (1.5).

---

## 5. Phase 4 — Frontend teacher cleanup

### 5.1 Delete timetable surfaces

```
frontend/src/app/teacher/schedule/**                      (moved)
frontend/src/app/teacher/advisory/schedule/**             (delete)
frontend/src/app/teacher/classes/components/MyWeekGrid.tsx        (delete)
frontend/src/app/teacher/classes/components/ClassesSchedule.tsx   (delete — already unused)
frontend/src/app/teacher/classes/components/my-timetable-reminder.ts (delete)
frontend/src/app/teacher/classes/components/timetable-sidebar.tsx (delete after link card is re-homed)
frontend/src/app/teacher/classes/components/Unlink*.tsx   (delete)
```

### 5.2 My Classes rewrite

`MyTimetable.tsx` becomes `MyClasses.tsx`:

- header `My Classes`, term pills, "Link your teacher code" card removed;
- subject × section cards with learner counts, from `/api/teacher/my-load`;
- no grid, no day/period cells, no meetup-day display;
- empty state: "Your timetable hasn't been published yet — the administrator
  publishes section schedules."

`app/teacher/classes/page.tsx` renders `MyClasses`.

### 5.3 Attendance

`app/teacher/attendance/page.tsx`:

- delete `useAttendancePairs` slot logic, `mySlotsQuery`, the `verify` mutation
  and the attendance-code field;
- pairs from `/api/teacher/my-load`;
- meetup days from `meetupDays[pairKey]`, fallback `[1,2,3,4,5]`;
- keep the adviser "enter term" path (`POST /schedule/teachers/term-grant` is
  deleted, so adviser entry must come from the publish grant — remove the
  adviser entry button from attendance too).

### 5.4 Reports

`services/teacher/reports.service.ts`:

- replace `fetchTeachingLoad` `/api/teacher/schedule/my-slots` with
  `/api/teacher/my-load`;
- `reports-scope-bar.tsx`: remove the "Master teacher" pill / label.

### 5.5 Nav, badges, keys

- `components/teacher-sidebar.tsx`: remove the master-gated "Timeslot" item and
  `useCachedMasterTeacher`; `buildNav(isAdviser)` only.
- `services/teacher/navCounts.service.ts` + `backend/src/services/teacher/navCounts.service.ts`:
  drop the `schedule` key.
- `lib/realtime/teacherKeys.ts` + `app/teacher/components/TeacherNotificationsBell.tsx`:
  remove `teacher-schedule*` invalidation keys that no longer exist.
- `app/teacher/settings/components/MasterTeacherCard.tsx` + `SettingsNav` entry:
  delete.
- `services/teacher/overview.service.ts` types: drop `isMasterTeacher*`,
  `masterTeacherTaken`, `masterTeacherSeniorTaken`.

---

## 6. Phase 5 — Verification

### Typecheck / lint / tests

```powershell
cd backend
npm run typecheck
npm test

cd ..\frontend
npx tsc --noEmit -p tsconfig.json
npm run lint
```

### Grep gates (must return nothing)

```powershell
grep -rn "isMasterTeacher" backend/src frontend/src
grep -rn "MASTER_TEACHER_REQUIRED" backend/src
grep -rn "Master Teacher" frontend/src backend/src
grep -rn "/teacher/schedule" frontend/src backend/src
grep -rn "schedule/teachers/claim" frontend/src
grep -rn "my-slots" frontend/src backend/src
```

### Manual smoke test

1. Admin logs in → `/admin/academics/schedule` → pick term → create/edit a section grid.
2. Leave `DRAFT` → teacher shell shows no classes for that section.
3. `PATCH /status PUBLISHED` → teacher `/teacher/classes` lists the classes;
   grading, lock-grades and attendance open without a code; attendance meetup
   days match the published slots.
4. Unpublish → teacher classes disappear; grading/attendance gate again.
5. Confirm the principal sees the timetable read-only and cannot approve.
6. Confirm no "Master Teacher" or "Timeslot" wording anywhere in the teacher shell.

### Docs

- Update `AGENTS.md`:
  - §1 roles (admin owns academic scheduling; no Master Teacher),
  - §3 teacher shell (no timetable surfaces),
  - §5 commands if any script changes,
  - §7 modules (`modules/admin/schedule.routes.ts`, `services/schedule/*`,
    `modules/teacher/myLoad`), principal review removed,
  - Gotchas: admin is now term-steering; publish creates grants.

---

## 7. Risks & watch-outs

| Risk | Mitigation |
|---|---|
| Admin forgets to publish → teacher desks empty | Loud Draft/Published control + empty-state copy + publish confirmation |
| Existing `SUBMITTED` rows invisible to class resolution | Migration converts them to `APPROVED` |
| Assignment rows owned by the old scheduler | Publish/assign upserts by `TeacherName.userId` |
| `TeacherName` rows with no linked login | Admin catalog needs a link-login control; grants only for linked names |
| Attendance meetup days change | `my-load` supplies days from published entries; falls back to Mon–Fri |
| Admin has no `StaffProfile` | Actor code must not read `StaffProfile` for admin |
| Admin prepping a future term | Admin added to `TERM_STEERING_ROLES` + term picker; verify cache keys include term scope |
| Deleting a subject that has gradebook rows | Keep the existing `SUBJECT_IN_USE` 409 guard |
| Migration applied by hand | Follow `AGENTS.md` bootstrap note; verify `TeacherTermGrant` unique constraint name |

---

## 8. File inventory (expected)

**Backend (~14)**

- `modules/admin/schedule.routes.ts` (new)
- `app.ts` (mount)
- `services/schedule/{config,entries,write,read,status}.ts` (moved/new)
- `modules/teacher/timetable.routes.ts` (delete)
- `modules/teacher/directory.routes.ts` (delete)
- `modules/teacher/myLoad.routes.ts` (new)
- `modules/academics/academics-schedule.routes.ts` (review removed)
- `modules/academics/academics-catalog.routes.ts` (admin on school-years)
- `lib/roles.ts` (admin term steering)
- `services/teacher/settings.service.ts`, `overview.service.ts`,
  `directory.service.ts`, `reports.service.ts` (master removal)
- `modules/teacher/teacher.schedule-guards.ts`, `teacher.fanout.ts`
- `prisma/schema.prisma` + generated client + migration + seeds + tests

**Frontend (~20)**

- `app/admin/academics/schedule/**` (moved, retitled)
- `app/admin/layout.tsx` / `components/admin-sidebar.tsx` / search NAV
- `app/teacher/classes/{page.tsx,components/MyClasses.tsx}`
- `app/teacher/attendance/page.tsx`
- `app/teacher/advisory/schedule/**` (delete)
- `app/teacher/settings/{page.tsx,components/MasterTeacherCard.tsx,SettingsNav.tsx}`
- `components/teacher-sidebar.tsx`
- `services/teacher/{overview,reports,navCounts}.service.ts` + types
- `lib/realtime/teacherKeys.ts`, `lib/auth/roles.ts`
- `app/teacher/overview/reports/components/reports-scope-bar.tsx`
- `components/ui/stat-deck` untouched
