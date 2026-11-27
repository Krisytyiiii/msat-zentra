"use client";

import * as React from "react";
import { ClipboardList, X } from "lucide-react";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import { SidePanel } from "@/components/ui/side-panel";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  AdvisoryModuleKind,
  AdvisorySubmissionRow,
  ModuleStatusCounts,
} from "@/services/teacher/advisoryModules.service";
import { SubmissionCards } from "./submission-cards";
import glass from "./modules-glass.module.css";

const SKELETON_ROWS = 4;

/** Shimmer placeholders that mirror the loaded submission cards. */
function DrawerSkeleton() {
  return (
    <ShimmerGroup>
      <div className="flex flex-col gap-2.5" aria-hidden>
        {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
          <article key={i} className={`${glass.card} gap-3 p-3`}>
            <div className="flex min-w-0 items-start gap-2.5">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Skeleton className="h-3.5 w-36 max-w-full" />
                <Skeleton className="h-2.5 w-28" />
              </div>
              <Skeleton className="h-5 w-20 shrink-0 rounded-md" />
            </div>

            <div className="grid gap-2 border-t border-border/60 pt-2 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-5 w-16 rounded-md" />
              </div>
              <div className="flex flex-col gap-1">
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-3 w-32 max-w-full" />
              </div>
            </div>
          </article>
        ))}
      </div>
    </ShimmerGroup>
  );
}

/**
 * Student submissions in the shared right-edge drawer (the same shell the
 * advisory list uses). One module's answer sheet slides in over the board,
 * with its own shimmer while the rows land.
 */
export function SubmissionsDrawer({
  open,
  moduleName,
  kind,
  counts,
  rows,
  total,
  page,
  loading,
  onPageChange,
  onClose,
}: {
  open: boolean;
  moduleName: string;
  kind: AdvisoryModuleKind | null;
  counts: ModuleStatusCounts;
  rows: AdvisorySubmissionRow[];
  total: number;
  page: number;
  loading: boolean;
  onPageChange: (page: number) => void;
  onClose: () => void;
}) {
  return (
    <SidePanel open={open} onClose={onClose} label="Student submissions" width="3xl">
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card">
        <header className="flex shrink-0 items-start gap-2.5 border-b border-border px-4 py-3">
          <span
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-500"
            aria-hidden
          >
            <ClipboardList size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold leading-tight text-foreground">
              Student submissions
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted-foreground">
              <span>
                Module:{" "}
                <span className="font-medium text-foreground">
                  {moduleName || "Select a module"}
                </span>
              </span>
              <span aria-hidden className="text-border">
                |
              </span>
              <span>
                Type:{" "}
                <span className="font-medium text-foreground">
                  {kind === "adm" ? "ADM" : "General"}
                </span>
              </span>
              <span aria-hidden className="text-border">
                |
              </span>
              <span>
                Submitted:{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {counts.submitted}/{counts.all}
                </span>
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close submissions"
            className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
          >
            <X size={15} aria-hidden />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
          {loading ? (
            <DrawerSkeleton />
          ) : (
            <SubmissionCards
              rows={rows}
              total={total}
              page={page}
              onPageChange={onPageChange}
            />
          )}
        </div>
      </div>
    </SidePanel>
  );
}
