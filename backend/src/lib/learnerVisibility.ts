import { prisma } from "./prisma.js";
import { Prisma } from "../generated/prisma/client.js";

export interface ArchivedLearnerIds {
  /** `StudentProfile.userId` values (learners with an account). */
  studentIds: string[];
  /** `StudentRoster.id` values (roster-only learners). */
  rosterIds: string[];
}

const EMPTY: ArchivedLearnerIds = { studentIds: [], rosterIds: [] };
const TTL_MS = 10_000;

let cache: { at: number; ids: ArchivedLearnerIds } | null = null;

/**
 * A to-one relation a learner can ride on a desk row, plus its nullable FK.
 * `roster: false` means the related model has no `rosterId` column (e.g.
 * `AdmLearnerProfile`, which only links a registered learner).
 */
export interface ArchivedReference {
  relation: string;
  fk: string;
  /** Does the related model carry the roster identity too? Defaults to true. */
  roster?: boolean;
  /**
   * Is the related model's `studentId` nullable? `AdmLearnerProfile.studentId`
   * is required (every ADM case is a registered learner), so its filter must
   * not ask for `studentId: null`.
   */
  studentNullable?: boolean;
}

/**
 * Null-safe Prisma fragment that hides rows whose learner was archived by
 * their adviser, for models that reach the learner through a to-one relation
 * (`referral`, `intervention`, `admLearnerProfile`).
 *
 * A plain `NOT: { OR: [{ intervention: { studentId: { in: ids } } }, …] }`
 * looks right but drops rows on SQL three-valued logic: a roster-only
 * intervention has `studentId = NULL`, so `NOT (NULL IN (…))` is `NULL`, not
 * true — which hid every intervention booking from the guidance/nurse
 * calendars whenever any archived profile learner existed. Negate each
 * identity side *inside* the relation and explicitly let NULL through, and
 * also let rows with no such relation through (a null relation filter is
 * false, so `{ intervention: … }` alone would drop referral-only sessions).
 */
export function excludeArchivedReferences(
  ids: ArchivedLearnerIds,
  refs: readonly ArchivedReference[],
): any {
  const clauses: any[] = [];
  for (const ref of refs) {
    const outside: any[] = [];
    if (ids.studentIds.length > 0) {
      outside.push(
        ref.studentNullable === false
          ? { studentId: { notIn: ids.studentIds } }
          : { OR: [{ studentId: null }, { studentId: { notIn: ids.studentIds } }] },
      );
    }
    if (ref.roster !== false && ids.rosterIds.length > 0) {
      outside.push({ OR: [{ rosterId: null }, { rosterId: { notIn: ids.rosterIds } }] });
    }
    if (outside.length === 0) continue;
    clauses.push({
      OR: [{ [ref.fk]: null }, { [ref.relation]: { AND: outside } }],
    });
  }
  return clauses.length > 0 ? { AND: clauses } : {};
}

/**
 * Prisma `where` fragment that hides counseling sessions belonging to
 * archived (adviser-removed) learners. Sessions ride either a referral or an
 * intervention, so both pipelines have to be covered — otherwise a deleted
 * learner keeps blocking slots on the counselor's booking calendar.
 */
export function excludeArchivedSessionLearners(ids: ArchivedLearnerIds): any {
  return excludeArchivedReferences(ids, [
    { relation: "referral", fk: "referralId" },
    { relation: "intervention", fk: "interventionId" },
  ]);
}

/**
 * Learners their section adviser removed from the advisory list.
 *
 * `AdviserArchivedStudent` is per adviser, so a row only applies while that
 * teacher is still the adviser of the learner's current section. A section
 * hand-over or a new school year therefore restores visibility everywhere
 * without deleting the archive row (the adviser desk lists rows per year).
 *
 * Cached for a few seconds because every desk board asks for it per request.
 */
export async function archivedAdvisoryLearnerIds(): Promise<ArchivedLearnerIds> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.ids;

  const rows = await prisma.adviserArchivedStudent.findMany({
    select: { teacherId: true, studentId: true, rosterId: true },
  });
  if (rows.length === 0) {
    cache = { at: Date.now(), ids: EMPTY };
    return EMPTY;
  }

  const studentIds = rows.map((r) => r.studentId).filter((id): id is string => !!id);
  const rosterIds = rows.map((r) => r.rosterId).filter((id): id is string => !!id);

  const [profiles, rosters] = await Promise.all([
    studentIds.length > 0
      ? prisma.studentProfile.findMany({
          where: { userId: { in: studentIds } },
          select: { userId: true, section: { select: { adviserId: true } } },
        })
      : Promise.resolve([]),
    rosterIds.length > 0
      ? prisma.studentRoster.findMany({
          where: { id: { in: rosterIds } },
          select: { id: true, section: { select: { adviserId: true } } },
        })
      : Promise.resolve([]),
  ]);

  const adviserByStudent = new Map(
    profiles
      .filter((p) => p.section?.adviserId)
      .map((p) => [p.userId, p.section!.adviserId as string]),
  );
  const adviserByRoster = new Map(
    rosters
      .filter((r) => r.section?.adviserId)
      .map((r) => [r.id, r.section!.adviserId as string]),
  );

  const ids: ArchivedLearnerIds = {
    studentIds: [
      ...new Set(
        rows
          .filter(
            (r) => r.studentId && adviserByStudent.get(r.studentId) === r.teacherId,
          )
          .map((r) => r.studentId as string),
      ),
    ],
    rosterIds: [
      ...new Set(
        rows
          .filter((r) => r.rosterId && adviserByRoster.get(r.rosterId) === r.teacherId)
          .map((r) => r.rosterId as string),
      ),
    ],
  };

  cache = { at: Date.now(), ids };
  return ids;
}

