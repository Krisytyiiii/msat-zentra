"use client";

import { BookOpen, X } from "lucide-react";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { PrincipalEmptyState } from "../../../../components/PrincipalEmptyCard";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { ALL_GRADES, type AttentionItem } from "./types";
import styles from "./academics.module.css";

export function SubjectSectionBreakdown({
  subject,
  gradeFilter,
  items,
  onClear,
}: {
  subject: string;
  gradeFilter: string;
  items: AttentionItem[];
  onClear: () => void;
}) {
  const scope = gradeFilter === ALL_GRADES ? "All grades" : gradeFilter;
  const worst = items.length > 0 ? items[0] : null;

  const clearButton = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClear}
      aria-label="Clear selected subject"
    >
      <X aria-hidden />
    </Button>
  );

  if (items.length === 0) {
    return (
      <KanbanBoard
        title={`${subject} — ${scope}`}
        icon={<BookOpen size={14} aria-hidden="true" />}
        actions={clearButton}
        ariaLabel={`${subject} section breakdown`}
      >
        <PrincipalEmptyState
          icon={BookOpen}
          title="No section grades yet"
          hint={`No section has grades for ${subject} yet — clear.`}
        />
      </KanbanBoard>
    );
  }

  return (
    <KanbanBoard
      title={`${subject} — ${scope}`}
      icon={<BookOpen size={14} aria-hidden="true" />}
      count={items.length}
      description={
        worst
          ? worst.avg < 75
            ? `Most underperformed: ${worst.section} at ${worst.avg}. Sections ranked worst first.`
            : `Every section is at or above 75 in ${subject}. Sections ranked lowest first.`
          : `No graded records for ${subject} in ${scope} yet.`
      }
      actions={clearButton}
      ariaLabel={`${subject} section breakdown`}
    >
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th aria-label="Rank">#</th>
              <th>Section</th>
              <th>Average</th>
              <th>Graded</th>
              <th>Below 75</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => {
              const below = item.avg < 75;
              const meter = Math.max(0, Math.min(100, item.avg));
              return (
                <tr
                  key={item.sectionId}
                  className={i === 0 && below ? styles.worstRow : ""}
                >
                  <td className={styles.rankCell}>
                    <span
                      className={`${styles.rankPill} ${
                        i === 0 && below ? styles.rankPillWorst : ""
                      }`}
                    >
                      {i + 1}
                    </span>
                  </td>
                  <td className={styles.sectionCell}>{item.section}</td>
                  <td>
                    <span className={styles.avgCell}>
                      <span className={below ? styles.avgBad : styles.avgGood}>
                        {item.avg}
                      </span>
                      <span className={styles.avgMeter} aria-hidden>
                        <span
                          className={`${styles.avgMeterFill} ${
                            below ? styles.avgMeterBad : ""
                          }`}
                          style={{ width: `${meter}%` }}
                        />
                      </span>
                    </span>
                  </td>
                  <td>{item.graded}</td>
                  <td>
                    <Pill
                      tone={item.below > 0 ? "red" : "green"}
                      label="Below 75"
                    >
                      {item.below}
                    </Pill>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </KanbanBoard>
  );
}
