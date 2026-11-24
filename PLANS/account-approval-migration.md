# Account Approval Migration — Registry Desks → Admin

**Status:** implemented (Phases 1–3 + admin bell deep-link and sidebar pending badge)
**Date:** 2026-11-20 (implemented 2026-11-21)
**Scope:** remove the account-approval responsibility from the record keeper
(G7–10) and registrar (G11–12) desks; the administrator owns every account
approval (student, parent, self-registered teacher).
**Non-goals:** changing how an account is provisioned (LRN → roster →
`StudentProfile`), the audit trail, or the applicant-facing notifications.

---

## 1. Decision

| | Today | After |
|---|---|---|
| Who reviews a pending sign-up | record keeper (G7–10), registrar (G11–12), both for unbanded teacher sign-ups and unknown-grade students | **admin only** |
| Where | `/record-keeper/accounts`, `/registrar/accounts` | `/admin/users` (new "Pending approvals" board) |
| LRN verification before approving | `LrnVerifyDock` / `LrnVerifyDialog` on both desks | same component, mounted in the admin board |
| Audit actor | record keeper / registrar user | admin user |
| Applicant notification | unchanged | unchanged |
| Nav | "Account Approvals" in both registry sidebars | removed from both; admin "User Accounts" gains a pending badge |
| Overview widgets | `OverviewApprovals` + `pendingAccounts` KPI on both registry overviews | removed from registry overviews; optional widget on `/admin/overview` |

Rationale: account approval is a system-identity decision (it creates a login
and provisions a `StudentProfile` from the roster), not an academic-records
task. Splitting it across two grade-banded desks produced duplicate queues
(teacher sign-ups appear on both) and desk-specific band logic that the
administrator does not need.

---

## 2. Current state (what actually exists)

### Backend

| Surface | File | Notes |
|---|---|---|
| `GET /api/auth/match-lrn` | `backend/src/modules/auth/auth.routes.ts:74-89` | `requireRole("record_keeper","registrar")` |
| `POST /api/auth/approve/:userId` | `auth.routes.ts:254-269` | `requireRole("record_keeper","registrar")` + `gradeBandGuard(allowNonStudent)` |
| `GET /api/auth/pending` | `auth.routes.ts:271-300` | band derived from caller role (`registrar` → G11/G12, else G7–G10) |
| `POST /api/auth/reject/:userId` | `auth.routes.ts:302-324` | `requireRole("record_keeper","registrar")` + `gradeBandGuard(allowUnresolved)` |
| Approval logic | `backend/src/services/auth/approval.service.ts` | `approveAccount` (roster → `StudentProfile`, carryover of roster-linked grades/attendance/anecdotes/referrals), `rejectAccount` (status → `suspended`), `listPending` (band list + staff queue) |
| Teacher sign-up fanout | `backend/src/services/auth/session.service.ts:84-145` | `notifyPendingSignup` → `fanoutToRole("record_keeper")` / `fanoutToRole("registrar")` |
| Registry nav badge | `backend/src/services/registry/navCounts.service.ts:82-99,145` | `accounts` CTE = pending users (both bands + teacher sign-ups) |
| Registry overview | `backend/src/services/registry/overview.service.ts:261-351` | `pendingStudents` rows + `pendingAccounts` count (`+ pendingAdviserAccess`) |
| Registry account breakdown | `backend/src/services/registry/accounts.service.ts` | per-section `withAccount / pending / noAccount` |
| Admin user console | `backend/src/modules/admin/admin.routes.ts:193-240` | `PATCH /users/:id/status` refuses `pending` accounts (`409 PENDING_ACCOUNT`) |

`gradeBandGuard` is a no-op for roles outside `isBandRole(...)`, so the admin
actor passes it untouched — but it must not be left as the only gate either.

### Frontend

