"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { useLiveQuery } from "@/lib/api/live";
import { apiClient } from "@/lib/api/client";
import { useTerm } from "@/lib/term/TermContext";
import { Check, Download, Layers, Loader2, Upload } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { Pill } from "@/components/ui/pill";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
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

export function PublishTimetableKanban() {
  const { activeTerm } = useTerm();
  const termKey = `${activeTerm?.schoolYearId ?? ""}:${activeTerm?.termId ?? ""}`;
  const [state, setState] = React.useState<"all" | "draft" | "published">("all");

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
  const visibleSections = sections.filter((section) => {
    if (state === "published") return isPublished(section);
    if (state === "draft") return !isPublished(section);
    return true;
  });
  const boardEmpty = sections.length === 0;

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
        ? `${draftSections.length} draft section${draftSections.length === 1 ? "" : "s"} go live for teachers. Sections with no slots are skipped.`
        : `${publishedCount} published section${publishedCount === 1 ? "" : "s"} become drafts only this workspace can see. Teacher desks lose those class lists until you publish again.`
      : confirm.mode === "publish"
        ? `${confirm.section.timetableEntries.length} slot${confirm.section.timetableEntries.length === 1 ? "" : "s"} go live for teachers — grading, attendance and the principal view read the published grid.`
        : "The grid becomes a draft only you can see. Teacher desks lose this class list until you publish it again."
    : "";
  const confirmCount = confirm
    ? confirm.scope === "all"
      ? `${confirm.mode === "publish" ? draftSections.length : publishedCount} section${
          (confirm.mode === "publish" ? draftSections.length : publishedCount) === 1 ? "" : "s"
        }`
      : `${confirm.section.timetableEntries.length} slot${
          confirm.section.timetableEntries.length === 1 ? "" : "s"
        }`
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
            options={[
              { value: "all", label: "All sections", count: sections.length },
              { value: "draft", label: "Draft", count: sections.length - publishedCount },
              { value: "published", label: "Published", count: publishedCount },
            ]}
            value={state}
            onChange={setState}
          />
        </div>
      ) : null}

      {boardEmpty ? (
        <PageEmptyCallout>
          No sections yet — build a timetable first, then publish it here.
        </PageEmptyCallout>
      ) : visibleSections.length === 0 ? (
        <PageEmptyCallout>
          No {state === "published" ? "published" : "draft"} sections right now.
        </PageEmptyCallout>
      ) : (
        <div className={styles.grid} aria-label="Sections to publish">
          {visibleSections.map((section, index) => {
            const published = isPublished(section);
            const drafts = draftCount(section);
            const slots = section.timetableEntries.length;
            const adviserName = section.adviser?.fullName ?? section.adviserLabel ?? "";
            return (
              <article
                key={section.id}
                className={`${styles.card} ${published ? styles.cardClaimed : ""}`}
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
                  <Pill field="grade" className={styles.gradePill}>
                    {`Grade ${section.gradeLevel.replace("G", "")}`}
                  </Pill>
                </header>

                <div className={styles.metaRow}>
                  {published ? (
                    <Pill tone="green" label="Timetable status">
                      <Check size={11} aria-hidden />
                      Published
                    </Pill>
                  ) : drafts > 0 ? (
                    <Pill tone="amber" label="Timetable status">
                      {drafts} draft{drafts === 1 ? "" : "s"}
                    </Pill>
                  ) : (
                    <Pill tone="neutral" label="Timetable status">
                      Empty
                    </Pill>
                  )}
                </div>

                <div className={styles.linksRow}>
                  <span className={styles.linkStat}>
                    <Layers size={11} aria-hidden />
                    {slots} slot{slots === 1 ? "" : "s"}
                  </span>
                  <span className={styles.linkStat}>
                    <Download size={11} aria-hidden />
                    {drafts} draft slot{drafts === 1 ? "" : "s"}
                  </span>
                </div>

                <p className={`${styles.notice} ${published ? styles.claimedNotice : styles.claimNotice}`}>
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
          countLabel={confirmCount}
          published={confirm.mode === "unpublish"}
          pending={publish.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={runConfirmed}
        />
      ) : null}
    </section>
  );
}

