import type { Request } from "express";
import { prisma } from "./prisma.js";
import { canSteerTerm } from "./roles.js";

export interface TermScope {
  schoolYearId: string;
  schoolYearName: string;
  termId: string;
  termNumber: number;
  startDate: string | null;
  endDate: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      termScope?: TermScope;
    }
  }
}

function single(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const first = value.find((v) => typeof v === "string" && (v as string).trim());
    return typeof first === "string" ? first.trim() : undefined;
  }
  return undefined;
}

function header(req: Request, name: string): string | undefined {
  return single(req.headers[name]);
}

/**
 * `attachTermScope` runs before routing, so this resolution happens on **every**
 * `/api` request — including unauthenticated ones and 404s. Un-memoized that was
 * one extra pooler round trip per request (measured 465 ms → 925 ms for an
 * unmatched `/api/*` path on a 2026-11-18 run, at ~460 ms RTT), and it made a
 * Redis cache HIT cost as much as a cache BYPASS.
 *
 * The rows involved (active school year + its terms, or one addressed term/year)
 * change a handful of times a year, so a short in-process TTL is enough; the
 * write paths that create terms/years also call `invalidateTermScopeCache()` so a
 * freshly created year is visible immediately.
 */
const SCOPE_TTL_MS = 30_000;
/** Cache keys are ids, so this is really an OOM guard for a misbehaving caller. */
const SCOPE_CACHE_MAX = 200;

const scopeCache = new Map<string, { value: TermScope | null; expiresAt: number }>();
const scopeInflight = new Map<string, Promise<TermScope | null>>();

/** Drop every memoized scope — call after creating/activating terms or school years. */
export function invalidateTermScopeCache(): void {
  scopeCache.clear();
  scopeInflight.clear();
}

function memoScope(
  key: string,
  load: () => Promise<TermScope | null>,
): Promise<TermScope | null> {
  const now = Date.now();
  const hit = scopeCache.get(key);
  if (hit && hit.expiresAt > now) return Promise.resolve(hit.value);

  // Single-flight: a burst of parallel requests (a desk mounting 6 queries)
  // must not each pay the same round trip.
  const pending = scopeInflight.get(key);
  if (pending) return pending;

  const load$ = load()
    .then((value) => {
      if (scopeCache.size >= SCOPE_CACHE_MAX) {
        const oldest = scopeCache.keys().next().value;
        if (oldest !== undefined) scopeCache.delete(oldest);
      }
      scopeCache.set(key, { value, expiresAt: Date.now() + SCOPE_TTL_MS });
      return value;
    })
    .finally(() => {
      scopeInflight.delete(key);
    });

  scopeInflight.set(key, load$);
  return load$;
}

export async function resolveTermScope(
  req: Request,
  role?: string | null,
): Promise<TermScope | null> {
  // The administrator console reads system-wide aggregates only; it never
  // touches term-scoped data, so skip the active-year lookup entirely.
  if (role === "admin") return null;

  // Teacher roles steer the term per desk; the principal steers it once in
  // Settings and every principal page follows the pick. Every other role —
  // and unauthenticated callers — always resolves server-side (active school
  // year → current term), so their desks can never be steered by (or leak)
  // another desk's term selection.
  const steersTerm = canSteerTerm(role);

  const qYear = steersTerm
    ? single((req.query as Record<string, unknown>).schoolYearId)
    : undefined;
  const qTerm = steersTerm
    ? single((req.query as Record<string, unknown>).termId)
    : undefined;
  const hYear = steersTerm ? header(req, "x-school-year-id") : undefined;
  const hTerm = steersTerm ? header(req, "x-term-id") : undefined;

  const termId = qTerm ?? hTerm;
  const yearId = qYear ?? hYear;

  if (termId) {
    const scoped = await memoScope(`term:${termId}`, async () => {
      const term = await prisma.term.findUnique({
        where: { id: termId },
        select: {
          id: true,
          termNumber: true,
          startDate: true,
          endDate: true,
          schoolYearId: true,
          schoolYear: { select: { id: true, name: true } },
        },
      });
      if (!term?.schoolYear) return null;
      return {
        schoolYearId: term.schoolYear.id,
        schoolYearName: term.schoolYear.name,
        termId: term.id,
        termNumber: term.termNumber,
        startDate: term.startDate?.toISOString() ?? null,
        endDate: term.endDate?.toISOString() ?? null,
      };
    });
    if (scoped) return scoped;
  }

  if (yearId) {
    const scoped = await memoScope(`year:${yearId}`, async () => {
      const year = await prisma.schoolYear.findUnique({
        where: { id: yearId },
        select: {
          id: true,
          name: true,
          terms: {
            orderBy: { termNumber: "asc" },
            select: { id: true, termNumber: true, startDate: true, endDate: true },
          },
        },
      });
      const first = year ? pickCurrentTerm(year.terms) : null;
      if (!year || !first) return null;
      return {
        schoolYearId: year.id,
        schoolYearName: year.name,
        termId: first.id,
        termNumber: first.termNumber,
        startDate: first.startDate?.toISOString() ?? null,
        endDate: first.endDate?.toISOString() ?? null,
      };
    });
    if (scoped) return scoped;
  }

  return memoScope("active", async () => {
    const activeYear = await prisma.schoolYear.findFirst({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        terms: {
          orderBy: { termNumber: "asc" },
          select: { id: true, termNumber: true, startDate: true, endDate: true },
        },
      },
    });
    const fallback = activeYear ? pickCurrentTerm(activeYear.terms) : null;
    if (!activeYear || !fallback) return null;
    return {
      schoolYearId: activeYear.id,
      schoolYearName: activeYear.name,
      termId: fallback.id,
      termNumber: fallback.termNumber,
      startDate: fallback.startDate?.toISOString() ?? null,
      endDate: fallback.endDate?.toISOString() ?? null,
    };
  });
}

