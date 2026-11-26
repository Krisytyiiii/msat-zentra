import { prisma } from "../lib/prisma.js";
import { activeScheduleConfigForYear } from "../lib/schedule-config.js";
import {
  SCHEDULE_CONFIG_DEFAULTS,
  toScheduleConfig,
} from "../modules/teacher/teacher.labels.js";

export type NoClassScope = "whole_day" | "am" | "pm";

export interface NoClassEntry {
  date: string;
  scope: NoClassScope;
  reason: string;
}

export type NoClassMap = Map<string, { scope: NoClassScope; reason: string }>;

export type DayConfigLike = {
  startTime: string;
  periodMins: number;
  lunch: { afterPeriod: number; mins: number };
  morningRecess: { enabled: boolean; afterPeriod: number; mins: number };
  afternoonRecess: { enabled: boolean; afterPeriod: number; mins: number };
};

// The risk engine resolves a rate per learner, so the term's no-class map and
// day shape would otherwise cost two round trips per learner (tens of queries
// per board). Writes clear this through `clearNoClassCache`, the same way
// `bumpRiskCohortVersion` re-keys the live cohort; the TTL is only a backstop.
const CONTEXT_TTL_MS = 20_000;
const contextCache = new Map<
  string,
  { at: number; value: { map: NoClassMap; config: DayConfigLike } }
>();

export function clearNoClassCache(termId?: string) {
  if (termId) contextCache.delete(termId);
  else contextCache.clear();
}

export function dateKeyOf(value: Date | string): string {
  return (typeof value === "string" ? new Date(value) : value)
    .toISOString()
    .slice(0, 10);
}

/** No-class rows whose calendar date falls inside [from, to] (inclusive). */
export async function loadNoClassDays(
  from: string | null | undefined,
  to: string | null | undefined,
): Promise<NoClassMap> {
  const map: NoClassMap = new Map();
  if (!from || !to || from > to) return map;
  const rows = await prisma.noClassDay.findMany({
    where: {
      date: {
        gte: new Date(`${from}T00:00:00Z`),
        lte: new Date(`${to}T00:00:00Z`),
      },
    },
    select: { date: true, scope: true, reason: true },
  });
  for (const r of rows) {
    map.set(dateKeyOf(r.date), { scope: r.scope as NoClassScope, reason: r.reason });
  }
  return map;
}

/**
 * Term-scoped no-class map plus the school year's active day shape. The day
 * shape is what turns a 0-based timetable period into AM or PM (periods before
 * the lunch break are AM).
 */
export async function noClassContextForTerm(termId: string): Promise<{
  map: NoClassMap;
  config: DayConfigLike;
}> {
  const now = Date.now();
  const hit = contextCache.get(termId);
  if (hit && now - hit.at < CONTEXT_TTL_MS) return hit.value;

  const term = await prisma.term.findUnique({
    where: { id: termId },
    select: { startDate: true, endDate: true, schoolYearId: true },
  });
  if (!term) {
    return { map: new Map(), config: SCHEDULE_CONFIG_DEFAULTS };
  }
  const from = term.startDate ? dateKeyOf(term.startDate) : null;
  const to = term.endDate ? dateKeyOf(term.endDate) : null;
  const [map, cfgRow] = await Promise.all([
    loadNoClassDays(from, to),
    activeScheduleConfigForYear(term.schoolYearId),
  ]);
  const value = {
    map,
    config: cfgRow ? toScheduleConfig(cfgRow) : SCHEDULE_CONFIG_DEFAULTS,
  };
  contextCache.set(termId, { at: now, value });
  return value;
}

/** Which half of the school day a 0-based timetable period belongs to. */
export function periodSession(
  config: DayConfigLike,
  period: number,
): "am" | "pm" {
  return period < config.lunch.afterPeriod ? "am" : "pm";
}

/** Does this no-class declaration cancel the given period on that date? */
export function blocksPeriod(
  entry: { scope: NoClassScope } | undefined,
  config: DayConfigLike,
  period: number,
): boolean {
  if (!entry) return false;
  if (entry.scope === "whole_day") return true;
  return entry.scope === periodSession(config, period);
}

/** Does a legacy AM/PM sheet fall inside the cancelled window? */
export function blocksSession(
  entry: { scope: NoClassScope } | undefined,
  session: "AM" | "PM",
): boolean {
  if (!entry) return false;
  if (entry.scope === "whole_day") return true;
  return entry.scope === (session === "AM" ? "am" : "pm");
}

/** Whole-day cancellations only — the dates removed from daily denominators. */
export function wholeDayKeys(map: NoClassMap): Set<string> {
  const set = new Set<string>();
  for (const [key, entry] of map) {
    if (entry.scope === "whole_day") set.add(key);
  }
  return set;
}

/**
 * Cancel the day keys that had no classes in the given window. `"all"` (the
 * default) only drops whole-day cancellations — a day with a PM-only
 * cancellation still held morning classes. `"AM"` / `"PM"` additionally drop
 * that half-day's cancellations, for session-specific denominators.
 */
export function cancelDayKeys(
  keys: string[],
  map: NoClassMap,
  session: "AM" | "PM" | "all" = "all",
): string[] {
  return keys.filter((key) => {
    const entry = map.get(key);
    if (!entry) return true;
    if (entry.scope === "whole_day") return false;
    if (session === "all") return true;
    return entry.scope !== (session === "AM" ? "am" : "pm");
  });
}

/** Load + filter in one call, for services that only hold their day axis. */
export async function activeDayKeys(
  keys: string[],
  session: "AM" | "PM" | "all" = "all",
): Promise<string[]> {
  if (keys.length === 0) return keys;
  const sorted = [...keys].sort();
  const map = await loadNoClassDays(sorted[0], sorted[sorted.length - 1]);
  return cancelDayKeys(keys, map, session);
}

