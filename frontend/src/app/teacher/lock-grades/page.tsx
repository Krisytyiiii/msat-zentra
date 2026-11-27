"use client";

import * as React from "react";
import { TeacherSearchField, searchEmptyMessage } from "@/app/teacher/components/TeacherSearchField";
import { TeacherGateCard } from "@/app/teacher/components/TeacherGateCard";
import { InsightCallout } from "@/components/ui/insight-callout";
import { FilterTabs, type FilterTabOption } from "@/components/ui/filter-tabs";
import { useTerm } from "@/lib/term/TermContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import { Pagination } from "@/components/shared/pagination";
import { useLockGrades, type LockGradesView, type LockGradesAdviseeRow } from "@/services/teacher/lockGrades.service";
import { LockGradesAdviseeTable } from "./components/advisee-card";
import { LockGradesClassCards, LockGradesCardsSkeleton } from "./components/class-card";
import styles from "./components/lock-grades.module.css";

const ADVISEES_PAGE_SIZE = 15;

/** Centered empty/insight note — same callout shape used across teacher desks. */
function EmptyCallout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full justify-center py-10">
      <InsightCallout role="status" className="w-full max-w-md text-left">
        {children}
      </InsightCallout>
    </div>
  );
}

/** Gate card — same shape as the My Classes action card, deep-linking there. */
function GateCard({
  title,
  description,
  status,
  facts,
  actionLabel,
}: {
  title: string;
  description: string;
  status: string;
  facts?: string[];
  actionLabel?: string;
}) {
  const { activeTerm } = useTerm();
  const termLabel = activeTerm
    ? `${activeTerm.schoolYearName} · Term ${activeTerm.termNumber}`
    : "this term";

  return (
    <TeacherGateCard
      title={title}
      subtitle="Lock grades follows your linked teacher row"
      status={status}
      description={description}
      termLabel={termLabel}
      facts={facts}
      actionLabel={actionLabel}
    />
  );
}

/** Loading state shaped like the loaded data list — search at the right, then
 *  the same column anatomy — so the swap causes no shift. */
function TableSkeleton() {
  return (
    <ShimmerGroup>
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading lock grades">
        <div className="flex items-center justify-end">
          <Skeleton className="h-8 w-60 max-w-full" />
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-card dark:bg-transparent">
          <div className="flex items-center gap-4 border-b border-border px-4 py-2.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="ml-auto h-3 w-12" />
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3 w-12" />
          </div>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-b border-border/60 px-4 py-3 last:border-b-0"
            >
              <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-3.5 w-40 max-w-full" />
                <Skeleton className="h-3 w-24 max-w-full" />
              </div>
              <Skeleton className="ml-auto h-3 w-16" />
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      </div>
    </ShimmerGroup>
  );
}

const MODE_OPTIONS: ReadonlyArray<FilterTabOption<LockGradesView>> = [
  { value: "classes", label: "Subjects", tone: "blue" },
  { value: "advisees", label: "Advisees", tone: "amber" },
];

/**
 * Learner lock-status table shared by both modes: search over learner, LRN,
 * section and subject, then page the same 15-row data list as the advisory
 * list desk. Clicking a row's Grades action opens the per-subject drawer.
 */
function LearnerLockTable({ rows }: { rows: LockGradesAdviseeRow[] }) {
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);

  const needle = search.trim().toLowerCase();
  const filtered = React.useMemo(
    () =>
      needle
        ? rows.filter((row) =>
            `${row.name} ${row.lrn} ${row.section} ${row.subjects
              .map((s) => s.subject)
              .join(" ")}`
              .toLowerCase()
              .includes(needle),
          )
        : rows,
    [rows, needle],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / ADVISEES_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (safePage - 1) * ADVISEES_PAGE_SIZE,
    safePage * ADVISEES_PAGE_SIZE,
  );

  return (
    <div className="flex flex-col gap-3">
      <div className={styles.toolbar} style={{ justifyContent: "flex-end" }}>
        <TeacherSearchField
          className="w-60 max-w-full"
          value={search}
          onChange={(next) => {
            setSearch(next);
            setPage(1);
          }}
          placeholder="Search learner, LRN or subject…"
          aria-label="Search learner, LRN or subject"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyCallout>
          {needle ? (
            searchEmptyMessage(
              search,
              "learners",
              "Clear the search to see every learner in your classes.",
            )
          ) : (
            <>
              <strong>No learners yet.</strong> Learners appear here once they are
              enlisted in your sections.
            </>
          )}
        </EmptyCallout>
      ) : (
        <>
          <LockGradesAdviseeTable rows={pageRows} />
          <Pagination
            currentPage={safePage}
            totalItems={filtered.length}
            pageSize={ADVISEES_PAGE_SIZE}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}