| Surface | File |
|---|---|
| Registry approval page (students + LRN dock + teacher queue + breakdown) | `frontend/src/app/record-keeper/accounts/page.tsx`, `frontend/src/app/registrar/accounts/page.tsx` (+ `accounts/components/*`, ~10 files each) |
| Shared teacher queue | `frontend/src/components/registry/pending-staff-queue.tsx` |
| Overview widget | `frontend/src/app/{record-keeper,registrar}/overview/components/OverviewApprovals.tsx` |
| Registry overview shared widgets | `frontend/src/components/registry/overview/{RegistryAttentionDeck,OverviewShortcuts,OverviewKpiRail,OverviewGradeChart,AccountBreakdown}.tsx` |
| Sidebars | `frontend/src/components/{record-keeper,registrar}-sidebar.tsx:43` ("Account Approvals") |
| Nav dots | `frontend/src/services/{record-keeper,registrar}/navCounts.service.ts` (`accounts` route key, `account-breakdown` invalidators) |
| Realtime invalidation | `frontend/src/lib/realtime/{recordKeeperChannel,registrarChannel}.ts` (`pending-students`, `account-breakdown`) |
| Notification deep links | `frontend/src/lib/notifications/label.ts:435,455` → `/registrar/accounts`, `/record-keeper/accounts` |
| Admin console | `frontend/src/app/admin/users/page.tsx` (pending rows render a read-only "—") |
| Admin bell | `frontend/src/app/admin/components/admin-bell.tsx` (poll only, no admin realtime channel) |

---

## 3. Target API contract

All endpoints move under the admin router (`/api/admin`, already behind
`requireRole("admin")`); the auth routes keep only auth/session duties.

| Method | New path | Old path | Notes |
|---|---|---|---|
| `GET` | `/api/admin/account-approvals` | `/api/auth/pending` | query `role=student\|staff\|parent`, `q`, `page`, `pageSize`; band = **all** G7–G12 |
| `GET` | `/api/admin/account-approvals/lrn-match` | `/api/auth/match-lrn` | same `matchLrn` service |
| `POST` | `/api/admin/account-approvals/:id/approve` | `/api/auth/approve/:id` | no band guard; audit + fanout unchanged |
| `POST` | `/api/admin/account-approvals/:id/reject` | `/api/auth/reject/:id` | body `{ reason }`; no band guard |
| `PATCH` | `/api/admin/users/:id/status` | — | drop the `409 PENDING_ACCOUNT` branch: `pending` targets go through the approve/reject flow instead |

Keep the old `/api/auth/*` routes temporarily (Phase 5 deletes them) so an
in-flight frontend build cannot 404 mid-rollout. They must be re-gated to
`requireRole("admin")` in Phase 1, so no registry user can still act.

`listPending` gains a `band` of `["G7","G8","G9","G10","G11","G12"]` for the
admin caller (`roleFilter` still selects student / staff / parent). Everything
below that — roster resolution, profile provisioning, carryover, audit,
notifications — is reused verbatim from `approval.service.ts`; no logic moves.

---

## 4. Responsibility matrix

| Action | Responsible | Deliverable |
|---|---|---|
| Re-gate the four auth approval endpoints to `admin` | Backend — auth module | `auth.routes.ts` guard swap |
| Add `/api/admin/account-approvals*` endpoints | Backend — admin module | `admin.routes.ts` (thin handlers) + `accountApprovals.schemas.ts` |
| Admin view of `listPending` with all grades | Backend — auth service | `approval.service.ts` band injection |
| Allow admin to act on `pending` from the users console | Backend — admin module | remove `409 PENDING_ACCOUNT`; approve/reject are the only transition |
| Re-route pending-sign-up fanout to admin | Backend — auth service | `session.service.ts` `notifyPendingSignup` → `fanoutToRole("admin")` |
| Keep applicant + actor notifications + audit | Backend — auth service | no change (`users:approve`, `users:reject`, `account_approval`) |
| Remove registry `accounts` nav queue + badge | Backend — registry | `navCounts.service.ts` (drop `accounts` CTE + union rows + type) |
| Remove registry overview pending cards/counts | Backend — registry | `overview.service.ts` (`pendingStudents`, `pendingAccounts`), `registry/overview.service` type consumers |
| Keep or move `account-breakdown` | Backend — registry | keep `withAccount / noAccount` KPIs; the `pending` bucket is only meaningful if the desk still shows sign-ups → **drop the `pending` column and its KPI** |
| Build the admin pending board (students + parents + teachers, LRN verify, approve/reject) | Frontend — admin shell | new `frontend/src/app/admin/users/components/account-approvals/*` (reuse `pending-staff-queue.tsx` + `LrnVerifyDock`/`LrnVerifyDialog`) |
| Add "Pending approvals" board + status filter default to `/admin/users` | Frontend — admin shell | `admin/users/page.tsx`; pending rows get Approve/Reject instead of "—" |
| Sidebar dots/invalidators for the admin console | Frontend — admin shell | `adminChannel.ts` (new, or 5s poll on `admin-account-approvals`) |
| Delete both registry approval pages | Frontend — registry desks | remove `app/{record-keeper,registrar}/accounts/**` |
| Remove "Account Approvals" nav items + route keys | Frontend — registry desks | `*‑sidebar.tsx`, `services/*/navCounts.service.ts` |
| Remove `pending-students` / `account-breakdown` invalidation from registry channels | Frontend — realtime | `recordKeeperChannel.ts`, `registrarChannel.ts` |
| Remove `OverviewApprovals` from both registry overviews | Frontend — registry desks | delete widget files; update `overview/page.tsx` empty-state conditions |
| Repoint `users:*` notification links | Frontend — shared | `lib/notifications/label.ts` → `/admin/users` |
| Update `AGENTS.md` (§1 roles, §7 auth + registry, §9 gotchas) | Docs | short edit |

