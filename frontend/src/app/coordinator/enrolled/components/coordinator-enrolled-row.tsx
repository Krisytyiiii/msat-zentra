"use client";

import type { CSSProperties, KeyboardEvent } from "react";
import { ChevronRight } from "lucide-react";
import { Pill } from "@/components/ui/pill";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { formatSurnameFirst } from "@/lib/names";
import type { AdmCaseRow } from "@/services/coordinator/coordinator.types";
import { LANES, laneFor, moduleProgress } from "./coordinator-enrolled-status";
import styles from "@/app/teacher/advisory/adm-cases/components/adm-cases.module.css";

/**
 * One enrolled learner in the monitoring desk's left list. Same row anatomy as
 * the adviser ADM desk — identity, status pill, module progress, chevron —
 * selecting it opens that learner's read-only monitoring workspace on the
 * right instead of navigating away.
 */
export function CoordinatorEnrolledRow({
  row,
  selected,
  onSelect,
}: {
  row: AdmCaseRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const { submitted, total, percent } = moduleProgress(row);
  const lane = LANES[laneFor(row)];

  const handleKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  };

  return (
    <li
      style={{ "--stage": lane.tint } as CSSProperties}
      className={`${styles.row} ${selected ? styles.rowSelected : ""}`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Open monitoring for ${row.student}, ${lane.title}`}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
    >
      <div className={`${styles.cell} ${styles.cellPerson}`}>
        <StudentMascot
          name={row.student}
          seed={row.lrn}
          character={row.mascot ?? undefined}
          size={30}
        />
        <div className={styles.personText}>
          <p className={styles.personName} title={row.student}>
            {formatSurnameFirst(row.student)}
          </p>
          <Pill label="LRN" className={styles.personLrn}>
            {row.lrn}
          </Pill>
        </div>
      </div>

      <div className={`${styles.cell} ${styles.cellStage}`}>
        <Pill
          tone={lane.tone}
          label="Monitoring status"
          className={styles.stagePill}
          title={lane.title}
        >
          {lane.title}
        </Pill>
      </div>

      <div className={`${styles.cell} ${styles.cellModules}`}>
        <span className={styles.moduleValue}>
          {total > 0 ? `${submitted}/${total} modules` : "No modules"}
        </span>
        <span className={styles.moduleTrack} aria-hidden>
          <span className={styles.moduleFill} style={{ width: `${percent}%` }} />
        </span>
      </div>

      <div className={`${styles.cell} ${styles.cellAction}`}>
        <span className={styles.rowChevron} aria-hidden>
          <ChevronRight size={15} />
        </span>
      </div>
    </li>
  );
}
