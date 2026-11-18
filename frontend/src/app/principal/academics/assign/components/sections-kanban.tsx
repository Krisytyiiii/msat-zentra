"use client";

import * as React from "react";
import {
  Check,
  Copy,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserRoundPen,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Pill } from "@/components/ui/pill";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import type { GradeLevel, Section } from "@/services/principal/assign.types";
import styles from "./sections-kanban.module.css";

export const GRADES: GradeLevel[] = [7, 8, 9, 10, 11, 12];

type StatusKey = "claimed" | "awaiting" | "unassigned";

const CLAIMED_AT_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatClaimedAt(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : CLAIMED_AT_FORMAT.format(date);
}

function statusOf(section: Section): StatusKey {
  if (section.adviserId) return "claimed";
  if (section.adviserName) return "awaiting";
  return "unassigned";
}

interface SectionsKanbanProps {
  sections: Section[];
  grade: GradeLevel | null;
  onGradeChange: (grade: GradeLevel | null) => void;
  pendingIds: ReadonlySet<string>;
  /** Any board-wide mutation in flight — disables every section action. */
  busy: boolean;
  copiedCode: string | null;
  onCopyCode: (code: string) => void;
  onAssign: (section: Section) => void;
  onClear: (sectionId: string) => void;
  onRegenerate: (sectionId: string) => void;
  onDelete: (section: Section) => void;
  onCreate: () => void;
}

/**
 * Advisory assignment workspace: a grade scope + search row, then one section
 * per card in a grade-sorted grid. Status is shown per section, not aggregated
 * on the page.
 */
