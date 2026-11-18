# Supabase Egress Recovery & Fresh Project Migration — Zentra

> Written 2026-11-18. Free-plan egress: **18.60 GB used / 5 GB included / 13.60 GB over**,
> grace period ends **2026-11-20** (after that requests return `402`).
> Billing cycle `03 Nov 2026 – 03 Dec 2026`, so the same org resets on **03 Dec**.
>
> **Diagnosis from the usage dashboard:** 100% of egress is **Shared Pooler Egress**
> (6.37 GB on 17 Nov alone). Storage 230 KB, Realtime 826 KB, Auth 9.8 KB.
> Nothing is being served from Storage — every byte is Postgres wire traffic
> caused by repeated queries and fat list payloads.
>
> Consequence: compression, CDN, image optimisation, `cacheControl` on storage,
> HTTP caching headers — **none of these help this number**. Only two levers exist:
> **fewer queries** and **fewer bytes per query**.

---

## 0. Decision: new organization?

Egress is metered **per organization**, not per project (the dashboard's
"All projects" filter is scoped to one 5 GB bucket). Therefore:

- A new **project in the same org** does **not** restore quota — it inherits the exceeded counter.
- A new **organization** does restore a fresh 5 GB immediately.
- Doing nothing restores 5 GB at **03 Dec 2026** but leaves 20 Nov → 3 Dec with `402`s.
- Supabase Pro ($25/mo, 250 GB) lifts restrictions immediately without migrating.

**Chosen path:** create the new org/project **immediately**, migrate the data into it, then keep
**every app instance pointed at the old project** until the Phase 0–1 fixes are committed and
verified — and only then flip the environment in one atomic step (§0.1). Migration before the fix
is safe *only* under that rule: at the observed 0.9 GB/day average a fresh 5 GB lasts ~5 days, and
at the 6.4 GB spike rate it lasts under one day.

## 0.1 The no-traffic guarantee (why creating first is safe)

Supabase counts egress produced by code that **uses the project's keys**. An idle project is 0 MB.
Therefore the new org cannot be "eaten" as long as these rules hold:

1. **New credentials live in a separate file** — `backend/.env.cutover` and
   `frontend/.env.local.cutover`. Never copy them into the real `.env` / `.env.local` until cutover.
2. **Do not update GitHub secrets yet.** CI's `migrate deploy` and any deployed frontend build
   read those; updating `DATABASE_URL` early makes the production deploy point at the new project
   while still running the leaky client.
3. **Never start `npm run dev` / the deployed app against the new project before Phase 0 lands.**
   The 5 s pollers mount on the first page load; one tab left open for an hour is already ~720
   queries.
4. **Migration scripts are exempt** — `pg_dump`, `psql`, the storage copy and `apply-rls.ts` are
   one-off, bounded, and total well under 200 MB.