---

## 5. Phased execution

### Phase 0 — freeze (½ day)
- Confirm no other consumer of `/api/auth/pending|approve|reject|match-lrn`
  outside the two registry pages. `rg` is authoritative: today the only callers
  are `pending-staff-queue.tsx`, both `accounts/page.tsx`,
  `OverviewApprovals.tsx` (×2), `LrnVerifyDock.tsx`/`LrnVerifyDialog.tsx` (×2
  copies), `LrnVerifyButton.tsx`.
- Confirm one admin account exists in every environment (`prisma:seed:admin`).
- Decide open question Q1 (below) before deleting pages.

### Phase 1 — backend (1 day)
1. `approval.service.ts`: `listPending` accepts the full grade list; no other
   change (keep `APPROVAL_TAGS` — they still warm registry/principal/teacher
   caches after a provisioning write).
2. `admin.routes.ts`: add the four endpoints, delegating to
   `approveAccount` / `rejectAccount` / `listPending` / `matchLrn`. Validate
   with Zod (`role` enum `student|staff|parent`, paging max 15).
3. `auth.routes.ts`: swap `requireRole("record_keeper","registrar")` →
   `requireRole("admin")` on the legacy routes (transitional) and keep
   `gradeBandGuard` (no-op for admin; harmless until Phase 5 deletes it).
4. `admin.routes.ts` `PATCH /users/:id/status`: remove the
   `409 PENDING_ACCOUNT` guard; keep the admin-account protection.
5. `session.service.ts`: `notifyPendingSignup` → `fanoutToRole("admin")`
   for every sign-up (student and teacher), same message wording.
6. Registry cleanup: `navCounts.service.ts` drop the `accounts` queue;
   `overview.service.ts` drop `pendingStudents` / `pendingAccounts` /
   `pendingAdviserAccess`; `accounts.service.ts` drop the `pending` bucket.
7. Backend typecheck + `npm test` (approval suites only; no DB required).