export function SectionsKanban({
  sections,
  grade,
  onGradeChange,
  pendingIds,
  busy,
  copiedCode,
  onCopyCode,
  onAssign,
  onClear,
  onRegenerate,
  onDelete,
  onCreate,
}: SectionsKanbanProps) {
  const [query, setQuery] = React.useState("");

  const visibleSections = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = sections.filter((s) => {
      if (grade != null && s.gradeLevel !== grade) return false;
      if (!needle) return true;
      return (
        s.name.toLowerCase().includes(needle) ||
        (s.adviserName ?? "").toLowerCase().includes(needle) ||
        (s.adviserCode ?? "").toLowerCase().includes(needle)
      );
    });
    return [...rows].sort((a, b) => {
      if (a.gradeLevel !== b.gradeLevel) return a.gradeLevel - b.gradeLevel;
      return a.name.localeCompare(b.name);
    });
  }, [sections, grade, query]);

  const filtersActive = grade != null || query.trim().length > 0;

  const boardEmpty = sections.length === 0;

  const rowActions = (
    s: Section,
    rowBusy: boolean,
    claimed: boolean,
    awaitingClaim: boolean,
    hasLinks: boolean,
  ) => {
    if (claimed) return null;
    const lockedHint =
      hasLinks && s.adviserName
        ? "Has linked learners or records — clear them first"
        : undefined;
    return (
      <div className={styles.cardActions}>
        <span className={styles.lockedHint}>
          {hasLinks && s.adviserName ? (
            <>
              <Lock size={10} aria-hidden /> Locked
            </>
          ) : null}
        </span>
        <Button
          size="xs"
          className={styles.rowBtn}
          aria-label={`${s.adviserName ? "Change" : "Assign"} adviser for ${s.name}`}
          title={lockedHint}
          disabled={rowBusy || (hasLinks && !!s.adviserName)}
          onClick={() => onAssign(s)}
        >
          <UserRoundPen size={12} aria-hidden />
          <span className={styles.rowBtnLabel}>
            {s.adviserName ? "Change" : "Assign"}
          </span>
        </Button>
        {awaitingClaim ? (
          <Button
            variant="ghost"
            size="xs"
            className={styles.rowBtn}
            aria-label={`Clear adviser for ${s.name}`}
            title={hasLinks ? "Has linked learners or records" : "Clear the listed adviser and code"}
            disabled={rowBusy || hasLinks}
            onClick={() => onClear(s.id)}
          >
            <X size={12} aria-hidden />
            <span className={styles.rowBtnLabel}>Clear</span>
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="xs"
          className={`${styles.rowBtn} ${styles.dangerGhost}`}
          aria-label={`Delete ${s.name} section`}
          title={hasLinks ? "Has linked learners or records" : undefined}
          disabled={rowBusy || hasLinks}
          onClick={() => onDelete(s)}
        >
          <Trash2 size={12} aria-hidden />
          <span className={styles.rowBtnLabel}>Delete</span>
        </Button>
      </div>
    );
  };

  const statusBadge = (s: Section) => {
    const key = statusOf(s);
    if (key === "claimed") {
      return (
        <Pill tone="green" label="Adviser status">
          <Check size={11} aria-hidden />
          Claimed
        </Pill>
      );
    }
    if (key === "awaiting") {
      return (
        <Pill tone="amber" label="Adviser status">
          Awaiting claim
        </Pill>
      );
    }
    return (
      <Pill tone="neutral" label="Adviser status">
        Unassigned
      </Pill>
    );
  };

  const codeBlock = (s: Section, rowBusy: boolean, canRegenerate: boolean) => {
    const code = s.adviserCode ?? "";
    if (!code) return null;
    return (
      <div className={styles.codeRow}>
        <Pill tone="violet" label="Advisory code" className={styles.codePill}>
          {code}
        </Pill>
        <Button
          variant="ghost"
          size="icon-xs"
          className={styles.codeBtn}
          aria-label={`Copy advisory code for ${s.name}`}
          title="Copy advisory code"
          disabled={rowBusy}
          onClick={() => onCopyCode(code)}
        >
          {copiedCode === code ? (
            <Check size={12} aria-hidden />
          ) : (
            <Copy size={12} aria-hidden />
          )}
        </Button>
        {canRegenerate ? (
          <Button
            variant="ghost"
            size="icon-xs"
            className={styles.codeBtn}
            aria-label={`Regenerate advisory code for ${s.name}`}
            title="Mint a replacement code — the old one stops working"
            disabled={rowBusy}
            onClick={() => onRegenerate(s.id)}
          >
            <RefreshCw size={12} aria-hidden />
          </Button>
        ) : null}
      </div>
    );
  };

  return (
    <section className={styles.board} aria-label="Section advisers">
      <header className={styles.header}>
        <div className={styles.headerText}>
          <div className={styles.titleRow}>
            <span className={styles.titleIcon} aria-hidden>
              <Users size={16} />
            </span>
            <h2 className={styles.title}>Advisory assignments</h2>
          </div>
          <p className={styles.subtitle}>
            Seat a class adviser per section, then hand them the advisory code
            so they can claim the record.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Button
            size="sm"
            className="h-6 px-2 text-[12px]"
            onClick={onCreate}
            disabled={busy}
          >
            <Plus size={14} aria-hidden />
            Assign Advisory
          </Button>
        </div>
      </header>

      {!boardEmpty ? (
        <div className={styles.toolbar}>
          <FilterTabs
            label="Filter by grade level"
            options={[
              { value: "all", label: "All grades" },
              ...GRADES.map((g) => ({ value: String(g), label: `Grade ${g}` })),
            ]}
            value={grade == null ? "all" : String(grade)}
            onChange={(next) =>
              onGradeChange(next === "all" ? null : (Number(next) as GradeLevel))
            }
          />
          <InputGroup className="w-60 max-w-full shrink-0 rounded-[16px]">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Find a section, adviser, or code…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Find a section"
            />
            {query ? (
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-xs"
                  aria-label="Clear search"
                  title="Clear search"
                  onClick={() => setQuery("")}
                >
                  <X aria-hidden />
                </InputGroupButton>
              </InputGroupAddon>
            ) : null}
          </InputGroup>
        </div>
      ) : null}

      {visibleSections.length === 0 ? (
        <PageEmptyCallout>
          {boardEmpty ? (
            <>
              No sections yet for this school year. Use{" "}
              <strong>Assign Advisory</strong> to create the first one.
            </>
          ) : filtersActive ? (
            <>
              <strong>No sections match these filters.</strong> Try another
              grade or search.
            </>
          ) : (
            <>No sections to show.</>
          )}
        </PageEmptyCallout>
      ) : (
        <div className={styles.grid} aria-label="Sections">
          {visibleSections.map((s, index) => {
            const pending = pendingIds.has(s.id);
            const claimed = statusOf(s) === "claimed";
            const awaitingClaim = statusOf(s) === "awaiting";
            const rowBusy = pending || busy;
            const hasLinks = (s.studentCount ?? 0) + (s.recordCount ?? 0) > 0;
            const claimedAtLabel = claimed ? formatClaimedAt(s.adviserClaimedAt) : null;
            const learnerCount = s.studentCount ?? 0;
            const recordCount = s.recordCount ?? 0;

            return (
              <article
                key={s.id}
                className={`${styles.card} ${claimed ? styles.cardClaimed : ""}`}
                aria-busy={pending || undefined}
                aria-label={`${s.name} section adviser`}
                style={{ animationDelay: `${Math.min(index, 11) * 35}ms` }}
              >
                <header className={styles.cardHead}>
                  <StudentMascot
                    name={s.adviserName || s.name}
                    seed={s.adviserId || s.id}
                    size={36}
                  />
                  <div className={styles.cardId}>
                    <span className={styles.sectionName} title={s.name}>
                      {s.name}
                    </span>
                    <span className={styles.teacher} title={s.adviserName || undefined}>
                      {pending ? (
                        <span className={styles.pendingWrap}>
                          <Loader2 className={styles.pendingSpin} aria-hidden />
                          {s.adviserName || "Assigning…"}
                        </span>
                      ) : s.adviserName ? (
                        s.adviserName
                      ) : (
                        <span className={styles.teacherNone}>No adviser named</span>
                      )}
                    </span>
                  </div>
                  <Pill field="grade" className={styles.gradePill}>
                    {`Grade ${s.gradeLevel}`}
                  </Pill>
                </header>

                <div className={styles.metaRow}>
                  {statusBadge(s)}
                  {codeBlock(s, rowBusy, awaitingClaim)}
                </div>

                {hasLinks ? (
                  <div className={styles.linksRow}>
                    <span className={styles.linkStat}>
                      <Users size={11} aria-hidden />
                      {learnerCount} learner{learnerCount === 1 ? "" : "s"}
                    </span>
                    <span className={styles.linkStat}>
                      <Lock size={11} aria-hidden />
                      {recordCount} linked record{recordCount === 1 ? "" : "s"}
                    </span>
                  </div>
                ) : null}

                {claimed ? (
                  <p className={`${styles.notice} ${styles.claimedNotice}`}>
                    <Check size={11} aria-hidden />
                    <span>
                      Claimed by <strong>{s.adviserName}</strong>
                      {claimedAtLabel ? <> on {claimedAtLabel}</> : null}.
                    </span>
                  </p>
                ) : awaitingClaim && s.adviserCode ? (
                  <p className={`${styles.notice} ${styles.claimNotice}`}>
                    <RefreshCw size={11} aria-hidden />
                    <span>
                      Share the code with <strong>{s.adviserName}</strong> so they
                      can claim the seat.
                    </span>
                  </p>
                ) : null}

                {!claimed ? rowActions(s, rowBusy, claimed, awaitingClaim, hasLinks) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
