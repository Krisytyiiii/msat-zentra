"use client";

import type { CSSProperties } from "react";
import { CalendarDays } from "lucide-react";
import { Pill, type PillTone } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  sectionCardStatus,
  type SectionCardStatus,
  type StatusEntry,
} from "@/components/schedule/SectionScheduleCard";
import rowStyles from "./subject-workspace-table.module.css";

/** Only the fields the table reads — the page's full section rows fit as-is. */
export interface WorkspaceSection {
  id: string;
  name: string;
  gradeLevel: string;
  adviser?: { fullName: string } | null;
  adviserLabel?: string | null;
  _count: { students: number };
  timetableEntries: StatusEntry[];
}

/** Desk wording for each timetable state — APPROVED means published here. */
const STATUS_LABEL: Record<SectionCardStatus, string> = {
  approved: "Published",
  draft: "Draft",
  submitted: "Submitted",
  returned: "Returned",
  empty: "Empty grid",
};

const STATUS_TONE: Record<SectionCardStatus, PillTone> = {
  approved: "green",
  draft: "amber",
  submitted: "sky",
  returned: "red",
  empty: "neutral",
};

/**
 * The section workspace list as a data table — same anatomy as the nurse desk
 * tables (hairline header row, muted 12px column labels, row separators, hover
 * tint), reduced to the columns that matter for scheduling: the section and its
 * adviser, grade, learner count, filled slots and timetable state.
 */
export function SectionWorkspaceTable({
  sections,
  activeId,
  onSelect,
}: {
  sections: WorkspaceSection[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card dark:bg-transparent">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-border">
            <th
              scope="col"
              className="px-4 py-2.5 text-left text-[12px] font-medium tracking-[0.02em] whitespace-nowrap text-muted-foreground"
            >
              Section
            </th>
            <th
              scope="col"
              className="px-4 py-2.5 text-left text-[12px] font-medium tracking-[0.02em] whitespace-nowrap text-muted-foreground"
            >
              Grade
            </th>
            <th
              scope="col"
              className="px-4 py-2.5 text-left text-[12px] font-medium tracking-[0.02em] whitespace-nowrap text-muted-foreground"
            >
              Learners
            </th>
            <th
              scope="col"
              className="px-4 py-2.5 text-left text-[12px] font-medium tracking-[0.02em] whitespace-nowrap text-muted-foreground"
            >
              Slots
            </th>
            <th
              scope="col"
              className="px-4 py-2.5 text-left text-[12px] font-medium tracking-[0.02em] whitespace-nowrap text-muted-foreground"
            >
              Timetable
            </th>
            <th
              scope="col"
              className="px-4 py-2.5 text-right text-[12px] font-medium tracking-[0.02em] whitespace-nowrap text-muted-foreground"
            >
              <span className="sr-only">Open grid</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sections.map((section, index) => {
            const active = section.id === activeId;
            const slotCount = section.timetableEntries.length;
            const status = sectionCardStatus(section.timetableEntries);
            const adviser = section.adviser?.fullName ?? section.adviserLabel ?? null;
            return (
              <tr
                key={section.id}
                tabIndex={0}
                aria-current={active ? "true" : undefined}
                onClick={() => onSelect(section.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(section.id);
                  }
                }}
                style={{ "--row-delay": `${Math.min(index, 11) * 35}ms` } as CSSProperties}
                className={cn(
                  rowStyles.row,
                  "cursor-pointer border-b border-border/60 transition-colors duration-150 last:border-b-0",
                  active
                    ? "bg-amber-500/10 hover:bg-amber-500/15"
                    : "hover:bg-muted/60",
                )}
              >
                <td className="px-4 py-2.5 align-middle">
                  <p className="m-0 text-[13px] leading-tight font-semibold text-foreground">
                    {section.name}
                  </p>
                  <p className="m-0 truncate text-[12px] leading-tight text-muted-foreground">
                    {adviser ? `Adviser: ${adviser}` : "No adviser assigned"}
                  </p>
                </td>
                <td className="px-4 py-2.5 align-middle whitespace-nowrap text-[12px] tabular-nums text-muted-foreground">
                  Grade {section.gradeLevel.replace("G", "")}
                </td>
                <td className="px-4 py-2.5 align-middle text-[12px] tabular-nums text-muted-foreground">
                  {section._count.students}
                </td>
                <td className="px-4 py-2.5 align-middle text-[12px] tabular-nums text-muted-foreground">
                  {slotCount}
                </td>
                <td className="px-4 py-2.5 align-middle whitespace-nowrap">
                  <Pill tone={STATUS_TONE[status]} label="Timetable status">
                    {STATUS_LABEL[status]}
                  </Pill>
                </td>
                <td className="px-4 py-2.5 text-right align-middle whitespace-nowrap">
                  <Button
                    variant="outline"
                    className="h-6 gap-1 px-2 text-[12px]"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(section.id);
                    }}
                  >
                    <CalendarDays size={12} aria-hidden />
                    {active ? "Building" : "Open grid"}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
