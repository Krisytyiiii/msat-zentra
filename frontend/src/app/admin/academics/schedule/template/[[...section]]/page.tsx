"use client";

import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLiveQuery } from "@/lib/api/live";

import { AlertTriangle, BookPlus, CalendarDays, CalendarRange, Check, Download, Gauge, Layers, Pencil, Plus, Trash2, Undo2, Upload, UserPlus } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useTerm, type SchoolYearOption } from "@/lib/term/TermContext";
import { apiClient } from "@/lib/api/client";
import { apiErrorMessage } from "@/lib/api/errors";
import { useAdminScheduleInvalidate } from "../../components/use-admin-schedule-invalidate";
import { Button } from "@/components/ui/button";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { InsightCallout } from "@/components/ui/insight-callout";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import { Pill } from "@/components/ui/pill";
import { toast } from "@/components/ui/sonner";
import { TemplateNavRail, type TemplateView } from "../../components/TemplateNavRail";
import { SubjectCatalogKanban } from "../../components/subject-catalog-kanban";
import { SubjectAddKanban } from "../../components/subject-add-kanban";
import { TeacherCatalogKanban } from "../../components/teacher-catalog-kanban";
import { TeacherAddKanban } from "../../components/teacher-add-kanban";
import { TemplateFormOverlay } from "../../components/TemplateFormOverlay";
import { TEACHER_CREATE_STEPS, TeacherCreateDockRows } from "../../components/teacher-add-kanban";
import type { TeacherCreateProgress } from "../../components/use-add-teachers";
import { TEACHER_DELETE_STEPS, TeacherDeleteDockRows } from "../../components/teacher-delete-kanban";
import type { TeacherDeleteProgress } from "../../components/teacher-delete-kanban";
import { DropdownSelect } from "@/app/principal/academics/assign/components/DropdownSelect";
import dropdownStyles from "@/app/principal/academics/assign/components/dropdown-select.module.css";
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
  type StatusConfirmSlot,
} from "../../components/schedule-status-confirm";
import { AddSectionKanban, type CreatedSection } from "../../components/add-section-kanban";
import { SectionsBoard } from "../../components/sections-board";
import { DeleteConfirmOverlay } from "../../components/delete-confirm-overlay";
import {
  AddSchoolYearKanban,
  PENDING_SCHOOL_YEAR_PREFIX,
  localTodayKey,
  type CreatedSchoolYear,
} from "../../components/add-school-year-kanban";
import { ConfigureTermsKanban } from "../../components/configure-terms-kanban";
import { Skeleton } from "@/components/ui/skeleton";
import { useScheduleConflicts } from "../../components/use-schedule-conflicts";
import { useTemplateWorkload } from "../../components/use-template-workload";
import { useDockProgressTask, type DockSnapshot } from "../../components/use-dock-progress";
import { ConflictsDock } from "../../components/conflicts-dock";
import type { SubjectCreateProgress } from "../../components/use-add-subjects";
import { DELETE_STEPS, DeleteDockRows, type SubjectDeleteProgress } from "../../components/subject-delete-kanban";
import type { ScheduleSection } from "../../page";

/** One school year's delete lock, from `/api/admin/schedule/school-years`. */
interface SchoolYearLockRow {
  id: string;
  locked: boolean;
  lockedReason: string | null;
  links: { sections: number; learners: number; records: number };
}

/** One stacked builder block: small caps title sitting at the right end above the divider. */
function TemplateBlockHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h2 className="self-end text-[12px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h2>
      <div className="h-px w-full bg-border" aria-hidden />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function sectionLabel(name: string, gradeLevel: string) {
  return (
    <span className={dropdownStyles.optionLabel}>
      <span className={dropdownStyles.optionName}>{name}</span>
      <Pill tone="amber" label="Grade level">
        Grade {gradeLevel.replace("G", "")}
      </Pill>
    </span>
  );
}

/**
 * Skeleton mirrors the template page panel by panel: the left rail (back link
 * + find box + the seven action links) beside the skeleton of whichever view
 * is open — timetable grid, sections, catalogs, day config, school years or
 * publish — so the loading state has the same footprint as the loaded page.
 */
