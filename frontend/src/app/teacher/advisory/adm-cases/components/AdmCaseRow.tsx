"use client";

import type { KeyboardEvent } from "react";
import { ChevronRight } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";
import type { PillTone } from "@/components/ui/pill";
import type { AdmCase } from "@/services/teacher/admCases.types";
import { admStageTone } from "@/lib/labels/status-tone";
import { formatSurnameFirst } from "@/lib/names";
import { StudentMascot } from "../../referrals/components/StudentMascot";
import listStyles from "../../list/components/advisory-list.module.css";

/** The stage reads as plain text, tinted with the tone it used to render as a pill. */
const TONE_TEXT: Record<PillTone, string> = {
  neutral: "text-foreground",
  amber: "text-amber-700 dark:text-amber-300",
  red: "text-red-700 dark:text-red-300",
  green: "text-green-700 dark:text-green-300",
  blue: "text-blue-700 dark:text-blue-300",
  violet: "text-violet-700 dark:text-violet-300",
  teal: "text-teal-700 dark:text-teal-300",
  indigo: "text-indigo-700 dark:text-indigo-300",
  rose: "text-rose-700 dark:text-rose-300",
  sky: "text-sky-700 dark:text-sky-300",
};

/**
 * One ADM case row in the split ADM desk. Same data-table design as the
 * adviser interventions board; selecting the row opens that learner's
 * monitoring workspace in the right pane — no page navigation.
 */
export function AdmCaseRow({
  caseData,
  selected,
  onSelect,
  index = 0,
}: {
  caseData: AdmCase;
  selected: boolean;
  onSelect: () => void;
  index?: number;
}) {
  const total = caseData.modulesTotal;
  const submitted = caseData.modulesSubmitted;
  const percent = total > 0 ? Math.round((submitted / total) * 100) : 0;

  const handleKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  };

  return (
    <TableRow
      style={{ animationDelay: `${450 + Math.min(index, 11) * 140}ms` }}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      aria-selected={selected}
      aria-label={`Open ADM case for ${caseData.studentName}, ${caseData.stageLabel}`}
      className={`${listStyles.row} ${selected ? listStyles.selected : ""}`}
    >
      <TableCell>
        <div className="flex min-w-0 items-center gap-2">
          <StudentMascot
            name={caseData.studentName}
            seed={caseData.lrn}
            character={caseData.mascot ?? undefined}
            size={32}
          />
          <div className="min-w-0 flex-1">
            <span
              className="block truncate text-[13px] font-semibold text-primary"
              title={caseData.studentName}
            >
              {formatSurnameFirst(caseData.studentName)}
            </span>
            <span
              className="mt-0.5 block max-w-full truncate font-mono text-[12px] tabular-nums text-muted-foreground"
              title={`LRN ${caseData.lrn}`}
            >
              {caseData.lrn || "—"}
            </span>
          </div>
        </div>
      </TableCell>

      <TableCell>
        <span
          className={`block whitespace-normal text-[12px] font-semibold leading-snug ${
            TONE_TEXT[
              caseData.referralStatus === "dismissed"
                ? "neutral"
                : admStageTone(caseData.stage)
            ]
          }`}
          title={caseData.stageLabel}
        >
          {caseData.stageLabel}
        </span>
      </TableCell>

      <TableCell>
        <span className="block text-[12px] font-semibold text-foreground tabular-nums">
          {total > 0 ? `${submitted}/${total} modules` : "No modules"}
        </span>
        <span
          className="mt-1 block h-1 w-full max-w-[7rem] overflow-hidden rounded-full bg-muted"
          aria-hidden
        >
          <span
            className="block h-full rounded-full bg-emerald-500 transition-[width] duration-200"
            style={{ width: `${percent}%` }}
          />
        </span>
      </TableCell>

      <TableCell>
        <div className="flex items-center justify-end">
          <ChevronRight
            size={15}
            aria-hidden
            className={`text-muted-foreground ${selected ? "text-amber-600 dark:text-amber-400" : ""}`}
          />
        </div>
      </TableCell>
    </TableRow>
  );
}
