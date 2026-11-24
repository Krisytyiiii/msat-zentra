"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Users } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { Pill } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import { PrincipalEmptyState } from "../../../../components/PrincipalEmptyCard";
import styles from "./SectionTrends.module.css";

interface SubjectMeta {
  subjectId: string;
  code: string;
  name: string;
}

interface SubjectCell {
  subjectId: string;
  present: number;
  late: number;
  absent: number;
  excused: number;
  total: number;
  ratio: number;
}

interface DayCounts {
  present: number;
  late: number;
  excused: number;
  absent: number;
  /** Enrolled learners counted that day (transferee-adjusted). */
  learners: number;
}

interface SubjectDay {
  date: string;
  isoDate: string;
  isWeekend: boolean;
  cells: SubjectCell[];
  /** Learner-level daily rollup — one status per learner, not per subject. */
  counts?: DayCounts;
}

interface SubjectRow {
  sectionId: string;
  section: string;
  gradeLevel: string;
  enrolled: number;
  subjects: SubjectMeta[];
  days: SubjectDay[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

const gradeNum = (level: string) => {
  const n = Number(String(level).replace(/\D/g, ""));
  return Number.isNaN(n) ? 0 : n;
};

const clampRate = (rate: number) => Math.min(100, Math.max(0, rate));

/** Local YYYY-MM-DD — the heatmap day keys are ISO dates. */
function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

interface BarDay {
  date: string;
  isoDate: string;
  /** Learners present in every subject held that day. */
  present: number;
  /** Everyone else enrolled that day (late/excused fold in — only two series). */
  absent: number;
  /** Marks recorded that day (sum across the subjects held). */
  marked: number;
}

interface SubjectAvg {
  subjectId: string;
  code: string;
  name: string;
  rate: number;
}

interface SectionModel {
  rate: number;
  /** One day group per school day from the term start through today. */
  bars: BarDay[];
  /** Tallest single status bar across the row, used to scale every bar. */
  maxCount: number;
  /** School days elapsed (term start → today). */
  elapsedDays: number;
  belowDays: number;
  subjects: SubjectAvg[];
  weakest: SubjectAvg | null;
}

/**
 * A section's recorded attendance rolled up twice: the section average and
 * weakest subject (for the KPI columns), and a per-day status stack
 * (present / late / excused / absent) for the chart. A meetup with no record
 * counts as absent — the subject teacher never took the sheet — except for
 * transferees before their enlistment day, which the API already excludes from
 * that day's headcount. The axis runs from the term start to today.
 */
function buildModel(section: SubjectRow, today: string): SectionModel {
  let presentTotal = 0;
  let capacityTotal = 0;
  let elapsedDays = 0;
  let belowDays = 0;
  const bars: BarDay[] = [];

  for (const day of section.days) {
    if (day.isWeekend || day.isoDate > today) continue;

    const marked = day.cells.reduce((sum, cell) => sum + (cell.total ?? 0), 0);
    let present: number;
    let absent: number;
    let capacity: number;

    if (day.counts) {
      // One status per learner (the API's daily rollup): 3 learners can never
      // read as 9 absences because they also take 3 subjects. Only present vs
      // not-present is charted — late/excused are folded into absent.
      present = day.counts.present;
      absent = day.counts.late + day.counts.excused + day.counts.absent;
      capacity = day.counts.learners;
    } else {
      // Fallback for older payloads: sum the per-subject cells.
      present = day.cells.reduce((sum, cell) => sum + (cell.present ?? 0), 0);
      absent = day.cells.reduce(
        (sum, cell) => sum + (cell.late ?? 0) + (cell.excused ?? 0) + (cell.absent ?? 0),
        0,
      );
      capacity = present + absent;
    }

    bars.push({ date: day.date, isoDate: day.isoDate, present, absent, marked });

    if (capacity <= 0) continue;
    elapsedDays += 1;
    presentTotal += present;
    capacityTotal += capacity;
    if ((present / capacity) * 100 < 80) belowDays += 1;
  }

  const rate = capacityTotal > 0 ? round1((presentTotal / capacityTotal) * 100) : 0;
  const maxCount = bars.reduce(
    (max, bar) => Math.max(max, bar.present, bar.absent),
    0,
  );

  const subjects: SubjectAvg[] = section.subjects.map((subject, index) => {
    let present = 0;
    let total = 0;
    for (const day of section.days) {
      if (day.isoDate > today) continue;
      const cell = day.cells[index];
      if (!cell) continue;
      present += cell.present ?? 0;
      total += cell.present ?? 0;
      total += cell.late ?? 0;
      total += cell.excused ?? 0;
      total += cell.absent ?? 0;
    }
    return {
      subjectId: subject.subjectId,
      code: subject.code,
      name: subject.name,
      rate: total > 0 ? round1((present / total) * 100) : 0,
    };
  });

  const weakest = subjects.length
    ? subjects.reduce((worst, subject) => (subject.rate < worst.rate ? subject : worst))
    : null;

  return { rate, bars, maxCount, elapsedDays, belowDays, subjects, weakest };
}

function SectionTrendRow({
  section,
  model,
}: {
  section: SubjectRow;
  model: SectionModel;
}) {
  const [hover, setHover] = React.useState<number | null>(null);

  const hoverBar = hover !== null ? model.bars[hover] : null;
  const alert = model.rate > 0 && model.rate < 80;
  const first = model.bars[0];
  const last = model.bars[model.bars.length - 1];
  const hoverX =
    hover !== null && model.bars.length > 0
      ? ((hover + 0.5) / model.bars.length) * 100
      : 50;

  const handleMove = (event: React.MouseEvent<HTMLSpanElement>) => {
    if (model.bars.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    setHover(Math.min(model.bars.length - 1, Math.floor(ratio * model.bars.length)));
  };

  return (
    <div className={`${styles.row} ${alert ? styles.rowAlert : ""}`}>
      <span className={styles.colId}>
        <span className={styles.name}>{section.section}</span>
        <span className={styles.metaRow}>
          <Pill field="grade" label="Grade level">
            Grade {section.gradeLevel}
          </Pill>
          <Pill label="Learners enrolled in this section">
            {section.enrolled} enrolled
          </Pill>
          <Pill label="Subjects offered in this section">
            {section.subjects.length} subject
            {section.subjects.length === 1 ? "" : "s"}
          </Pill>
        </span>
      </span>

      <span className={styles.colChart}>
        {model.bars.length > 0 ? (
          <>
            <span
              className={styles.plot}
              onMouseMove={handleMove}
              onMouseLeave={() => setHover(null)}
            >
              <span className={styles.grid} aria-hidden="true">
                <span className={styles.gridLine} style={{ bottom: "50%" }} />
                <span className={styles.gridLine} style={{ bottom: "25%" }} />
              </span>

              <span className={styles.bars} aria-hidden="true">
                {model.bars.map((bar, index) => {
                  const scale = (count: number) =>
                    model.maxCount > 0 ? `${(count / model.maxCount) * 100}%` : "0%";
                  return (
                    <span
                      key={bar.isoDate}
                      className={`${styles.barSlot} ${
                        hover === index ? styles.barSlotHover : ""
                      }`}
                    >
                      <span
                        className={`${styles.bar} ${styles.barPresent}`}
                        style={{ height: scale(bar.present) }}
                      />
                      <span
                        className={`${styles.bar} ${styles.barAbsent}`}
                        style={{ height: scale(bar.absent) }}
                      />
                    </span>
                  );
                })}
              </span>

              {hoverBar ? (
                <span
                  className={`${styles.tip} ${hoverX > 82 ? styles.tipEnd : ""} ${
                    hoverX < 18 ? styles.tipStart : ""
                  }`}
                  style={{ left: `${hoverX}%` }}
                >
                  <span className={styles.tipDate}>{hoverBar.date}</span>
                  {hoverBar.present + hoverBar.absent > 0 ? (
                    <span className={styles.tipRows}>
                      <span>
                        <span className={`${styles.dot} ${styles.dotPresent}`} />
                        Present <strong>{hoverBar.present}</strong>
                      </span>
                      <span>
                        <span className={`${styles.dot} ${styles.dotAbsent}`} />
                        Absent <strong>{hoverBar.absent}</strong>
                      </span>
                    </span>
                  ) : (
                    <span className={styles.tipEmpty}>No learners enrolled</span>
                  )}
                  {hoverBar.marked === 0 &&
                  hoverBar.present + hoverBar.absent > 0 ? (
                    <span className={styles.tipNote}>
                      No sheet taken — counted absent
                    </span>
                  ) : null}
                </span>
              ) : null}
            </span>
            <span className={styles.axis} aria-hidden="true">
              <span>{first.date}</span>
              <span>{last.date}</span>
            </span>
          </>
        ) : (
          <span className={styles.noChart}>No recorded days yet</span>
        )}
      </span>

      <span className={styles.colWeak}>
        <span className={styles.colLabel}>Weakest subject</span>
        {model.weakest ? (
          <>
            <span className={styles.weakRow}>
              <strong>{model.weakest.code}</strong>
              <span className={styles.weakRate}>{model.weakest.rate}%</span>
            </span>
            <span className={styles.weakTrack} aria-hidden="true">
              <span
                className={`${styles.weakFill} ${
                  model.weakest.rate < 80 ? styles.weakFillLow : ""
                }`}
                style={{ width: `${clampRate(model.weakest.rate)}%` }}
              />
            </span>
          </>
        ) : (
          <span className={styles.muted}>No subject marks yet</span>
        )}
      </span>

      <span className={styles.colRate}>
        <Pill
          tone={alert ? "red" : "green"}
          label="Section attendance"
          className={styles.ratePill}
        >
          {model.rate}%
        </Pill>
        <span className={styles.rateHint}>
          {model.elapsedDays === 0
            ? "No school days yet"
            : `${model.belowDays} of ${model.elapsedDays} school day${
                model.elapsedDays === 1 ? "" : "s"
              } below 80%`}
        </span>
      </span>
    </div>
  );
}

export function SectionTrends() {
  const { data, isPending } = useQuery({
    queryKey: ["attendance-section-subject-heatmap", "shared"],
    queryFn: async () => {
      const res = await apiClient.get<{
        sections: SubjectRow[];
        subjects: SubjectMeta[];
        schoolDays: number;
        term?: { id: string; termNumber: number };
      }>("/api/attendance/section-subject-heatmap", {
        params: { sharedOnly: true },
      });
      return res.data;
    },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const sections = React.useMemo(() => data?.sections ?? [], [data]);
  // Captured once per mount so the axis end (and the "today" clip) is stable
  // across renders.
  const [today] = React.useState(todayKey);

  // One model per section, shared by the rows.
  const models = React.useMemo(
    () => new Map(sections.map((section) => [section.sectionId, buildModel(section, today)])),
    [sections, today],
  );

  const visible = React.useMemo(
    () =>
      [...sections].sort(
        (a, b) =>
          gradeNum(a.gradeLevel) - gradeNum(b.gradeLevel) ||
          a.section.localeCompare(b.section),
      ),
    [sections],
  );

  return (
    <KanbanBoard
      title="Subject Trends"
      icon={<CalendarDays size={14} aria-hidden="true" />}
      description="One row per section — grouped daily bars counting each learner once (present vs absent) from the term start to today. A learner counts as present only when marked present in every subject held that day; late and excused are counted as not present, and a day without a taken sheet counts as absent (transferee windows open at enlistment). Hover a day for its numbers."
    >
      {isPending ? (
        <div className={styles.list} aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className={styles.skelRow} />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <PrincipalEmptyState
          icon={Users}
          title="No trend data yet"
          hint="No adviser-shared attendance trend is available for this term."
        />
      ) : (
        <div className={styles.list}>
          <div className={styles.rail} aria-hidden="true">
            <span>Section</span>
            <span className={styles.railChart}>
              Daily attendance
              <span className={styles.railLegend}>
                <span>
                  <span className={`${styles.dot} ${styles.dotPresent}`} />
                  Present
                </span>
                <span>
                  <span className={`${styles.dot} ${styles.dotAbsent}`} />
                  Absent
                </span>
              </span>
            </span>
            <span>Weakest subject</span>
            <span className={styles.railRate}>Attendance</span>
          </div>
          {visible.map((section) => (
            <SectionTrendRow
              key={section.sectionId}
              section={section}
              model={models.get(section.sectionId)!}
            />
          ))}
        </div>
      )}
    </KanbanBoard>
  );
}
