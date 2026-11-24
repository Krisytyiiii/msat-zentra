"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { apiErrorMessage } from "@/lib/api/errors";
import {
  coordinatorAdmMonitoringKey,
  fetchCoordinatorMonitoringCase,
} from "@/services/teacher/admMonitoring.service";
import { MonitoringHeader } from "@/app/teacher/advisory/adm-cases/[slug]/components/monitoring-header";
import { MonitoringProgress } from "@/app/teacher/advisory/adm-cases/[slug]/components/monitoring-progress";
import { ModulesPanel } from "@/app/teacher/advisory/adm-cases/[slug]/components/modules-panel";
import { MonitoringReport } from "@/app/teacher/advisory/adm-cases/[slug]/components/monitoring-report";
import { MonitoringSkeleton } from "@/app/teacher/advisory/adm-cases/[slug]/components/MonitoringSkeleton";
import { CaseJourney } from "@/app/teacher/advisory/adm-cases/[slug]/components/case-journey";
import { CaseSupport } from "@/app/teacher/advisory/adm-cases/[slug]/components/case-support";
import { CaseNextStep } from "@/app/teacher/advisory/adm-cases/[slug]/components/case-next-step";
import { CaseFile } from "../[slug]/components/case-file";

/**
 * Read-only monitoring workspace for one enrolled learner, rendered inside the
 * enrolled desk's right pane (and reused by the legacy `[slug]` detail route).
 * Same view switcher as the adviser ADM desk — Overview / Modules / Documents /
 * Report — reusing the adviser's monitoring components; modules are released
 * and marked by the adviser, so the coordinator only oversees progress.
 */
export function CoordinatorEnrolledWorkspace({
  caseRef,
  /** Drops the back link and stacks the panes for the half-width desk pane. */
  compact = true,
  backHref = "/coordinator/enrolled",
}: {
  caseRef: string;
  compact?: boolean;
  backHref?: string;
}) {
  const [tab, setTab] = React.useState<
    "overview" | "modules" | "documents" | "report"
  >("overview");

  const monitoringQuery = useQuery({
    queryKey: coordinatorAdmMonitoringKey(caseRef),
    queryFn: ({ signal }) => fetchCoordinatorMonitoringCase(caseRef, signal),
    enabled: Boolean(caseRef),
    retry: false,
    staleTime: 30 * 1000,
  });

  if (!caseRef) {
    return (
      <div className="flex w-full flex-col gap-4">
        <p className="text-sm text-muted-foreground">ADM case not found.</p>
      </div>
    );
  }

  if (monitoringQuery.isPending) return <MonitoringSkeleton />;

  const data = monitoringQuery.data;
  const error = monitoringQuery.error;

  if (error || !data) {
    return (
      <div className="flex w-full flex-col gap-4">
        <div className="flex flex-col items-center gap-2 rounded-lg border bg-card px-4 py-10 text-center">
          <ShieldOff size={28} className="text-muted-foreground" aria-hidden />
          <p role="alert" className="m-0 font-semibold text-foreground">
            {apiErrorMessage(error, "Could not load this ADM case.")}
          </p>
          <p className="m-0 max-w-sm text-xs text-muted-foreground">
            The case may have been removed, or you may not have access to it.
          </p>
          {compact ? null : (
            <Button asChild variant="outline" className="h-7 px-2.5 text-xs">
              <Link href={backHref}>Back to enrolled students</Link>
            </Button>
          )}
        </div>
      </div>
    );
  }

  const { header, modules } = data;

  return (
    <div className="flex w-full flex-col gap-4">
      {/* One view at a time: the case overview, the module tracker, the
          learner's documents/support records, or the printable report. */}
      <FilterTabs
        label="ADM case views"
        variant="tags"
        value={tab}
        onChange={setTab}
        options={[
          { value: "overview" as const, label: "Overview", tone: "neutral" },
          {
            value: "modules" as const,
            label: "Modules",
            count: modules.length,
            tone: "amber",
          },
          {
            value: "documents" as const,
            label: "Documents",
            count: data.forms.length,
            tone: "blue",
          },
          { value: "report" as const, label: "Report", tone: "green" },
        ]}
      />

      {tab === "overview" ? (
        <div className="flex w-full flex-col gap-4">
          <MonitoringHeader header={header} compact={compact} backHref={backHref} />
          <CaseNextStep data={data} reader="coordinator" />
          <MonitoringProgress data={data} compact={compact} />
        </div>
      ) : null}

      {tab === "modules" ? <ModulesPanel modules={modules} /> : null}

      {tab === "documents" ? (
        <div
          className={
            compact
              ? "flex min-w-0 flex-col gap-4"
              : "grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
          }
        >
          <CaseSupport data={data} />
          <CaseFile data={data} />
        </div>
      ) : null}

      {tab === "report" ? (
        <div
          className={
            compact
              ? "flex min-w-0 flex-col gap-4"
              : "grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]"
          }
        >
          <MonitoringReport data={data} />
          <CaseJourney timeline={data.timeline} />
        </div>
      ) : null}
    </div>
  );
}
