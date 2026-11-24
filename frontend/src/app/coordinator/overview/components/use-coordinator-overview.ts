import { keepPreviousData, useQuery } from "@tanstack/react-query";
import * as React from "react";
import {
  fetchCoordinatorDashboard,
  fetchCoordinatorDevices,
  fetchCoordinatorReferrals,
} from "@/services/coordinator/overview.service";
import { stageLabel } from "@/services/coordinator/labels";
import { useNowTick } from "@/lib/clock";
import {
  countFor,
  SHORT_STAGE,
  STAGE_COLORS,
  type StageDonutEntry,
} from "./coordinator-overview-helpers";

export interface CoordinatorOverviewModel {
  now: number;
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
  isRefetching: boolean;
  referredToMe: number;
  certificationsIssued: number;
  awaitingPrincipal: number;
  activeEnrolled: number;
  stageDonut: StageDonutEntry[];
  needsReview: number | null;
  needsReviewReady: boolean;
  forwards: {
    rows: NonNullable<
      Awaited<ReturnType<typeof fetchCoordinatorReferrals>>["rows"]
    >;
    isPending: boolean;
    isError: boolean;
    isRefetching: boolean;
    refetch: () => void;
  };
  devices: {
    data: Awaited<ReturnType<typeof fetchCoordinatorDevices>> | undefined;
    isPending: boolean;
    isError: boolean;
    isRefetching: boolean;
    refetch: () => void;
    oldestOut: NonNullable<
      Awaited<ReturnType<typeof fetchCoordinatorDevices>>["rows"]
    >;
    devicesOut: number | null;
  };
}
export function useCoordinatorOverview(): CoordinatorOverviewModel {
  const now = useNowTick();

  const dashboardQuery = useQuery({
    queryKey: ["coordinator-dashboard"],
    queryFn: ({ signal }) => fetchCoordinatorDashboard(signal),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const devicesQuery = useQuery({
    queryKey: ["coordinator-devices", "preview", "issued", "oldest", 15],
    queryFn: ({ signal }) =>
      fetchCoordinatorDevices({ status: "issued", order: "oldest", limit: 15, signal }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const forwardsQuery = useQuery({
    queryKey: ["coordinator-referrals", "preview", 1, "", "consultation", 15],
    queryFn: ({ signal }) =>
      fetchCoordinatorReferrals(1, { stage: "consultation", limit: 15, signal }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const data = dashboardQuery.data;

  const isPending = dashboardQuery.isPending;
  const isError = dashboardQuery.isError || !data;

  const referredToMe = React.useMemo(() => {
    if (typeof data?.totalReferred === "number") return data.totalReferred;

    return countFor(
      data?.stageBreakdown,
      "consultation",
      "meeting_parents",
      "home_visitation",
      "certification",
      "principal_approval",
    );
  }, [data]);

  const certificationsIssued = React.useMemo(
    () =>
      countFor(
        data?.stageBreakdown,
        "certification",
        "principal_approval",
        "enrollment_monitoring",
        "completion",
      ),
    [data],
  );
  const awaitingPrincipal = data?.kpis?.pendingSignature ?? 0;
  const activeEnrolled = React.useMemo(
    () => countFor(data?.stageBreakdown, "enrollment_monitoring"),
    [data],
  );

  const stageDonut: StageDonutEntry[] = React.useMemo(
    () =>
      (Array.isArray(data?.stageBreakdown) ? data.stageBreakdown : []).map((s, i) => ({
        name: SHORT_STAGE[s.stage] ?? s.stage,
        full: stageLabel(s.stage),
        value: s.count,
        fill: STAGE_COLORS[i % STAGE_COLORS.length],
      })),
    [data],
  );

  const recentRows = React.useMemo(
    () => (Array.isArray(forwardsQuery.data?.rows) ? forwardsQuery.data.rows : []),
    [forwardsQuery.data],
  );
  const needsReview = React.useMemo(() => {
    const raw = forwardsQuery.data?.needsReview;
    return typeof raw === "number" ? raw : null;
  }, [forwardsQuery.data]);
  const needsReviewReady = forwardsQuery.data !== undefined;
  const devicesOut = React.useMemo(() => {
    if (typeof data?.deviceSummary?.issued === "number")
      return data.deviceSummary.issued;
    return devicesQuery.data?.issued ?? null;
  }, [data, devicesQuery.data]);

  const oldestOut = React.useMemo(() => {
    const raw = devicesQuery.data?.rows;
    const rows = Array.isArray(raw) ? raw : [];
    const issuedOnly = rows.filter((d) => d.status === "issued");
    if (issuedOnly.length !== rows.length) return issuedOnly.slice(0, 15);
    return rows.slice(0, 15);
  }, [devicesQuery.data]);

  return {
    now,
    isPending,
    isError,
    refetch: () => {
      void dashboardQuery.refetch();
    },
    isRefetching: dashboardQuery.isRefetching,
    referredToMe,
    certificationsIssued,
    awaitingPrincipal,
    activeEnrolled,
    stageDonut,
    needsReview,
    needsReviewReady,
    forwards: {
      rows: recentRows,
      isPending: forwardsQuery.isPending,
      isError: forwardsQuery.isError,
      isRefetching: forwardsQuery.isRefetching,
      refetch: () => {
        void forwardsQuery.refetch();
      },
    },
    devices: {
      data: devicesQuery.data,
      isPending: devicesQuery.isPending,
      isError: devicesQuery.isError,
      isRefetching: devicesQuery.isRefetching,
      refetch: () => {
        void devicesQuery.refetch();
      },
      oldestOut,
      devicesOut,
    },
  };
}