function ClassesMode() {
  const query = useLockGrades("classes");

  if (query.isPending && !query.data) {
    return (
      <div className="flex flex-col gap-4">
        <LockGradesCardsSkeleton />
        <section className="flex flex-col gap-2" aria-busy="true" aria-label="Loading learner lock status">
          <Skeleton className="h-3.5 w-40" />
          <TableSkeleton />
        </section>
      </div>
    );
  }

  if (query.isError || !query.data) {
    return <p className={styles.error}>Could not load your classes. Check your connection and try again.</p>;
  }

  const data = query.data;
  if (!data.isSubjectTeacher) {
    return (
      <GateCard
        title="Link your teacher code"
        status="Not linked yet"
        description="Lock statuses appear only for a linked teacher. Link the code printed beside your name on My Classes and this board fills with your classes."
        facts={[
          "The code sits beside your name in the administrator's teacher list.",
          "Linking attaches your subject × section load to this login.",
          "Locking still happens in the gradebook — this desk only reads status.",
        ]}
      />
    );
  }

  if (!data.gates.linked) {
    return (
      <GateCard
        title="Link your teacher code"
        status="Not linked yet"
        description="Your classes appear here only after you link the teacher code printed beside your name. The link button opens the form on My Classes."
        facts={[
          "One code per teacher row, valid for the whole school year.",
          "Lock statuses are read-only on this desk.",
        ]}
      />
    );
  }

  if (!data.gates.termGrant) {
    return (
      <GateCard
        title="Open this term"
        status="Term not entered"
        description="Your classes appear here only after you enter this term's code on My Classes. Nothing needs relinking — just open the term."
        facts={[
          "The entry carries to every term of this school year.",
          "The term picker in the top bar decides which grid you see.",
        ]}
        actionLabel="Enter term"
      />
    );
  }

  if (data.classes.length === 0) {
    return (
      <GateCard
        title="No classes assigned yet"
        status="No classes"
        description="Your linked load is empty for this term — classes appear once the administrator publishes the section grid with your teacher row on it."
        facts={[
          "Your load follows the linked teacher row, not a manual pick.",
          "Ask the administrator if your subjects are missing from the grid.",
        ]}
        actionLabel="Open classes"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <LockGradesClassCards rows={data.classes} />
      <section className="flex flex-col gap-2" aria-label="Learner lock status">
        <h3 className="m-0 text-[13px] font-semibold text-foreground">Learner lock status</h3>
        <LearnerLockTable rows={data.learners ?? []} />
      </section>
    </div>
  );
}

function AdviseesMode() {
  const query = useLockGrades("advisees");
  const [sectionId, setSectionId] = React.useState<string>("all");

  if (query.isPending && !query.data) return <TableSkeleton />;

  if (query.isError || !query.data) {
    return (
      <EmptyCallout>
        <strong>No advisory section assigned.</strong> Advisee lock statuses are
        scoped to your advisory section. Claim your advisory in Settings, then
        come back.
      </EmptyCallout>
    );
  }

  const data = query.data;
  if (!data.isAdviser || data.advisorySections.length === 0) {
    return (
      <EmptyCallout>
        <strong>No advisory section assigned.</strong> Claim your advisory in
        Settings to see your advisees&apos; subject lock statuses here.
      </EmptyCallout>
    );
  }

  const sectionRows =
    sectionId === "all"
      ? data.advisees
      : data.advisees.filter((row) => row.sectionId === sectionId);

  return (
    <div className="flex flex-col gap-3">
      {data.advisorySections.length > 1 ? (
        <div className={styles.toolbar}>
          <Select
            value={sectionId}
            onValueChange={(value) => setSectionId(value)}
          >
            <SelectTrigger className="h-8 w-48 text-xs" aria-label="Advisory section">
              <SelectValue placeholder="All sections" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sections</SelectItem>
              {data.advisorySections.map((section) => (
                <SelectItem key={section.id} value={section.id}>
                  {section.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <LearnerLockTable rows={sectionRows} />
    </div>
  );
}

export default function TeacherLockGradesPage() {
  const classesQuery = useLockGrades("classes");
  const [mode, setMode] = React.useState<LockGradesView>("classes");

  // An adviser-only teacher opens straight on the read-only advisee board.
  const data = classesQuery.data;
  const canTeach = data?.isSubjectTeacher ?? false;
  const canAdvise = data?.isAdviser ?? false;
  const effectiveMode: LockGradesView =
    canTeach || !canAdvise ? mode : "advisees";

  return (
    <section className={styles.page} aria-label="Lock grades">
      {canTeach && canAdvise ? (
        <FilterTabs
          label="Lock grades view"
          variant="tags"
          options={MODE_OPTIONS}
          value={effectiveMode}
          onChange={setMode}
          className="self-end"
        />
      ) : null}

      {effectiveMode === "classes" ? <ClassesMode /> : <AdviseesMode />}
    </section>
  );
}
