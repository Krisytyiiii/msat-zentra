"use client";

import { Send, X } from "lucide-react";
import { SidePanel } from "@/components/ui/side-panel";
import { ReferForm, type ReferFormSeed, type ReferralSubmitSnapshot } from "./refer-form";

/**
 * New-referral entry point: a right-hand drawer over the desk (same shape as
 * the advisory list's add-student panel), no longer a centered modal. The
 * whole form mounts on open, so referable records are only fetched on demand.
 */
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
  return (
    <SidePanel open={open} onClose={onClose} label="New referral" width="2xl">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-card">
        <header className="flex shrink-0 items-start gap-2.5 border-b border-border px-4 py-3">
          <span
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-500"
            aria-hidden
          >
            <Send size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold leading-tight text-foreground">
              New referral
            </h2>
            <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
              Link the learner, the anecdotal record behind the case, and the desk that should handle it.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close new referral"
            className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
          >
            <X size={15} aria-hidden />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col px-4 py-4">
          <ReferForm
            onDone={onClose}
            onSubmitStart={onSubmitStart}
            onSubmitEnd={onSubmitEnd}
            seed={seed}
          />
        </div>
      </div>
    </SidePanel>
  );
}
