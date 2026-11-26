"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { useLiveQuery } from "@/lib/api/live";
import { apiClient } from "@/lib/api/client";
import { useTerm } from "@/lib/term/TermContext";
import { Check, Download, Layers, Loader2, Upload, Users } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { SearchField } from "@/components/ui/search-field";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { EmptyActionCard } from "./schedule-empty-kanban";
import styles from "@/app/principal/academics/assign/components/sections-kanban.module.css";
import { useAdminScheduleInvalidate } from "./use-admin-schedule-invalidate";
import { ScheduleStatusConfirm, type PublishConfirmMode } from "./schedule-status-confirm";
import { useDockProgressTask, type DockSnapshot } from "./use-dock-progress";
import type { ScheduleSectionSummary } from "../page";

export type PublishStatus = "DRAFT" | "PUBLISHED";

function getErrorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: { message?: unknown }; message?: unknown } } })
    ?.response?.data;
  const message = data?.error?.message ?? data?.message;
  if (typeof message === "string" && message) return message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function isPublished(section: ScheduleSectionSummary): boolean {
  return (
    section.timetableEntries.length > 0 &&
    section.timetableEntries.every((e) => e.status === "APPROVED")
  );
}

function draftCount(section: ScheduleSectionSummary): number {
  return section.timetableEntries.filter((e) => e.status !== "APPROVED").length;
}

function gradeLabel(grade: string): string {
  return `Grade ${grade.replace("G", "")}`;
}

/**
 * Draft ⇄ published. Publishing writes `APPROVED`, the status teacher desks
 * read for class lists, grading and attendance — there is no principal review
 * step, the administrator owns the timetable.
 */
export function usePublishTimetable() {
  const invalidateSchedule = useAdminScheduleInvalidate();
  return useMutation({
    mutationFn: async (input: { sectionId?: string; status: PublishStatus }) => {
      const { data } = await apiClient.post<{ published?: number; drafted?: number }>(
        "/api/admin/schedule/status",
        input,
      );
      return data;
    },
    onSuccess: (data, input) => {
      invalidateSchedule();
      const count = data.published ?? data.drafted ?? 0;
      toast.success({
        title: input.status === "PUBLISHED" ? "Timetable published" : "Switched back to draft",
        description:
          input.status === "PUBLISHED"
            ? `${count} slot${count === 1 ? "" : "s"} are now live for teachers.`
            : `${count} slot${count === 1 ? "" : "s"} are editable again.`,
      });
    },
    onError: (err: unknown) => {
      toast.error({
        title: "Could not update the timetable",
        description: getErrorMessage(err, "The timetable status was not changed."),
      });
    },
  });
}

