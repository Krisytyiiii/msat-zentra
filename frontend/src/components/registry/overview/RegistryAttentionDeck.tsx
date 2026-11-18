"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Check,
  FileSignature,
  FileStack,
  GraduationCap,
  ShieldQuestion,
  type LucideIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCountUp } from "@/lib/hooks/useCountUp";
import type { RegistryDesk } from "@/services/registry/overview.service";
import { registryBase, registryOverviewQuery } from "./registryOverviewQuery";
import styles from "./registry-overview.module.css";

interface DeckItem {
  key: string;
  icon: LucideIcon;
  label: string;
  unit: string;
  hint: string;
  count: number;
  href: string;
}

function AttentionTile({
  item,
  share,
}: {
  item: DeckItem;
  /** Slice of the total open workload, 0–100. */
  share: number;
}) {
  const Icon = item.icon;
  const shown = useCountUp(item.count, 700);
  const clear = item.count === 0;

  return (
    <Link
      href={item.href}
      className={`${styles.tile} ${clear ? styles.tileClear : ""}`}
      aria-label={
        clear
          ? `${item.label}: all caught up`
          : `${item.label}: ${item.count} ${item.unit} — open queue`
      }
    >
      <span className={styles.tileTop}>
        <span className={styles.tileIcon} aria-hidden>
          <Icon />
        </span>
        <span className={styles.tileLabel}>{item.label}</span>
        <ArrowUpRight className={styles.tileArrow} aria-hidden />
      </span>

      <span className={styles.tileValue}>
        <span className={styles.tileNumber}>{shown}</span>
        <span className={styles.tileUnit}>{item.unit}</span>
      </span>

      <span className={styles.tileMeter} aria-hidden>
        <span className={styles.tileMeterFill} style={{ width: `${share}%` }} />
      </span>

      <span className={styles.tileHint}>{clear ? "All caught up" : item.hint}</span>
    </Link>
  );
}

/**
 * Attention deck — the four desks this role owns, in one bordered strip
 * instead of four floating cards. Counts animate to their live value, the
 * thin meter shows each queue's share of the open workload, and the whole
 * tile is the link (queue pages stay one click away).
 */
export function RegistryAttentionDeck({ desk }: { desk: RegistryDesk }) {
  const { data, isPending } = useQuery(registryOverviewQuery(desk));
  const base = registryBase(desk);

  const items: DeckItem[] = [
    {
      key: "finals",
      icon: FileSignature,
      label: "Final grade approvals",
      unit: "ready",
      hint: "Adviser-approved finals waiting for the desk",
      count: data?.lockedFinalsAwaiting ?? 0,
      href: `${base}/final-grades`,
    },
    {
      key: "students",
      icon: GraduationCap,
      label: "Pending students",
      unit: "accounts",
      hint: "LRN verification before the account goes live",
      count: data?.pendingStudents.length ?? 0,
      href: `${base}/accounts`,
    },
    {
      key: "adviser",
      icon: ShieldQuestion,
      label: "Adviser access",
      unit: "requests",
      hint: "SF10 access requests from section advisers",
      count: data?.pendingAdviserAccess ?? 0,
      href: `${base}/adviser-access`,
    },
    {
      key: "sf10",
      icon: FileStack,
      label: "SF10 to attach",
      unit: "files",
      hint: "Validated records still to attach to files",
      count: data?.latestAttachments.length ?? 0,
      href: `${base}/sf10`,
    },
  ];

  const total = items.reduce((sum, item) => sum + item.count, 0);
  const clear = total === 0;

  return (
    <section className={styles.deck} aria-label="Queues needing action">
      <div className={styles.deckHead}>
        <span className={styles.deckTitle}>
          {clear ? <Check aria-hidden /> : <FileSignature aria-hidden />}
          Needs your action
        </span>
      </div>

      <div className={styles.tiles}>
        {isPending
          ? Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className={styles.tile} aria-hidden>
                <span className={styles.tileTop}>
                  <Skeleton className="size-[1.375rem] shrink-0 rounded-md" />
                  <Skeleton className="h-3 w-28" />
                </span>
                <Skeleton className="h-7 w-12" />
                <Skeleton className="h-[3px] w-full" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))
          : items.map((item) => (
              <AttentionTile
                key={item.key}
                item={item}
                share={total > 0 ? Math.round((item.count / total) * 100) : 0}
              />
            ))}
      </div>
    </section>
  );
}
