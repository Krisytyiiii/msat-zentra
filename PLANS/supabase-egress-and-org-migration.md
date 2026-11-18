# Supabase egress: new organization + guardrails

> Status: **plan only — no code changed yet.**
> Created 2026-11-18. Owner: (you). Related: `AGENTS.md` §2 (Realtime),
> §3 (caching), §7 (modules/risk), `docs/architecture/system-architecture.md`.

---

## 1. The problem, measured

Current organization (project `kbxbtbbgekolnlwqx`), billing cycle 03–03 Nov:

| Metric | Value | Read |
| --- | --- | --- |
| Egress | 16.59 GB / 5 GB (332%) | over quota |
| **Cached egress** | 0.003 GB / 5 GB | ~0% served from CDN |
| Database size | 0.038 GB | tiny |
| Storage size | 0.017 GB | tiny |
| Realtime messages | 3,214 | negligible |
| Log ingestion | 0.095 GB / 1 GB | fine |
| MAU | 6 | small user base |

Egress breakdown (17 Nov 2026): **Auth 9.8 KB · Storage 230 KB · Realtime
826 KB · Shared Pooler 6.16 GB (100%)**.

Two conclusions that drive everything below:

1. **This is database egress, not files.** Storage/realtime/auth are rounding
   errors. No amount of image/CDN tuning fixes it.
2. **It is human-driven.** Weekend days are near-zero; 12, 13, 16 and 17 Nov
   (school days) carry the spikes. The hourly sweeps (`index.ts`) run every
   day, so they are *not* the cause.

Supabase bills the bytes leaving Postgres for the backend. HTTP-level fixes
(ETag/304, gzip, Next `<Image>`) do **not** reduce this number — only fewer
queries and smaller result sets do.

---

## 2. Root cause (ranked by expected impact)

### R1 — The guidance shell polls the whole interventions board every 15 s, in background

- `frontend/src/app/guidance/components/GuidanceRiskAlertMonitor.tsx:208-213`
  spreads `guidanceLiveQueryOptions` (`refetchIntervalInBackground: true`)
  over `fetchAllGuidanceInterventions`.
- `frontend/src/services/guidance/interventions.service.ts:48-83` fetches
  **every page in parallel** (`totalPages - 1` extra requests).
- Each request runs the live risk cohort
  (`backend/src/modules/risk/interventions.service.ts:270-330`), which per
  learner pulls **every `attendanceRecords` row for the term**
  (`select: { status: true, subjectId: true }`), anecdotal ids, finals, plans,
  sessions and assignees.

The monitor is mounted in the guidance shell, so it polls on **every guidance
page**, with the tab hidden, on every open tab.

Order-of-magnitude check: 1 MB per poll × every 15 s ≈ 67 KB/s; two open
guidance tabs over a 10-hour day ≈ 4.8 GB. Observed: 6.16 GB on 17 Nov. The
shape fits.

### R2 — The teacher shell does the same

`frontend/src/app/teacher/components/AdviserRiskAlertMonitor.tsx:352-355`
polls `fetchAllAdvisoryInterventions` every 15 s in the background on every
teacher page.

### R3 — Six sidebars poll nav-counts every 5 s in the background

`services/{teacher,guidance,nurse,coordinator,registrar,record-keeper}/navCounts.service.ts`
— `refetchInterval: 5_000`, `refetchIntervalInBackground: true`. Rows are
cheap, but this is a constant floor of queries around the clock.

### R4 — The response cache may be off

`backend/src/lib/cache.ts` is fail-open: with no
`UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`, **nothing** is cached and
every refetch hits Postgres. ETag/304 does not help (see §1).

### R5 — Development runs against the cloud project

`npm run dev`, seeds, and QA scripts against Supabase burn the same quota with
no users at all.

---

## 3. Decision: new **organization**, not a new project

The Free Plan quota is **organization-wide** (the usage page reads
"Organization is on the Free Plan" with "All projects" selected). A second
project inside the same org inherits the same 16.59 GB and lands in the same
grace period.

- Creating a new **organization** gives a fresh 5 GB bucket.
- Without §5, the new bucket is consumed in roughly the same two weeks.

⚠️ Verify the current free-org allowance at creation time (Supabase has limited
free organizations per account). If the limit is hit, the fallback is to reduce
usage in place until the cycle rolls over on 03 Dec.

---

## 4. Phase 1 — Migration checklist (new org / new project)

### 4.1 Dashboard (manual)

1. Create organization → new project → region closest to the school
   (Singapore/Tokyo are the usual picks from PH).
2. Save from **Project Settings → API**: Project URL, `anon` key,
   `service_role` key.
