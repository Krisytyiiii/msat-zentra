"use client";

import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLiveQuery } from "@/lib/api/live";

import { AlertTriangle, ArrowLeft, BookPlus, CalendarDays, Download, Gauge, Layers, Pencil, Plus, Trash2, Undo2, Upload, UserPlus } from "lucide-react";
import { useTerm, type SchoolYearOption } from "@/lib/term/TermContext";
import { apiClient } from "@/lib/api/client";
import { apiErrorMessage } from "@/lib/api/errors";
import { useAdminScheduleInvalidate } from "../../components/use-admin-schedule-invalidate";
import { Button } from "@/components/ui/button";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import { Pill } from "@/components/ui/pill";
import { toast } from "@/components/ui/sonner";
import { SubjectCatalogKanban } from "../../components/subject-catalog-kanban";
import { SubjectAddKanban } from "../../components/subject-add-kanban";
import { TeacherCatalogKanban } from "../../components/teacher-catalog-kanban";
import { TeacherAddKanban } from "../../components/teacher-add-kanban";
import { TemplateFormOverlay } from "../../components/TemplateFormOverlay";
import { TEACHER_CREATE_STEPS, TeacherCreateDockRows } from "../../components/teacher-add-kanban";
import type { TeacherCreateProgress } from "../../components/use-add-teachers";
import { TEACHER_DELETE_STEPS, TeacherDeleteDockRows } from "../../components/teacher-delete-kanban";
import type { TeacherDeleteProgress } from "../../components/teacher-delete-kanban";
import {
  CONFIG_SAVE_STEPS,
  ConfigDockRows,
  describeConfig,
  ScheduleConfigKanban,
  type ConfigSaveProgress,
} from "../../components/schedule-config-kanban";
import { PublishTimetableKanban, usePublishTimetable } from "../../components/schedule-publish-kanban";
import { ScheduleConfigPresets } from "../../components/schedule-config-presets";
import { buildTimetable, DEFAULT_DAY_CONFIG, type DayConfig } from "@/components/schedule/schedule-time";
import { matchSectionSlug, sectionSlug } from "@/lib/sectionSlug";
import {
  useScheduleCatalog,
  type ScheduleConfigPreset,
} from "../../components/use-schedule-catalog";
import { cellKey, useScheduleCells } from "../../components/use-schedule-cells";
import { ScheduleTemplateGrid } from "../../components/ScheduleTemplateGrid";
import { ScheduleUnlockConfirm } from "../../components/schedule-unlock-kanban";
import {
  ScheduleStatusConfirm,
  type PublishConfirmMode,
} from "../../components/schedule-status-confirm";
import { AddSectionKanban, type CreatedSection } from "../../components/add-section-kanban";
import { SectionsBoard } from "../../components/sections-board";
import { TemplateSetupEmptyCard } from "../../components/schedule-empty-kanban";
import { SectionWorkspaceTable } from "../../components/section-workspace-table";
import { DeleteConfirmOverlay } from "../../components/delete-confirm-overlay";
import {
  AddSchoolYearKanban,
  localTodayKey,
  type CreatedSchoolYear,
} from "../../components/add-school-year-kanban";
import { ConfigureTermsKanban } from "../../components/configure-terms-kanban";
import {
  ScheduleSchoolYears,
  type SchoolYearLockRow,
} from "../../components/schedule-school-years";
import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import { useScheduleConflicts } from "../../components/use-schedule-conflicts";
import { useTemplateWorkload } from "../../components/use-template-workload";
import { useDock } from "@/components/dock/dock-store";
import { useDockProgressTask, type DockSnapshot } from "../../components/use-dock-progress";
import { ConflictsDock } from "../../components/conflicts-dock";
import type { SubjectCreateProgress } from "../../components/use-add-subjects";
import { DELETE_STEPS, DeleteDockRows, type SubjectDeleteProgress } from "../../components/subject-delete-kanban";
import type { ScheduleSection } from "../../page";

/** The shared `KanbanBoard` shell: hairline header row, then the panel body. */
function SkeletonBoard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-2.5">
      <div className="-mx-2.5 flex items-center gap-2 border-b border-border px-3.5 pb-2">
        <Skeleton className="h-3.5 w-28" />
        <span className="ml-auto flex items-center gap-2">
          <Skeleton className="h-6 w-24 rounded-md" />
          <Skeleton className="h-3 w-8" />
        </span>
      </div>
      <div className="pt-2">{children}</div>
    </div>
  );
}

/** Default view: section picker + warning pills + the weekly grid table. */
function SkeletonTimetable() {
  return (
    <>
      <div className="flex items-center justify-end gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-24 rounded-md" />
        ))}
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-8 w-48 rounded-md" />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <Skeleton className="h-5 w-40 rounded-full" />
            <Skeleton className="h-5 w-36 rounded-full" />
          </div>
        </div>
        <SkeletonBoard>
          <div className="overflow-hidden rounded-lg border">
            <div className="grid grid-cols-[10rem_repeat(5,minmax(0,1fr))]">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={`h-${i}`} className="m-2 h-4" />
              ))}
              {Array.from({ length: 6 }).flatMap((_, row) =>
                Array.from({ length: 6 }).map((__, col) => (
                  <Skeleton
                    key={`c-${row}-${col}`}
                    className={`m-1.5 ${col === 0 ? "h-4" : "h-14"}`}
                  />
                )),
              )}
            </div>
          </div>
        </SkeletonBoard>
      </div>
    </>
  );
}

/** Sections view: header + toolbar + the section card grid (same as loaded). */
function SkeletonSections() {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-80 max-w-full" />
        </div>
        <Skeleton className="h-6 w-28 rounded-md" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Skeleton className="h-7 w-72 max-w-full rounded-full" />
        <Skeleton className="h-7 w-60 max-w-full rounded-[16px]" />
      </div>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(16.5rem,1fr))]">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-2.5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
            </div>
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
            <Skeleton className="h-3 w-40" />
            <div className="mt-auto flex justify-end border-t border-border pt-1.5">
              <Skeleton className="h-5 w-20 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Subjects view: the catalog board — title + subtitle, the header actions,
 * the grade scope/search row, then the subject data table (`subject-catalog-kanban`
 * → `SubjectWorkspaceTable`). Deliberately not the sections card grid.
 */
function SkeletonSubjects() {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-[1.625rem] w-[1.625rem] shrink-0 rounded-lg" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-3 w-[46rem] max-w-full" />
        </div>
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-6 w-28 rounded-md" />
          <Skeleton className="h-6 w-28 rounded-md" />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Skeleton className="h-7 w-80 max-w-full rounded-full" />
        <Skeleton className="h-7 w-60 max-w-full rounded-[16px]" />
      </div>
      <div
        className="overflow-x-auto rounded-lg border border-border bg-card"
        aria-busy="true"
      >
        <div className="grid grid-cols-[minmax(0,1fr)_6rem_7rem_8rem_9rem] items-center gap-3 border-b border-border px-4 py-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-14" />
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, row) => (
          <div
            key={row}
            className="grid grid-cols-[minmax(0,1fr)_6rem_7rem_8rem_9rem] items-center gap-3 border-b border-border/60 px-4 py-2.5 last:border-b-0"
          >
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-7 shrink-0 rounded-md" />
              <Skeleton className="h-3.5 w-32 max-w-full" />
            </div>
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-5 w-16 rounded-md" />
            <Skeleton className="h-5 w-20 rounded-md" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Configure view: the applied day-shape board, centered like the real panel. */
function SkeletonDayConfig() {
  return (
    <div className="flex min-h-[calc(100dvh-12rem)] flex-col justify-center gap-4">
      <div className="mx-auto w-full max-w-xl">
        <SkeletonBoard>
          <div className="flex flex-wrap content-start gap-1.5 px-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-28 rounded-full" />
            ))}
          </div>
          <div className="flex justify-end px-1 pt-2">
            <Skeleton className="h-6 w-24 rounded-md" />
          </div>
        </SkeletonBoard>
      </div>
    </div>
  );
}

