"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { LibraryBig } from "lucide-react";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { Skeleton } from "@/components/ui/skeleton";
import type { RegistryDesk } from "@/services/registry/overview.service";
import { registryBase, registryOverviewQuery } from "./registryOverviewQuery";
import styles from "./registry-overview.module.css";

interface LedgerCell {
  key: string;
  label: string;
  value: number;
  of?: number;
  hint: string;
  href: string;
}

function percent(value: number, of: number | undefined): number {
  if (!of || of <= 0) return 0;
  return Math.min(100, Math.round((value / of) * 100));
}

/**
 * Records ledger — the lifecycle figures behind the queues: how much of the
 * band's final-grade set is adviser-approved, how much of its SF10 archive is
 * released, and the academic footprint (sections / subjects). Each cell links
 * to the desk page that owns that number.
 */
export function RegistryRecordsLedger({ desk }: { desk: RegistryDesk }) {
  const { data, isPending, isError } = useQuery(registryOverviewQuery(desk));
  const base = registryBase(desk);

  const cells: LedgerCell[] = [
    {
      key: "finals",
      label: "Finals adviser-approved",
      value: data?.finals.awaiting ?? 0,
      of: data?.finals.total ?? 0,
      hint: "of all final grade rows in this band",
      href: `${base}/final-grades`,
    },
    {
      key: "sf10",
      label: "SF10 released",
      value: data?.sf10.released ?? 0,
      of: data?.sf10.total ?? 0,
      hint: "released records in the band archive",
      href: `${base}/sf10`,
    },
    {
      key: "sections",
      label: "Sections",
      value: data?.sections ?? 0,
      hint: "active class sections this school year",
      href: `${base}/academics`,
    },
    {
      key: "subjects",
      label: "Subjects",
      value: data?.subjects ?? 0,
      hint: "subjects offered across the band",
      href: `${base}/academics`,
    },
  ];

  return (
    <KanbanBoard
      title="Records Health"
      icon={
        <span className="text-muted-foreground" aria-hidden>
          <LibraryBig size={14} />
        </span>
      }
      description="Lifecycle coverage behind the queues — approval and release progress plus the band's academic footprint."
      ariaLabel="Records health"
    >
      <div className={styles.ledgerGrid}>
        {isPending
          ? Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className={styles.ledgerCell} aria-hidden>
                <Skeleton className="h-2.5 w-20" />
                <Skeleton className="h-5 w-14" />
                <Skeleton className="h-[3px] w-full" />
                <Skeleton className="h-2.5 w-28" />
              </div>
            ))
          : isError
            ? (
                <p className="col-span-full px-1 py-3 text-center text-xs text-muted-foreground">
                  Could not load records health.
                </p>
              )
            : cells.map((cell) => (
                <Link
                  key={cell.key}
                  href={cell.href}
                  className={styles.ledgerCell}
                  aria-label={
                    cell.of !== undefined
                      ? `${cell.label}: ${cell.value} of ${cell.of}`
                      : `${cell.label}: ${cell.value}`
                  }
                >
                  <span className={styles.ledgerLabel}>{cell.label}</span>
                  <span className={styles.ledgerValue}>
                    <span className={styles.ledgerNumber}>{cell.value}</span>
                    {cell.of !== undefined ? (
                      <span className={styles.ledgerOf}>/ {cell.of}</span>
                    ) : null}
                  </span>
                  {cell.of !== undefined ? (
                    <span className={styles.ledgerMeter} aria-hidden>
                      <span
                        className={styles.ledgerMeterFill}
                        style={{ width: `${percent(cell.value, cell.of)}%` }}
                      />
                    </span>
                  ) : null}
                  <span className={styles.ledgerHint}>{cell.hint}</span>
                </Link>
              ))}
      </div>
    </KanbanBoard>
  );
}
