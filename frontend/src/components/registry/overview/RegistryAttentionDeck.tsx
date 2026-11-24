"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Check,
  FileSignature,
  FileStack,
  ShieldQuestion,
} from "lucide-react";
import { StatDeck, type StatDeckItem } from "@/components/ui/stat-deck";
import type { RegistryDesk } from "@/services/registry/overview.service";
import { registryBase, registryOverviewQuery } from "./registryOverviewQuery";

/**
 * Attention deck — the four desks this role owns, in one bordered strip
 * (shared `StatDeck`) instead of four floating cards. The thin meter shows each
 * queue's share of the open workload and the whole tile is the link, so queue
 * pages stay one click away.
 */
export function RegistryAttentionDeck({ desk }: { desk: RegistryDesk }) {
  const { data, isPending } = useQuery(registryOverviewQuery(desk));
  const base = registryBase(desk);

  const items: StatDeckItem[] = [
    {
      key: "finals",
      icon: FileSignature,
      label: "Final grade approvals",
      unit: "ready",
      hint: "Adviser-approved finals waiting for the desk",
      value: data?.lockedFinalsAwaiting ?? 0,
      href: `${base}/final-grades`,
    },
    {
      key: "adviser",
      icon: ShieldQuestion,
      label: "Adviser access",
      unit: "requests",
      hint: "SF10 access requests from section advisers",
      value: data?.pendingAdviserAccess ?? 0,
      href: `${base}/adviser-access`,
    },
    {
      key: "sf10",
      icon: FileStack,
      label: "SF10 to attach",
      unit: "files",
      hint: "Validated records still to attach to files",
      value: data?.latestAttachments.length ?? 0,
      href: `${base}/sf10`,
    },
  ];

  const total = items.reduce((sum, item) => sum + Number(item.value), 0);
  const clear = total === 0;

  return (
    <StatDeck
      title="Needs your action"
      icon={clear ? Check : FileSignature}
      ariaLabel="Queues needing action"
      items={items.map((item) => ({
        ...item,
        hint: clear ? "All caught up" : item.hint,
        meter: total > 0 ? Math.round((Number(item.value) / total) * 100) : 0,
      }))}
      loading={isPending}
    />
  );
}
