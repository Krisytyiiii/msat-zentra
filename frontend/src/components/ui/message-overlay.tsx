"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  ShieldAlert,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import styles from "./message-overlay.module.css";

/**
 * The app's message overlay: one card + scrim shape for every "tell the user
 * something and maybe ask" moment — info notes, success receipts, warnings and
 * destructive confirmations. `ConfirmDialog` is the two-button wrapper over
 * this, so a desk never hand-rolls a modal again.
 *
 * Rules it enforces: blurred scrim, 1px border, one accent tint per tone, a
 * one-sentence consequence, Escape/backdrop dismissal (unless blocked while a
 * request settles), and 32px actions in a separated footer.
 */
export type MessageOverlayTone =
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "neutral";

/** Default icon per tone — omit `icon` to use it. */
const TONE_ICONS: Record<MessageOverlayTone, React.ReactNode> = {
  primary: <Info size={16} />,
  success: <CheckCircle2 size={16} />,
  warning: <AlertTriangle size={16} />,
  danger: <ShieldAlert size={16} />,
  neutral: <Info size={16} />,
};

const ICON_TONES: Record<MessageOverlayTone, string> = {
  primary: "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  success:
    "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warning: "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  danger: "border-destructive/25 bg-destructive/10 text-destructive",
  neutral: "border-border bg-muted text-muted-foreground",
};

const DETAIL_TONES: Record<MessageOverlayTone, string> = {
  primary: "border-border bg-muted/40 text-muted-foreground",
  success: "border-emerald-500/25 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
  warning: "border-amber-500/25 bg-amber-500/5 text-amber-700 dark:text-amber-400",
  danger: "border-destructive/25 bg-destructive/5 text-destructive",
  neutral: "border-border bg-muted/40 text-muted-foreground",
};

const WIDTHS = {
  sm: "max-w-[22rem]",
  md: "max-w-[26rem]",
  lg: "max-w-[32rem]",
} as const;

export interface MessageOverlayProps {
  title: React.ReactNode;
  /** One sentence: what this means / what happens next. */
  description?: React.ReactNode;
  tone?: MessageOverlayTone;
  /** Overrides the tone's default icon. */
  icon?: React.ReactNode;
  /** Right-aligned chip in the header (counts, scope, status…). */
  meta?: React.ReactNode;
  /** Highlighted consequence line (what exactly is removed / affected). */
  detail?: React.ReactNode;
  /** Optional body (rows, fields, a preview) between the text and the footer. */
  children?: React.ReactNode;
  /** Footer actions, right-aligned. Omit for a plain message with one Close. */
  actions?: React.ReactNode;
  /** Left-aligned footer hint. Defaults to the Esc affordance. */
  footerHint?: React.ReactNode;
  /** Escape / backdrop / close-X handler. Omit for a non-dismissable overlay. */
  onDismiss?: () => void;
  /** False blocks Escape, the backdrop and the close X (a request is settling). */
  dismissable?: boolean;
  /** `alertdialog` (needs a decision) vs `dialog` (a message). */
  role?: "dialog" | "alertdialog";
  /** Show the header close X. Defaults to true when `onDismiss` is given. */
  showClose?: boolean;
  width?: keyof typeof WIDTHS;
  className?: string;
}

export function MessageOverlay({
  title,
  description,
  tone = "primary",
  icon,
  meta,
  detail,
  children,
  actions,
  footerHint,
  onDismiss,
  dismissable = true,
  role = "dialog",
  showClose = true,
  width = "md",
  className,
}: MessageOverlayProps) {
  const titleId = React.useId();
  const descriptionId = React.useId();
  const canClose = Boolean(onDismiss) && dismissable;

  React.useEffect(() => {
    if (!canClose) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canClose, onDismiss]);

  // Portals need a document; render nothing during prerender.
  if (typeof document === "undefined") return null;

  const footer =
    actions === undefined ? (
      onDismiss ? (
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 text-[12px]"
          onClick={onDismiss}
          autoFocus
        >
          Close
        </Button>
      ) : null
    ) : (
      actions
    );

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px] dark:bg-black/70",
        styles.scrim,
      )}
      role={role}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClick={canClose ? onDismiss : undefined}
    >
      <div
        className={cn(
          "w-full min-w-0 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-2xl",
          WIDTHS[width],
          styles.dialog,
          className,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-4 pt-4">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg border",
              ICON_TONES[tone],
            )}
            aria-hidden
          >
            {icon ?? TONE_ICONS[tone]}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex min-w-0 items-start gap-2">
              <h2
                id={titleId}
                className="min-w-0 flex-1 text-[15px] leading-snug font-semibold tracking-[-0.01em] text-foreground"
              >
                {title}
              </h2>
              {meta ? (
                <span className="shrink-0 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[12px] font-semibold text-muted-foreground tabular-nums">
                  {meta}
                </span>
              ) : null}
              {showClose && canClose ? (
                <button
                  type="button"
                  onClick={onDismiss}
                  aria-label="Close message"
                  className="-mr-1 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
                >
                  <X size={14} aria-hidden />
                </button>
              ) : null}
            </div>
            {description ? (
              <p id={descriptionId} className="text-[12px] leading-[1.55] text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
        </div>

        {detail || children ? (
          <div className="flex flex-col gap-2.5 px-4 pt-3">
            {detail ? (
              <p
                className={cn(
                  "m-0 rounded-lg border px-2.5 py-2 text-[12px] leading-[1.5]",
                  DETAIL_TONES[tone],
                )}
              >
                {detail}
              </p>
            ) : null}
            {children}
          </div>
        ) : null}

        {footer ? (
          <div className="mt-4 flex items-center gap-2 border-t border-border bg-muted/30 px-4 py-2.5">
            {footerHint !== undefined ? (
              <span className="mr-auto hidden text-[12px] text-muted-foreground sm:block">
                {footerHint}
              </span>
            ) : canClose ? (
              <span className="mr-auto hidden text-[12px] text-muted-foreground sm:block">
                Esc to close
              </span>
            ) : null}
            <span className="ml-auto flex items-center gap-2">{footer}</span>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
