"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, Info, KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";
import cardStyles from "@/app/principal/academics/assign/components/sections-kanban.module.css";
import scheduleCardStyles from "@/app/admin/academics/schedule/components/schedule-overview-board.module.css";

/** Where the gate cards send a teacher: the classes page opens its code drawer. */
export const TEACHER_CODE_HREF = "/teacher/classes?link=1";

interface Props {
  title: string;
  /** One line under the title naming what the page needs. */
  subtitle: string;
  /** Status chip text — "Not linked yet", "Term not entered", … */
  status: string;
  tone?: "amber" | "neutral" | "green";
  description: string;
  termLabel: string;
  /** Optional "how this works" lines shown in the muted info block. */
  facts?: string[];
  actionLabel?: string;
  href?: string;
  icon?: React.ComponentType<{ size?: number | string; "aria-hidden"?: boolean }>;
  /** Editor-facing label for the action, read by screen readers. */
  actionAriaLabel?: string;
}

/**
 * The shared "you cannot use this page yet" card for the teacher desks —
 * grading, lock-grades and attendance all render it so an unlinked code, an
 * unentered term or an empty load looks exactly like the My Classes action
 * card. Its action deep-links to /teacher/classes?link=1, which opens the
 * teacher-code drawer there automatically.
 */
export function TeacherGateCard({
  title,
  subtitle,
  status,
  tone = "amber",
  description,
  termLabel,
  facts,
  actionLabel = "Link now",
  href = TEACHER_CODE_HREF,
  icon: Icon = KeyRound,
  actionAriaLabel,
}: Props) {
  return (
    <div className="flex min-h-[calc(100dvh-11rem)] w-full items-center justify-center py-8">
      <div className={cn(cardStyles.grid, "w-full max-w-md")}>
        <article className={scheduleCardStyles.card} aria-label={title}>
          <header className={cardStyles.cardHead}>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Icon size={16} aria-hidden />
            </span>
            <div className={cardStyles.cardId}>
              <span className={cardStyles.sectionName}>{title}</span>
              <span className={cardStyles.teacher}>{subtitle}</span>
            </div>
          </header>

          <div className={cardStyles.metaRow}>
            <span className={scheduleCardStyles.statusText} data-tone={tone}>
              {status}
            </span>
            <span className={scheduleCardStyles.codeBadgeWrap}>
              <Pill tone="amber" label="Active term">
                {termLabel}
              </Pill>
            </span>
          </div>

          <p className={scheduleCardStyles.progressLine}>{description}</p>

          {facts && facts.length > 0 ? (
            <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-2">
              <p className="flex items-center gap-1.5 text-[12px] font-semibold">
                <Info size={12} aria-hidden className="shrink-0 text-muted-foreground" />
                How this works
              </p>
              <ul className="flex list-none flex-col gap-1 text-[12px] text-muted-foreground">
                {facts.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className={cardStyles.cardActions}>
            <span className={cn(cardStyles.lockedHint, "min-w-0")}>
              <span className="truncate">Opens on My Classes</span>
            </span>
            <Button
              asChild
              variant="outline"
              className="h-6 shrink-0 gap-1 bg-card px-2 text-[12px] text-foreground"
            >
              <Link href={href} aria-label={actionAriaLabel ?? actionLabel}>
                {actionLabel}
                <ChevronRight size={12} aria-hidden />
              </Link>
            </Button>
          </div>
        </article>
      </div>
    </div>
  );
}