/** Drop the memo so an archive/restore shows up on the next read. */
export function clearArchivedLearnerCache(): void {
  cache = null;
}

/**
 * True when the learner is currently hidden by their own section adviser.
 * Detail routes gate on `section.adviserId === requester`, so membership here
 * means *this* adviser archived them — their per-student endpoints must 404
 * exactly like they do for a learner outside the advisory.
 */
export async function isArchivedAdvisoryLearner(ref: {
  studentId?: string | null;
  rosterId?: string | null;
}): Promise<boolean> {
  const ids = await archivedAdvisoryLearnerIds();
  if (ref.studentId && ids.studentIds.includes(ref.studentId)) return true;
  if (ref.rosterId && ids.rosterIds.includes(ref.rosterId)) return true;
  return false;
}

/** Prisma fragment for `StudentProfile` queries. */
export function excludeArchivedProfiles(
  ids: ArchivedLearnerIds,
): { userId?: { notIn: string[] } } {
  return ids.studentIds.length > 0 ? { userId: { notIn: ids.studentIds } } : {};
}

/**
 * LRNs of archived (adviser-removed) learners. The SF10 store is keyed by LRN
 * with no account relation, so hiding archived learners there is an LRN
 * comparison (`lrn: { notIn: [...] }`) rather than a relation filter.
 */
export async function archivedAdvisoryLrns(
  ids?: ArchivedLearnerIds,
): Promise<string[]> {
  const archived = ids ?? (await archivedAdvisoryLearnerIds());
  if (archived.studentIds.length === 0 && archived.rosterIds.length === 0) return [];
  const [profiles, rosters] = await Promise.all([
    archived.studentIds.length > 0
      ? prisma.studentProfile.findMany({
          where: { userId: { in: archived.studentIds } },
          select: { lrn: true },
        })
      : Promise.resolve([]),
    archived.rosterIds.length > 0
      ? prisma.studentRoster.findMany({
          where: { id: { in: archived.rosterIds } },
          select: { lrn: true },
        })
      : Promise.resolve([]),
  ]);
  return [...new Set([...profiles, ...rosters].map((r) => r.lrn))];
}

/** Prisma fragment for `StudentRoster` queries. */
export function excludeArchivedRosters(
  ids: ArchivedLearnerIds,
): { id?: { notIn: string[] } } {
  return ids.rosterIds.length > 0 ? { id: { notIn: ids.rosterIds } } : {};
}

/**
 * Raw-SQL fragment for hand-written queries (raw SQL cannot take a Prisma
 * `where` object). `alias` is the roster table alias used in the query.
 */
export function excludeArchivedRostersSql(
  ids: ArchivedLearnerIds,
  alias = "r",
): Prisma.Sql {
  return ids.rosterIds.length > 0
    ? Prisma.sql`AND ${Prisma.raw(`${alias}."id"`)} NOT IN (${Prisma.join(ids.rosterIds)})`
    : Prisma.empty;
}

/** Prisma fragment matching grade/attendance rows (dual identity). */
export function excludeArchivedLearnerRows(
  ids: ArchivedLearnerIds,
): { AND?: Record<string, unknown>[] } {
  // Dual identity is studentId XOR rosterId, so a plain `NOT: { OR: [...] }`
  // silently drops every row whose *other* column is NULL (SQL three-valued
  // logic: `NULL NOT IN (...)` is NULL, not true). That hid every registered
  // learner's grades from the registry overview feeds whenever any roster-only
  // learner was archived. Negate each side only when that side is archived and
  // let NULL rows on the other side through.
  const clauses: Record<string, unknown>[] = [];
  if (ids.studentIds.length > 0) {
    clauses.push({ OR: [{ studentId: null }, { studentId: { notIn: ids.studentIds } }] });
  }
  if (ids.rosterIds.length > 0) {
    clauses.push({ OR: [{ rosterId: null }, { rosterId: { notIn: ids.rosterIds } }] });
  }
  return clauses.length > 0 ? { AND: clauses } : {};
}