/** School year view: header, the year card grid, then the scope strip. */
function SkeletonSchoolYears() {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-[1.625rem] w-[1.625rem] shrink-0 rounded-lg" />
            <Skeleton className="h-4 w-28" />
          </div>
          <Skeleton className="h-3 w-[46rem] max-w-full" />
        </div>
        <Skeleton className="h-7 w-32 rounded-md" />
      </div>
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-[0.9375rem]"
          >
            <div className="flex items-center gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-36" />
              </div>
              <Skeleton className="h-[1.125rem] w-16 shrink-0 rounded-full" />
            </div>
            <div className="flex gap-1">
              <Skeleton className="h-[1.125rem] w-20 rounded-full" />
              <Skeleton className="h-[1.125rem] w-16 rounded-full" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-1.5 w-full rounded-full" />
              <div className="flex justify-between">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              {Array.from({ length: 3 }).map((__, j) => (
                <div key={j} className="flex items-center gap-2 px-2 py-1.5">
                  <Skeleton className="h-5 w-5 shrink-0 rounded" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Skeleton className="h-3 w-14" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 4 }).map((__, k) => (
                <div key={k} className="flex flex-col gap-1">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3.5 w-20" />
                </div>
              ))}
            </div>
            <div className="flex justify-between border-t border-border pt-2">
              <Skeleton className="h-6 w-20 rounded-md" />
              <Skeleton className="h-6 w-6 rounded-md" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 px-1">
        <Skeleton className="h-1.5 w-1.5 rounded-full" />
        <Skeleton className="h-3 w-64 max-w-full" />
      </div>
    </>
  );
}

/** Publish view: the same section card grid as the loaded board. */
function SkeletonPublish() {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-[1.625rem] w-[1.625rem] shrink-0 rounded-lg" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-3 w-80 max-w-full" />
        </div>
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-6 w-28 rounded-md" />
          <Skeleton className="h-6 w-32 rounded-md" />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Skeleton className="h-7 w-72 max-w-full rounded-full" />
        <Skeleton className="h-7 w-60 max-w-full rounded-[16px]" />
      </div>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(16.5rem,1fr))]">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-2.5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-4 w-14 shrink-0" />
            </div>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-1.5 w-full rounded-full" />
            <div className="mt-auto flex justify-end gap-1.5 border-t border-border pt-1.5">
              <Skeleton className="h-5 w-20 rounded-md" />
              <Skeleton className="h-5 w-16 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScheduleTemplateSkeleton({ view }: { view: TemplateView }) {
  return (
    <ShimmerGroup>
      <section
        className="flex w-full flex-col gap-5"
        aria-busy="true"
        aria-label="Loading template"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          {view === "grid" ? (
            <SkeletonTimetable />
          ) : view === "sections" ? (
            <SkeletonSections />
          ) : view === "subjects" ? (
            <SkeletonSubjects />
          ) : view === "teachers" ? (
            <SkeletonSubjects />
          ) : view === "config" ? (
            <SkeletonDayConfig />
          ) : view === "term" ? (
            <SkeletonSchoolYears />
          ) : (
            <SkeletonPublish />
          )}
        </div>
      </section>
    </ShimmerGroup>
  );
}

/**
 * Collapses a page-local progress state into the one shape the shared Dock
 * understands, so every confirmed action reports it the same way.
 */
function dockSnapshotOf(input: {
  active: boolean;
  total: number;
  settled: number;
  failed: number;
  activeTitle: string;
  activeDescription: string;
  doneTitle: string;
  failedTitle: string;
  doneDescription: string;
}): DockSnapshot {
  const total = input.total > 0 ? input.total : undefined;
  if (input.active) {
    return {
      active: true,
      title: input.activeTitle,
      description: input.activeDescription,
      total,
    };
  }
  const failed = input.failed > 0;
  return {
    active: false,
    failed,
    title: failed ? input.failedTitle : input.doneTitle,
    description: failed
      ? `${input.failed} of ${input.total} failed — please try again.`
      : input.doneDescription,
    total,
  };
}

/**
 * The term whose date window contains today, if any. Shown as the pick while
 * no term has been chosen by hand, so the board always reflects the term this
 * desk is actually following — and rolls over on its own when a window ends.
 *
 * The active school year is checked first: overlapping/left-open windows on an
 * older year must never make the board present that year while the server (and
 * every unscoped request) is following the active one.
 */
function termCoveringToday(years: SchoolYearOption[], todayKey: string) {
  const ordered = [...years].sort((a, b) => Number(b.isActive) - Number(a.isActive));
  for (const y of ordered) {
    for (const t of [...y.terms].sort((a, b) => a.termNumber - b.termNumber)) {
      const start = t.startDate?.slice(0, 10);
      const end = t.endDate?.slice(0, 10);
      if (start && end && start <= todayKey && todayKey <= end) {
        return {
          schoolYearId: y.id,
          schoolYearName: y.name,
          termId: t.id,
          termNumber: t.termNumber,
        };
      }
    }
  }
  return null;
}

/** True when today falls inside a term's stored date window. */
function termCoversToday(
  startDate: string | null,
  endDate: string | null,
  todayKey: string,
): boolean {
  const start = startDate?.slice(0, 10);
  const end = endDate?.slice(0, 10);
  return Boolean(start && end && start <= todayKey && todayKey <= end);
}

export type TemplateView = "grid" | "sections" | "subjects" | "teachers" | "config" | "term" | "publish";

/** `?view=` → panel. Unknown or missing values land on the timetable grid. */
function parseView(raw: string): TemplateView {
  switch (raw) {
    case "config":
      return "config";
    case "publish":
      return "publish";
    case "teachers":
    case "add-teacher":
      return "teachers";
    case "subjects":
    case "add-subject":
      return "subjects";
    case "sections":
    case "add-section":
      return "sections";
    case "term":
    case "school-year":
    case "add-school-year":
    case "scope":
      return "term";
    default:
      return "grid";
  }
}

