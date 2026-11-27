"use client";

import * as React from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Referral desk actions on the right of the casebook deck header — the
 * starters flattened into one row next to the search field (same anatomy as
 * /teacher/advisory/list). Heights come from the global 32px button rule.
 */
export function ReferralPageActions({ onNewReferral }: { onNewReferral?: () => void }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
      <Button type="button" size="sm" className="shrink-0 px-2 text-xs" onClick={onNewReferral}>
        <Send size={14} aria-hidden />
        New referral
      </Button>
    </span>
  );
}
