"use client";

import * as React from "react";
import { Briefcase, GraduationCap, Inbox, UserRound } from "lucide-react";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import { StatDeck } from "@/components/ui/stat-deck";
import { PendingAccountsQueue } from "@/components/registry/account-approvals/PendingAccountsQueue";
import { PendingStaffQueue } from "@/components/registry/account-approvals/PendingStaffQueue";
import { usePendingApprovalCounts } from "@/components/registry/account-approvals/api";

type Tab = "student" | "parent" | "staff";

const TABS: {
  value: Tab;
  label: string;
  icon: typeof GraduationCap;
  hint: string;
}[] = [
  {
    value: "student",
    label: "Students",
    icon: GraduationCap,
    hint: "Needs LRN verification",
  },
  {
    value: "parent",
    label: "Parents",
    icon: UserRound,
    hint: "Guardian sign-ups",
  },
  {
    value: "staff",
    label: "Teachers",
    icon: Briefcase,
    hint: "Self-registered staff",
  },
];

/**
 * The administrator-owned approval board. Every self-registered account
 * (student, parent, teacher) is reviewed here; the registry desks no longer
 * approve sign-ups.
 *
 * Headerless `StatDeck` + tag `FilterTabs` + `SearchField` + data table, exactly
 * like the account directory on `/admin/users`.
 */
export function AccountApprovals() {
  const [tab, setTab] = React.useState<Tab>("student");
  const counts = usePendingApprovalCounts();

  const filterTabs = (
    <FilterTabs
      label="Approval queue"
      variant="tags"
      value={tab}
      onChange={setTab}
      options={TABS.map((item) => ({
        value: item.value,
        label: item.label,
        tone: "neutral" as const,
        count: counts[item.value],
      }))}
    />
  );

  return (
    <ShimmerGroup>
      <div className="flex flex-col gap-3">
        <StatDeck
          ariaLabel="Pending approval totals"
          loading={counts.isLoading}
          items={[
            ...TABS.map((item) => ({
              key: item.value,
              icon: item.icon,
              label: item.label,
              unit: "",
              value: counts[item.value],
              hint: item.hint,
              onClick: () => setTab(item.value),
              active: tab === item.value,
              indicator: "none" as const,
              ...(counts[item.value] > 0 ? { tone: "amber" as const } : {}),
            })),
            {
              key: "total",
              icon: Inbox,
              label: "Total",
              unit: "",
              value: counts.total,
              hint: "All pending sign-ups",
              indicator: "none" as const,
              ...(counts.total > 0 ? { tone: "amber" as const } : {}),
            },
          ]}
        />

        {tab === "student" ? (
          <PendingAccountsQueue key="student" kind="student" filterTabs={filterTabs} />
        ) : null}
        {tab === "parent" ? (
          <PendingAccountsQueue key="parent" kind="parent" filterTabs={filterTabs} />
        ) : null}
        {tab === "staff" ? <PendingStaffQueue key="staff" filterTabs={filterTabs} /> : null}
      </div>
    </ShimmerGroup>
  );
}