3. Save from **Project Settings → Database**: pooler connection string
   (transaction mode, port 6543) for `DATABASE_URL`.
4. **Storage**: nothing to create — `lib/storage.ts` auto-creates missing
   public buckets on first upload. Confirm buckets `zentra-docs` (or
   `STORAGE_BUCKET`), `SF10_STORAGE_BUCKET`, `REFERRAL_STORAGE_BUCKET` after
   the first upload of each kind.
5. **Realtime**: nothing to toggle — the migrations add every published table
   to `supabase_realtime` (`20260923030000_adm_realtime_publication`,
   `20261111090000_realtime_publication_guidance_section`,
   `20261111130000_realtime_publication_risk_snapshot`).
6. **Auth (Supabase)**: only needed if Google sign-in is used — re-add the
   Google provider and the redirect URL for the new project.

### 4.2 Backend env (`backend/.env`)

```dotenv
DATABASE_URL=<new pooler URL>            # port 6543, ?pgbouncer=true
SUPABASE_URL=<new project URL>
SUPABASE_ANON_KEY=<new anon key>
SUPABASE_SERVICE_ROLE_KEY=<new service role key>   # Storage only
# optional but recommended: Upstash (see R4)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

**Realtime gotcha:** `signRealtimeToken` (`backend/src/lib/jwt.ts:36-52`) signs
the Supabase realtime JWT with `JWT_ACCESS_SECRET`. Supabase only accepts
tokens signed with **that project's** JWT secret. If realtime currently works
because `JWT_ACCESS_SECRET` is set to the old project's JWT secret, copying it
verbatim to the new project silently breaks every `postgres_changes`
subscription (sounds stop firing, boards stop invalidating). After the move:
open a desk, confirm the socket connects, then confirm a live notification
still arrives.

### 4.3 Schema + RLS + data

```powershell
cd backend
npm run prisma:migrate           # prisma migrate deploy against the new DB
npx tsx prisma/apply-rls.ts      # RLS + authenticated grants + SECDEF helpers
```

Notes:
- `apply-rls.ts` is **manual and mandatory** — without it Realtime delivers
  nothing (no schema USAGE / SELECT grants) and RLS is absent.
- The script strips `--` comments before splitting on `;`; do not add comments
  containing semicolons.
- Seed choice: `npm run prisma:seed:roles` (clean one-account-per-role + SY with
  3 terms) for a fresh demo, or a `pg_dump`/`pg_restore` of the current project
  if the school data must survive.

### 4.4 Frontend env (`frontend/.env.local`)

```dotenv
NEXT_PUBLIC_API_BASE_URL=<backend URL>
NEXT_PUBLIC_SUPABASE_URL=<new project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<new anon key>
```

These are **build-inlined** — a rebuild is required, not just a restart.

### 4.5 Cut-over order

1. New project migrated + seeded, RLS applied.
2. Backend pointed at it, realtime token verified.
3. Frontend rebuilt with the new public keys.
4. Old project left **untouched for 7 days** (rollback window), then deleted.
5. Keep the old org's usage page open to prove the new org is not growing the
   same way.

---

## 5. Phase 2 — Egress guardrails (proposed, not applied)

Ordered by savings per unit of risk. P0/P1 are where the 6 GB/day lives.

| # | Change | Files | Est. saving | Risk |
| --- | --- | --- | --- | --- |
| P0 | Stop running dev/seeds against the cloud project; use local Postgres (`docker run postgres:16`, same `migrate deploy` + `apply-rls`) | env only | unknown, possibly large | none (dev only) |
| P1 | Guidance shell: refetch the board **only when a nav-count version changes**, instead of a 15 s blind poll | `GuidanceRiskAlertMonitor.tsx:208`, `services/guidance/navCounts.service.ts` | ~4–8× on the biggest query | medium — alarm must still ring; realtime remains the fast path |
| P1b | Fallback if P1 slips: raise `GUIDANCE_REFETCH_MS` 15 s → 60 s, keep realtime invalidation | `lib/api/live.ts:54` | ~4× | low |
| P2 | Server-side "fetch all" for the interventions board (one request, internal paging like `alertCases.service.ts` uses `INTERNAL_AGGREGATE_ROW_CAP`) instead of N parallel requests each re-running the cohort | `services/guidance/interventions.service.ts:48-83`, new route in `modules/risk` | ~N× per poll | medium |
| P3 | Slim the cohort query: attendance aggregated in SQL (`COUNT(*) FILTER (WHERE status='present')`) instead of shipping every attendance row | `modules/risk/interventions.service.ts:270-330, 332-385` | est. 50–80% of payload | medium — must match `sectionAttendanceTotals` semantics exactly |
| P4 | Same treatment for the adviser monitor (`BOARD_POLL_MS` 15 s → 45–60 s or version-gated) | `AdviserRiskAlertMonitor.tsx:93,352` | ~3× on teacher shells | low |
| P5 | Nav-counts 5 s → 20 s on all six sidebars (`refetchIntervalInBackground` may stay `true`) | six `navCounts.service.ts` files | ~4× on the constant floor | low |
| P6 | Enable Upstash Redis so `lib/cache.ts` actually caches GETs; review TTLs (dashboard 15 s / list 30 s) | `backend/.env`, `lib/cache.ts` | removes many repeat reads | low |

Explicitly **not** worth doing for this problem: image/CDN tuning, ETag/304,
gzip, Realtime throttling — none of them reduce pooler egress. (Storage cache
headers are still good hygiene; they just aren't the fix.)

### Do-not-break list

- Desk sounds and login catch-up must keep working (`useDeskCatchUp`,
  `playDeskSound`) — they ride notifications, not polls, so P1/P4/P5 are safe
  **if** realtime invalidation stays wired.
- The risk alarm must still ring for a learner entering detection while the
  tab is on another page. Any P1 implementation must prove that.
- Pagination stays 15/page (16 for the referral/intervention queues).

---

## 6. Phase 3 — Verification

### 6.1 Find the culprit query today (Dashboard → SQL Editor)

```sql
select left(regexp_replace(query,'\s+',' ','g'), 90) as q,
       calls, rows,
       round(rows::numeric/nullif(calls,0)) as avg_rows_per_call,
       round(total_exec_time::numeric) as total_ms