function TemplateInner({ initialView }: { initialView?: TemplateView }) {
  const searchParams = useSearchParams();
  const params = useParams<{ section?: string | string[] }>();
  const router = useRouter();
  // Pretty route: /admin/academics/schedule/template/<section-name-slug>. The
  // legacy ?sectionId= deep link still works.
  const routeSegment = Array.isArray(params?.section) ? (params.section[0] ?? "") : (params?.section ?? "");
  const slugSegment = routeSegment ? decodeURIComponent(String(routeSegment)) : "";
  const initialSectionId = searchParams.get("sectionId") ?? "";
  const viewParam = searchParams.get("view") ?? "";
  const [sectionId, setSectionId] = useState(initialSectionId);
  const [configProgress, setConfigProgress] = useState<ConfigSaveProgress | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [confirmUnlock, setConfirmUnlock] = useState(false);
  // Publish/unpublish confirmation overlay, opened from the grid header action.
  const [publishConfirm, setPublishConfirm] = useState<PublishConfirmMode | null>(null);
  // Dock snapshot for the publish action (auto-closes the overlay on settle).
  const [publishProgress, setPublishProgress] = useState<{
    active: boolean;
    failed?: boolean;
    mode: PublishConfirmMode;
    count: number;
  } | null>(null);
  // One panel at a time: the sidebar picks which action's inputs are shown.
  const dock = useDock();
  const [view, setView] = useState<TemplateView>(() => initialView ?? parseView(viewParam));
  const [kanbanAddOpen, setKanbanAddOpen] = useState(viewParam === "add-subject");
  const [teacherKanbanAddOpen, setTeacherKanbanAddOpen] = useState(viewParam === "add-teacher");
  // Sections are created here (not on the schedule index): a new section is
  // only useful once its weekly grid can be built right below.
  const [sectionAddOpen, setSectionAddOpen] = useState(viewParam === "add-section");
  // Rows the dialog painted at confirm time — they show until the live list
  // carries the saved section (or the save fails and drops them).
  const [pendingSections, setPendingSections] = useState<
    Array<CreatedSection & { submittedAt: number }>
  >([]);
  // School years are seeded from the School year panel (same dialog pattern).
  const [schoolYearAddOpen, setSchoolYearAddOpen] = useState(viewParam === "add-school-year");
  // Trimesters are fixed at 1–3; only their date windows are configured here.
  const [termsYearId, setTermsYearId] = useState<string | null>(null);
  // The Configure tab shows the year's presets; editing one opens the stepper
  // overlay. `presetId === null` means "new configuration".
  const [configEditor, setConfigEditor] = useState<{
    presetId: string | null;
    name: string;
    config: DayConfig;
  } | null>(null);
  const [presetDeleteTarget, setPresetDeleteTarget] = useState<ScheduleConfigPreset | null>(null);
  // Deep-link sync (?sectionId=… / ?view=…): runs once per param change, not per render.
  /* eslint-disable react-hooks/set-state-in-effect -- deep-link landing sync */
  useEffect(() => {
    if (initialSectionId) {
      setSectionId(initialSectionId);
    }
  }, [initialSectionId]);
  useEffect(() => {
    if (!viewParam) return;
    setView(parseView(viewParam));
    setKanbanAddOpen(viewParam === "add-subject");
    setTeacherKanbanAddOpen(viewParam === "add-teacher");
    setSectionAddOpen(viewParam === "add-section");
    setSchoolYearAddOpen(viewParam === "add-school-year");
  }, [viewParam]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Keep the active panel in the URL so reloading the page lands on the same
  // tab (Timetable / Subjects / Teachers / Configure / Send) instead of resetting.
  // Dedicated route pages (/schedule/publish, /schedule/sections, …) already
  // carry the panel in the path, so they never append a `?view=` on top of it.
  useEffect(() => {
    if (initialView) return;
    if (viewParam === view) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", view);
    router.replace(`${window.location.pathname}?${params.toString()}`, { scroll: false });
  }, [view, viewParam, searchParams, router, initialView]);

  const [createProgress, setCreateProgress] = useState<SubjectCreateProgress | null>(null);
  const [deleteProgress, setDeleteProgress] = useState<SubjectDeleteProgress | null>(null);
  const [teacherCreateProgress, setTeacherCreateProgress] = useState<TeacherCreateProgress | null>(null);
  const [teacherDeleteProgress, setTeacherDeleteProgress] = useState<TeacherDeleteProgress | null>(null);
  // Destructive actions confirm through one shared overlay; the lock comes
  // from the API (sections: learners/records, school years: any linked row).
  const [sectionDeleteTarget, setSectionDeleteTarget] = useState<ScheduleSection | null>(null);
  const [yearDeleteTarget, setYearDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  /** Top-right actions: jump straight into the matching add form. */
  const openAddSubject = () => {
    setView("subjects");
    setTeacherKanbanAddOpen(false);
    setKanbanAddOpen(true);
  };

  const openAddTeacher = () => {
    setView("teachers");
    setKanbanAddOpen(false);
    setTeacherKanbanAddOpen(true);
  };

  const handleKanbanAddOpenChange = (open: boolean) => setKanbanAddOpen(open);

  const handleTeacherKanbanAddOpenChange = (open: boolean) => setTeacherKanbanAddOpen(open);

  const collapseSubjectsView = () => {
    setView("grid");
    setKanbanAddOpen(false);
  };

  const collapseTeachersView = () => {
    setView("grid");
    setTeacherKanbanAddOpen(false);
  };

  const collapseConfigView = () => setConfigEditor(null);

  const {
    activeTerm,
    schoolYears,
    activeSchoolYear,
    isLoading: schoolYearsLoading,
    isError: schoolYearsError,
    setActiveTerm,
    clearActiveTerm,
  } = useTerm();
  const termKey = `${activeTerm?.schoolYearId ?? ""}:${activeTerm?.termId ?? ""}`;
  const invalidateSchedule = useAdminScheduleInvalidate();
  const queryClient = useQueryClient();
  const catalog = useScheduleCatalog(termKey);
  const { workload, setWorkload } = useTemplateWorkload(termKey);
  // The grid block is always on the page, so conflicts only need to load once a
  // section is picked (the grid is the only consumer).
  const needsGrid = Boolean(sectionId);
  const conflicts = useScheduleConflicts(termKey, workload, { enabled: needsGrid });

  const sectionsQuery = useLiveQuery<{ sections: ScheduleSection[] }>({
    queryKey: ["admin-schedule-section", "template", termKey],
    queryFn: async () => {
      const { data } = await apiClient.get<{ sections: ScheduleSection[] }>("/api/admin/schedule");
      return data;
    },
    enabled: true,
    // Admin has no realtime channel: the open grid polls so an edit in another
    // tab (or the publish action) lands without a manual refresh.
    refetchInterval: 20_000,
  });

  const sections = useMemo(() => sectionsQuery.data?.sections ?? [], [sectionsQuery.data]);
  const section = sections.find((s) => s.id === sectionId) ?? null;

  // Optimistic rows painted at confirm time stay on the board only while the
  // live list does not carry the same name + grade yet. Once the list has
  // refetched after the submit (with a small grace window for the save), an
  // absent row means it landed outside this year's list — drop it.
  const pendingRows = pendingSections.filter((row) => {
    if (sections.some((s) => s.name === row.name && s.gradeLevel === row.gradeLevel)) return false;
    return sectionsQuery.dataUpdatedAt <= row.submittedAt + 4000;
  });

  // School-year delete locks: read only while the School year panel is open.
  const yearLocksQuery = useLiveQuery<{ schoolYears: SchoolYearLockRow[] }>({
    queryKey: ["admin-schedule-school-years", termKey],
    queryFn: async () => {
      const { data } = await apiClient.get<{ schoolYears: SchoolYearLockRow[] }>(
        "/api/admin/schedule/school-years",
      );
      return data;
    },
    enabled: view === "term",
  });
  const yearLocks = useMemo(
    () => new Map((yearLocksQuery.data?.schoolYears ?? []).map((y) => [y.id, y])),
    [yearLocksQuery.data],
  );

  /** Patch every cached section list (`["admin-schedule-section", …]`). */
  const patchSectionLists = (updater: (list: ScheduleSection[]) => ScheduleSection[]) => {
    for (const entry of queryClient
      .getQueryCache()
      .findAll({ queryKey: ["admin-schedule-section"] })) {
      queryClient.setQueryData(entry.queryKey, (prev: unknown) => {
        if (
          prev &&
          typeof prev === "object" &&
          Array.isArray((prev as { sections?: unknown }).sections)
        ) {
          return {
            ...(prev as Record<string, unknown>),
            sections: updater((prev as { sections: ScheduleSection[] }).sections ?? []),
          };
        }
        return prev;
      });
    }
  };

  const deleteSectionMutation = useMutation({
    mutationFn: async (target: ScheduleSection) => {
      await apiClient.delete(`/api/admin/schedule/sections/${target.id}`);
      return target;
    },
    onMutate: async (target) => {
      // Instant: close the prompt and drop the card this tick; the DELETE
      // confirms in the background. A failure refetches the restored row.
      setSectionDeleteTarget(null);
      await queryClient.cancelQueries({ queryKey: ["admin-schedule-section"] });
      patchSectionLists((list) => list.filter((s) => s.id !== target.id));
      if (sectionId === target.id) setSectionId("");
    },
    onSuccess: (target) => {
      toast.success({
        title: "Section deleted",
        description: `${target.name} was removed from the template.`,
      });
    },
    onError: (err: unknown) => {
      toast.error({
        title: "Could not delete section",
        description: apiErrorMessage(err, "The section was not deleted."),
      });
    },
    onSettled: () => invalidateSchedule(),
  });

  const deleteYearMutation = useMutation({
    mutationFn: async (target: { id: string; name: string; taskId: string }) => {
      await apiClient.delete(`/api/admin/schedule/school-years/${target.id}`);
      return target;
    },
    onMutate: async (target) => {
      // Instant: drop the year card and its lock row this tick.
      setYearDeleteTarget(null);
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ["term-picker", "school-years"] }),
        queryClient.cancelQueries({ queryKey: ["admin-schedule-school-years"] }),
      ]);
      queryClient.setQueryData<SchoolYearOption[]>(
        ["term-picker", "school-years"],
        (prev) => prev?.filter((y) => y.id !== target.id),
      );
      queryClient.setQueriesData<{ schoolYears: SchoolYearLockRow[] }>(
        { queryKey: ["admin-schedule-school-years"] },
        (prev) =>
          prev
            ? { ...prev, schoolYears: prev.schoolYears.filter((y) => y.id !== target.id) }
            : prev,
      );
    },
    onSuccess: (target) => {
      dock.completeTask(target.taskId, `${target.name} and its terms were removed.`);
      // The desk may still be steering the deleted year; fall back to the
      // server's active scope instead of querying a term that no longer exists.
      if (activeTerm?.schoolYearId === target.id) {
        clearActiveTerm();
      }
      void queryClient.invalidateQueries({ queryKey: ["term-picker"] });
      toast.success({
        title: "School year deleted",
        description: `${target.name} and its terms were removed.`,
      });
    },
    onError: (err: unknown, target) => {
      dock.failTask(
        target.taskId,
        apiErrorMessage(err, "The school year was not deleted."),
      );
      // Restore the card from the server (it was dropped optimistically).
      void queryClient.invalidateQueries({ queryKey: ["term-picker"] });
      toast.error({
        title: "Could not delete school year",
        description: apiErrorMessage(err, "The school year was not deleted."),
      });
    },
    onSettled: () => invalidateSchedule(),
  });

  // Resolve /template/<section-slug> once the section list lands.
  const [slugResolved, setSlugResolved] = useState(false);
  /* eslint-disable react-hooks/set-state-in-effect -- one-shot slug → id resolution */
  useEffect(() => {
    if (slugResolved || !slugSegment || sections.length === 0) return;
    const hit = matchSectionSlug(slugSegment, sections);
    if (hit) {
      setSectionId(hit.id);
    }
    setSlugResolved(true);
  }, [slugSegment, sections, slugResolved, viewParam]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Picking a section keeps the URL shareable: /template/<slug> (+ ?view=…).
  const handleSectionChange = (id: string) => {
    setSectionId(id);
    const picked = sections.find((s) => s.id === id);
    if (!picked) return;
    const slug = sectionSlug(picked.name, picked.gradeLevel, sections);
    router.replace(`/admin/academics/schedule/template/${encodeURIComponent(slug)}?view=${encodeURIComponent(view)}`, { scroll: false });
  };

  // Back to the section list: drop the picked section (and its slug) so the
  // desk shows the section data table again instead of one timetable.
  const backToSectionList = () => {
    setSectionId("");
    setSlugResolved(false);
    router.replace(
      `/admin/academics/schedule/template?view=${encodeURIComponent(view)}`,
      { scroll: false },
    );
  };

  // Confirming closes at once: the new rows paint straight away, the shared
  // Dock reports the save, and the live list replaces them on its next fetch.
  const handleSectionSubmitted = (created: CreatedSection[]) => {
    setSectionAddOpen(false);
    if (created.length === 0) return;
    const submittedAt = Date.now();
    setPendingSections((prev) => [...prev, ...created.map((row) => ({ ...row, submittedAt }))]);
    setView("sections");
  };

  // Rows that never reached the server leave the board immediately.
  const handleSectionRejected = (pendingIds: string[]) => {
    if (pendingIds.length === 0) return;
    setPendingSections((prev) => prev.filter((row) => !pendingIds.includes(row.id)));
  };

  /** Open one section's weekly grid from the Sections panel. */
  const openSectionGrid = (id: string) => {
    const picked = sections.find((s) => s.id === id);
    if (!picked) return;
    setSectionId(id);
    setView("grid");
    const slug = sectionSlug(picked.name, picked.gradeLevel, sections);
    router.replace(
      `/admin/academics/schedule/template/${encodeURIComponent(slug)}?view=grid`,
      { scroll: false },
    );
  };

  // Scope shown in the School year panel: the stored pick, else the server's
  // active school year and its first term.
  const scopeYear =
    schoolYears.find((y) => y.id === activeTerm?.schoolYearId) ??
    schoolYears.find((y) => y.id === activeSchoolYear?.id) ??
    schoolYears[0] ??
    null;
  /** Changing a term tile steers this desk in place — every query is keyed by
   *  the term, so no full reload is needed. */
  const applyScope = (yearId: string, termId: string) => {
    const year = schoolYears.find((y) => y.id === yearId);
    const term = year?.terms.find((t) => t.id === termId);
    if (!year || !term) return;
    setActiveTerm(
      {
        schoolYearId: year.id,
        schoolYearName: year.name,
        termId: term.id,
        termNumber: term.termNumber,
      },
      { reload: false },
    );
  };
  /** Next label to seed: one school year past the latest on file. */
  const suggestedYearName = (() => {
    const starts = schoolYears
      .map((y) => Number(y.name.match(/\d{4}/)?.[0] ?? 0))
      .filter((n) => n > 0);
    const base = starts.length > 0 ? Math.max(...starts) + 1 : new Date().getFullYear();
    return `SY ${base}-${base + 1}`;
  })();
  const hasActiveYear = schoolYears.some((y) => y.isActive);
  /** The year whose trimester dates are being configured (dialog). */
  const termsYear = termsYearId ? schoolYears.find((y) => y.id === termsYearId) ?? null : null;
  /**
   * Auto scope: the term whose date window contains today. Shown as the pick
   * while no term has been chosen by hand, so the board always reflects the
   * term this desk is actually following — and rolls over on its own when a
   * term window ends.
   */
  const todayKey = localTodayKey();
  const autoTerm = termCoveringToday(schoolYears, todayKey);
  // Only the term whose date window contains today may be worked on from the
  // board. A stored future/past pick stays in storage (the Configure tab can
  // still steer it to prepare a term), but the board itself falls back to
  // today's term instead of presenting the out-of-window pick as selectable.
  const activeTermCoversToday = (() => {
    if (!activeTerm) return false;
    const year = schoolYears.find((y) => y.id === activeTerm.schoolYearId);
    const term = year?.terms.find((t) => t.id === activeTerm.termId);
    return term ? termCoversToday(term.startDate, term.endDate, todayKey) : false;
  })();
  const boardActiveTerm = activeTermCoversToday ? activeTerm : null;
  // A hand-picked term wins; otherwise today's window is the one in use.
  const steeringTermId = boardActiveTerm?.termId ?? autoTerm?.termId ?? null;
  const steeringYearId = boardActiveTerm?.schoolYearId ?? autoTerm?.schoolYearId ?? null;
  // A pick left over from an earlier session may point outside today's window
  // (e.g. a future term prepared last month). Opening this board drops it so
  // the whole admin desk falls back to today's term — the only one it can work
  // on here.
  useEffect(() => {
    if (view !== "term") return;
    if (!activeTerm || activeTermCoversToday) return;
    if (schoolYears.length === 0) return;
    clearActiveTerm();
  }, [view, activeTerm, activeTermCoversToday, schoolYears.length, clearActiveTerm]);
  /**
   * Create-then-configure: a new school year lands on the board and opens its
   * trimester-date dialog straight away. Steering happens once the windows are
   * in place (pick a term tile).
   */
  const handleSchoolYearCreated = (year: CreatedSchoolYear) => {
    setSchoolYearAddOpen(false);
    setTermsYearId(year.id);
  };

  const cellsHook = useScheduleCells(
    section ?? { id: "__template__", name: "", gradeLevel: "G7", timetableEntries: [] } as unknown as ScheduleSection,
    { subjectById: catalog.subjectById, teacherById: catalog.teacherById },
    { silent: true, persistKey: `zentra.schedule-template-cells:${termKey}:${sectionId}` },
  );
  const stagedKeys = useMemo(
    () => new Set(cellsHook.pendingSlots.map((p) => p.key)),
    [cellsHook.pendingSlots],
  );
  const publishMutation = usePublishTimetable();

  /**
   * Runs the confirmed publish/unpublish. Publishing first flushes any staged
   * slots (that is the save step now), then the overlay closes and the shared
   * Dock carries the progress until the request settles.
   */
  const confirmPublish = async () => {
    if (!section || !publishConfirm) return;
    const mode = publishConfirm;
    const isPublished = cellsHook.isLocked || cellsHook.serverLocked;
    const count =
      mode === "publish"
        ? cellsHook.filledCount
        : section.timetableEntries.filter((e) => e.status === "APPROVED").length;
    setPublishConfirm(null);
    // A draft save only flushes the staged slots — asking the server to switch
    // an all-draft section back to draft is a no-op it rejects.
    if (mode === "unpublish" && !isPublished) {
      if (cellsHook.pendingSlots.length > 0) await cellsHook.saveAll();
      return;
    }
    if (cellsHook.pendingSlots.length > 0) {
      await cellsHook.saveAll();
    }
    setPublishProgress({ active: true, mode, count });
    publishMutation.mutate(
      { sectionId: section.id, status: mode === "publish" ? "PUBLISHED" : "DRAFT" },
      {
        onSuccess: () => setPublishProgress({ active: false, mode, count }),
        onError: () => setPublishProgress({ active: false, failed: true, mode, count }),
      },
    );
  };

  // Every confirmed action on this page reports to the one shared Dock
  // (`components/dock`), never its own floating panel.
  const subjectDeleteDock = useMemo<DockSnapshot | null>(() => {
    if (!deleteProgress) return null;
    const rows = deleteProgress.rows;
    const total = rows.length;
    const settled = rows.filter((r) => r.status !== "deleting").length;
    const failed = rows.filter((r) => r.status === "failed").length;
    return dockSnapshotOf({
      active: deleteProgress.active,
      total,
      settled,
      failed,
      activeTitle: `Deleting ${rows[0]?.name ?? "subject"}…`,
      activeDescription: `${settled}/${total} settled — ${rows[0]?.code ?? "catalog"}`,
      doneTitle: `Deleted ${total} subject${total === 1 ? "" : "s"}`,
      failedTitle: "Delete incomplete",
      doneDescription: `${total} removed from the catalog`,
    });
  }, [deleteProgress]);

  const configDock = useMemo<DockSnapshot | null>(() => {
    if (!configProgress) return null;
    if (configProgress.active) {
      return { active: true, title: "Saving school day…", description: configProgress.summary };
    }
    return configProgress.status === "failed"
      ? {
          active: false,
          failed: true,
          title: "Save failed",
          description: configProgress.message ?? "The school day was not saved.",
        }
      : { active: false, title: "School day saved", description: configProgress.summary };
  }, [configProgress]);

  const publishDock = useMemo<DockSnapshot | null>(() => {
    if (!publishProgress) return null;
    const publishing = publishProgress.mode === "publish";
    const slots = `${publishProgress.count} slot${publishProgress.count === 1 ? "" : "s"}`;
    if (publishProgress.active) {
      return {
        active: true,
        title: publishing ? "Publishing timetable..." : "Saving timetable draft...",
        description: slots,
        total: publishProgress.count,
      };
    }
    if (publishProgress.failed) {
      return {
        active: false,
        failed: true,
        title: "Timetable status not changed",
        description: "The request failed - nothing was changed.",
      };
    }
    return {
      active: false,
      title: publishing ? "Timetable published" : "Timetable saved as draft",
      description: publishing ? `${slots} live for teachers.` : `${slots} kept as a working draft.`,
    };
  }, [publishProgress]);

  const teacherCreateDock = useMemo<DockSnapshot | null>(() => {
    if (!teacherCreateProgress) return null;
    const rows = teacherCreateProgress.rows;
    const total = rows.length;
    const settled = rows.filter((r) => r.status !== "creating").length;
    const failed = rows.filter((r) => r.status === "failed").length;
    return dockSnapshotOf({
      active: teacherCreateProgress.active,
      total,
      settled,
      failed,
      activeTitle:
        total > 0 ? `Creating ${total} teacher${total === 1 ? "" : "s"}…` : "Creating teacher names…",
      activeDescription: total > 0 ? `${settled}/${total} saved` : "Saving to server",
      doneTitle: `Added ${total} teacher${total === 1 ? "" : "s"}`,
      failedTitle: "Creation incomplete",
      doneDescription: `${total} name${total === 1 ? "" : "s"} now pickable in timetable slots`,
    });
  }, [teacherCreateProgress]);

  const teacherDeleteDock = useMemo<DockSnapshot | null>(() => {
    if (!teacherDeleteProgress) return null;
    const rows = teacherDeleteProgress.rows;
    const total = rows.length;
    const settled = rows.filter((r) => r.status !== "deleting").length;
    const failed = rows.filter((r) => r.status === "failed").length;
    return dockSnapshotOf({
      active: teacherDeleteProgress.active,
      total,
      settled,
      failed,
      activeTitle: `${total} teacher${total === 1 ? "" : "s"} · deleting…`,
      activeDescription: `${settled}/${total} removed`,
      doneTitle: `Deleted ${total} teacher${total === 1 ? "" : "s"}`,
      failedTitle: "Delete incomplete",
      doneDescription: `${total} removed from the catalog`,
    });
  }, [teacherDeleteProgress]);

  // Subject creation reports no settle flag (its progress clears on finish),
  // so the Dock settles it when the state goes away.
  const subjectCreateDock = useMemo<DockSnapshot | null>(() => {
    if (!createProgress) return null;
    const n = createProgress.count;
    return {
      active: true,
      title: `Creating ${n} subject${n === 1 ? "" : "s"}…`,
      description: `${createProgress.gradeLabel} · ${createProgress.categoryLabel}`,
      total: n,
    };
  }, [createProgress]);

  useDockProgressTask(subjectDeleteDock);
  useDockProgressTask(configDock);
  useDockProgressTask(publishDock);
  useDockProgressTask(teacherCreateDock);
  useDockProgressTask(teacherDeleteDock);
  useDockProgressTask(subjectCreateDock);

  const configMutation = useMutation({
    mutationFn: async ({
      presetId,
      name,
      config,
    }: {
      presetId: string | null;
      name: string;
      config: DayConfig;
    }) => {
      const { startTime, periodMins, lunch, morningRecess, afternoonRecess } = config;
      // A brand-new shape goes live immediately; editing an existing one keeps
      // whichever preset the school year is already using.
      const body = presetId
        ? { startTime, periodMins, lunch, morningRecess, afternoonRecess, name }
        : { startTime, periodMins, lunch, morningRecess, afternoonRecess, name, activate: true };
      const { data } = presetId
        ? await apiClient.patch<{ preset: ScheduleConfigPreset }>(
            `/api/admin/schedule/configs/${presetId}`,
            body,
          )
        : await apiClient.post<{ preset: ScheduleConfigPreset }>(
            "/api/admin/schedule/configs",
            body,
          );
      return data.preset;
    },
    onSuccess: (preset, variables) => {
      invalidateSchedule();
      setConfigProgress((prev) =>
        prev ? { ...prev, active: false, done: true, status: "saved" } : prev,
      );
      toast.success({
        title: `${preset.name} saved`,
        description: variables.presetId
          ? "The saved configuration was updated."
          : "Template reshaped itself and this configuration is in use.",
      });
    },
    onError: (err: unknown) => {
      const message = apiErrorMessage(err, "Failed to save school-day configuration.");
      setConfigProgress((prev) =>
        prev ? { ...prev, active: false, done: true, status: "failed", message } : prev,
      );
      toast.error({ title: "Could not save configuration", description: message });
    },
  });

  const activateConfigMutation = useMutation({
    mutationFn: async (presetId: string) => {
      const { data } = await apiClient.post<{ preset: ScheduleConfigPreset }>(
        `/api/admin/schedule/configs/${presetId}/activate`,
      );
      return data.preset;
    },
    onSuccess: (preset) => {
      invalidateSchedule();
      toast.success({ title: `${preset.name} is now in use`, description: "Timetables re-timed." });
    },
    onError: (err: unknown) => {
      toast.error({
        title: "Could not switch configuration",
        description: apiErrorMessage(err, "Try again."),
      });
    },
  });

  const deleteConfigMutation = useMutation({
    mutationFn: async (presetId: string) => {
      await apiClient.delete(`/api/admin/schedule/configs/${presetId}`);
    },
    onSuccess: () => {
      invalidateSchedule();
      setPresetDeleteTarget(null);
      toast.success({ title: "Configuration deleted" });
    },
    onError: (err: unknown) => {
      toast.error({
        title: "Could not delete configuration",
        description: apiErrorMessage(err, "Try again."),
      });
    },
  });

  const handleConfigApply = (next: DayConfig, name: string) => {
    const { items, summary } = describeConfig(next);
    if (next.workload) setWorkload(next.workload);
    // Stay on the Configure tab: close the stepper and let the dock report the
    // save while the list refetches with the new/changed preset.
    setConfigEditor(null);
    setConfigProgress({ active: true, done: false, status: "saving", items, summary });
    configMutation.mutate({ presetId: configEditor?.presetId ?? null, name, config: next });
  };

  /** Open the stepper for a new preset, seeded from the active shape. */
  const openNewConfig = () => {
    setConfigEditor({
      presetId: null,
      name: `Configuration ${catalog.presets.length + 1}`,
      config: catalog.activeConfig ?? DEFAULT_DAY_CONFIG,
    });
  };

  const openEditConfig = (preset: ScheduleConfigPreset) => {
    setConfigEditor({ presetId: preset.id, name: preset.name, config: preset });
  };

  const duplicateConfig = (preset: ScheduleConfigPreset) => {
    setConfigEditor({
      presetId: null,
      name: `${preset.name} copy`,
      config: preset,
    });
  };

  /** Configure starts by picking the school year; the desk follows the pick. */
  const pickConfigYear = (yearId: string) => {
    const year = schoolYears.find((y) => y.id === yearId);
    if (!year || year.terms.length === 0) return;
    // The day shape is year-level, so any term of the year scopes the desk
    // correctly; keep the current term when it already belongs to that year.
    const term =
      year.terms.find((t) => t.id === activeTerm?.termId) ??
      [...year.terms].sort((a, b) => a.termNumber - b.termNumber)[0];
    if (!term) return;
    setConfigEditor(null);
    applyScope(year.id, term.id);
  };

  // One panel at a time — the skeleton mirrors whichever panel is open.
  if (sectionsQuery.isLoading) {
    return <ScheduleTemplateSkeleton view={view} />;
  }

  const gradeSubjects = section
    ? catalog.subjects.filter((s) => s.gradeLevel === section.gradeLevel)
    : catalog.subjects;
  const activeConfig = catalog.activeConfig;
  const rows = activeConfig ? buildTimetable({ ...activeConfig, workload }) : [];
  // No catalog → the section picker has nothing to render, so the panel shows
  // the "add the catalog first" note instead.
  const catalogMissing = catalog.subjects.length === 0 || catalog.teachers.length === 0;

  const handleTemplateChange = (day: number, period: number, subjectId: string, teacherNameId: string) => {
    if (!section) return;
    // Low latency: stage instantly in the grid (persisted locally), no toast,
    // no waiting — Publish flushes staged slots with a progress dock.
    const key = cellKey(day, period);
    cellsHook.setCells((prev) => ({
      ...prev,
      [key]: { subjectId, teacherNameId: teacherNameId === "" ? null : teacherNameId },
    }));
    cellsHook.setSlotError(null);
  };

  const handleTemplateClear = (day: number, period: number) => {
    if (!section) return;
    const key = cellKey(day, period);
    if ((cellsHook.cells[key] ?? null) === null) return;
    cellsHook.setCells((prev) => ({ ...prev, [key]: null }));
    cellsHook.removeSlot.mutate({ day, period, key });
  };

  return (
    <section className="flex w-full flex-col gap-5">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        {view === "subjects" ? (
          <section id="subjects" aria-label="Subjects" className="flex scroll-mt-6 flex-col gap-4">
            <SubjectCatalogKanban
              subjects={catalog.subjects}
              pending={catalog.subjectsQuery.isPending}
              loadError={catalog.subjectsQuery.isError}
              onBack={collapseSubjectsView}
              addOpen={false}
              onAddOpenChange={handleKanbanAddOpenChange}
              onCreateProgress={setCreateProgress}
              onDeleteProgress={setDeleteProgress}
            />
            <TemplateFormOverlay
              open={kanbanAddOpen}
              onClose={() => setKanbanAddOpen(false)}
              label="Add subjects"
              variant="drawer"
            >
              <SubjectAddKanban
                onClose={() => setKanbanAddOpen(false)}
                onProgress={setCreateProgress}
              />
            </TemplateFormOverlay>
          </section>
        ) : view === "teachers" ? (
          <section id="teachers" aria-label="Teachers" className="flex scroll-mt-6 flex-col gap-4">
            <TeacherCatalogKanban
              teachers={catalog.teachers}
              pending={catalog.teachersQuery.isPending}
              loadError={catalog.teachersQuery.isError}
              onBack={collapseTeachersView}
              addOpen={false}
              onAddOpenChange={handleTeacherKanbanAddOpenChange}
              onCreateProgress={setTeacherCreateProgress}
              onDeleteProgress={setTeacherDeleteProgress}
            />
            <TemplateFormOverlay
              open={teacherKanbanAddOpen}
              onClose={() => setTeacherKanbanAddOpen(false)}
              label="Add teachers"
              variant="drawer"
            >
              <TeacherAddKanban
                onClose={() => setTeacherKanbanAddOpen(false)}
                onProgress={setTeacherCreateProgress}
              />
            </TemplateFormOverlay>
          </section>
        ) : view === "config" ? (
          <section
            id="day-configuration"
            aria-label="Day configuration"
            className="flex scroll-mt-6 flex-col gap-4"
          >
            <ScheduleConfigPresets
              presets={catalog.presets}
              activeId={catalog.activePresetId}
              years={schoolYears.map((y) => ({
                id: y.id,
                name: y.name,
                isActive: y.isActive,
              }))}
              selectedYearId={scopeYear?.id ?? null}
              onSelectYear={pickConfigYear}
              busy={
                configMutation.isPending ||
                activateConfigMutation.isPending ||
                deleteConfigMutation.isPending
              }
              onNew={openNewConfig}
              onEdit={openEditConfig}
              onDuplicate={duplicateConfig}
              onActivate={(preset) => activateConfigMutation.mutate(preset.id)}
              onDelete={setPresetDeleteTarget}
            />

            {presetDeleteTarget ? (
              <DeleteConfirmOverlay
                title={`Delete ${presetDeleteTarget.name}?`}
                description="This removes the saved configuration. The school day in use is not affected."
                confirmLabel="Delete configuration"
                pending={deleteConfigMutation.isPending}
                onCancel={() => setPresetDeleteTarget(null)}
                onConfirm={() => deleteConfigMutation.mutate(presetDeleteTarget.id)}
              />
            ) : null}
          </section>
        ) : view === "sections" ? (
          <section id="sections" aria-label="Sections" className="flex scroll-mt-6 flex-col gap-4">
            <SectionsBoard
              sections={sections}
              pending={pendingRows}
              onOpenGrid={openSectionGrid}
              onCreate={() => setSectionAddOpen(true)}
              onDelete={setSectionDeleteTarget}
            />
            {sectionDeleteTarget ? (
              <DeleteConfirmOverlay
                title={`Delete ${sectionDeleteTarget.name}?`}
                description="This cannot be undone. Only a section with no learners and no records can be deleted."
                confirmLabel="Delete section"
                pending={deleteSectionMutation.isPending}
                onCancel={() => setSectionDeleteTarget(null)}
                onConfirm={() => deleteSectionMutation.mutate(sectionDeleteTarget)}
              />
            ) : null}
          </section>
        ) : view === "term" ? (
          <section
            id="school-year"
            aria-label="School year and term"
            className="flex scroll-mt-6 flex-col gap-3"
          >
            <ScheduleSchoolYears
              years={schoolYears}
              yearLocks={yearLocks}
              loading={schoolYearsLoading}
              error={schoolYearsError}
              steeringYearId={steeringYearId}
              steeringTermId={steeringTermId}
              activeTerm={
                boardActiveTerm
                  ? {
                      schoolYearId: boardActiveTerm.schoolYearId,
                      schoolYearName: boardActiveTerm.schoolYearName,
                      termNumber: boardActiveTerm.termNumber,
                    }
                  : null
              }
              autoTerm={
                autoTerm
                  ? {
                      schoolYearId: autoTerm.schoolYearId,
                      schoolYearName: autoTerm.schoolYearName,
                      termNumber: autoTerm.termNumber,
                    }
                  : null
              }
              activeSchoolYearName={activeSchoolYear?.name ?? null}
              onAdd={() => setSchoolYearAddOpen(true)}
              onSetDates={setTermsYearId}
              onRequestDelete={setYearDeleteTarget}
              onApplyScope={(yearId, termId) => {
                // Defensive: the board only enables today's term, but never
                // steer to an out-of-window term even if a caller tries.
                const term = schoolYears
                  .find((y) => y.id === yearId)
                  ?.terms.find((t) => t.id === termId);
                if (!term || !termCoversToday(term.startDate, term.endDate, todayKey)) return;
                applyScope(yearId, termId);
              }}
              onFollowToday={() => clearActiveTerm()}
            />
            {yearDeleteTarget ? (
              <DeleteConfirmOverlay
                title={`Delete ${yearDeleteTarget.name}?`}
                description="This cannot be undone. The school year's three terms are removed with it; only a year with no sections, learners, or term records can be deleted."
                confirmLabel="Delete school year"
                pending={deleteYearMutation.isPending}
                onCancel={() => setYearDeleteTarget(null)}
                onConfirm={() => {
                  if (!yearDeleteTarget) return;
                  // Close the confirm first: the shared Dock reports the
                  // delete, so the desk never waits on the network.
                  const taskId = dock.startTask({
                    kind: "term-context",
                    title: "Deleting school year",
                    description: `${yearDeleteTarget.name} · its three terms`,
                  });
                  deleteYearMutation.mutate({ ...yearDeleteTarget, taskId });
                }}
              />
            ) : null}
          </section>
        ) : view === "publish" ? (
          <section id="publish" aria-label="Publish timetable" className="flex scroll-mt-6 flex-col gap-4">
            <PublishTimetableKanban onOpenGrid={openSectionGrid} />
          </section>
        ) : (
          <>
            {/* Default view — the section list, or one section's timetable. */}
            <section
              id="teachers-subjects"
              aria-label="Teachers and subjects"
              className={`flex scroll-mt-6 flex-col gap-4 ${
                catalogMissing ? "min-h-[calc(100dvh-12rem)] justify-center" : ""
              }`}
            >
              {catalogMissing ? (
                <div className="flex min-h-[calc(100dvh-10rem)] items-center justify-center">
                  <TemplateSetupEmptyCard />
                </div>
              ) : sections.length === 0 ? (
                <PageEmptyCallout
                  fit
                  action={
                    <Button
                      className="h-7 gap-1 px-2.5 text-[12px]"
                      onClick={() => setSectionAddOpen(true)}
                    >
                      <Plus size={12} aria-hidden />
                      Add section
                    </Button>
                  }
                >
                  No sections yet for {scopeYear?.name ?? "this school year"} — add the first one,
                  then build and publish its weekly grid.
                </PageEmptyCallout>
              ) : (
                <div className="flex flex-col gap-3">
                  {section ? null : (
                  <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          aria-hidden
                        >
                          <CalendarDays size={14} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[13px] leading-tight font-semibold">
                            Section workspace
                          </p>
                          <p className="truncate text-[12px] leading-tight text-muted-foreground">
                            {sections.length} section{sections.length === 1 ? "" : "s"} this
                            year — pick one to build its weekly grid.
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                          variant="outline"
                          className="h-6 gap-1 px-2 text-[12px]"
                          onClick={() => setSectionAddOpen(true)}
                        >
                          <Layers size={12} aria-hidden />
                          New section
                        </Button>
                        <Button
                          variant="outline"
                          className="h-6 gap-1 px-2 text-[12px]"
                          onClick={openAddSubject}
                        >
                          <BookPlus size={12} aria-hidden />
                          Add subject
                        </Button>
                        <Button className="h-6 gap-1 px-2 text-[12px]" onClick={openAddTeacher}>
                          <UserPlus size={12} aria-hidden />
                          Add teacher
                        </Button>
                      </div>
                    </div>

                    <SectionWorkspaceTable
                      sections={sections}
                      activeId={sectionId}
                      onSelect={handleSectionChange}
                    />
                  </div>
                  )}

                  {section ? (
                    <>
                  {conflicts.data && conflicts.data.conflicts.length > 0 ? (
                    <ConflictsDock
                      key={conflicts.data.conflicts.map((c) => `${c.teacherNameId}:${c.day}:${c.period}`).join("|")}
                      conflicts={conflicts.data.conflicts}
                    />
                  ) : null}

                  {!activeConfig ? (
                    <p className="text-sm text-muted-foreground">Loading day configuration…</p>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Button
                            variant="outline"
                            className="h-6 shrink-0 gap-1 px-2 text-[12px]"
                            onClick={backToSectionList}
                            title="Back to the section list"
                          >
                            <ArrowLeft size={12} aria-hidden />
                            Section list
                          </Button>
                        </div>
                        {conflicts.data ? (
                          <span
                            className="ml-auto flex flex-wrap items-center justify-end gap-1.5"
                            role="status"
                          >
                            <Pill tone="amber" label="Double-book warnings">
                              <AlertTriangle size={12} aria-hidden className="text-amber-500" />
                              {conflicts.data.conflicts.length} double-book warning
                              {conflicts.data.conflicts.length === 1 ? "" : "s"}
                            </Pill>
                            <Pill tone="amber" label="Workload warnings">
                              <Gauge size={12} aria-hidden className="text-amber-500" />
                              {conflicts.data.workload.overDaily.length + conflicts.data.workload.overWeekly.length}{" "}
                              overload warning
                              {conflicts.data.workload.overDaily.length + conflicts.data.workload.overWeekly.length === 1
                                ? ""
                                : "s"}
                            </Pill>
                          </span>
                        ) : null}
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {cellsHook.pendingSlots.length > 0 && !cellsHook.saveProgress?.active ? (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setConfirmClearAll(true)}
                              title="Discard staged picks and revert to last-saved state"
                              className="h-6 gap-1 px-2 text-[12px]"
                            >
                              <Trash2 size={12} aria-hidden />
                              Clear all
                            </Button>
                          ) : null}
                          {cellsHook.isLocked || cellsHook.serverLocked ? (
                            <Button
                              variant="outline"
                              className="h-6 gap-1 px-2 text-[12px]"
                              onClick={() => setPublishConfirm("unpublish")}
                              disabled={publishMutation.isPending || !section}
                              aria-busy={publishMutation.isPending || undefined}
                              title="Move this timetable back to draft — teacher desks stop seeing it"
                            >
                              <Download size={12} aria-hidden />
                              Draft
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              className="h-6 gap-1 px-2 text-[12px]"
                              onClick={() => setPublishConfirm("unpublish")}
                              disabled={
                                publishMutation.isPending ||
                                !section ||
                                cellsHook.pendingSlots.length === 0
                              }
                              title="Save the staged slots as a draft — teachers do not see it until you publish"
                            >
                              <Download size={12} aria-hidden />
                              Save draft
                            </Button>
                          )}
                          <Button
                            className="h-6 gap-1 px-2 text-[12px]"
                            onClick={() => setPublishConfirm("publish")}
                            disabled={
                              publishMutation.isPending ||
                              !section ||
                              cellsHook.filledCount === 0 ||
                              cellsHook.isLocked ||
                              cellsHook.serverLocked
                            }
                            aria-busy={publishMutation.isPending || undefined}
                            title={
                              cellsHook.isLocked || cellsHook.serverLocked
                                ? "Already published — move it to draft first to make changes"
                                : cellsHook.pendingSlots.length > 0
                                  ? "Saves the staged slots, then publishes this timetable for teachers"
                                  : "Publish this timetable for teachers"
                            }
                          >
                            <Upload size={12} aria-hidden />
                            Publish
                          </Button>
                        </div>
                      </div>
                      <KanbanBoard
                        title={
                          section
                            ? `Timetable — ${section.name} | Grade ${section.gradeLevel.replace("G", "")}`
                            : "Timetable"
                        }
                        icon={
                          <span className="text-amber-500" aria-hidden>
                            <CalendarDays size={14} />
                          </span>
                        }
                        count={`${cellsHook.filledCount} slot${cellsHook.filledCount === 1 ? "" : "s"}`}
                        actions={
                          cellsHook.isLocked || (cellsHook.editMode && cellsHook.serverLocked) ? (
                            <div className="flex items-center gap-1.5">
                              {cellsHook.isLocked ? (
                                <Button
                                  variant="outline"
                                  className="h-6 gap-1 px-2 text-[12px]"
                                  onClick={() => setConfirmUnlock(true)}
                                  disabled={cellsHook.unlock.isPending}
                                  aria-busy={cellsHook.unlock.isPending || undefined}
                                >
                                  <Pencil size={12} aria-hidden />
                                  Edit
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  className="h-6 gap-1 px-2 text-[12px]"
                                  onClick={cellsHook.cancelEdit}
                                >
                                  <Undo2 size={12} aria-hidden />
                                  Cancel edit
                                </Button>
                              )}
                            </div>
                          ) : undefined
                        }
                        ariaLabel="Timetable slots"
                        boardLabel={
                          section
                            ? `${section.name} timetable, ${cellsHook.filledCount} slots, ${
                                cellsHook.isLocked ? "published" : cellsHook.editMode ? "editing" : "in progress"
                              }`
                            : "Timetable"
                        }
                        footer={
                          cellsHook.isLocked ? (
                            <p className="px-1 text-xs text-muted-foreground">
                              Published timetable — the official record for this term. It is read-only
                              until you press Edit.
                            </p>
                          ) : cellsHook.editMode && cellsHook.serverLocked ? (
                            <p className="px-1 text-xs text-muted-foreground">
                              Editing a working draft. The published slots stay official until you
                              press Publish — Cancel edit leaves the approval untouched.
                            </p>
                          ) : null
                        }
                      >
                        <ScheduleTemplateGrid
                          rows={rows}
                          cells={cellsHook.cells}
                          subjects={gradeSubjects.map((s) => ({
                            id: s.id,
                            name: s.name,
                            code: s.code,
                            category: s.category,
                          }))}
                          teachers={catalog.teachers}
                          subjectTeacherMap={cellsHook.dialogSubjectTeacherMap}
                          conflictedCells={conflicts.conflictedCells}
                          stagedKeys={stagedKeys}
                          isLocked={cellsHook.isLocked}
                          saving={cellsHook.saveProgress?.active ?? false}
                          onChange={handleTemplateChange}
                          onClear={handleTemplateClear}
                        />
                      </KanbanBoard>
                    </>
                  )}
                    </>
                  ) : null}
                  {cellsHook.splitSubjects.length > 0 ? (
                    <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
                      <p className="font-medium">Blocked: subject split across teachers in {section?.name}.</p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                        {cellsHook.splitSubjects.map((s) => (
                          <li key={s.subjectId}>
                            {s.subjectName} — {s.teacherNames.join(", ")}. Clear its slots to unify it.
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )}
            </section>
          </>
        )}

        {view === "config" && configEditor ? (
          <TemplateFormOverlay
            open
            onClose={collapseConfigView}
            label="Configure school day"
            variant="drawer"
            drawerWidth="3xl"
          >
            <ScheduleConfigKanban
              config={{ ...configEditor.config, workload }}
              initialName={configEditor.name}
              heading={configEditor.presetId ? "Edit configuration" : "New configuration"}
              year={
                scopeYear
                  ? { name: scopeYear.name, isActive: scopeYear.isActive }
                  : null
              }
              onClose={collapseConfigView}
              onApply={handleConfigApply}
              saving={configMutation.isPending}
            />
          </TemplateFormOverlay>
        ) : null}

        <TemplateFormOverlay
          open={sectionAddOpen}
          onClose={() => setSectionAddOpen(false)}
          label="New sections"
          variant="drawer"
        >
          <AddSectionKanban
            onSubmitted={handleSectionSubmitted}
            onRejected={handleSectionRejected}
            onCancel={() => setSectionAddOpen(false)}
          />
        </TemplateFormOverlay>

        {schoolYearAddOpen ? (
          <TemplateFormOverlay
            open
            onClose={() => setSchoolYearAddOpen(false)}
            label="New school year"
            variant="drawer"
          >
            <AddSchoolYearKanban
              suggestedName={suggestedYearName}
              suggestActive={!hasActiveYear}
              onSubmitted={() => setSchoolYearAddOpen(false)}
              onCreated={handleSchoolYearCreated}
              onCancel={() => setSchoolYearAddOpen(false)}
            />
          </TemplateFormOverlay>
        ) : null}

        {termsYear ? (
          <TemplateFormOverlay
            open
            onClose={() => setTermsYearId(null)}
            label="Term dates"
            variant="drawer"
          >
            <ConfigureTermsKanban
              year={termsYear}
              onSubmitted={() => setTermsYearId(null)}
              onCancel={() => setTermsYearId(null)}
            />
          </TemplateFormOverlay>
        ) : null}

        {confirmClearAll ? (
          <DeleteConfirmOverlay
            title="Discard staged slots?"
            description="Every unsaved pick on this section's grid is thrown away. The last saved timetable stays exactly as it is."
            confirmLabel="Discard changes"
            onCancel={() => setConfirmClearAll(false)}
            onConfirm={() => {
              setConfirmClearAll(false);
              cellsHook.discardStaged();
            }}
          />
        ) : null}

        {publishConfirm && section ? (
          <ScheduleStatusConfirm
            mode={publishConfirm}
            title={
              publishConfirm === "publish"
                ? `Publish ${section.name}'s timetable?`
                : cellsHook.isLocked || cellsHook.serverLocked
                  ? `Move ${section.name}'s timetable back to draft?`
                  : `Save ${section.name}'s timetable as a draft?`
            }
            description={
              publishConfirm === "publish"
                ? "This grid goes live for teachers — grading, attendance and the principal view read the published timetable. You can move it back to draft at any time."
                : cellsHook.isLocked || cellsHook.serverLocked
                  ? "The grid becomes a draft only you can see. Teacher desks lose this class list until you publish it again."
                  : "The grid is saved as a working draft only you can see. Teacher desks keep waiting until you publish."
            }
            published={cellsHook.isLocked || cellsHook.serverLocked}
            pending={publishMutation.isPending}
            onCancel={() => setPublishConfirm(null)}
            onConfirm={confirmPublish}
          />
        ) : null}

        {confirmUnlock && section ? (
          <ScheduleUnlockConfirm
            section={section}
            onCancel={() => setConfirmUnlock(false)}
            onConfirm={() => {
              // Local-only: entering the edit session does not touch the
              // approval. The unlock happens when a change is actually saved.
              cellsHook.beginEdit();
              setConfirmUnlock(false);
            }}
          />
        ) : null}
      </div>
    </section>
  );
}

/**
 * The schedule workspace shared by `/schedule/template` (query-driven panels)
 * and the dedicated panel routes (`/schedule/publish`, `/schedule/sections`, …).
 * `initialView` pins the panel for those routes instead of reading `?view=`.
 */
export function ScheduleWorkspace({ initialView }: { initialView?: TemplateView }) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading template…</p>}>
      <TemplateInner initialView={initialView} />
    </Suspense>
  );
}

export default function TeacherScheduleTemplatePage() {
  return <ScheduleWorkspace />;
}