5. **Confirm it:** the new org's Usage page must read ~0 MB egress the entire time you are fixing
   (only the migration's one-time cost). If it moves while nothing is pointed at it, something is
   still wired to it — stop and find it.

**Deadline reality:** the old project dies **20 Nov**. Cutover must happen before that, or the app
is down until the 03 Dec cycle reset. Phases 0–1 are ~1–2 hours of work, so the timeline holds —
but do not start the migration on 20 Nov.

---

## 1. Root causes found in the codebase

| # | Issue | Location | Rate |
|---|-------|----------|------|
| 1 | **Redis response cache is dead code.** `cache()` is exported and documented in AGENTS.md but is mounted on **zero** routes (only match in the repo is its own definition). Every poll goes straight to Postgres. | `backend/src/lib/cache.ts:39` | n/a |
| 2 | Every shell layout polls its profile via `useLiveQuery` — payload includes `fullName`, `photoUrl` (inline image), mascot, colours | `frontend/src/services/settings/profile-settings.ts:59` | 20 s, all 7 desks, every page |
| 3 | Guidance boards / alerts / risk monitor poll **with the tab hidden** | `frontend/src/lib/api/live.ts:54-62` | 15 s background |
| 4 | Six nav-count endpoints, one raw-SQL round trip each | `frontend/src/services/{teacher,nurse,guidance,coordinator,record-keeper,registrar}/navCounts.service.ts` | **5 s background** |
| 5 | Teacher desks | `frontend/src/lib/api/live.ts:26` | 20 s |
| 6 | Admin presence globe (geolocation joins) | `frontend/src/services/admin/admin.service.ts:119` | 8 s background |
| 7 | Dev servers / tabs left running against the cloud DB; hot reload re-mounts every query | workflow | continuous |

`backend/src/lib/perf.ts` already measures `bytes` per response but only logs when
`durationMs > 2000` or status ≥ 500, so payload size is invisible in normal operation.

---

## 2. Phase 0 — Cut the burn (do first, ~1 hour)

Target: **90%+ reduction**, no feature loss. Realtime already invalidates every
query below (`teacherChannel.ts`, `nurseChannel.ts`, `guidanceChannel.ts`, etc.),
and `useDeskCatchUp` covers anything that landed while signed out — so the polls
are safety nets, not the primary path.

- [ ] **1. Stop the profile poll.** `frontend/src/services/settings/profile-settings.ts`
      - `useLiveQuery` → plain `useQuery` (`@tanstack/react-query`).
      - `staleTime: 5 * 60_000`, `gcTime: 15 * 60_000`.
      - Keep the query key so the settings `ProfileCard` mutation still invalidates it.
      - Why: this runs in **every** layout of **every** desk, on every page, carrying an image URL.

- [ ] **2. Guidance backgrounds off.** `frontend/src/lib/api/live.ts`
      - `GUIDANCE_REFETCH_MS` `15_000` → `60_000`.
      - `refetchIntervalInBackground: false`.
      - Also check `frontend/src/app/guidance/components/GuidanceRiskAlertMonitor.tsx:177,190`
        and `frontend/src/app/teacher/components/AdviserRiskAlertMonitor.tsx:355` —
        set `refetchIntervalInBackground: false` unless the hidden-tab alert sound is
        genuinely required in the demo (if it is, raise the interval instead).

- [ ] **3. Nav dots 5 s → 60 s, background off.** All six files:
      `services/teacher/navCounts.service.ts:165`, `services/nurse/...:132`,
      `services/guidance/...:171`, `services/coordinator/...:129`,
      `services/record-keeper/...:137`, `services/registrar/...:137`.
      - `refetchInterval: 60_000`, `refetchIntervalInBackground: false`.
      - 12× less traffic; realtime still lights dots instantly.

- [ ] **4. Teacher desks.** `live.ts:26` `LIVE_REFETCH_MS` `20_000` → `60_000`.

- [ ] **5. Admin globe.** `services/admin/admin.service.ts:119` `8_000` → `30_000`, background off.

- [ ] **6. Stop dev traffic.** Run against local Postgres / `supabase start`
      (`supabase/config.toml` is already in the repo). Never leave `npm run dev`
      open against the cloud project; hot reload re-mounts every query.

- [ ] **7. Verify.** `npx tsc --noEmit -p tsconfig.json` in `frontend`.

Expected: back under 5 GB comfortably, likely <1.5 GB/month.

---

## 3. Phase 1 — Turn on the cache that already exists

This is the structural fix and the cheapest egress you will ever buy: a cache hit
is a Postgres query that never happens (and Redis traffic costs **zero** Supabase quota).

- [ ] **1. Provision Upstash** (free tier is plenty) and set in the backend env:
      `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `CACHE_ENABLED=true`, `CACHE_TTL_SECONDS=60`.

- [ ] **2. Mount `cache()` on the polled read routes.** Start with the highest-traffic
      ones only; do not blanket-mount on writes or auth:
      - `/api/teacher/*` overview + roster + advisory lists
      - `/api/guidance/nav-counts`, `/api/{nurse,teacher,registrar,record-keeper,coordinator}/nav-counts`
      - `/api/guidance/alerts/cases`, `/api/guidance/interventions`
      - `/api/overview/*`, `/api/admin/presence`, `/settings/profile` for each desk

      Pattern (matches the existing `etag()` usage, e.g. `modules/nurse/navCounts.routes.ts:27`):
      ```ts
      import { cache } from "../../lib/cache.js";
      import { CACHE_TAGS } from "../../lib/cacheTags.js";

      router.get("/nav-counts", requireAuth, requireRole(...), etag(), cache({
        ttl: 30,
        tags: [CACHE_TAGS.NAV_COUNTS /* existing tag for that desk */],
      }), handler);
      ```

- [ ] **3. Tags must be invalidated by the writes that touch them.** `invalidateTags([...])`
      is already called in the write paths; confirm each newly cached route maps to a
      tag that some write invalidates, otherwise the board goes stale for one TTL.
      `lib/cacheTags.ts` is the single source of truth — add tags there, never inline strings.

- [ ] **4. Keep the realtime escape hatch.** The client already sends
      `x-zentra-fresh: 1` for 10 s after any realtime invalidation (`lib/api/fresh.ts`),
      which bypasses the cache read but still repopulates it. Do not remove that.

- [ ] **5. Verify.** Response should carry `x-cache: MISS` then `HIT`; Supabase usage
      should flatten within an hour.

### 3.1 A dead Redis used to be worse than no Redis — FIXED 2026-11-18

Measured on the new project with an invalid Upstash token: `GET /api/guidance/nav-counts`
took **7.7–23 s** and two of three calls blew the 25 s server timeout, while the same route
with `x-zentra-fresh: 1` (cache read skipped) answered in **230 ms**. The database was not
the problem — `getNavQueues` runs in ~230 ms warm.

Cause: `@upstash/redis` retries a rejected credential, and each REST round trip from PH is
~1 s, so "fail-open" was really "stall for 6–20 s, then fail open". With `cache()` mounted on
~60 routes that is the whole app.

Fix (`lib/redis.ts` + `lib/cache.ts`):

- client configured with `retry: { retries: 1, backoff: … }`;
- new `redisOp(promise, timeoutMs = 1200)` races every Redis call against a hard budget —
  cache read, cache write (3 s), and every `smembers`/`del` in `invalidateTags`.

Same route after the fix, **still with the broken token**: 1.9 s (the 1.2 s read timeout plus
the live query). With a working token it is 230 ms on a miss and a single round trip on a hit.
Keep `redisOp` around any new Redis call site.

### 3.2 Upstash credential checklist — VERIFIED 2026-11-18

Live on database `genuine-earwig-206013` (Singapore, free tier):

```
call 1  200   986ms  x-cache=MISS
call 2  200   226ms  x-cache=HIT
call 3  200   223ms  x-cache=HIT
overview    MISS -> HIT
x-zentra-fresh: 1 -> BYPASS, next call -> HIT
```

Two traps that cost real time, both avoidable:

1. **The token must be the read-write REST token.** "Read-Only Token" in the Connect panel is a
   different string that authenticates fine (`PING` → 200) and then rejects every write with
   `403 NOPERM ... 'set'`. A cache with a read-only token never stores anything: every lookup
   misses and pays an Upstash round trip for nothing, which is *slower* than leaving caching off.
   Check it before wiring it in:

   ```powershell
   # in backend/, with UPSTASH_* in .env
   npx tsx -e "import('dotenv/config');fetch(process.env.UPSTASH_REDIS_REST_URL,{method:'POST',headers:{authorization:'Bearer '+process.env.UPSTASH_REDIS_REST_TOKEN,'content-type':'application/json'},body:JSON.stringify(['SET','probe','1','EX','10'])}).then(async r=>console.log(r.status, await r.text()))"
   ```

   `200 {"result":"OK"}` = good. `403 NOPERM` = read-only. `401 WRONGPASS ... invalid or missing
   auth token` = the string is malformed (a mistyped character), which is what reading a token off
   a screenshot produces — always copy/paste it as text.

2. **Free tier allows exactly one database.** Creating a second one is blocked ("You can create
   1 database in free tier"). If a database's token is unusable, delete it and recreate — a cache
   holds only TTL'd HTTP bodies, so nothing is lost. Turn **Eviction ON** when creating it,
   otherwise `SET` starts failing once the 250 MB limit is reached.

Region: **Singapore (ap-southeast-1)**. A US region adds ~200 ms to every cache read from PH and
undoes most of the benefit.

---

## 4. Phase 2 — New organization + migration runbook

Data volume is trivial (DB 38 MB, Storage 17 MB), so this is mostly careful sequencing.
Total expected Supabase traffic for the migration: **well under 200 MB**.

### 4.1 Create

- [ ] Create a **new organization** (same Supabase account is fine).
- [ ] Create **one** project in region **`ap-southeast-1` (Singapore)** — region is immutable.
- [ ] Save the new project ref, anon key, service-role key, DB password, pooler connection string.
- [ ] Create buckets **public**: `zentra-docs`, `referral-docs` (matches `backend/.env.example:29-34`).
- [ ] Keep the old project and old org alive until Phase 3 verification passes.

### 4.1b DECIDED (2026-11-18): re-seed roles only

No data migration. The new project is created empty, schema applied, RLS applied, then
`npm run prisma:seed:roles` creates **exactly 11 accounts (one per Role) + one active school
year with 3 terms** and nothing else. Consequences:

- **Skip §4.2 (dump/restore) and §4.3 (storage copy) entirely** — no existing records, no files.
- No `sed` URL rewriting, no `_prisma_migrations` transplant, no row-count checks.
- Storage buckets may stay empty: `lib/storage.ts:30` auto-creates a missing bucket on first upload.
  Creating `zentra-docs` and `referral-docs` up front as **public** is still recommended so the
  first upload doesn't depend on the service-role key being correct.

Runbook (against the new DB only — see §0.1):

```powershell
# 1. Point only this shell session at the new project (dotenv never overrides a real env var)
$env:DATABASE_URL = "postgresql://postgres.<NEWREF>:<PASSWORD>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"
$env:SUPABASE_URL = "https://<NEWREF>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<new-service-role-key>"

