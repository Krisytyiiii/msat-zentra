"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Award, HelpCircle, Loader2 } from "lucide-react";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { Pill, type PillTone } from "@/components/ui/pill";
import { KanbanOverlay } from "@/components/ui/kanban-overlay";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { useDock } from "@/components/dock/dock-store";
import { apiClient } from "@/lib/api/client";
import { toast } from "@/components/ui/sonner";
import { markSelfNotified } from "@/lib/realtime/coordinatorChannel";
import { apiErrorMessage } from "@/lib/api/errors";
import { useNowTick } from "@/lib/clock";
import { toSlug } from "@/lib/slug";
import { CERT_STATUS_META } from "@/services/coordinator/certifications.service";
import type {
  CertRecord,
  CertStatus,
  CertStatusFilter,
} from "@/services/coordinator/certifications.types";
import { CoordinatorCertificationsEndorseConfirm } from "./coordinator-certifications-endorse-confirm";
import { CoordinatorEmptyCard } from "../../components/CoordinatorEmptyCard";
import { SearchField } from "@/components/ui/search-field";
import { PAGE_SIZE, Pagination } from "@/components/shared/pagination";
import styles from "./coordinator-certifications-folders.module.css";

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const date = iso.slice(0, 10);
  const then = new Date(`${date}T00:00:00`).getTime();
  if (!Number.isFinite(then) || then < Date.UTC(2000, 0, 1)) return "—";
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

interface CoordinatorCertificationsFoldersProps {
  records: CertRecord[];
  query: string;
  onQueryChange: (value: string) => void;
  status: CertStatusFilter;
  onStatusChange: (value: CertStatusFilter) => void;
}

const DISPLAY_LIMIT = PAGE_SIZE;

/** Centered status tabs — same pattern as the referrals desk. */
const STATUS_TABS: { value: CertStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "prepared", label: "Prepared" },
  { value: "awaiting", label: "Awaiting" },
  { value: "revision", label: "Needs revision" },
  { value: "approved", label: "Approved" },
];

const STATUS_TONE: Record<CertStatus, PillTone> = {
  prepared: "amber",
  awaiting: "blue",
  revision: "red",
  approved: "green",
};

/* Glass-tag dot tones — the same palette the referrals / interventions desks
   use for their status filters. */
const STATUS_TAB_TONE: Record<
  CertStatusFilter,
  "neutral" | "amber" | "blue" | "red" | "green"
> = {
  all: "neutral",
  prepared: "amber",
  awaiting: "blue",
  revision: "red",
  approved: "green",
};

/* Row accent + status hint — the same read-only vocabulary the case file uses. */
const ROW_ACCENT: Record<CertStatus, string> = {
  prepared: styles.rowPrepared,
  awaiting: styles.rowAwaiting,
  revision: styles.rowRevision,
  approved: styles.rowApproved,
};

const STATUS_HINT: Record<CertStatus, string> = {
  prepared: "Ready to endorse",
  awaiting: "Locked · awaiting signature",
  revision: "Revise evidence, then forward",
  approved: "Signed",
};

/* Help legend — one entry per certification status, in the order a file moves
   through the desk. The pill uses the same tone as the list so the legend and
   the rows read as one vocabulary. */
const HELP_ITEMS: {
  status: CertStatus;
  title: string;
  text: string;
}[] = [
  {
    status: "prepared",
    title: "Ready to endorse",
    text: "The recommendation is recorded. Press Endorse under the folder to lock it and send it to the Principal for final signature.",
  },
  {
    status: "awaiting",
    title: "With the Principal",
    text: "The case is locked and waiting for the Principal's signature. Only the Principal can sign — you prepare and forward.",
  },
  {
    status: "revision",
    title: "Fix first",
    text: "The evidence chain is incomplete or the Principal returned the case. Open the case file, revise the evidence, then forward it again.",
  },
  {
    status: "approved",
    title: "Signed",
    text: "Signed by the Principal. Monitoring continues on the Enrolled Students page.",
  },
];

