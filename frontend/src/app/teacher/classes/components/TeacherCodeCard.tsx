"use client";

import * as React from "react";
import { ChevronRight, Info, KeyRound, Loader2, ShieldCheck } from "lucide-react";

import { SidePanel } from "@/components/ui/side-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";
import cardStyles from "@/app/principal/academics/assign/components/sections-kanban.module.css";
import scheduleCardStyles from "@/app/admin/academics/schedule/components/schedule-overview-board.module.css";
import styles from "./class-detail-drawer.module.css";

export type TeacherCodeMode = "link" | "term";

interface CardProps {
  mode: TeacherCodeMode;
  termLabel: string;
  linkedName?: string | null;
  linkedCode?: string | null;
  onOpen: () => void;
}

/**
 * The teacher-code step rendered as the same action card the class grid uses:
 * one elevated tile with a status line and a single action that slides the form
 * drawer in. Keeps the unlinked / not-entered states from looking like a
 * different page than the rest of My Classes.
 */
export function TeacherCodeCard({ mode, termLabel, linkedName, linkedCode, onOpen }: CardProps) {
  const isLink = mode === "link";
  return (
    <div className={cn(cardStyles.grid, "min-w-0")}>
      <article
        className={cn(scheduleCardStyles.card, "max-w-md")}
        aria-label={isLink ? "Link your teacher code" : "Enter this term"}
        style={{ animationDelay: "0ms" }}
      >
        <header className={cardStyles.cardHead}>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <KeyRound size={16} aria-hidden />
          </span>
          <div className={cardStyles.cardId}>
            <span className={cardStyles.sectionName}>
              {isLink ? "Link your teacher code" : "Open this term"}
            </span>
            <span className={cardStyles.teacher}>
              {isLink
                ? "No teacher code on this account"
                : `${linkedName ?? "Linked"} · ${linkedCode ?? "code on file"}`}
            </span>
          </div>
        </header>

        <div className={cardStyles.metaRow}>
          <span className={scheduleCardStyles.statusText} data-tone={isLink ? "amber" : "neutral"}>
            {isLink ? "Not linked yet" : "Term not entered"}
          </span>
          <span className={scheduleCardStyles.codeBadgeWrap}>
            <Pill tone="amber" label="Active term">
              {termLabel}
            </Pill>
          </span>
        </div>

        <p className={scheduleCardStyles.progressLine}>
          {isLink
            ? "Enter the code next to your name in the administrator's teacher list (e.g. MS-101) to attach your subjects and sections to this login."
            : "Your code stays valid for every term of this school year — enter it once to open classes, grading and attendance."}
        </p>

        <div className={cardStyles.cardActions}>
          <span className={cn(cardStyles.lockedHint, "min-w-0")}>
            <ShieldCheck size={11} aria-hidden />
            <span className="truncate">
              {isLink ? "Links your scheduled load" : `${termLabel}`}
            </span>
          </span>
          <Button
            type="button"
            variant="outline"
            className="h-6 shrink-0 gap-1 bg-card px-2 text-[12px] text-foreground"
            onClick={onOpen}
            aria-label={isLink ? "Open the teacher code form" : "Open the term entry form"}
          >
            {isLink ? "Link code" : "Enter term"}
            <ChevronRight size={12} aria-hidden />
          </Button>
        </div>
      </article>
    </div>
  );
}

