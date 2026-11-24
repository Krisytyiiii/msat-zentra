"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { useDock } from "@/components/dock/dock-store";
import { apiErrorMessage } from "@/lib/api/errors";
import { sileo } from "@/components/ui/sonner";
import { useLiveQuery } from "@/lib/api/live";
import {
  admMonitoringKey,
  fetchAdmMonitoringCase,
  updateAdmModule,
  type AdmModulePayload,
  type AdmMonitoredModule,
} from "@/services/teacher/admMonitoring.service";
import { MonitoringHeader } from "../[slug]/components/monitoring-header";
import { MonitoringProgress } from "../[slug]/components/monitoring-progress";
import { ModulesPanel } from "../[slug]/components/modules-panel";
import { ModuleFormDialog } from "../[slug]/components/module-form-dialog";
import { MonitoringReport } from "../[slug]/components/monitoring-report";
import { CaseJourney } from "../[slug]/components/case-journey";
import { CaseSupport } from "../[slug]/components/case-support";
import { CaseNextStep } from "../[slug]/components/case-next-step";
import { MonitoringSkeleton } from "../[slug]/components/MonitoringSkeleton";

/**
 * The full ADM monitoring workspace for one case.
 *
 * Extracted from the `/adm-cases/[slug]` route so the split ADM desk can render
 * the exact same content in its right panel — the adviser never leaves the list
 * to open a case. `compact` drops the back link and stacks the module tracker
 * above the context cards, because the pane is only half the viewport wide.
 */
export function AdmCaseWorkspace({
  caseRef,
  compact = false,
}: {
  /** Profile UUID or the learner-name slug. */
  caseRef: string;
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const dock = useDock();

  const [dialog, setDialog] = React.useState<AdmMonitoredModule | null>(null);
  // Modules / Documents / Report view switcher (one visible at a time).
  const [tab, setTab] = React.useState<"overview" | "modules" | "documents" | "report">(
    "overview",
  );
  // Shared dock task started when the dialog closes; finished by the mutation.
  const dockTaskRef = React.useRef<string | null>(null);

  const monitoringQuery = useLiveQuery({
    queryKey: admMonitoringKey(caseRef),
    queryFn: ({ signal }) => fetchAdmMonitoringCase(caseRef, signal),
    enabled: Boolean(caseRef),
    retry: false,
    staleTime: 30 * 1000,
    // No placeholder from the previously opened case: switching cases shows
    // the shimmer skeleton until this case's own data lands.
  });

  const invalidate = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: admMonitoringKey(caseRef) });
    void queryClient.invalidateQueries({ queryKey: ["adm-my-cases"] });
  }, [caseRef, queryClient]);

  const saveModule = useMutation({
    mutationFn: (vars: { payload: AdmModulePayload; moduleId: string }) =>
      updateAdmModule(caseRef, vars.moduleId, vars.payload),
    onSuccess: (_saved, vars) => {
      const taskId = dockTaskRef.current;
      dockTaskRef.current = null;
      if (taskId) {
        dock.completeTask(taskId, `${vars.payload.moduleName ?? "Module"} updated`);
      }
      invalidate();
      sileo.success({
        title: "Module updated",
        description: "Module tracking and the monitoring report now reflect this change.",
      });
    },
    onError: (err) => {
      const message = apiErrorMessage(err, "Could not save this module.");
      const taskId = dockTaskRef.current;
      dockTaskRef.current = null;
      if (taskId) dock.failTask(taskId, message);
      sileo.error({ title: "Could not save this module", description: message });
    },
  });

  const data = monitoringQuery.data;
  const error = monitoringQuery.error;

  if (!caseRef) {
    return (
      <div className="flex w-full flex-col gap-4">
        <p className="text-sm text-muted-foreground">ADM case not found.</p>
      </div>
    );
  }

  // Any fetch with no data for this case (first open or a case switch) shows
  // the shimmer skeleton; background refreshes keep the current content.
  if (!error && !data) return <MonitoringSkeleton />;

  if (error || !data) {
    return (
      <div className="flex w-full flex-col gap-4">
        <div className="flex flex-col items-center gap-2 rounded-lg border bg-card px-4 py-10 text-center">
          <ShieldOff size={28} className="text-muted-foreground" aria-hidden />
          <p role="alert" className="m-0 font-semibold text-foreground">
            {apiErrorMessage(error, "Could not load this ADM case.")}
          </p>
          <p className="m-0 max-w-sm text-xs text-muted-foreground">
            Monitoring is limited to ADM cases of your own advisees.
          </p>
          <Button asChild variant="outline" className="h-7 px-2.5 text-xs">
            <Link href="/teacher/advisory/adm-cases">Back to ADM cases</Link>
          </Button>
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
          { value: "modules" as const, label: "Modules", count: modules.length, tone: "amber" },
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
          <MonitoringHeader header={header} compact={compact} />
          <CaseNextStep data={data} />
          <MonitoringProgress data={data} compact={compact} />
        </div>
      ) : null}

      {tab === "modules" ? (
        <ModulesPanel modules={modules} onEdit={(module) => setDialog(module)} />
      ) : null}

      {tab === "documents" ? <CaseSupport data={data} /> : null}

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

      {dialog ? (
        <ModuleFormDialog
          key={dialog.id}
          module={dialog}
          pending={saveModule.isPending}
          onClose={() => setDialog(null)}
          onSubmit={(payload) => {
            const moduleId = dialog.id;
            const label = payload.moduleName ?? "Module";
            // Close at once and finish in the shared dock, so the desk never
            // waits on the request with a blocking overlay.
            dockTaskRef.current = dock.startTask({
              kind: "generic",
              title: "Updating module",
              description: label,
            });
            setDialog(null);
            saveModule.mutate({ payload, moduleId });
          }}
        />
      ) : null}

      {saveModule.isPending ? (
        <span className="sr-only" role="status">
          <Loader2 size={12} className="animate-spin" aria-hidden /> Saving module…
        </span>
      ) : null}
    </div>
  );
}