from extensions.pg_stat_statements
where query not ilike '%pg_stat%'
order by rows * avg_rows_per_call desc
limit 15;
```

Take a baseline **before** Phase 2 and repeat after each step. `pg_stat_statements`
resets on project restart — note that when comparing.

### 6.2 Success targets

| Metric | Target |
| --- | --- |
| Weekday egress (school day, 6 users) | < 0.5 GB/day (from ~6 GB) |
| Monthly egress | < 5 GB |
| `avg_rows_per_call` on the cohort query | < 200 |
| Alarm latency for a new detection | ≤ realtime path (unchanged) |

### 6.3 Per-change check

- After P1/P4: open a guidance/teacher desk, trigger a referral and an
  intervention booking, confirm the clip still rings and the card updates
  without a reload.
- After P3: diff the attendance number shown on the desk against the previous
  build for the same learner/term (transferee `learnerType` window and the ADM
  exemption must be preserved — see `AGENTS.md` §7 `risk.ts`).
- After P5: sidebar dots still appear within ~20 s of a new row.

---

## 7. Phase 4 — Ongoing budget

1. **Daily**: glance at org usage; the chart should be flat on weekends.
2. **Weekly**: rerun §6.1 and record the top query.
3. **Rule**: no `npm run dev`/seeds against the cloud project; only the deployed
   backend talks to Supabase.
4. **Alarm**: if weekday egress > 1 GB/day, the pollers regressed — check P1/P5
   first.
5. If the school outgrows Free, the decision point is Pro ($25/mo, 250 GB
   egress) — cheaper than engineering around 6 GB/day again.

---

## 8. Risks & rollback

| Risk | Mitigation |
| --- | --- |
| Realtime silently dead after migration (JWT secret mismatch) | §4.2 check; keep old project 7 days |
| RLS not applied → Realtime delivers nothing | `apply-rls.ts` is a mandatory step, verify desk sounds live |
| Alarm regresses after P1 | Ship P1b (interval bump) instead; both are one-file |
| Attendance math drift after P3 | Keep the old query behind a flag until the desk matches |
| Free-org creation limit | Fall back to in-place reduction until 03 Dec |

Rollback is per-change: each P-item is one or two files and does not touch
schema.

---

## 9. Acceptance criteria

- New organization's project runs the same app (login, desks, realtime, sounds,
  Storage uploads, SF10 lifecycle).
- Weekday egress under 0.5 GB with 6 concurrent users.
- Alarm/catch-up behavior byte-for-byte unchanged from the user's point of view.
- No schema change in this plan (no migration).

---

## 10. Open questions

1. Does `backend/.env` currently point at the cloud project during development?
2. Is Upstash Redis configured in any environment?
3. Does the school data in the current project need to be carried over, or is a
   fresh `prisma:seed:roles` acceptable?
4. Which P-items do you want in the first pass? (Recommended: P0, P1b, P4, P5 —
   four small diffs, no behavior loss.)
