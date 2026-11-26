"use client";

import { useParams } from "next/navigation";
import { Suspense } from "react";

import {
  ScheduleTemplateSkeleton,
  ScheduleWorkspace,
  type TemplateView,
} from "../template/[[...section]]/page";

/**
 * Dedicated workspace panels — clean URLs for the sidebar tabs instead of
 * `/schedule/template?view=…`. Each route renders the same schedule workspace
 * pinned to one panel, so the dock can light the right tab from the pathname
 * and switching tabs is a normal route change (no query-string churn).
 */
const ROUTE_VIEWS: Record<string, TemplateView> = {
  timetable: "grid",
  sections: "sections",
  subjects: "subjects",
  teachers: "teachers",
  configure: "config",
  "school-year": "term",
  publish: "publish",
};

export default function AdminSchedulePanelPage() {
  const params = useParams<{ view?: string | string[] }>();
  const segment = Array.isArray(params.view) ? params.view[0] : params.view;
  const view = segment ? ROUTE_VIEWS[segment] : undefined;

  if (!view) {
    return (
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-2 py-10">
        <h1 className="text-sm font-semibold">Unknown schedule panel</h1>
        <p className="text-sm text-muted-foreground">
          Pick a panel from the Academics menu to open the timetable workspace.
        </p>
      </section>
    );
  }

  return (
    <Suspense fallback={<ScheduleTemplateSkeleton view={view} />}>
      <ScheduleWorkspace key={view} initialView={view} />
    </Suspense>
  );
}
