"use client";

import * as React from "react";
import { ChevronRight, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";
import cardStyles from "@/app/principal/academics/assign/components/sections-kanban.module.css";
import scheduleCardStyles from "@/app/admin/academics/schedule/components/schedule-overview-board.module.css";
import styles from "@/app/teacher/anecdotal/components/anecdotal-empty-kanban.module.css";

interface EmptyAction {
  key: string;
  title: string;
  description: string;
  icon: React.ComponentType<{
    size?: number | string;
    className?: string;
    "aria-hidden"?: boolean | "true" | "false";
  }>;
  /** Status line shown under the title, same slot as "Scheduled". */
  statusLabel: string;
  statusTone: "green" | "amber" | "neutral";
  /** Amber code badge, same slot as the class code. */
  badgeLabel: string;
  badgeValue: string;
  /** Left-hand hint in the card footer. */
  hintLabel: string;
  /** Footer action. */
  ctaLabel: string;
}

const ACTIONS: EmptyAction[] = [
  {
    key: "request",
    title: "Request SF10 access",
    description: "Ask the registrar or record keeper to grant SF10 access for your advisory.",
    icon: Send,
    statusLabel: "Ready to file",
    statusTone: "green",
    badgeLabel: "Starts here",
    badgeValue: "Request",
    hintLabel: "Bama files it for your section",
    ctaLabel: "Request",
  },
];

function ActionCard({
  action,
  onRequest,
}: {
  action: EmptyAction;
  onRequest?: () => void;
}) {
  const Icon = action.icon;
  return (
    <article className={cn(scheduleCardStyles.card, "w-full")} aria-label={action.title}>
      <header className={cardStyles.cardHead}>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <Icon size={16} aria-hidden />
        </span>
        <div className={cardStyles.cardId}>
          <span className={cardStyles.sectionName} title={action.title}>
            {action.title}
          </span>
        </div>
      </header>

      <div className={cardStyles.metaRow}>
        <span className={scheduleCardStyles.statusText} data-tone={action.statusTone}>
          {action.statusLabel}
        </span>
        <span className={scheduleCardStyles.codeBadgeWrap}>
          <Pill tone="amber" label={action.badgeLabel}>
            {action.badgeValue}
          </Pill>
        </span>
      </div>

      <p className={scheduleCardStyles.progressLine}>{action.description}</p>

      <div className={cardStyles.cardActions}>
        <span className={cn(cardStyles.lockedHint, "min-w-0")}>
          <Sparkles size={11} aria-hidden />
          <span className="truncate">{action.hintLabel}</span>
        </span>
        <Button
          type="button"
          variant="outline"
          className="h-6 shrink-0 gap-1 bg-card px-2 text-[12px] text-foreground"
          onClick={onRequest}
          disabled={!onRequest}
          aria-label="Request SF10 access"
        >
          {action.ctaLabel}
          <ChevronRight size={12} aria-hidden />
        </Button>
      </div>
    </article>
  );
}

export function Sf10EmptyActions({ onRequest }: { onRequest?: () => void }) {
  return (
    <section aria-labelledby="sf10-empty-board" className={styles.section}>
      <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
        <div className={styles.head}>
          <h2 id="sf10-empty-board" className={styles.title}>
            No SF10 records yet
          </h2>
          <p className={styles.subtitle}>
            Your Grade 7 and Grade 11 SF10 records appear here automatically. Other grades
            show as folders once the registrar or record keeper grants access. Pick a
            starting point below.
          </p>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2.5" aria-label="SF10 starting points">
          {ACTIONS.map((action) => (
            <ActionCard key={action.key} action={action} onRequest={onRequest} />
          ))}
        </div>
      </div>
    </section>
  );
}