function SkeletonRail() {
  return (
    <>
      {/* Below lg the real rail is a horizontal strip. */}
      <div className="flex w-full items-center gap-1 overflow-x-auto border-b border-border pb-1 lg:hidden">
        <Skeleton className="h-7 w-7 shrink-0 rounded-md" />
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-20 shrink-0 rounded-md" />
        ))}
      </div>
      <div className="hidden w-52 shrink-0 lg:-mt-4 lg:-mb-4 lg:-ml-4 lg:block lg:min-h-[calc(100dvh-3rem)] lg:w-56 lg:border-r lg:border-solid lg:border-border lg:bg-linear-to-b lg:from-muted/40 lg:via-muted/10 lg:to-transparent lg:pt-4 lg:pr-4 lg:pl-4">
        <div className="sticky top-16 flex flex-col gap-2">
          <Skeleton className="h-4 w-28 rounded-md" />
          <Skeleton className="h-8 w-full rounded-md" />
          <div className="flex flex-col gap-0.5 pt-1">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-full rounded-md" />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

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

/** Stacked panel heading: right-aligned small-caps title, rule, hint line. */
function SkeletonPanelHeading() {
  return (
    <div className="flex flex-col gap-1.5">
      <Skeleton className="h-3 w-24 self-end" />
      <div className="h-px w-full bg-border" />
      <Skeleton className="h-3 w-80 max-w-full" />
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

/** School year view: board header, the three lanes, then the scope strip. */
function SkeletonSchoolYears() {
  return (
    <>
      <SkeletonBoard>
        <Skeleton className="mx-1 mb-1 h-3 w-80 max-w-full" />
        <ul className="grid gap-2 px-0.5 pb-0.5 sm:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
              <div className="flex items-start gap-2 px-3 pt-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3 w-36" />
                </div>
                <Skeleton className="h-6 w-20 shrink-0 rounded-md" />
              </div>
              <div className="flex items-center gap-2 px-3 pt-2 pb-2.5">
                <Skeleton className="h-1 w-14 rounded-full" />
                <Skeleton className="h-3 w-28" />
              </div>
              <div className="flex flex-col gap-0.5 border-t border-border/70 p-1.5">
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
            </li>
          ))}
        </ul>
      </SkeletonBoard>
      <div className="flex items-center gap-1.5 px-1">
        <Skeleton className="h-1.5 w-1.5 rounded-full" />
        <Skeleton className="h-3 w-64 max-w-full" />
      </div>
    </>
  );
}

/** Publish view: heading + section rows with their publish state. */
function SkeletonPublish() {
  return (
    <>
      <SkeletonPanelHeading />
      <SkeletonBoard>
        <div className="flex flex-col px-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-2 border-b border-border px-1 py-2 last:border-b-0"
            >
              <Skeleton className="h-3.5 w-3.5 rounded-sm" />
              <Skeleton className="h-3.5 w-44" />
              <Skeleton className="ml-auto h-5 w-24 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-md" />
            </div>
          ))}
        </div>
      </SkeletonBoard>
    </>
  );
}