export function getTermScope(req: Request): TermScope | null {
  return req.termScope ?? null;
}

interface TermDateRow {
  startDate: Date | null;
  endDate: Date | null;
}

export function pickCurrentTerm<T extends TermDateRow>(terms: T[]): T | null {
  if (terms.length === 0) return null;
  const today = new Date().toISOString().slice(0, 10);
  const day = (d: Date | null, fallback: string) =>
    d ? d.toISOString().slice(0, 10) : fallback;
  return (
    terms.find(
      (t) => day(t.startDate, "0000-01-01") <= today && today <= day(t.endDate, "9999-12-31"),
    ) ?? terms[0]!
  );
}

export interface TermScopeInput {
  schoolYearId?: string | null;
  termId?: string | null;
}

export function scopedTermId(req: Request): string | null {
  return req.termScope?.termId ?? null;
}

export function scopedSchoolYearId(req: Request): string | null {
  return req.termScope?.schoolYearId ?? null;
}

export function schoolYearWhere(
  req: Request,
): { schoolYearId: string } | { schoolYear: { isActive: boolean } } {
  const id = req.termScope?.schoolYearId;
  return id ? { schoolYearId: id } : { schoolYear: { isActive: true } };
}

export interface ScopedTermRow {
  id: string;
  termNumber: number;
  startDate: Date | null;
  endDate: Date | null;
  schoolYearId: string | null;
  schoolYearName: string | null;
}

export async function scopedTermRow(req: Request): Promise<ScopedTermRow | null> {
  const s = req.termScope;
  if (s) {
    return {
      id: s.termId,
      termNumber: s.termNumber,
      startDate: s.startDate ? new Date(s.startDate) : null,
      endDate: s.endDate ? new Date(s.endDate) : null,
      schoolYearId: s.schoolYearId,
      schoolYearName: s.schoolYearName,
    };
  }
  const candidates = await prisma.term.findMany({
    where: { schoolYear: { isActive: true } },
    orderBy: { termNumber: "asc" },
    select: {
      id: true,
      termNumber: true,
      startDate: true,
      endDate: true,
      schoolYearId: true,
      schoolYear: { select: { name: true } },
    },
  });
  const t = pickCurrentTerm(candidates);
  return t
    ? {
        id: t.id,
        termNumber: t.termNumber,
        startDate: t.startDate,
        endDate: t.endDate,
        schoolYearId: t.schoolYearId,
        schoolYearName: t.schoolYear.name,
      }
    : null;
}

export async function scopedYearId(req: Request): Promise<string | null> {
  if (req.termScope) return req.termScope.schoolYearId;
  const y = await prisma.schoolYear.findFirst({
    where: { isActive: true },
    select: { id: true },
  });
  return y?.id ?? null;
}