### Phase 2 — admin frontend (1–1.5 days)
1. New board `frontend/src/app/admin/users/components/account-approvals/`:
   - student/parent queue (list from `/api/admin/account-approvals?role=student`
     and `?role=parent`),
   - LRN verification (port `LrnVerifyDock` + `LrnVerifyDialog` unchanged —
     they already call a service function, only the URL changes),
   - teacher queue (generalize `pending-staff-queue.tsx`: replace the `desk`
     prop with `scope`, keep the shared markup),
   - KanbanBoard + shared `Pagination` (15/page), search, approve/reject with
     reason overlay (reuse today's reject overlay).
2. `/admin/users`: embed the board above the account table; pending rows get
   `Approve` / `Reject` actions; update the header copy
   ("pending sign-ups are approved here").
3. Optional: a `pending` badge on the admin sidebar "User Accounts" item,
   fed by a 5s poll (mirror `useRegistryNavDots`) — do **not** add a bare
   `useQuery` panel elsewhere.
4. `/admin/overview`: add a "Pending approvals" deck (optional, Phase 2 stretch)
   reusing `RegistryAttentionDeck` styling or a `StatDeck` column.

### Phase 3 — registry removal (½–1 day)
1. Delete `app/record-keeper/accounts/**` and `app/registrar/accounts/**`.
2. Remove "Account Approvals" from both sidebars and their `ROUTE_KEYS`.
3. Remove `pending-students` / `account-breakdown` from
   `recordKeeperChannel.ts` / `registrarChannel.ts`.
4. Delete both `OverviewApprovals.tsx`; update `overview/page.tsx` empty-state
   conditions and `services/registry/overview.types.ts`
   (`pendingAccounts`, `pendingStudents`).
5. Update `RegistryAttentionDeck`, `OverviewShortcuts`, `OverviewKpiRail`
   (remove the pending KPI/tile), `AccountBreakdown` /
   `OverviewGradeChart` (drop the `pending` series).
6. `lib/notifications/label.ts`: `sourceTable === "users"` → `/admin/users` for
   both role maps.

### Phase 4 — verification (½ day)
- Admin approves: student with roster match (profile + mascot + carryover),
  student with no roster (active, no profile — existing behaviour), parent,
  self-registered teacher.
- Admin rejects with a reason → `suspended`, applicant notified, audit row
  `account_approval` with the admin actor.
- Registry user hitting any legacy approval URL → `403`.
- Registry desks: no approval nav item, no 404 links from the notification
  bell (old `users:*` notifications now land on `/admin/users`).
- Registry overviews render with no pending KPI.
- Badge/dot: admin sees the pending count without a manual refresh.
- `npx tsc --noEmit` (frontend), `npm run typecheck` + `npm test` (backend),
  `npm run lint` (frontend).

### Phase 5 — cleanup (optional)
- Delete the legacy `/api/auth/pending|approve|reject|match-lrn` routes.
- Delete `LrnVerify*` duplicates under the registry app trees (keep one shared
  copy under `components/registry/` or `components/auth/`).
- Update `AGENTS.md` (§1 role notes, §7 auth/registry bullets, §9 gotchas) and
  the role guides that describe desk approvals.

---

## 6. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Admin becomes the single bottleneck | Sign-ups sit unapproved | Pending badge + bell notification on the admin shell; document an SLA; Q2 below |
| Student approved without a roster match | Account active but no `StudentProfile` (no grades/attendance) | LRN verification is mandatory in the admin board (same dialog as today); surface the "no roster match" state, require an explicit confirm |
| Registry desk still linked from an old notification | 404 dead link | `label.ts` repoint; old notifications deep-link by role at render time, so no data migration is needed |
| Cache staleness after approval | Registry KPIs show stale pending counts | `APPROVAL_TAGS` invalidation is unchanged and still fires |
| Realtime: admin shell has no channel | Badge/bell lag | 5s poll (same as registry nav dots) or add `adminChannel.ts` subscribing to `Notification` (`notification_own` RLS already matches by `zentra_uid()`, role-agnostic) |
| Admin approving a G11 learner | Fine now, but the old band split disappears | Accept by design; `gradeBandGuard` no-ops for `admin` |
| Two admins approving simultaneously | Second call gets `409 ALREADY_ACTIVE` | Already handled by `approveAccount`; UI should refresh on settle |

---

## 7. Open questions

1. **Delete or redirect the registry pages?** Recommended: delete, and repoint
   notification deep links. Alternative: keep `/record-keeper/accounts` as a
   read-only redirect to `/admin/users?status=pending` for a release.
2. **One admin only?** If the school runs a single administrator account, do we
   allow the principal as a fallback approver? Recommended: no — keep identity
   approval exclusively with the administrator.
3. **Keep the registry "Pending sign-up" KPI?** It counts rostered learners with
   no login yet — that is a registrar/record-keeper enrolment metric, not an
   approval queue. Recommended: keep `withAccount` / `noAccount`, drop `pending`.
4. **Move `LrnVerify*` to a shared folder now or in Phase 5?** Recommended:
   Phase 3 (it is copied twice under the registry trees).

---

## 8. Definition of done

- No registry role can read or act on pending accounts (API + UI).
- Administrator can list, verify, approve, reject every account type from
  `/admin/users`.
- Applicant notification, audit trail and profile provisioning behave exactly
  as today, with the admin actor recorded in `approvedBy` / `AuditLog`.
- Both registry shells build with no references to `/accounts`,
  `pending-students`, `account-breakdown`, or `pendingAccounts`.
- `AGENTS.md` reflects the new ownership.