function ScheduleTemplateSkeleton({ view }: { view: TemplateView }) {
  return (
    <section
      className="flex w-full flex-col gap-5 lg:flex-row lg:items-start lg:gap-6"
      aria-busy="true"
      aria-label="Loading template"
    >
      <SkeletonRail />
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        {view === "grid" ? (
          <SkeletonTimetable />
        ) : view === "sections" ? (
          <SkeletonSections />
        ) : view === "subjects" || view === "teachers" ? (
          <SkeletonSections />
        ) : view === "config" ? (
          <SkeletonDayConfig />
        ) : view === "term" ? (
          <SkeletonSchoolYears />
        ) : (
          <SkeletonPublish />
        )}
      </div>
    </section>
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

/** Stored ISO date → "Jun 8, 2026" for the scope board. */
function fmtDate(value: string | null): string {
  if (!value) return "";
  const date = parseISO(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : format(date, "MMM d, yyyy");
}

/**
 * The term whose date window contains today, if any. Shown as the pick while
 * no term has been chosen by hand, so the board always reflects the term this
 * desk is actually following — and rolls over on its own when a window ends.
 */
function termCoveringToday(years: SchoolYearOption[], todayKey: string) {
  for (const y of years) {
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

/** `?view=` → panel. Unknown or missing values land on the timetable grid. */function parseView(raw: string): TemplateView {
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

function TemplateInner() {
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
  const [view, setView] = useState<TemplateView>(() => parseView(viewParam));
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
  useEffect(() => {
    if (viewParam === view) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", view);
    router.replace(`${window.location.pathname}?${params.toString()}`, { scroll: false });
  }, [view, viewParam, searchParams, router]);

  const [createProgress, setCreateProgress] = useState<SubjectCreateProgress | null>(null);
  const [deleteProgress, setDeleteProgress] = useState<SubjectDeleteProgress | null>(null);
  const [teacherCreateProgress, setTeacherCreateProgress] = useState<TeacherCreateProgress | null>(null);
  const [teacherDeleteProgress, setTeacherDeleteProgress] = useState<TeacherDeleteProgress | null>(null);
  // Destructive actions confirm through one shared overlay; the lock comes
  // from the API (sections: learners/records, school years: any linked row).
  const [sectionDeleteTarget, setSectionDeleteTarget] = useState<ScheduleSection | null>(null);
  const [yearDeleteTarget, setYearDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  /** Sidebar click: show that action's panel; any open add form closes first. */
  const openView = (next: TemplateView) => {
    setView(next);
    setKanbanAddOpen(false);
    setTeacherKanbanAddOpen(false);
    // Configure only opens the stepper when there is no saved preset yet; with
    // presets the tab lists them (Edit/New reopen the stepper).
    setConfigEditor(
      next === "config" && catalog.presets.length === 0
        ? { presetId: null, name: "Default", config: DEFAULT_DAY_CONFIG }
        : null,
    );
  };

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
    mutationFn: async (target: { id: string; name: string }) => {
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
    onError: (err: unknown) => {
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
  // A hand-picked term wins; otherwise today's window is the one in use.
  const steeringTermId = activeTerm?.termId ?? autoTerm?.termId ?? null;
  const steeringYearId = activeTerm?.schoolYearId ?? autoTerm?.schoolYearId ?? null;
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

  // The overlay lists the working grid (saved + freshly staged slots), so the
  // count/cards match what the admin sees instead of only server-saved rows.
  const workingSlots = useMemo<StatusConfirmSlot[]>(() => {
    const out: StatusConfirmSlot[] = [];
    for (const [key, value] of Object.entries(cellsHook.cells)) {
      if (!value) continue;
      const [day, period] = key.split(":").map(Number);
      out.push({
        day,
        period,
        subjectName: catalog.subjectById.get(value.subjectId)?.name ?? "Subject",
        teacherName: value.teacherNameId
          ? catalog.teacherById.get(value.teacherNameId)?.name ?? "Teacher"
          : "No teacher",
      });
    }
    return out.sort((a, b) => a.day - b.day || a.period - b.period);
  }, [cellsHook.cells, catalog.subjectById, catalog.teacherById]);

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
    <section className="flex w-full flex-col gap-5 lg:flex-row lg:gap-6">
      <TemplateNavRail view={view} onSelect={openView} />
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
              widthClassName="max-w-xl"
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
                detail={`Starts ${presetDeleteTarget.startTime} · ${presetDeleteTarget.periodMins} min periods`}
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
                detail={
                  sectionDeleteTarget.gradeLevel
                    ? `Grade ${sectionDeleteTarget.gradeLevel.replace("G", "")} section`
                    : null
                }
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
            {schoolYearsLoading && schoolYears.length === 0 ? (
              <p className="text-sm text-muted-foreground">Loading school years…</p>
            ) : schoolYears.length === 0 ? (
              <PageEmptyCallout
                action={
                  <Button
                    className="h-6 gap-1 px-2.5 text-[12px]"
                    onClick={() => setSchoolYearAddOpen(true)}
                  >
                    <Plus size={12} aria-hidden />
                    Add school year
                  </Button>
                }
              >
                {schoolYearsError
                  ? "Could not load the school years. Check the connection and try again."
                  : "There is no school year yet. Add one here — its three terms come with it, and you can set their start and end dates next."}
              </PageEmptyCallout>
            ) : (
              <div className="flex flex-col gap-3">
                <KanbanBoard
                  title="School years"
                  icon={
                    <span className="text-amber-500" aria-hidden>
                      <CalendarRange size={14} />
                    </span>
                  }
                  count={`${schoolYears.length} year${schoolYears.length === 1 ? "" : "s"}`}
                  actions={
                    <Button
                      variant="outline"
                      className="h-6 gap-1 px-2 text-[12px]"
                      onClick={() => setSchoolYearAddOpen(true)}
                    >
                      <Plus size={12} aria-hidden />
                      Add school year
                    </Button>
                  }
                  ariaLabel="School years and their terms"
                  boardLabel="School year and term picker"
                  description="Set each term's dates, then click a term to work on it. The term that covers today is used automatically."
                >
                  {/* One lane per school year: header, date-set progress, then
                      its three terms as selectable rows. */}
                  <ul className="grid gap-2 px-0.5 pb-0.5 sm:grid-cols-2 2xl:grid-cols-3">
                    {schoolYears.map((y) => {
                      const terms = [...y.terms].sort((a, b) => a.termNumber - b.termNumber);
                      const steeringYear = steeringYearId === y.id;
                      // Delete lock: any linked section/learner/term record, or
                      // the active year, keeps the row from being deleted.
                      const yearLock = yearLocks.get(y.id);
                      // Optimistic row painted at confirm time — the request is
                      // still in flight and the shared Dock carries its progress.
                      const pending = y.id.startsWith(PENDING_SCHOOL_YEAR_PREFIX);
                      const datedTerms = terms.filter((t) => t.startDate && t.endDate).length;
                      const totalTerms = terms.length || 3;
                      const termsConfigured = terms.length > 0 && datedTerms === terms.length;
                      return (
                        <li
                          key={y.id}
                          className={`relative flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card transition-colors duration-150 ${
                            steeringYear
                              ? "border-amber-500/50"
                              : "border-border hover:border-border/80"
                          } ${pending ? "opacity-75" : ""}`}
                        >
                          {steeringYear ? (
                            <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-amber-500" />
                          ) : null}
                          <div className="flex min-w-0 items-start gap-2 px-3 pt-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span
                                  className={`text-[13px] font-semibold tracking-tight ${
                                    pending ? "text-muted-foreground" : "text-foreground"
                                  }`}
                                >
                                  {y.name}
                                </span>
                                {pending ? (
                                  <Pill tone="amber" label="Saving the new school year">
                                    Creating…
                                  </Pill>
                                ) : null}
                                {y.isActive && !pending ? (
                                  <Pill tone="green" label="The school year in use">
                                    Active
                                  </Pill>
                                ) : null}
                                {y.isCurrent && !pending ? (
                                  <Pill tone="sky" label="Matches the current calendar year">
                                    Current
                                  </Pill>
                                ) : null}
                                {yearLock && !pending ? (
                                  <Pill
                                    tone={yearLock.locked ? "amber" : "green"}
                                    label="Delete status"
                                    title={
                                      yearLock.lockedReason ??
                                      "No sections, learners, or term records are linked"
                                    }
                                  >
                                    {yearLock.locked ? "Locked" : "Can be deleted"}
                                  </Pill>
                                ) : null}
                              </div>
                              <p className="mt-0.5 flex items-center gap-1 text-[12px] tabular-nums text-muted-foreground">
                                <CalendarRange size={11} aria-hidden className="shrink-0 opacity-70" />
                                <span className="truncate">
                                  {fmtDate(y.startDate)} – {fmtDate(y.endDate)}
                                </span>
                              </p>
                            </div>
                            {!pending ? (
                              <div className="flex shrink-0 items-center gap-1">
                                <Button
                                  variant="outline"
                                  className={`h-6 shrink-0 gap-1 px-2 text-[12px] ${
                                    termsConfigured
                                      ? "border-transparent bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
                                      : "border-amber-500/50 text-amber-700 dark:text-amber-400"
                                  }`}
                                  onClick={() => setTermsYearId(y.id)}
                                >
                                  <Pencil size={11} aria-hidden />
                                  {termsConfigured ? "Edit dates" : "Set dates"}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  disabled={!yearLock || yearLock.locked}
                                  className="text-muted-foreground hover:bg-red-500/10 hover:text-red-700 dark:hover:text-red-400"
                                  aria-label={`Delete ${y.name}`}
                                  title={
                                    yearLock?.locked
                                      ? (yearLock.lockedReason ?? "This school year cannot be deleted")
                                      : "Delete school year"
                                  }
                                  onClick={() => setYearDeleteTarget({ id: y.id, name: y.name })}
                                >
                                  <Trash2 size={12} aria-hidden />
                                </Button>
                              </div>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 px-3 pt-2 pb-2.5">
                            {!pending ? (
                              <>
                                <span className="flex items-center gap-0.5" aria-hidden>
                                  {Array.from({ length: totalTerms }).map((_, i) => (
                                    <span
                                      key={i}
                                      className={`h-1 w-4 rounded-full ${
                                        i < datedTerms ? "bg-emerald-500/70" : "bg-border"
                                      }`}
                                    />
                                  ))}
                                </span>
                                <span className="text-[12px] text-muted-foreground">
                                  {datedTerms} of {totalTerms} dates set
                                </span>
                              </>
                            ) : null}
                            {steeringYear ? (
                              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[12px] font-medium text-amber-700 dark:text-amber-400">
                                <Check size={11} aria-hidden />
                                In use
                              </span>
                            ) : null}
                          </div>

                          <div className="flex flex-1 flex-col gap-0.5 border-t border-border/70 p-1.5">
                            {pending ? (
                              <span className="px-1.5 py-1 text-[12px] text-muted-foreground">
                                The three terms will appear here once the school year is saved.
                              </span>
                            ) : terms.length === 0 ? (
                              <span className="px-1.5 py-1 text-[12px] text-muted-foreground">
                                This school year has no terms yet.
                              </span>
                            ) : (
                              terms.map((t) => {
                                const selected = steeringTermId === t.id;
                                const auto = !activeTerm && autoTerm?.termId === t.id;
                                const dated = Boolean(t.startDate && t.endDate);
                                return (
                                  <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => applyScope(y.id, t.id)}
                                    aria-pressed={selected}
                                    title={`Work on ${y.name} · Term ${t.termNumber}`}
                                    className={`flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors duration-150 ${
                                      selected
                                        ? "border-amber-500/45 bg-amber-500/10"
                                        : "border-transparent hover:border-border hover:bg-muted/60"
                                    }`}
                                  >
                                    <span
                                      aria-hidden
                                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[12px] font-semibold ${
                                        selected
                                          ? "bg-amber-500 text-white"
                                          : "bg-muted text-muted-foreground"
                                      }`}
                                    >
                                      {t.termNumber}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="flex items-center gap-1.5">
                                        <span
                                          className={`text-[12px] font-medium leading-tight ${
                                            selected ? "text-foreground" : "text-muted-foreground"
                                          }`}
                                        >
                                          Term {t.termNumber}
                                        </span>
                                        {auto ? (
                                          <span
                                            className="rounded bg-amber-500/15 px-1 text-[12px] leading-4 font-medium text-amber-700 dark:text-amber-400"
                                            title="Picked automatically because today falls in this term"
                                          >
                                            Auto
                                          </span>
                                        ) : null}
                                      </span>
                                      <span className="block truncate text-[12px] leading-tight text-muted-foreground">
                                        {dated
                                          ? `${fmtDate(t.startDate)} – ${fmtDate(t.endDate)}`
                                          : "Dates not set"}
                                      </span>
                                    </span>
                                    {selected ? (
                                      <Check size={12} aria-hidden className="shrink-0 text-amber-500" />
                                    ) : null}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </KanbanBoard>
                <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                  <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${
                        activeTerm ? "bg-amber-500" : autoTerm ? "bg-emerald-500" : "bg-muted-foreground"
                      }`}
                      aria-hidden
                    />
                    {activeTerm ? (
                      <>
                        Working on{" "}
                        <span className="font-medium text-foreground">
                          {activeTerm.schoolYearName} · Term {activeTerm.termNumber}
                        </span>
                      </>
                    ) : autoTerm ? (
                      <>
                        Following today&apos;s term{" "}
                        <span className="font-medium text-foreground">
                          {autoTerm.schoolYearName} · Term {autoTerm.termNumber}
                        </span>{" "}
                        — picked automatically because today falls in it.
                      </>
                    ) : (
                      <>
                        Using the school&apos;s current term
                        {activeSchoolYear ? ` (${activeSchoolYear.name})` : ""}
                      </>
                    )}
                  </p>
                  {activeTerm ? (
                    <Button
                      variant="outline"
                      className="h-6 px-2 text-[12px]"
                      onClick={() => clearActiveTerm()}
                    >
                      Follow today&apos;s term
                    </Button>
                  ) : null}
                </div>
              </div>
            )}
            {yearDeleteTarget ? (
              <DeleteConfirmOverlay
                title={`Delete ${yearDeleteTarget.name}?`}
                description="This cannot be undone. The school year's three terms are removed with it; only a year with no sections, learners, or term records can be deleted."
                confirmLabel="Delete school year"
                pending={deleteYearMutation.isPending}
                onCancel={() => setYearDeleteTarget(null)}
                onConfirm={() => deleteYearMutation.mutate(yearDeleteTarget)}
              />
            ) : null}
          </section>
        ) : view === "publish" ? (
          <section id="publish" aria-label="Publish timetable" className="flex scroll-mt-6 flex-col gap-4">
            <TemplateBlockHeading
              title="Publish"
              hint="Publish a section's draft to make it live for teachers, or switch it back to draft to edit."
            />
            <PublishTimetableKanban />
          </section>
        ) : (
          <>
            {/* Default view — section picker on top of the cell filler. */}
            <section
              id="teachers-subjects"
              aria-label="Teachers and subjects"
              className={`flex scroll-mt-6 flex-col gap-4 ${
                section || catalogMissing ? "" : "min-h-[calc(100dvh-12rem)] justify-center"
              }`}
            >
              {catalogMissing ? (
                <div className="flex min-h-[calc(100dvh-10rem)] items-center justify-center">
                  <InsightCallout role="status" className="w-fit max-w-xl text-center">
                    Add at least one <strong>subject</strong> (with Core/Elective type) and one{" "}
                    <strong>teacher</strong> first — then pick a section to fill its timetable cells.
                  </InsightCallout>
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
                  {/* Workspace bar: pick a section, see its size, jump into the
                      catalog actions that feed the grid. */}
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
                        <span className="hidden sm:inline-flex">
                          <DropdownSelect
                            value={sectionId}
                            onValueChange={handleSectionChange}
                            options={sections.map((s) => ({
                              value: s.id,
                              label: sectionLabel(s.name, s.gradeLevel),
                            }))}
                            placeholder="Pick a section…"
                            ariaLabel="Section for this template"
                            triggerClassName={dropdownStyles.dropdown32}
                          />
                        </span>
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

                    <div
                      className="flex gap-1.5 overflow-x-auto pb-1"
                      role="listbox"
                      aria-label="Choose a section"
                    >
                      {sections.map((s) => {
                        const active = s.id === sectionId;
                        const slotCount = s.timetableEntries?.length ?? 0;
                        const published =
                          slotCount > 0 &&
                          s.timetableEntries.every((entry) => entry.status === "APPROVED");
                        return (
                          <button
                            key={s.id}
                            type="button"
                            role="option"
                            aria-selected={active}
                            onClick={() => handleSectionChange(s.id)}
                            className={`group flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left transition-colors duration-150 ${
                              active
                                ? "border-amber-500/55 bg-amber-500/10"
                                : "border-border bg-background hover:border-amber-500/40 hover:bg-muted/60"
                            }`}
                          >
                            <span className="min-w-0">
                              <span className="block max-w-40 truncate text-[12px] leading-tight font-semibold">
                                {s.name}
                              </span>
                              <span className="block text-[12px] leading-tight text-muted-foreground tabular-nums">
                                Grade {s.gradeLevel.replace("G", "")} · {slotCount} slot
                                {slotCount === 1 ? "" : "s"}
                              </span>
                            </span>
                            <span
                              aria-hidden
                              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                published
                                  ? "bg-emerald-500"
                                  : slotCount > 0
                                    ? "bg-amber-500"
                                    : "bg-border"
                              }`}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {conflicts.data ? (
                    <span className="flex flex-wrap items-center justify-end gap-1.5" role="status">
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

                  {conflicts.data && conflicts.data.conflicts.length > 0 ? (
                    <ConflictsDock
                      key={conflicts.data.conflicts.map((c) => `${c.teacherNameId}:${c.day}:${c.period}`).join("|")}
                      conflicts={conflicts.data.conflicts}
                    />
                  ) : null}

                  {!section ? (
                    <p className="text-center text-sm text-muted-foreground">
                      Pick a section above to load its generic template grid.
                    </p>
                  ) : !activeConfig ? (
                    <p className="text-sm text-muted-foreground">Loading day configuration…</p>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5">
                        <div className="flex min-w-0 flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-sm font-semibold">{section.name}</span>
                            <Pill field="grade">
                              Grade {section.gradeLevel.replace("G", "")}
                            </Pill>
                            {cellsHook.isLocked || cellsHook.serverLocked ? (
                              <Pill tone="green" label="Timetable status">
                                <Check size={11} aria-hidden />
                                Published
                              </Pill>
                            ) : cellsHook.filledCount > 0 ? (
                              <Pill tone="amber" label="Timetable status">
                                <Pencil size={11} aria-hidden />
                                {cellsHook.editMode ? "Editing draft" : "Draft"}
                              </Pill>
                            ) : (
                              <Pill tone="neutral" label="Timetable status">
                                Empty grid
                              </Pill>
                            )}
                          </div>
                          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1 tabular-nums">
                              <CalendarDays size={11} aria-hidden />
                              {cellsHook.filledCount} slot
                              {cellsHook.filledCount === 1 ? "" : "s"} filled
                            </span>
                            {section.adviser?.fullName ? (
                              <span className="truncate">
                                Adviser · {section.adviser.fullName}
                              </span>
                            ) : null}
                            {cellsHook.pendingSlots.length > 0 || cellsHook.saveProgress?.active ? (
                              <span className="text-amber-700 dark:text-amber-400" aria-live="polite">
                                {cellsHook.saveProgress?.active
                                  ? "Saving staged slots…"
                                  : `${cellsHook.pendingSlots.length} unsaved slot${cellsHook.pendingSlots.length === 1 ? "" : "s"}`}
                              </span>
                            ) : null}
                          </p>
                        </div>
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
                          section ? `Timetable — ${section.name}` : "Timetable"
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
            widthClassName="max-w-5xl"
          >
            <ScheduleConfigKanban
              config={{ ...configEditor.config, workload }}
              initialName={configEditor.name}
              heading={configEditor.presetId ? "Edit configuration" : "New configuration"}
              onClose={collapseConfigView}
              onApply={handleConfigApply}
              saving={configMutation.isPending}
            />
          </TemplateFormOverlay>
        ) : null}

        {sectionAddOpen ? (
          <TemplateFormOverlay
            open
            onClose={() => setSectionAddOpen(false)}
            label="New sections"
            widthClassName="max-w-lg"
          >
            <AddSectionKanban
              onSubmitted={handleSectionSubmitted}
              onRejected={handleSectionRejected}
              onCancel={() => setSectionAddOpen(false)}
            />
          </TemplateFormOverlay>
        ) : null}

        {schoolYearAddOpen ? (
          <TemplateFormOverlay
            open
            onClose={() => setSchoolYearAddOpen(false)}
            label="New school year"
            widthClassName="max-w-md"
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
            widthClassName="max-w-lg"
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
            detail={`${cellsHook.pendingSlots.length} unsaved slot${cellsHook.pendingSlots.length === 1 ? "" : "s"} will be discarded.`}
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
                ? `These ${workingSlots.length} slot${workingSlots.length === 1 ? "" : "s"} go live for teachers — grading, attendance and the principal view read the published grid. You can move it back to draft at any time.`
                : cellsHook.isLocked || cellsHook.serverLocked
                  ? "The grid becomes a draft only you can see. Teacher desks lose this class list until you publish it again."
                  : `These ${workingSlots.length} slot${workingSlots.length === 1 ? "" : "s"} stay a working draft only you can see. Teacher desks keep waiting until you publish.`
            }
            countLabel={`${workingSlots.length} slot${workingSlots.length === 1 ? "" : "s"}`}
            slots={workingSlots}
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

export default function TeacherScheduleTemplatePage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading template…</p>}>
      <TemplateInner />
    </Suspense>
  );
}