export function PublishTimetableKanban({
  onOpenGrid,
}: {
  onOpenGrid?: (id: string) => void;
} = {}) {
  const { activeTerm } = useTerm();
  const termKey = `${activeTerm?.schoolYearId ?? ""}:${activeTerm?.termId ?? ""}`;
  const [state, setState] = React.useState<"all" | "draft" | "published">("all");
  const [query, setQuery] = React.useState("");

  const sectionsQuery = useLiveQuery<{ sections: ScheduleSectionSummary[] }>({
    queryKey: ["admin-schedule-summary", termKey],
    queryFn: async () => {
      const { data } = await apiClient.get<{ sections: ScheduleSectionSummary[] }>(
        "/api/admin/schedule?summary=1",
      );
      return data;
    },
  });

  const publish = usePublishTimetable();
  const sections = sectionsQuery.data?.sections ?? [];
  const publishedCount = sections.filter(isPublished).length;
  const draftSections = sections.filter((s) => !isPublished(s) && draftCount(s) > 0);
  const needle = query.trim().toLowerCase();
  const visibleSections = sections.filter((section) => {
    if (state === "published" && !isPublished(section)) return false;
    if (state === "draft" && isPublished(section)) return false;
    if (!needle) return true;
    const adviserName = section.adviser?.fullName ?? section.adviserLabel ?? "";
    return (
      section.name.toLowerCase().includes(needle) ||
      adviserName.toLowerCase().includes(needle) ||
      section.gradeLevel.toLowerCase().includes(needle) ||
      gradeLabel(section.gradeLevel).toLowerCase().includes(needle)
    );
  });
  const boardEmpty = sections.length === 0;
  const filtersActive = state !== "all" || needle.length > 0;

  const [confirm, setConfirm] = React.useState<
    | { mode: PublishConfirmMode; scope: "all" }
    | { mode: PublishConfirmMode; scope: "section"; section: ScheduleSectionSummary }
    | null
  >(null);
  const [progress, setProgress] = React.useState<{
    active: boolean;
    failed?: boolean;
    mode: PublishConfirmMode;
    count: number;
  } | null>(null);

  const dock = React.useMemo<DockSnapshot | null>(() => {
    if (!progress) return null;
    const publishing = progress.mode === "publish";
    const items = `${progress.count} ${progress.count === 1 ? "section" : "sections"}`;
    if (progress.active) {
      return {
        active: true,
        title: publishing ? "Publishing timetables..." : "Moving timetables to draft...",
        description: items,
        total: progress.count,
      };
    }
    if (progress.failed) {
      return {
        active: false,
        failed: true,
        title: "Timetable status not changed",
        description: "The request failed - nothing was changed.",
      };
    }
    return {
      active: false,
      title: publishing ? "Timetables published" : "Timetables moved to draft",
      description: publishing ? `${items} live for teachers.` : `${items} back to working drafts.`,
    };
  }, [progress]);

  useDockProgressTask(dock);

  const runConfirmed = () => {
    if (!confirm) return;
    const { mode, scope } = confirm;
    const target = scope === "section" ? confirm.section : null;
    const count =
      scope === "all"
        ? mode === "publish"
          ? draftSections.length
          : publishedCount
        : (target?.timetableEntries.length ?? 0);
    setConfirm(null);
    setProgress({ active: true, mode, count });
    publish.mutate(
      { sectionId: target?.id, status: mode === "publish" ? "PUBLISHED" : "DRAFT" },
      {
        onSuccess: () => setProgress({ active: false, mode, count }),
        onError: () => setProgress({ active: false, failed: true, mode, count }),
      },
    );
  };

  const confirmTitle = confirm
    ? confirm.scope === "all"
      ? confirm.mode === "publish"
        ? "Publish all draft sections?"
        : "Move every published section back to draft?"
      : confirm.mode === "publish"
        ? `Publish ${confirm.section.name}'s timetable?`
        : `Move ${confirm.section.name}'s timetable back to draft?`
    : "";
  const confirmDescription = confirm
    ? confirm.scope === "all"
      ? confirm.mode === "publish"
        ? "Every draft section goes live for teachers. Sections with no slots are skipped."
        : "Every published section becomes a draft only this workspace can see. Teacher desks lose those class lists until you publish again."
      : confirm.mode === "publish"
        ? "This grid goes live for teachers — grading, attendance and the principal view read the published timetable."
        : "The grid becomes a draft only you can see. Teacher desks lose this class list until you publish it again."
    : "";

  return (
    <section className={styles.board} aria-label="Publish timetables">
      <header className={styles.header}>
        <div className={styles.headerText}>
          <div className={styles.titleRow}>
            <span className={styles.titleIcon} aria-hidden>
              <Upload size={16} />
            </span>
            <h2 className={styles.title}>Publish</h2>
          </div>
          <p className={styles.subtitle}>
            Published timetables are what teachers see in grading and attendance. Drafts stay
            private to this workspace.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Button
            variant="outline"
            className="h-6 gap-1 bg-card px-2 text-[12px] text-foreground"
            onClick={() => setConfirm({ mode: "unpublish", scope: "all" })}
            disabled={publish.isPending || publishedCount === 0}
          >
            {publish.isPending ? (
              <Loader2 size={12} className="animate-spin" aria-hidden />
            ) : (
              <Download size={12} aria-hidden />
            )}
            Unpublish all
          </Button>
          <Button
            className="h-6 gap-1 px-2 text-[12px]"
            onClick={() => setConfirm({ mode: "publish", scope: "all" })}
            disabled={publish.isPending || draftSections.length === 0}
          >
            {publish.isPending ? (
              <Loader2 size={12} className="animate-spin" aria-hidden />
            ) : (
              <Upload size={12} aria-hidden />
            )}
            Publish all drafts
          </Button>
        </div>
      </header>

      {!boardEmpty ? (
        <div className={styles.toolbar}>
          <FilterTabs
            label="Filter by timetable status"
            variant="tags"
            options={[
              { value: "all", label: "All sections", count: sections.length, tone: "neutral" },
              {
                value: "draft",
                label: "Draft",
                count: sections.length - publishedCount,
                tone: "amber",
              },
              { value: "published", label: "Published", count: publishedCount, tone: "green" },
            ]}
            value={state}
            onChange={setState}
          />
          <SearchField
            className="w-60"
            placeholder="Find a section, adviser, or grade…"
            value={query}
            onChange={setQuery}
            aria-label="Find a section to publish"
          />
        </div>
      ) : null}

      {boardEmpty ? (
        <div className="flex min-h-[calc(100dvh-18rem)] items-center justify-center py-8">
          <EmptyActionCard
            icon={Upload}
            title="Nothing to publish yet"
            description="Add the first section for this school year, build its weekly grid, then publish it here for teachers."
            actions={[
              {
                href: "/admin/academics/schedule/sections",
                title: "Create the first section",
                description: "Add its name and grade, then timetable it",
                icon: Layers,
                accent: "text-muted-foreground",
              },
              {
                href: "/admin/academics/schedule/timetable",
                title: "Open timetable workspace",
                description: "Build and publish each section's weekly grid",
                icon: Upload,
                accent: "text-amber-500",
              },
            ]}
          />
        </div>
      ) : visibleSections.length === 0 ? (
        <PageEmptyCallout
          action={
            <Button
              variant="outline"
              className="h-6 gap-1 px-2.5 text-[12px]"
              onClick={() => {
                setState("all");
                setQuery("");
              }}
            >
              Show all sections
            </Button>
          }
        >
          {filtersActive ? (
            <>
              <strong>No sections match these filters.</strong> Try another status or search.
            </>
          ) : (
            <>No sections to show.</>
          )}
        </PageEmptyCallout>
      ) : (
        <div className={styles.grid} aria-label="Sections to publish">
          {visibleSections.map((section, index) => {
            const published = isPublished(section);
            const drafts = draftCount(section);
            const slots = section.timetableEntries.length;
            const approved = slots - drafts;
            const learners = section._count.students;
            const adviserName = section.adviser?.fullName ?? section.adviserLabel ?? "";
            return (
              <article
                key={section.id}
                className={`${styles.card} ${styles.cardAmber} ${
                  published ? styles.cardClaimed : ""
                }`}
                aria-label={`${section.name} timetable`}
                style={{ animationDelay: `${Math.min(index, 11) * 35}ms` }}
              >
                <header className={styles.cardHead}>
                  <StudentMascot
                    name={adviserName || section.name}
                    seed={section.adviserId ?? section.id}
                    size={36}
                  />
                  <div className={styles.cardId}>
                    <span className={styles.sectionName} title={section.name}>
                      {section.name}
                    </span>
                    <span className={styles.teacher} title={adviserName || undefined}>
                      {adviserName || <span className={styles.teacherNone}>No adviser yet</span>}
                    </span>
                  </div>
                  <span className="shrink-0 text-[12px] font-semibold text-muted-foreground">
                    {gradeLabel(section.gradeLevel)}
                  </span>
                </header>

                <div className={styles.metaRow}>
                  {published ? (
                    <span className="inline-flex items-center gap-1 text-[12px] font-medium text-green-700 dark:text-green-400">
                      <Check size={11} aria-hidden />
                      Published
                    </span>
                  ) : drafts > 0 ? (
                    <span className="text-[12px] font-medium text-amber-700 dark:text-amber-400">
                      {drafts} draft slot{drafts === 1 ? "" : "s"}
                    </span>
                  ) : (
                    <span className="text-[12px] font-medium text-muted-foreground">
                      No slots yet
                    </span>
                  )}
                </div>

                <div className={styles.linksRow}>
                  <span className={styles.linkStat}>
                    <Users size={11} aria-hidden />
                    {learners} learner{learners === 1 ? "" : "s"}
                  </span>
                  <span className={styles.linkStat}>
                    <Layers size={11} aria-hidden />
                    {slots} slot{slots === 1 ? "" : "s"} this term
                  </span>
                  <span className={styles.linkStat}>
                    <Download size={11} aria-hidden />
                    {drafts} draft{drafts === 1 ? "" : "s"}
                  </span>
                </div>

                {slots > 0 ? (
                  <div
                    className={styles.gridProgress}
                    title={`${approved} of ${slots} slots published`}
                    aria-hidden
                  >
                    <span
                      className={styles.gridProgressFill}
                      style={{ width: `${Math.round((approved / slots) * 100)}%` }}
                    />
                  </div>
                ) : null}

                <p
                  className={`${styles.notice} ${
                    published ? styles.claimedNotice : styles.claimNotice
                  }`}
                >
                  {published ? <Check size={11} aria-hidden /> : <Download size={11} aria-hidden />}
                  <span>
                    {published
                      ? "Live for teachers — grading and attendance read this grid."
                      : drafts > 0
                        ? "Only this workspace can see it until you publish."
                        : "No slots yet — open the grid to build it."}
                  </span>
                </p>

                <div className={styles.cardActions}>
                  <span className={styles.lockedHint}>
                    {published ? (
                      <>
                        <Check size={11} aria-hidden />
                        <span>In use this term</span>
                      </>
                    ) : (
                      <>
                        <Download size={11} aria-hidden />
                        <span>Working draft</span>
                      </>
                    )}
                  </span>
                  {onOpenGrid ? (
                    <Button
                      variant="outline"
                      className="h-6 gap-1 bg-card px-2 text-[12px] text-foreground"
                      aria-label={`Open the weekly grid for ${section.name}`}
                      onClick={() => onOpenGrid(section.id)}
                    >
                      <Layers size={12} className="text-amber-500" aria-hidden />
                      Open grid
                    </Button>
                  ) : null}
                  <Button
                    variant={published ? "outline" : "default"}
                    className={
                      published
                        ? "h-6 gap-1 bg-card px-2 text-[12px] text-foreground"
                        : "h-6 gap-1 px-2 text-[12px]"
                    }
                    onClick={() =>
                      setConfirm({
                        mode: published ? "unpublish" : "publish",
                        scope: "section",
                        section,
                      })
                    }
                    disabled={publish.isPending || (!published && drafts === 0)}
                    title={
                      published
                        ? "Move this timetable back to draft"
                        : drafts === 0
                          ? "Add at least one slot before publishing"
                          : "Publish this timetable for teachers"
                    }
                  >
                    {published ? (
                      <>
                        <Download size={12} aria-hidden />
                        Move to draft
                      </>
                    ) : (
                      <>
                        <Upload size={12} aria-hidden />
                        Publish
                      </>
                    )}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {confirm ? (
        <ScheduleStatusConfirm
          mode={confirm.mode}
          title={confirmTitle}
          description={confirmDescription}
          published={confirm.mode === "unpublish"}
          pending={publish.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={runConfirmed}
        />
      ) : null}
    </section>
  );
}

