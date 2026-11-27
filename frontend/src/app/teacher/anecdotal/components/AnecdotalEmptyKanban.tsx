"use client";

import * as React from "react";
import Link from "next/link";
import { ArchiveRestore, ChevronRight, FolderOpen, Plus, Sparkles } from "lucide-react";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";
import cardStyles from "@/app/principal/academics/assign/components/sections-kanban.module.css";
import scheduleCardStyles from "@/app/admin/academics/schedule/components/schedule-overview-board.module.css";
import styles from "./anecdotal-empty-kanban.module.css";

function BamaMascot({ size = 14 }: { size?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center" aria-hidden>
      <StudentMascot name="Bama" character="crt" size={size} />
    </span>
  );
}

export interface EmptyKanbanAction {
  key?: string;
  title: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ size?: number | string; className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  /** Chat with Bama entries always open the standalone chat in a new tab. */
  newTab?: boolean;
  /** Render the CRT Bama mascot instead of the lucide icon. */
  mascot?: boolean;
  /** Action that opens a dialog instead of navigating. */
  onClick?: () => void;
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

const ACTIONS: EmptyKanbanAction[] = [
  {
    key: "chat",
    title: "Chat with Bama",
    description: "File through chat — Bama drafts the GCForm-01 for you.",
    href: "/teacher/chat?standalone=1",
    icon: Plus,
    newTab: true,
    mascot: true,
    statusLabel: "Ready to file",
    statusTone: "green",
    badgeLabel: "Starts here",
    badgeValue: "Chat",
    hintLabel: "Drafts the form as you talk",
    ctaLabel: "Chat now",
  },
  {
    key: "archive",
    title: "Archive records",
    description: "Restore records you removed from this desk.",
    href: "/teacher/anecdotal",
    icon: ArchiveRestore,
    statusLabel: "Nothing archived",
    statusTone: "neutral",
    badgeLabel: "Recover",
    badgeValue: "Removed",
    hintLabel: "Bring a record back to the board",
    ctaLabel: "Open",
  },
  {
    key: "folders",
    title: "Record folders",
    description: "Open per-student folders once records are stored.",
    href: "/teacher/anecdotal/folders",
    icon: FolderOpen,
    statusLabel: "Opens after filing",
    statusTone: "amber",
    badgeLabel: "View",
    badgeValue: "Per student",
    hintLabel: "Grouped by learner",
    ctaLabel: "See all",
  },
];

function ActionCard({
  action,
  onOpenArchive,
  onOpenChat,
}: {
  action: EmptyKanbanAction;
  onOpenArchive?: () => void;
  onOpenChat?: () => void;
}) {
  const Icon = action.icon;
  const isArchive = action.key === "archive";
  const isChat = action.key === "chat";
  const cta = (
    <>
      {action.ctaLabel}
      <ChevronRight size={12} aria-hidden />
    </>
  );
  return (
    <article className={cn(scheduleCardStyles.card, "w-full")} aria-label={action.title}>
      <header className={cardStyles.cardHead}>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400">
          {action.mascot ? <BamaMascot size={22} /> : <Icon size={16} aria-hidden />}
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
        {isArchive ? (
          <Button
            type="button"
            variant="outline"
            className="h-6 shrink-0 gap-1 bg-card px-2 text-[12px] text-foreground"
            onClick={onOpenArchive}
            disabled={!onOpenArchive}
            aria-label={`Open ${action.title}`}
          >
            {cta}
          </Button>
        ) : isChat ? (
          <Button
            type="button"
            variant="outline"
            className="h-6 shrink-0 gap-1 bg-card px-2 text-[12px] text-foreground"
            onClick={onOpenChat}
            disabled={!onOpenChat}
            aria-label="Open Chat with Bama"
          >
            {cta}
          </Button>
        ) : (
          <Button
            asChild
            variant="outline"
            className="h-6 shrink-0 gap-1 bg-card px-2 text-[12px] text-foreground"
          >
            <Link
              href={action.href}
              {...(action.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              aria-label={`Open ${action.title}${action.newTab ? " (opens in a new tab)" : ""}`}
            >
              {cta}
            </Link>
          </Button>
        )}
      </div>
    </article>
  );
}

export function AnecdotalEmptyKanban({
  onOpenArchive,
  onOpenChat,
}: {
  onOpenArchive?: () => void;
  onOpenChat?: () => void;
} = {}) {
  return (
    <section aria-labelledby="anecdotal-empty-board" className={styles.section}>
      <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
        <div className={styles.head}>
          <h2 id="anecdotal-empty-board" className={styles.title}>
            No files stored yet
          </h2>
          <p className={styles.subtitle}>
            Files you file through Chat with Bama will appear here once stored. Pick a starting point below.
          </p>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2.5" aria-label="Anecdotal starting points">
          {ACTIONS.map((action) => (
            <ActionCard
              key={action.title}
              action={action}
              onOpenArchive={onOpenArchive}
              onOpenChat={onOpenChat}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
