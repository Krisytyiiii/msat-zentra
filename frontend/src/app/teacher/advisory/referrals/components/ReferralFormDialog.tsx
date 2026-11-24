"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReferForm, type ReferFormSeed, type ReferralSubmitSnapshot } from "./refer-form";
import refStyles from "./referrals.module.css";

export function ReferralFormDialog({
  open,
  onClose,
  onSubmitStart,
  onSubmitEnd,
  seed,
}: {
  open: boolean;
  onClose: () => void;
  onSubmitStart?: (snap: ReferralSubmitSnapshot) => void;
  onSubmitEnd?: (ok: boolean, snap: ReferralSubmitSnapshot & { message?: string }) => void;
  seed?: ReferFormSeed | null;
}) {
  const [mounted, setMounted] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  React.useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    // Width is already stabilized by `scrollbar-gutter: stable` on <html>,
    // so locking scroll here changes nothing about page width — no extra
    // padding compensation (that would shift content left).
    document.body.style.overflow = "hidden";
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open ]);

  // Mount only when open so referable records are fetched on demand,
  // and each opening starts with a fresh form.
  if (!open || !mounted) return null;

  return createPortal(
    <div
      className={refStyles.overlay}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="New referral"
        tabIndex={-1}
        className={refStyles.overlayPanel}
      >
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <span
                className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                aria-hidden
              >
                <Send size={15} />
              </span>
              <div className="min-w-0">
                <h2 className="m-0 text-[0.9375rem] font-bold tracking-[-0.01em] text-foreground [font-family:var(--font-inter)]">
                  New referral
                </h2>
                <p className="m-0 text-[0.8125rem] leading-[1.45] text-muted-foreground [font-family:var(--font-inter)]">
                  Link the learner, the anecdotal record behind the case, and the desk that should handle it.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="shrink-0 text-muted-foreground"
              onClick={onClose}
              aria-label="Close dialog"
            >
              <X aria-hidden />
            </Button>
          </div>
          <ReferForm
            onDone={onClose}
            onSubmitStart={onSubmitStart}
            onSubmitEnd={onSubmitEnd}
            seed={seed}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