# 2. Schema (74 migrations) — NOT `migrate dev`, this is not a dev loop
npm run prisma:deploy

# 3. RLS + realtime grants (schema USAGE + SELECT on published tables)
npx tsx prisma/apply-rls.ts

# 4. Accounts: wipes all public tables, then 11 logins + 1 SY with 3 terms
npm run prisma:seed:roles
```

Resulting logins: `admin@zentra.test / Admin2025!`, `student@zentra.test / Student2025!`,
`parent@zentra.test / Parent2025!`, every staff role `@zentra.test / Zentra2025!`
(principal, registrar, record_keeper, nurse, guidance_counselor, adm_coordinator,
subject_teacher, adviser).

Notes:
- `seed-roles-only.ts` refuses to run when `NODE_ENV=production` unless `ALLOW_PROD_SEED=yes`.
  Your `.env` is `development`, so it runs — but confirm before running, it **deletes every row**.
- **Do not stack `prisma:seed:school` on top of `prisma:seed:roles`.** The roles seed gives
  `subject_teacher@zentra.test` the employee id `TCH001`, and the school seed assigns `TCH001` to
  `subject.teacher1@zentra.test` → `P2002` on `StaffProfile_employeeId_key`, half-seeded (core done,
  academic aborted). Pick one: `seed:school` creates its own full staff set (and its own emails:
  `guidance@`, `adm@`, `nurse2@`, `subject.teacher1..N@`) and reuses the existing `SY 2026-2027`
  rather than creating a second one. To come back from demo data to the canonical 11 accounts, just
  re-run `npm run prisma:seed:roles` (truncates all 51 tables and rebuilds them).
- **Demo data that exercises every desk:** `npm run prisma:seed:sample5`
  (`backend/prisma/seed-sample-five.ts`). Also wipes first, then keeps the same 11 canonical logins
  and adds 5 learners + 5 parents (accounts), 5 roster-only learners, 5 sections (G7 Amethyst /
  Emerald / Ruby, G8 Narra / Molave), 16 subjects, a full gradebook, attendance, anecdote →
  referral → session chains, interventions, health + home-visitation records, the whole ADM track,
  advisory modules + submissions, SF10 records + versions, risk/report snapshots, flags, audit and
  notifications — **≥5 rows in every public table**. It writes everything into **T1** of the active
  SY (see §5.2 for the two verification traps). It also prints a per-table count table and warns on
  any table that lands under 5. Do not stack it with `seed:school` (same `TCH001` collision).
- Use the **Session pooler** string (port `5432`). Direct `db.<ref>.supabase.co` is IPv6-only on
  this tier and will fail on many PH ISPs.
- Verify with `psql` / `curl /health` only. Do **not** start the app against these variables.


### 4.2 Database

- [ ] Dump from the old pooler URL:
      ```bash
      pg_dump "$OLD_DATABASE_URL" --no-owner --no-privileges --format=plain --file=zentra.sql
      ```
- [ ] **Rewrite storage URLs in the dump** (one global replace handles every column at once,
      no per-table script needed):
      ```bash
      # old ref → new ref, e.g. haivwhvhfzzzbztufcsn → NEWREF
      sed -i 's/<OLD-REF>/<NEW-REF>/g' zentra.sql
      ```
- [ ] Restore into the new project:
      ```bash
      psql "$NEW_DATABASE_URL" --set ON_ERROR_STOP=1 -f zentra.sql
      ```
      The `_prisma_migrations` table comes with the dump, so CI's `migrate deploy`
      will see the schema as already applied.
- [ ] Row-count spot checks on the big tables (`User`, `StudentRoster`, `StudentGrade`,
      `AttendanceRecord`, `Referral`, `Sf10Record`, `Notification`).

### 4.2b Schema bootstrap on a fresh project — VERIFIED 2026-11-18

Two things make the "just run `prisma migrate deploy`" step impossible, and both are worth
knowing before anyone tries a fresh DB again:

1. **The migration history is incomplete.** No migration file contains
   `CREATE TABLE "StudentRoster"` — only `ALTER TABLE "StudentRoster" …` — yet
   `schema.prisma:517` defines it. `migrate deploy` therefore dies on a fresh database at
   `20260911100000_attendance_roster_support` with `42P01 relation "StudentRoster" does not
   exist`. The old database only works because it was built with `prisma db push` at some point.
   **Repairing the history (a baseline migration) is an open follow-up.**
2. **Prisma's schema engine cannot use the transaction pooler.** It issues prepared statements,
   and pgbouncer transaction mode rejects them (`prepared statement "s1" already exists`), while
   `migrate deploy` also needs session-level advisory locks and simply hangs.

What worked (all over port **6543**, because some ISP networks reset port 5432):

```powershell
# 1. Generate the full DDL offline — no DB connection needed
npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script -o tmp-schema.sql