const ELIGIBILITY_LABEL = {
  eligible: "Eligible",
  ineligible: "Ineligible",
  pending: "For review",
} as const;

const ELIGIBILITY_TONE: Record<"eligible" | "ineligible" | "pending", PillTone> = {
  eligible: "green",
  ineligible: "red",
  pending: "amber",
};

/** Full date for a row tooltip (the cell itself shows a relative age). */
function fullDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";
}

export function CoordinatorCertificationsFolders({
  records,
  query,
  onQueryChange,
  status,
  onStatusChange,
}: CoordinatorCertificationsFoldersProps) {
  const queryClient = useQueryClient();
  const [forwardTarget, setForwardTarget] =
    React.useState<CertRecord | null>(null);
  const [helpOpen, setHelpOpen] = React.useState(false);

  const [forwardingId, setForwardingId] = React.useState<string | null>(null);
  const dock = useDock();

  const forwardMutation = useMutation({
    mutationFn: async ({
      id,
    }: {
      id: string;
      student: string;
      taskId: string | null;
    }) => {
      const { data } = await apiClient.patch(`/api/adm/${id}/stage`, {
        stage: "principal_approval",
      });
      return data;
    },
    onSuccess: (_data, vars) => {
      markSelfNotified(vars.id);
      void queryClient.invalidateQueries({
        queryKey: ["coordinator-certifications"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["coordinator-dashboard"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["coordinator-notifications"],
      });
      if (vars.taskId) {
        dock.completeTask(vars.taskId, `${vars.student} → Principal`);
      }
    },
    onError: (err, vars) => {
      if (vars.taskId) dock.failTask(vars.taskId, apiErrorMessage(err));
      toast.error({
        title: "Could not forward",
        description: apiErrorMessage(err),
      });
    },
    onSettled: () => setForwardingId(null),
  });

  /** Confirming closes the overlay at once — the shared Dock reports it. */
  const confirmForward = () => {
    const record = forwardTarget;
    if (!record || forwardMutation.isPending) return;
    setForwardTarget(null);
    setForwardingId(record.id);
    let taskId: string | null = null;
    try {
      taskId = dock.startTask({
        kind: "adm-endorse",
        title: "Endorsing to Principal",
        description: `${record.student} → Principal`,
      });
    } catch {
      taskId = null;
    }
    forwardMutation.mutate({
      id: record.id,
      student: record.student,
      taskId,
    });
  };

  const counts = React.useMemo<Record<CertStatusFilter, number>>(() => {
    const out: Record<CertStatusFilter, number> = {
      all: records.length,
      prepared: 0,
      awaiting: 0,
      revision: 0,
      approved: 0,
    };
    for (const record of records) out[record.status] += 1;
    return out;
  }, [records]);

  // Filter the loaded rows instantly as the clerk types (same feel as the
  // referrals desk); the debounced server query then swaps in matches from the
  // rest of the desk.
  const searchTerm = query.trim().toLowerCase();
  const searched = React.useMemo(() => {
    if (searchTerm === "") return records;
    return records.filter((record) =>
      `${record.student} ${record.lrn} ${record.grade}`
        .toLowerCase()
        .includes(searchTerm),
    );
  }, [records, searchTerm]);

  const filtered = React.useMemo(
    () =>
      status === "all"
        ? searched
        : searched.filter((r) => r.status === status),
    [searched, status],
  );
  const total = filtered.length;

  const totalPages = Math.max(1, Math.ceil(total / DISPLAY_LIMIT));
  const [page, setPage] = React.useState(1);

  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * DISPLAY_LIMIT + 1;
  const end = Math.min(safePage * DISPLAY_LIMIT, total);

  const nowTick = useNowTick();
  const visible = React.useMemo(
    () =>
      filtered.slice(start - 1, end).map((record) => ({ record })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, start, end, nowTick],
  );

  const openRecord = (record: CertRecord) => {
    window.open(
      `/coordinator/referrals/${encodeURIComponent(toSlug(record.student))}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  if (records.length === 0 && query.trim() === "" && status === "all") {
    return (
      <CoordinatorEmptyCard
        icon={Award}
        title="No certification files yet"
        hint="Certifications you prepare will appear here as folders you can endorse."
        label="Files"
        centered
      />
    );
  }

  return (
    <>
      <section className={styles.boardShell} aria-label="Files">
        <div className={styles.boardHeader}>
          <span className={styles.boardTitle}>
            <span className="text-amber-500" aria-hidden>
              <Award size={14} />
            </span>
            Files
          </span>

          <div className={styles.filterRow}>
            <FilterTabs
              label="Filter certifications by status"
              variant="tags"
              options={STATUS_TABS.map((tab) => ({
                value: tab.value,
                label: tab.label,
                count: counts[tab.value],
                tone: STATUS_TAB_TONE[tab.value],
              }))}
              value={status}
              onChange={(next) => {
                setPage(1);
                onStatusChange(next);
              }}
            />
          </div>

          <div className={styles.headerActions}>
            <SearchField
              className="w-60 max-w-full"
              placeholder="Search student, LRN, or grade…"
              value={query}
              onChange={(v) => {
                setPage(1);
                onQueryChange(v);
              }}
              aria-label="Search certifications"
            />
            <button
              type="button"
              className={styles.helpBtn}
              onClick={() => setHelpOpen(true)}
              aria-label="What do the certification status labels mean?"
              title="What do the certification status labels mean?"
            >
              <HelpCircle aria-hidden="true" />
            </button>
          </div>
        </div>

        {visible.length === 0 ? (
          <PageEmptyCallout>
            {searchTerm !== "" || status !== "all"
              ? "No certification files match your search or filters. Try a different name, LRN, or status."
              : "No certification files to show."}
          </PageEmptyCallout>
        ) : (
          <div className={styles.listPanel}>
            <div className={styles.listHead} aria-hidden="true">
              <span>Learner</span>
              <span>Grade</span>
              <span>Eligibility</span>
              <span>Certification</span>
              <span className={styles.headFiles}>Files</span>
              <span className={styles.headPrepared}>Prepared</span>
              <span className={styles.headApproved}>Approved</span>
              <span />
            </div>
            <ul className={styles.listBody} aria-label="Certification files">
              {visible.map(({ record }, index) => {
                const meta = CERT_STATUS_META[record.status];
                return (
                  <li
                    key={record.id}
                    className={`${styles.row} ${ROW_ACCENT[record.status]}`}
                    style={{ animationDelay: `${Math.min(index, 14) * 35}ms` }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${record.student}'s certification file`}
                    onClick={() => openRecord(record)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openRecord(record);
                      }
                    }}
                  >
                    <div className={`${styles.cell} ${styles.cellPerson}`}>
                      <StudentMascot
                        name={record.student}
                        seed={record.lrn}
                        size={30}
                      />
                      <div className={styles.personText}>
                        <p className={styles.personName} title={record.student}>
                          {record.student}
                        </p>
                        <span className={styles.personLrn}>{record.lrn || "—"}</span>
                      </div>
                    </div>

                    <div
                      className={`${styles.cell} ${styles.cellPill} ${styles.cellGrade}`}
                    >
                      <Pill tone="blue" label="Grade level">
                        {record.grade}
                      </Pill>
                    </div>

                    <div
                      className={`${styles.cell} ${styles.cellPill} ${styles.cellEligibility}`}
                    >
                      <Pill
                        tone={ELIGIBILITY_TONE[record.eligibilityStatus]}
                        label="Eligibility"
                      >
                        {ELIGIBILITY_LABEL[record.eligibilityStatus]}
                      </Pill>
                    </div>

                    <div className={`${styles.cell} ${styles.cellStatus}`}>
                      <Pill
                        tone={STATUS_TONE[record.status]}
                        label="Certification status"
                      >
                        <Award size={12} aria-hidden />
                        {meta.label}
                      </Pill>
                      <span className={styles.cellMuted}>
                        {record.status === "approved" && record.approvedBy
                          ? `Signed by ${record.approvedBy}`
                          : STATUS_HINT[record.status]}
                      </span>
                    </div>

                    <div
                      className={`${styles.cell} ${styles.cellMetaRow} ${styles.cellFiles}`}
                    >
                      <span className={styles.cellLabel}>Files</span>
                      <span className={styles.cellValue}>
                        {record.formsCount} file{record.formsCount === 1 ? "" : "s"}
                      </span>
                    </div>

                    <div
                      className={`${styles.cell} ${styles.cellMetaRow} ${styles.cellPrepared}`}
                    >
                      <span className={styles.cellLabel}>Prepared</span>
                      <span
                        className={styles.cellValue}
                        title={fullDate(record.datePrepared)}
                      >
                        {timeAgo(record.datePrepared)}
                      </span>
                    </div>

                    <div
                      className={`${styles.cell} ${styles.cellMetaRow} ${styles.cellApproved}`}
                    >
                      <span className={styles.cellLabel}>Approved</span>
                      <span
                        className={styles.cellValue}
                        title={fullDate(record.approvalDate)}
                      >
                        {record.approvalDate ? timeAgo(record.approvalDate) : "—"}
                      </span>
                    </div>

                    <div className={`${styles.cell} ${styles.cellAction}`}>
                      {record.status === "prepared" ? (
                        <Button
                          size="xs"
                          variant="outline"
                          className="h-6 gap-1 bg-card px-2 text-xs text-foreground"
                          disabled={forwardingId === record.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            setForwardTarget(record);
                          }}
                        >
                          {forwardingId === record.id ? (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.375rem",
                              }}
                            >
                              <Loader2
                                className="animate-spin"
                                aria-hidden
                                style={{ width: "0.875rem", height: "0.875rem" }}
                              />
                              Endorsing…
                            </span>
                          ) : (
                            "Endorse"
                          )}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          className="h-6 gap-1 bg-card px-2 text-[12px] text-foreground"
                          aria-label={`View ${record.student}'s case`}
                          onClick={(event) => {
                            event.stopPropagation();
                            openRecord(record);
                          }}
                        >
                          <ArrowUpRight
                            size={12}
                            className="text-amber-500"
                            aria-hidden
                          />
                          View file
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      {visible.length > 0 ? (
        <Pagination
          currentPage={safePage}
          totalItems={total}
          onPageChange={setPage}
        />
      ) : null}

      {forwardTarget ? (
        <CoordinatorCertificationsEndorseConfirm
          record={forwardTarget}
          onConfirm={confirmForward}
          onClose={() => setForwardTarget(null)}
        />
      ) : null}

      <KanbanOverlay
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        width="lg"
        title="What do the certification status labels mean?"
        icon={
          <span className="text-primary" aria-hidden>
            <HelpCircle size={14} />
          </span>
        }
        description="Every amber folder is a certification file. Its pill shows the state it is in — open the folder to work on the case."
        footer={
          <div className="flex items-center justify-end gap-1.5 px-1 pb-1">
            <Button
              type="button"
              size="sm"
              className="h-6 px-3 text-xs"
              onClick={() => setHelpOpen(false)}
              autoFocus
            >
              Understood
            </Button>
          </div>
        }
      >
        <ul className={styles.helpList}>
          {HELP_ITEMS.map((item) => (
            <li
              key={item.status}
              className={styles.helpItem}
              data-status={item.status}
            >
              <span className={styles.helpPill}>
                <Pill tone={STATUS_TONE[item.status]} label="Certification status">
                  <Award size={12} aria-hidden />
                  {CERT_STATUS_META[item.status].label}
                </Pill>
              </span>
              <span className={styles.helpItemBody}>
                <span className={styles.helpItemTitle}>{item.title}</span>
                <span className={styles.helpItemText}>{item.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </KanbanOverlay>
    </>
  );
}
