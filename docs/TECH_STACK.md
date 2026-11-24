# E-zentra (Zentra) — Technology Stack

> Student Information & Management System for **Mati School of Arts and Trades**
> (Grades 7–12, trimester school year, 11 roles).
> Versions below are taken from `frontend/package.json` and `backend/package.json` at the time of writing.

---

## 1. At a Glance

| Layer | Technology |
| --- | --- |
| **Frontend** | Next.js 16 (App Router) + React 19 + TypeScript |
| **Styling / UI** | Tailwind CSS 4, CSS Modules, shadcn/radix-ui, lucide + hugeicons |
| **Client data** | TanStack Query 5 + Axios, Zod 4 validation |
| **Backend** | Node.js + Express 4 (TypeScript, ESM) |
| **Database** | PostgreSQL on Supabase (pooler), Prisma 7 ORM |
| **Auth** | JWT access/refresh (argon2id), Supabase Auth brokering Google OAuth |
| **Realtime** | Supabase Realtime (`postgres_changes`) per role |
| **Storage** | Supabase Storage (documents, SF10, referral/clinic files) |
| **Cache** | Upstash Redis (response cache, fail-open) |
| **File / document** | ExcelJS, pdf-lib, Tesseract.js (OCR), jsPDF |
| **Testing** | Vitest 5 + Supertest 7, Playwright (dev dependency) |
| **CI/CD** | GitHub Actions (typecheck, test, lint, build) |

---

## 2. Frontend (`frontend/`)

### Core framework
| Package | Version | Purpose |
| --- | --- | --- |
| `next` | 16.4.6 | App Router, per-role route trees, SSR/build |
| `react` / `react-dom` | 19.2.8 | UI runtime |
| `typescript` | ^5 | Type checking |
| `eslint` / `eslint-config-next` | ^9 / 16.4.6 | Lint (React Compiler gate) |

### UI, styling & design system
| Package | Version | Purpose |
| --- | --- | --- |
| `tailwindcss` + `@tailwindcss/postcss` | ^4 | Utility styling |
| CSS Modules | — | Role-shell and page layout |
| `shadcn` | ^4.22.1 | Component generator (CLI) |
| `radix-ui` | ^1.6.7 | Accessible primitives behind shadcn |
| `@base-ui/react` | ^1.7.0 | Additional headless primitives |
| `class-variance-authority` | ^0.7.1 | Variant-driven component APIs |
| `clsx` + `tailwind-merge` | ^2 / ^3 | Conditional class composition |
| `tw-animate-css` | ^1.4 | Tailwind animation utilities |
| `motion` | ^14 | Micro-motion (120–180 ms transitions) |
| `gsap` | ^3.15 | Advanced animation |
| `next-themes` | ^0.4.6 | Theming support |
| `cmdk` | ^1.1.1 | Command palette (⌘K global search) |
| `sileo` | ^0.1.5 | Toasts |
| `lucide-react` | ^1.33.0 | Icons |
| `@hugeicons/react` + `@hugeicons/core-free-icons` | ^1.1 / ^4.3 | Icon set |

### Data fetching & state
| Package | Version | Purpose |
| --- | --- | --- |
| `@tanstack/react-query` | ^5.101.4 | Server-state cache, polling, mutations |
| `@tanstack/react-table` | ^8.21.3 | Data tables |
| `axios` | ^1.20.0 | HTTP client (token refresh, term headers) |
| `zod` | ^4.4.3 | Schema validation |

### Domain widgets & interaction
| Package | Version | Purpose |
| --- | --- | --- |
| `@dnd-kit/core` + `sortable` + `modifiers` + `utilities` | 6 / 10 / 9 / 3 | Drag-and-drop kanban boards |
| `recharts` | ^3.8.0 | Charts & dashboards |
| `date-fns` | ^4.4.0 | Date handling |
| `react-day-picker` | ^10.0.1 | Calendar / schedule pickers |
| `three` + `@types/three` | ^0.185 | Admin live-presence globe |
| `ogl` | ^1.0.11 | WebGL rendering support |

### Export, files & realtime
| Package | Version | Purpose |
| --- | --- | --- |
| `exceljs` | ^4.4.0 | Excel workbook export |
| `jspdf` | ^4.2.1 | PDF generation |
| `html-to-image` | ^1.11.13 | Render DOM to image |
| `@supabase/supabase-js` | ^2.112.3 | Realtime + client |
| `@supabase/ssr` | ^0.12.4 | Supabase SSR helpers |

### Testing / dev
| Package | Version | Purpose |
| --- | --- | --- |
| `@playwright/test` / `playwright` | ^1.62.1 | Browser testing (no committed e2e suite) |
| `@types/node`, `@types/react`, `@types/react-dom` | ^20 / ^19 / ^19 | Type definitions |

---

## 3. Backend (`backend/`)