# 2. Apply it with node-postgres (simple query protocol: no prepared statements)
node tmp-run-sql.mjs tmp-schema.sql          # → 51 tables in public

# 3. RLS + realtime grants  (Prisma *client* works fine over 6543)
npx tsx prisma/apply-rls.ts                  # → 60/60 statements

# 4. Seed
npm run prisma:seed:roles                    # → 11 accounts + 1 SY with 3 terms
```

Result: 51 tables, 15 policies, 11 role accounts, SY 2026-2027 with 3 terms.

- **Realtime publication is NOT in the schema diff.** `prisma migrate diff` emits DDL only, so
  `supabase_realtime` came up empty and `postgres_changes` would have delivered nothing even
  with a correct JWT (silent — the desks just fall back to polling). The membership lives in
  three migrations; re-run them on a fresh project **after** `apply-rls.ts`:

  ```powershell
  # 20260923030000_adm_realtime_publication       (Notification, Referral, Adm*)
  # 20261111090000_realtime_publication_guidance_section (Section, Intervention, CounselingSession)
  # 20261111130000_realtime_publication_risk_snapshot    (RiskSnapshot)
  ```

  Verify: `select tablename from pg_publication_tables where pubname='supabase_realtime'`
  → 11 rows. Then prove delivery for real: subscribe with `@supabase/supabase-js`, calling
  `realtime.setAuth(token)` **before** `.subscribe()` (after the join the socket is already
  authorised as `anon` and RLS drops every row), insert a `Notification` for that user, and
  confirm the insert arrives while another user's row does not.

- **JWT secret must equal the project's legacy JWT secret.** Verified 2026-11-18 against
  PostgREST: a mismatched `JWT_ACCESS_SECRET` makes `/rest/v1/*` answer `401 PGRST301
  "None of the keys was able to decode the JWT"` for the app-signed realtime token. A cheap
  pre-check without a server: `jwt.verify(SUPABASE_ANON_KEY, JWT_ACCESS_SECRET)` succeeds
  when the secret is right (the anon key is signed with it).

- **CI caveat:** `.github/workflows/ci.yml` runs `migrate deploy` on `main`. Pointed at the new
  project it will try to replay all migrations onto an already-populated schema and fail (there is
  no `_prisma_migrations` history). Either remove that step until the history is repaired, or add a
  baseline migration. Do **not** hand-insert `_prisma_migrations` rows: the checksum is a sha256 of
  the file bytes, and CRLF locally vs LF in CI produces a mismatch.
- **Connection strings:** deployed backends can use the session pooler (5432). Locally on a network
  that blocks 5432, use 6543 with `?pgbouncer=true` — `apply-rls.ts` and the seed both work there.

### 4.3 Storage

- [ ] Copy objects with the **service-role** key (old project → new project):

      ```ts
      // backend/scripts/migrate-storage.ts  (run once: npx tsx scripts/migrate-storage.ts)
      // per bucket: list all pages → download → upload to the same path → log failures
      // Idempotent: upsert: true, skip paths that already exist.
      ```

      Buckets: `zentra-docs` (SF10 + signatures/attachments), `referral-docs` (clinic/guidance attachments).
- [ ] Confirm every object copied (`list` count old == new, per bucket + prefix).

### 4.4 RLS — do not skip

- [ ] With the **new** env loaded: `npx tsx prisma/apply-rls.ts`
      This also installs the `authenticated` schema USAGE + SELECT grants on the
      published realtime tables. Without them Realtime silently delivers nothing and
      you will spend hours debugging "live updates stopped working".

### 4.5 Environment

> **New-project key format (2026).** Supabase now shows `sb_publishable_…` / `sb_secret_…`
> by default and moves the JWT-based `anon` / `service_role` keys behind
> **Settings → API → View legacy API keys**. `env.ts:7-9` expects `SUPABASE_ANON_KEY` /
> `SUPABASE_SERVICE_ROLE_KEY`, and `lib/jwt.ts:33,49` signs the realtime token with
> **`JWT_ACCESS_SECRET`**, which Supabase only accepts if the project's **legacy JWT secret
> equals that value**. Therefore:
>
> - [ ] Use the **legacy `anon` + `service_role`** keys (lower risk; supported until early 2027),
>       or the publishable/secret pair — either works as the API key, but neither removes the
>       JWT-secret requirement below.
> - [ ] **Set `JWT_ACCESS_SECRET` = the new project's legacy JWT Secret**
>       (Settings → API → Legacy keys → JWT Secret). Do not disable legacy JWT signing.
> - [ ] Keep `JWT_REFRESH_SECRET` as-is (unrelated to Supabase).
> - [ ] Expect every current session to be invalidated → all users re-login. Normal for a cutover.
> - [ ] Symptom if skipped: login works, pages work, **realtime never fires**, every desk falls
>       back to its poll → the new org burns exactly like the old one.
> - [ ] If Google sign-in is used: configure Auth → Providers → Google on the new project with the
>       same Client ID/Secret, plus Site URL and `…/auth/callback` redirect. Seeded accounts are
>       email/password, so this is only needed for the Google button.


- [ ] Backend `.env` / deploy secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
      `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `STORAGE_BUCKET`,
      `SF10_STORAGE_BUCKET`, `REFERRAL_STORAGE_BUCKET`.
- [ ] **Reuse the existing `CONTACT_ENCRYPTION_KEY`.** A different key makes every
      stored contact number unreadable (no recovery path).
- [ ] Frontend `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
      These are **build-inlined** — you must rebuild, a runtime env swap does nothing.
- [ ] Update the GitHub repo secret `DATABASE_URL` (CI runs `migrate deploy` on every
      `main` push; leaving it pointed at the old project is a live footgun).

---

## 5. Phase 3 — Verification checklist

**Run 2026-11-18 against `fqqhezpdniohylybujhp`.** Two passes: the first on the seed-only DB
(11 accounts, 1 SY + 3 terms, no sections/grades), the second after `prisma:seed:sample5`
(`backend/prisma/seed-sample-five.ts`, ≥5 rows in every one of the 51 public tables — see §5.2).

- [x] `GET /health` → `{ status: "ok" }` (proves pooler connectivity).
- [x] **All 11 logins 200** (admin, principal, registrar, record_keeper, nurse,
      guidance_counselor, adm_coordinator, subject_teacher, adviser, student, parent) and each
      role's desk probe returned 200 (`/admin/overview`, `/principal/settings/profile`,
      `/<desk>/nav-counts`, `/student/modules`, `/notifications/unread-count`).
- [x] **Realtime delivery + RLS proven live**: guidance desk subscribed to
      `postgres_changes:Notification`, a row for that user arrived, a row for another user did
      not. Token carries `role: authenticated` + `app_role: guidance_counselor`.
- [x] **Storage round-trip**: upload → public URL read back byte-identical → delete, on
      `zentra-docs` with the service-role key. The seeded SF10 / session-attachment rows carry
      fabricated public URLs (no object behind them), so the *UI path* is only proven to render a
      link, not to fetch a real file. Upload a real file through the desk to close that fully.
- [ ] Realtime sound catch-up: needs a real unread desk notification + a browser; not verifiable
      from the API.
- [x] **Grade workspace works on real data** (after `prisma:seed:sample5`): subject teacher
      `/teacher/overview?scope=gradebook` `200`, `classes=5 assessments=20 standings=5`
      (8.5 KB, 1.2 s fresh); `/teacher/grading/classes/:assignmentId` `200`
      (`assignment,students,components`, 2.2 KB); `/teacher/lock-grades`
      `200 classes=5 gates {linked:true, termGrant:true}`. Adviser
      `/teacher/advisory/interventions` `200 total=3`, `/teacher/advisory/modules` `200 total=3`,
      `/teacher/advisory/sf10-access-requests` `200`; record keeper `/sf10/records` `200`;
      principal `/reports?reportType=trends` `200` (1.1 KB).
- [x] **Sweeps run green on the new DB**: `runEscalation` 0, `sweepAutoAbsent`
      `{meetups:0,rows:0,exemptLearners:0}`, `refreshRiskSnapshots`
      `{profiles:0,rosters:0,pruned:0}` — no permission/config errors.
- [x] Cache: `x-cache: HIT` on `/api/guidance/nav-counts`, `BYPASS` with `x-zentra-fresh: 1`.
- [ ] Supabase usage page on the new org: egress flat for 24 h while desks are open (client-side).

### 5.2 Two traps when verifying against the demo seed

1. **A teacher needs a `TeacherTermGrant` before the gradebook resolves.** `seed-sample5` grants one
   only to `adviser@` (the seeder's timetable names `TCH-ARNEL` but grants no code to the subject
   teacher), so `subject_teacher@` sees `/teacher/overview?scope=gradebook` → `{"classes":[]}` and
   `lock-grades` with `gates.termGrant: false`. Create the grant (one `TeacherTermGrant` row with
   any `TeacherName` of that term) or sign in as `adviser@`.
2. **Only teacher roles can steer the term.** The seed writes every row into T1 (`2026-06-08 →
   09-15`), but today's date resolves the active term to T2, and guidance / nurse / registry desks
   resolve their term *server-side*. So their boards legitimately come back empty
   (`/guidance/alerts total=0`, `/guidance/nav-counts` all-empty) while T1 is full. Verify those
   desks with `?termId`/`x-term-id` on a teacher shell, or by moving the date window — not by
   concluding the wiring is broken.

### 5.1 Found during verification: a Postgres query on *every* `/api` request

`attachTermScope` (`app.ts` → `middleware/termScope.ts` → `lib/termScope.ts:112`) resolves the
active school year + terms **per request**, before routing. It runs even for unauthenticated calls
and 404s (measured: `/health` 465 ms, `/api/<unmatched>` 925 ms from the same client, i.e. ~460 ms =
one pooler round trip). So each desk request pays one extra round trip and one extra query, and a
cache `HIT` still costs that + auth before reaching Redis (HIT ≈ BYPASS ≈ 1.38 s at the current
460 ms RTT, versus 226 ms when RTT was 255 ms).

**FIXED 2026-11-18** — `lib/termScope.ts` now memoizes the resolved scope for 30 s
(`active`, `term:<id>`, `year:<id>`, keyed per scope, single-flight so a burst of parallel queries
shares one lookup) and exports `invalidateTermScopeCache()`, called by the paths that create terms
or school years (`academics-catalog.routes.ts`, `registry.repository.ts`,
`academics.sections.service.ts`). Re-measured on the same client/RTT:

| Request | Before | After |
|---|---|---|
| `/api/<unmatched>` (404) | 925 ms | **3 ms** |
| `/guidance/nav-counts` cache HIT | 1375 ms | **470 ms** |
| `/guidance/nav-counts` BYPASS | 1385 ms | 464–926 ms (handler query only) |
| `/notifications/unread-count` | 1399 ms | **458 ms** |

What remains per request is `requireAuth`'s own user lookup (one round trip) — the next candidate if
latency ever matters more than it does today.

---

## 6. Phase 4 — Guardrails so this never repeats

- [ ] **Weekly 30-second check:** Org → Usage → egress. With <10 MAU, anything over
      ~500 MB/week means something is looping again.
- [ ] **Target:** < 1 GB/month (≈ 5% of quota). Leaves headroom for the hourly
      risk snapshot / auto-absent / grade-flag sweeps and report generation.
- [ ] **Dev against local.** `supabase start` (or plain local Postgres) for everyday work;
      cloud only for demos.
- [ ] **Add payload visibility.** Extend `backend/src/lib/perf.ts` so it logs the top
      endpoints by cumulative bytes every 5 minutes (dev-only), or keep the
      `if (durationMs > 2000)` log but lower the byte threshold for a day of profiling.
- [ ] **Payload hygiene on polled endpoints:** `select` only rendered columns; never
      `include` a relation the UI doesn't show; never ship inline base64 images
      (`photoUrl`, `signatureImageUrl`) inside a polled list response — serve those from
      a separate, cached endpoint.
- [ ] **Do not** try to fix this with gzip/compression (sits between browser and Express,
      not between Express and Supabase), storage CDN caching (Storage is 0% of the problem),
      or by proxying Storage through the API (just moves the bytes).
- [ ] **Do not** re-create orgs each month to reset quota — that is what Supabase's
      fair-use policy targets, and it hides a bug you will hit again.

---

## 7. Rollback

- Keep the old org + project until 30 days after cutover (it is restricted, not deleted).
- Rollback = restore the old `.env` / `.env.local`, rebuild the frontend, re-point the
  GitHub `DATABASE_URL` secret. The old project resumes normally from 03 Dec 2026,
  or immediately if you upgrade it to Pro.
- Only write to **one** project at a time during cutover — do not leave two backends
  accepting writes against two databases.

---

## 8. Order of operations (the actual sequence)

0. **Create the new org + project + buckets** — immediately, costs nothing, 10 minutes.
1. **Migrate data** (dump → rewrite URLs → restore → copy storage → `apply-rls.ts`) with the app
   **stopped**. Nothing is pointed at the new project yet.
2. **Park the new credentials** in `.env.cutover` / `.env.local.cutover`. Leave the real env files
   on the old project. Check the new org reads ~0 MB egress.
3. **Land Phase 0 + Phase 1** in `main`, verified locally **against the old project** (the fixes are
   client-side and cache-mounts; they don't need the new project at all).
4. **Canary:** point one local dev instance at `.env.cutover`, open **one** desk for 5 minutes, then
   check the new org's Egress-per-day chart. Expect a few MB, not hundreds.
5. **Cut over atomically:** stop the old backend → swap `.env`/`.env.local` → rebuild the frontend
   (`NEXT_PUBLIC_*` are build-inlined) → deploy → update the GitHub `DATABASE_URL` secret.
6. **Watch for 24 h.** Flat egress = done. Then Phase 4 guardrails.

Never seed or demo against the new project with the old polling in place.
