"use client";

import * as React from "react";
import { ClipboardList, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import type {
  AdvisoryModuleKind,
  AdvisorySubmissionRow,
  ModuleStatusCounts,
} from "@/services/teacher/advisoryModules.service";
import { SubmissionCards } from "./submission-cards";
import glass from "./modules-glass.module.css";
import styles from "./submissions-drawer.module.css";

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
 * Student submissions as a glass drawer. The modules board owns the page; one
 * module's answer sheet slides in from the right, with its own shimmer while
 * the rows land.
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
    <Sheet open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full gap-0 border-0 bg-transparent p-0 shadow-none data-[side=right]:sm:max-w-3xl"
      >
        <div className={styles.surface}>
          <header className={styles.head}>
            <span className={styles.headIcon} aria-hidden>
              <ClipboardList size={15} />
            </span>
            <div className={styles.headText}>
              <SheetTitle className="text-sm font-semibold text-foreground">
                Student submissions
              </SheetTitle>
              <div className={styles.headMeta}>
                <SheetDescription className="truncate text-[12px] text-muted-foreground">
                  {moduleName || "Select a module"}
                </SheetDescription>
                <Pill tone={kind === "adm" ? "violet" : "neutral"} label="Module type">
                  {kind === "adm" ? "ADM" : "General"}
                </Pill>
                <Pill tone="green" label="Submitted submissions">
                  {counts.submitted}/{counts.all} submitted
                </Pill>
              </div>
            </div>
            <SheetClose asChild>
              <Button
                type="button"
                variant="ghost"
                className="h-7 w-7 shrink-0 px-0 text-muted-foreground hover:text-foreground"
                aria-label="Close submissions"
              >
                <X size={14} aria-hidden />
              </Button>
            </SheetClose>
          </header>

          <div className={styles.body}>
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
      </SheetContent>
    </Sheet>
  );
}
