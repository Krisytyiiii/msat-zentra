"use client";

import type { CSSProperties, KeyboardEvent } from "react";
import { ChevronRight } from "lucide-react";
import { Pill } from "@/components/ui/pill";
import type { AdmCase } from "@/services/teacher/admCases.types";
import { admStageTone } from "@/lib/labels/status-tone";
import { stageColor } from "@/services/teacher/admCases.labels";
import { formatSurnameFirst } from "@/lib/names";
import { StudentMascot } from "../../referrals/components/StudentMascot";
import styles from "./adm-cases.module.css";

/**
 * One ADM case in the desk's right-hand list. Selecting a row opens that
 * learner's monitoring workspace in the left pane — no page navigation.
 */
export function AdmCaseRow({
  caseData,
  selected,
  onSelect,
}: {
  caseData: AdmCase;
  selected: boolean;
  onSelect: () => void;
}) {
  const total = caseData.modulesTotal;
  const submitted = caseData.modulesSubmitted;
  const percent = total > 0 ? Math.round((submitted / total) * 100) : 0;
  const stageTint = stageColor(caseData.stage);

  const handleKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  };

  return (
    <li
      style={{ "--stage": stageTint } as CSSProperties}
      className={`${styles.row} ${selected ? styles.rowSelected : ""}`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Open ADM case for ${caseData.studentName}, ${caseData.stageLabel}`}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
    >
      <div className={`${styles.cell} ${styles.cellPerson}`}>
        <StudentMascot
          name={caseData.studentName}
          seed={caseData.lrn}
          character={caseData.mascot ?? undefined}
          size={30}
        />
        <div className={styles.personText}>
          <p className={styles.personName} title={caseData.studentName}>
            {formatSurnameFirst(caseData.studentName)}
          </p>
          <Pill tone="neutral" label="LRN" className={styles.personLrn}>
            {caseData.lrn}
          </Pill>
        </div>
      </div>

      <div className={`${styles.cell} ${styles.cellStage}`}>
        <Pill
          tone={
            caseData.referralStatus === "dismissed" ? "neutral" : admStageTone(caseData.stage)
          }
          label="ADM stage"
          className={styles.stagePill}
          title={caseData.stageLabel}
        >
          {caseData.stageLabel}
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
