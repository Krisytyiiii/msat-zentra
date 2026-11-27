"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, FileText, Plus, Send, Sparkles } from "lucide-react";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";
import cardStyles from "@/app/principal/academics/assign/components/sections-kanban.module.css";
import scheduleCardStyles from "@/app/admin/academics/schedule/components/schedule-overview-board.module.css";
import styles from "@/app/teacher/anecdotal/components/anecdotal-empty-kanban.module.css";

function BamaMascot({ size = 14 }: { size?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center" aria-hidden>
      <StudentMascot name="Bama" character="crt" size={size} />
    </span>
  );
}

interface EmptyKanbanAction {
  key: string;
  title: string;
  description: string;
  href: string;
  icon: React.ComponentType<{
    size?: number | string;
    className?: string;
    "aria-hidden"?: boolean | "true" | "false";
  }>;
  /** Chat with Bama entries always open the standalone chat in a new tab. */
  newTab?: boolean;
  /** Render the CRT Bama mascot instead of the lucide icon. */
  mascot?: boolean;
  /** Action that opens the referral form instead of navigating. */
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
    key: "new",
    title: "New referral",
    description: "Refer a learner to guidance, the clinic, or the ADM desk.",
    href: "/teacher/advisory/referrals",
    icon: Send,
    statusLabel: "Ready to file",
    statusTone: "green",
    badgeLabel: "Starts here",
    badgeValue: "Form",
    hintLabel: "Pick a filed record to refer",
    ctaLabel: "Start",
  },
  {
    key: "chat",
    title: "Chat with Bama",
    description: "File through chat — Bama drafts the GCForm-01 for you.",
    href: "/teacher/anecdotal?chat=1",
    icon: Plus,
    mascot: true,
    statusLabel: "Ready to file",
    statusTone: "green",
    badgeLabel: "Starts here",
    badgeValue: "Chat",
    hintLabel: "Drafts the form as you talk",
    ctaLabel: "Chat now",
  },
  {
    key: "records",
    title: "Anecdotal records",
    description: "Referrals start from a filed GCForm-01 record.",
    href: "/teacher/anecdotal",
    icon: FileText,
    statusLabel: "One step before",
    statusTone: "amber",
    badgeLabel: "View",
    badgeValue: "Per learner",
    hintLabel: "File a record first",
    ctaLabel: "Open",
  },
];

function ActionCard({
  action,
  onNewReferral,
}: {
  action: EmptyKanbanAction;
  onNewReferral?: () => void;
}) {
  const Icon = action.icon;
  const isNew = action.key === "new";
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
        {isNew ? (
          <Button
            type="button"
            variant="outline"
            className="h-6 shrink-0 gap-1 bg-card px-2 text-[12px] text-foreground"
            onClick={onNewReferral}
            disabled={!onNewReferral}
            aria-label="Start a new referral"
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

export function ReferralEmptyKanban({ onNewReferral }: { onNewReferral?: () => void }) {
  return (
    <section aria-labelledby="referral-empty-board" className={styles.section}>
      <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
        <div className={styles.head}>
          <h2 id="referral-empty-board" className={styles.title}>
            No referrals yet
          </h2>
          <p className={styles.subtitle}>
            Referrals you submit will appear here once created. Pick a starting point below.
          </p>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2.5" aria-label="Referral starting points">
          {ACTIONS.map((action) => (
            <ActionCard
              key={action.key}
              action={action}
              onNewReferral={onNewReferral}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
