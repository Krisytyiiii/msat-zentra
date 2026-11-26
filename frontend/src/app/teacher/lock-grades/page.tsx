"use client";

import * as React from "react";
import { Lock } from "lucide-react";
import { TeacherSearchField, searchEmptyMessage } from "@/app/teacher/components/TeacherSearchField";
import { TeacherGateCard } from "@/app/teacher/components/TeacherGateCard";
import { InsightCallout } from "@/components/ui/insight-callout";
import { useTerm } from "@/lib/term/TermContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/shared/pagination";
import { useLockGrades, type LockGradesView } from "@/services/teacher/lockGrades.service";
import { FilterTabs } from "@/app/teacher/advisory/interventions/components/filter-tabs";
import { LockGradesClassCard } from "./components/class-card";
import { LockGradesAdviseeCard } from "./components/advisee-card";
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

/** One placeholder card, shaped exactly like the loaded class / advisee card. */
function CardSkeleton() {
  return (
    <div className={styles.skelCard} aria-hidden="true">
      <div className={styles.cardHead}>
        <Skeleton className={styles.skelAvatar} />
        <div className={styles.cardId}>
          <Skeleton className="h-3.5 w-32 max-w-full" />
          <Skeleton className="h-3 w-24 max-w-full" />
        </div>
        <Skeleton className={styles.skelPill} />
      </div>
      <div className={styles.metaRow}>
        <Skeleton className={styles.skelMetaPill} />
        <Skeleton className={styles.skelMetaPill} style={{ width: "4rem" }} />
        <Skeleton className={styles.skelMetaPill} style={{ width: "4.5rem" }} />
      </div>
      <Skeleton className={styles.skelRail} />
      <Skeleton className="h-3 w-44 max-w-full" />
      <div className={styles.linksRow}>
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-24" />
      </div>
      <div className={styles.cardActions}>
        <Skeleton className="mr-auto h-3 w-24" />
        <Skeleton className={styles.skelAction} />
      </div>
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className={styles.skelGrid} aria-busy="true" aria-label="Loading lock grades">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

const MODE_OPTIONS: { value: LockGradesView; label: string }[] = [
  { value: "classes", label: "My Classes" },
  { value: "advisees", label: "My Advisees" },
];

function ClassesMode() {
  const query = useLockGrades("classes");

  if (query.isPending && !query.data) return <BoardSkeleton />;

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

  return (
    <div className="flex flex-col gap-3">
      {data.classes.length === 0 ? (
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
      ) : (
        <div className={`${styles.grid} ${styles.gridEnter}`}>
          {data.classes.map((row) => (
            <LockGradesClassCard key={row.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function AdviseesMode() {
  const query = useLockGrades("advisees");
  const [sectionId, setSectionId] = React.useState<string>("all");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);

  if (query.isPending && !query.data) return <BoardSkeleton />;

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

  const needle = search.trim().toLowerCase();
  const filtered = data.advisees.filter((row) => {
    if (sectionId !== "all" && row.sectionId !== sectionId) return false;
    if (needle && !`${row.name} ${row.lrn} ${row.section}`.toLowerCase().includes(needle)) {
      return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / ADVISEES_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (safePage - 1) * ADVISEES_PAGE_SIZE,
    safePage * ADVISEES_PAGE_SIZE,
  );

  return (
    <div className="flex flex-col gap-3">
      <div className={styles.toolbar}>
        {data.advisorySections.length > 1 ? (
          <Select
            value={sectionId}
            onValueChange={(value) => {
              setSectionId(value);
              setPage(1);
            }}
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
        ) : null}
        <TeacherSearchField
          className="w-60 max-w-full"
          value={search}
          onChange={(next) => {
            setSearch(next);
            setPage(1);
          }}
          placeholder="Search advisee or LRN…"
          aria-label="Search advisee or LRN"
        />
        <span className="text-xs text-muted-foreground">
          {filtered.length} advisee{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyCallout>
          {needle || sectionId !== "all" ? (
            searchEmptyMessage(
              needle ? search : "",
              "advisees",
              needle
                ? "Clear the search or pick another section to see every advisee."
                : "Pick another section to see every advisee.",
            )
          ) : (
            <>
              <strong>No advisees yet.</strong> Learners from your advisory section will
              appear here once they are enrolled.
            </>
          )}
        </EmptyCallout>
      ) : (
        <>
          <div className={`${styles.grid} ${styles.gridEnter}`}>
            {pageRows.map((row) => (
              <LockGradesAdviseeCard key={row.studentId} row={row} />
            ))}
          </div>
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

export default function TeacherLockGradesPage() {
  const classesQuery = useLockGrades("classes");
  const [mode, setMode] = React.useState<LockGradesView>("classes");

  // An adviser-only teacher opens straight on the read-only advisee board.
  const data = classesQuery.data;
  const canTeach = data?.isSubjectTeacher ?? false;
  const canAdvise = data?.isAdviser ?? false;
  const effectiveMode: LockGradesView =
    canTeach || !canAdvise ? mode : "advisees";

  // The gate card stands alone — hide the page title/subtitle while it shows.
  const gateActive =
    !!data &&
    effectiveMode === "classes" &&
    (!data.isSubjectTeacher ||
      !data.gates.linked ||
      !data.gates.termGrant ||
      data.classes.length === 0);

  return (
    <section className={styles.page} aria-label="Lock grades">
      {gateActive ? null : (
        <div className={styles.header}>
          <div className={styles.headerText}>
            <div className={styles.titleRow}>
              <span className={styles.titleIcon} aria-hidden>
                <Lock size={14} />
              </span>
              <h1 className={styles.title}>Lock Grades</h1>
            </div>
            <p className={styles.subtitle}>
              Review the lock status of your classes and advisees — read-only.
            </p>
          </div>
          {canTeach && canAdvise ? (
            <div className={styles.headerActions}>
              <FilterTabs
                label="Lock grades mode"
                options={MODE_OPTIONS}
                value={effectiveMode}
                onChange={setMode}
                tone="blue"
              />
            </div>
          ) : null}
        </div>
      )}

      {effectiveMode === "classes" ? <ClassesMode /> : <AdviseesMode />}
    </section>
  );
}
