"use client";

import * as React from "react";
import { ArrowUpRight, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/ui/side-panel";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { useTerm } from "@/lib/term/TermContext";
import type { LockGradesAdviseeRow } from "@/services/teacher/lockGrades.service";
import rowStyles from "@/components/ui/table-row-in.module.css";
import { AdviseeGradesBoard } from "./advisee-grades-board";

const HEAD_CLASS =
  "px-4 py-2.5 text-left text-[12px] font-medium tracking-[0.02em] whitespace-nowrap text-muted-foreground";
const CELL_CLASS = "px-4 py-2.5 align-middle whitespace-nowrap";
const NUM_CLASS = `${CELL_CLASS} tabular-nums text-[12px] text-muted-foreground`;

function AdviseeRow({
  row,
  index,
  onOpen,
}: {
  row: LockGradesAdviseeRow;
  index: number;
  onOpen: () => void;
}) {
  const total = row.summary.subjects;
  const locked = row.summary.locked + row.summary.approved;

  return (
    <tr
      style={{ "--row-delay": `${Math.min(index, 11) * 35}ms` } as React.CSSProperties}
      className={`${rowStyles.row} border-b border-border/60 transition-colors duration-150 last:border-b-0 hover:bg-muted/60`}
    >
      <td className={CELL_CLASS}>
        <div className="flex items-center gap-2.5">
          <StudentMascot name={row.name} seed={row.studentId} size={28} />
          <div className="min-w-0">
            <p
              className="m-0 truncate text-[13px] leading-tight font-semibold text-foreground"
              title={row.name}
            >
              {row.name}
            </p>
            <p className="m-0 truncate text-[12px] leading-tight text-muted-foreground">
              {row.lrn || "No LRN"}
            </p>
          </div>
        </div>
      </td>
      <td className={`${CELL_CLASS} text-[12px] text-muted-foreground`}>
        {row.section || "No section"}
      </td>
      <td className={CELL_CLASS}>
        <span className="block text-[12px] font-medium tabular-nums text-foreground">
          {total} subject{total === 1 ? "" : "s"}
        </span>
        <span
          className="block max-w-[20rem] truncate text-[12px] text-muted-foreground"
          title={row.subjects.map((s) => s.subject).join(", ")}
        >
          {row.subjects.length === 0
            ? "No subjects"
            : row.subjects.map((s) => s.subject).join(", ")}
        </span>
      </td>
      <td className={NUM_CLASS}>{row.summary.graded}</td>
      <td className={CELL_CLASS}>
        <span className="text-[12px] font-medium tabular-nums text-foreground">{locked}</span>
        {row.summary.approved > 0 ? (
          <span className="ml-1.5 text-[12px] tabular-nums text-muted-foreground">
            ({row.summary.approved} final)
          </span>
        ) : null}
      </td>
      <td className="px-4 py-2.5 text-right align-middle whitespace-nowrap">
        <Button
          variant="outline"
          className="h-6 gap-1 px-2 text-[12px]"
          onClick={onOpen}
          aria-label={`View grades for ${row.name}`}
        >
          <BookOpen size={12} aria-hidden />
          Grades
          <ArrowUpRight size={12} aria-hidden />
        </Button>
      </td>
    </tr>
  );
}

export function LockGradesAdviseeTable({ rows }: { rows: LockGradesAdviseeRow[] }) {
  const [openRow, setOpenRow] = React.useState<LockGradesAdviseeRow | null>(null);
  const { activeTerm } = useTerm();

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-border bg-card dark:bg-transparent">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className={HEAD_CLASS}>Learner</th>
              <th scope="col" className={HEAD_CLASS}>Section</th>
              <th scope="col" className={HEAD_CLASS}>Subjects</th>
              <th scope="col" className={HEAD_CLASS}>Graded</th>
              <th scope="col" className={HEAD_CLASS}>Locked</th>
              <th scope="col" className={`${HEAD_CLASS} text-right`}>
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <AdviseeRow
                key={row.studentId}
                row={row}
                index={index}
                onOpen={() => setOpenRow(row)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <SidePanel
        open={openRow !== null}
        onClose={() => setOpenRow(null)}
        label={openRow ? `${openRow.name} — per-subject grades` : "Advisee grades"}
        width="3xl"
        showCloseButton
      >
        <div className="flex h-full min-h-0 flex-col">
          <header className="flex shrink-0 items-center gap-2.5 border-b border-border px-4 py-3">
            {openRow ? <StudentMascot name={openRow.name} seed={openRow.studentId} size={36} /> : null}
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold leading-tight text-foreground">
                {openRow?.name ?? "Advisee grades"}
              </h2>
              {openRow ? (
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted-foreground">
                  <span>
                    LRN:{" "}
                    <span className="font-medium tabular-nums text-foreground">
                      {openRow.lrn || "—"}
                    </span>
                  </span>
                  <span aria-hidden className="text-border">|</span>
                  <span>
                    Section:{" "}
                    <span className="font-medium text-foreground">
                      {openRow.section || "—"}
                    </span>
                  </span>
                  <span aria-hidden className="text-border">|</span>
                  <span>
                    Term:{" "}
                    <span className="font-medium text-foreground">
                      {activeTerm ? `Term ${activeTerm.termNumber}` : "—"}
                    </span>
                  </span>
                  <span aria-hidden className="text-border">|</span>
                  <span>
                    School year:{" "}
                    <span className="font-medium text-foreground">
                      {activeTerm?.schoolYearName ?? "—"}
                    </span>
                  </span>
                </p>
              ) : null}
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <AdviseeGradesBoard row={openRow} bare />
          </div>
        </div>
      </SidePanel>
    </>
  );
}