interface DrawerProps {
  open: boolean;
  mode: TeacherCodeMode;
  termLabel: string;
  linkedName?: string | null;
  code: string;
  error: string | null;
  pending: boolean;
  onCodeChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

/**
 * Slide-in form for the card above. Contents ease in from the panel edge so the
 * drawer reads as sliding content rather than a snapping dialog.
 */
export function TeacherCodeDrawer({
  open,
  mode,
  termLabel,
  linkedName,
  code,
  error,
  pending,
  onCodeChange,
  onSubmit,
  onClose,
}: DrawerProps) {
  const isLink = mode === "link";
  const title = isLink ? "Link your teacher code" : "Enter this term";
  return (
    <SidePanel
      open={open}
      onClose={onClose}
      label={title}
      width="md"
      showCloseButton
    >
      <div className={styles.panel}>
        <header className={styles.header}>
          <span className={styles.iconTile} aria-hidden>
            <KeyRound size={18} />
          </span>
          <div className={styles.headText}>
            <h2 className={styles.title}>{title}</h2>
            <p className={styles.subtitle}>
              {isLink ? "Match the code on your teacher list entry" : `${linkedName ?? "Your code"} · ${termLabel}`}
            </p>
          </div>
        </header>

        <div className={styles.body}>
          <div className={styles.pills}>
            <Pill tone="amber" label="Active term">
              {termLabel}
            </Pill>
            {isLink ? (
              <Pill label="Status">One-time link</Pill>
            ) : (
              <Pill label="Status">Stays valid all year</Pill>
            )}
          </div>

          <section aria-label="Teacher code" className={styles.weekCard}>
            <div className={styles.weekHead}>
              <p className={styles.eyebrow}>Teacher code</p>
              <span className={styles.muted}>e.g. MS-101</span>
            </div>
            <div className="flex flex-col gap-2 p-3">
              <label htmlFor="teacher-code-input" className="sr-only">
                Teacher code
              </label>
              <Input
                id="teacher-code-input"
                placeholder="Teacher code (e.g. MS-101)"
                value={code}
                onChange={(e) => onCodeChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSubmit();
                }}
                aria-label="Teacher code"
                aria-invalid={!!error}
                className="h-8 w-full rounded-lg border-input bg-transparent px-2.5 text-sm transition-[border-color,box-shadow] duration-150 focus-visible:border-amber-500 focus-visible:ring-2 focus-visible:ring-amber-500/25 dark:bg-transparent"
              />
              {error ? (
                <p role="alert" className="text-[12px] text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
          </section>

          {/* How it works — same muted info block the admin schedule drawers use
              at the foot of their forms. */}
          <section
            aria-label="How the teacher code works"
            className="mt-auto flex flex-col gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5"
          >
            <p className="flex items-center gap-1.5 text-[12px] font-semibold">
              <Info size={12} aria-hidden className="shrink-0 text-muted-foreground" />
              How this works
            </p>
            <ul className="flex list-none flex-col gap-1.5 text-[12px] text-muted-foreground">
              {isLink ? (
                <>
                  <li>
                    The administrator prints this code beside your name on the teacher
                    list — enter it exactly as shown, without spaces.
                  </li>
                  <li>
                    Linking attaches the subjects and sections on that row to this login,
                    so classes, grading, lock-grades and attendance open for you.
                  </li>
                  <li>
                    One code stays valid for the whole school year — you only enter it
                    again if the administrator reassigns your teacher row.
                  </li>
                  <li>
                    Selected term:{" "}
                    <span className="font-medium text-foreground">{termLabel}</span>. The
                    code does not change the term; switch it with the term picker in the
                    top bar.
                  </li>
                </>
              ) : (
                <>
                  <li>
                    This account is already linked to{" "}
                    <span className="font-medium text-foreground">
                      {linkedName ?? "your teacher row"}
                    </span>
                    , so your load is fixed — only the term needs opening.
                  </li>
                  <li>
                    Entering the code opens classes, grading, lock-grades and attendance
                    for{" "}
                    <span className="font-medium text-foreground">{termLabel}</span>.
                  </li>
                  <li>
                    The entry carries over to every term of this school year; the term
                    picker in the top bar decides which grid you see.
                  </li>
                  <li>
                    Lost or forgotten the code? Ask the administrator — it is the code
                    printed beside your name in the teacher list.
                  </li>
                </>
              )}
            </ul>
          </section>
        </div>

        <footer className={styles.footer}>
          <p className={styles.nextLine}>
            {isLink ? "Links your scheduled subjects and sections" : "Stays valid for every term of this year"}
          </p>
          <div className={styles.actions}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 gap-1 px-2 text-[12px]"
              onClick={onClose}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-6 gap-1 px-2 text-[12px]"
              onClick={onSubmit}
              disabled={pending}
            >
              {pending ? (
                <>
                  <Loader2 size={12} className="animate-spin" aria-hidden />
                  <span aria-live="polite">
                    {isLink ? "Linking…" : "Verifying…"}
                  </span>
                </>
              ) : (
                (isLink ? "Link code" : "Enter term")
              )}
            </Button>
          </div>
        </footer>
      </div>
    </SidePanel>
  );
}