### Runtime & framework
| Package | Version | Purpose |
| --- | --- | --- |
| Node.js | 20 (CI) | Runtime |
| `express` | ^4.21.2 | REST API (`/api/*`) |
| `typescript` | ^5.7.3 | Strict TS, ESM (`.js` import specifiers) |
| `tsx` | ^4.19.2 | Dev runner (`tsx watch`) |
| `helmet` | ^8 | HTTP security headers |
| `cors` | ^2.8.5 | CORS control |
| `express-rate-limit` | ^8.7.1 | Rate limiting |
| `multer` | ^2.3.0 | File uploads |
| `dotenv` | ^17.4.2 | Env loading |

### Data & persistence
| Package | Version | Purpose |
| --- | --- | --- |
| `prisma` / `@prisma/client` | ^7.10.0 | ORM + migrations |
| `@prisma/adapter-pg` | ^7.10.0 | Prisma PostgreSQL driver adapter |
| `pg` | ^8.23.0 | PostgreSQL driver (Supabase pooler) |

### Auth & validation
| Package | Version | Purpose |
| --- | --- | --- |
| `argon2` | ^0.45.1 | Password hashing (argon2id) |
| `jsonwebtoken` | ^9.0.2 | JWT access/refresh tokens |
| `zod` | ^3.24.1 | Request validation (middleware) |
| `@supabase/supabase-js` | ^2.112.4 | Storage + Google token verification |

### Caching, logging & observability
| Package | Version | Purpose |
| --- | --- | --- |
| `@upstash/redis` | ^1.38.3 | Redis response cache (fail-open) |
| `pino` / `pino-http` / `pino-pretty` | ^9 / ^11 / ^13 | Structured logging |

### Documents & processing
| Package | Version | Purpose |
| --- | --- | --- |
| `exceljs` | ^4.4.0 | OCForm-01 / report workbooks |
| `pdf-lib` | ^1.17.1 | SF10 PDF patching & generation |
| `tesseract.js` | ^7.0.0 | SF10 photo OCR |

### Testing
| Package | Version | Purpose |
| --- | --- | --- |
| `vitest` | ^5.0.5 | Test runner |
| `vite` | ^8.3.5 | Build/test tooling |
| `supertest` | ^7.0.0 | HTTP endpoint tests (no live DB) |

---

## 4. Data Layer

- **Database:** PostgreSQL hosted on **Supabase** (connection-pooled `DATABASE_URL`, port 6543 for the Prisma client).
- **Schema:** 51 Prisma models (`backend/prisma/schema.prisma`), 95 migration folders plus a manual RLS migration (`backend/prisma/migrations/0001_rls.sql`).
- **Security:** Row Level Security applied by hand via `backend/prisma/apply-rls.ts`; realtime publication membership tracked separately.
- **Key domain areas:** identity & roles, academic spine (school year → term → section → subject), grading + DepEd transmutation, attendance, anecdotal records, referrals & interventions, ADM case flow, SF10 records, risk snapshots, notifications, audit, reports.

---

## 5. Third-Party Services

| Service | Role |
| --- | --- |
| **Supabase Postgres** | Primary database (pooled connection) |
| **Supabase Realtime** | Role-scoped `postgres_changes` live updates |
| **Supabase Storage** | Public bucket URLs for documents, SF10, referral/clinic files |
| **Supabase Auth** | Google OAuth brokering (token verified by backend) |
| **Upstash Redis** | API response cache with tag invalidation (optional, fail-open) |

---

## 6. Auth & Security Model

- JWT **access token** (localStorage `zentra.access`) + **refresh token** in an httpOnly cookie.
- 401 → single-flight refresh → retry → error page.
- Password hashing with **argon2id**; contact numbers encrypted with **AES-256-GCM**.
- Role guards (`requireAuth`, `requireRole`, `requireOwnershipOrRole`) + grade-band guard.
- Per-request term scoping (server-resolved for most roles, client-steered for teachers/advisers/principal/admin).

---

## 7. Tooling & CI/CD

- **CI:** GitHub Actions (`.github/workflows/ci.yml`) on Node 20
  - Backend: `prisma generate` → `typecheck` → `test` → `build`
  - Frontend: `tsc --noEmit` → `lint` → `build`
  - CI does **not** touch the database; migrations are applied manually.
- **Scripts:** per-folder npm scripts (no root workspace) — `npm run dev`, `npm run build`, `npm test`, `npm run typecheck`, Prisma seed/migrate scripts.
- **Version control:** Git, conventional commits; helper `push.bat`.

---

## 8. Architectural Style

- Two separate apps: `backend/` REST API (`/api/*`) and `frontend/` Next.js App Router with one layout per role shell (teacher, guidance, nurse, coordinator, principal, admin, record keeper, registrar).
- Backend layering: thin routes → repositories/services → Prisma; shared kernel in `lib/`.
- Frontend data flow: page → role service hook (TanStack Query, canonical query keys) → `apiClient` → API; lists server-paged (15/page, queues 16) and URL-synced.
- Live experience: per-role Supabase Realtime channels invalidate queries instantly, with polling as a safety net, plus desk notification sounds.
