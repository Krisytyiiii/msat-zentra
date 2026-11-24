"use client";

import * as React from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTerm } from "@/lib/term/TermContext";
import { liveQueryOptions } from "@/lib/api/live";
import { fetchNurseReports } from "@/services/nurse/reports.service";
import { buildNurseAlerts } from "@/services/nurse/alerts.service";
import { toQueueRow } from "@/services/nurse/labels";
import {
  buildNurseAdmInsights,
  buildNurseAdmReferrals,
  type NurseAdmInsightsData,
  type NurseAdmReferralsData,
} from "@/services/nurse/adm.reports";
import {
  buildCategoryTrend,
  buildRiskDashboard,
  type CategoryTrend,
  type RiskDashboard,
} from "@/components/risk-dashboard/risk-dashboard-data";
import { buildRiskWatch, type RiskWatchData } from "./nurse-adm-risk-watch";

/**
 * Single data source for /nurse/reports. The backend returns the whole term's
 * nurse-desk cases plus their risk levels/factors in one payload, so this page
 * makes exactly one request (the old page fetched a page of the referral
 * queue, notifications, the same queue again for the risk boards and two
 * identical risk-batch calls).
 */
export function useNurseReportsQuery() {
  const { activeTerm, termReady } = useTerm();
  const termKey = `${activeTerm?.schoolYearId ?? ""}:${activeTerm?.termId ?? ""}`;

  return useQuery({
    ...liveQueryOptions,
    queryKey: ["nurse-reports", termKey],
    queryFn: ({ signal }) => fetchNurseReports(signal),
    placeholderData: keepPreviousData,
    enabled: termReady,
  });
}

export interface NurseReportData {
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: () => void;
  data: NurseAdmReferralsData | null;
  insights: NurseAdmInsightsData | null;
}

/** Reports + insights built from the shared payload. */
export function useNurseReportData(): NurseReportData {
  const query = useNurseReportsQuery();
  const riskLevels = query.data?.riskLevels;

  const data = React.useMemo(() => {
    if (!query.data) return null;
    const cases = buildNurseAlerts(query.data.referrals, []).cases;
    return buildNurseAdmReferrals(cases);
  }, [query.data]);

  const insights = React.useMemo(
    () => (data ? buildNurseAdmInsights(data.desk, riskLevels ?? {}) : null),
    [data, riskLevels],
  );

  return {
    isPending: query.isPending,
    isError: query.isError,
    isFetching: query.isFetching,
    refetch: query.refetch,
    data,
    insights,
  };
}

export interface NurseAdmRiskData {
  isPending: boolean;
  dashboard: RiskDashboard | null;
  trend: CategoryTrend | null;
  watch: RiskWatchData | null;
}

/** Risk boards for the reports page — same shared payload, no extra request. */
export function useNurseAdmRiskData(): NurseAdmRiskData {
  const query = useNurseReportsQuery();

  const rows = React.useMemo(
    () => (query.data?.referrals ?? []).map(toQueueRow),
    [query.data],
  );

  const referralToStudent = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of query.data?.referrals ?? []) {
      const sid = r.student?.userId ?? r.roster?.id ?? null;
      if (sid) map[r.id] = sid;
    }
    return map;
  }, [query.data]);

  const dashboard = React.useMemo(
    () =>
      query.data
        ? buildRiskDashboard(rows, query.data.riskLevels, referralToStudent)
        : null,
    [query.data, rows, referralToStudent],
  );

  const trend = React.useMemo(
    () =>
      query.data
        ? buildCategoryTrend(
            rows.map((r) => ({
              category: r.category,
              referredAt: r.referredAt,
            })),
          )
        : null,
    [query.data, rows],
  );

  const watch = React.useMemo(
    () =>
      query.data
        ? buildRiskWatch(
            rows,
            referralToStudent,
            query.data.riskLevels,
            query.data.riskFactors,
          )
        : null,
    [query.data, rows, referralToStudent],
  );

  return { isPending: query.isPending, dashboard, trend, watch };
}
