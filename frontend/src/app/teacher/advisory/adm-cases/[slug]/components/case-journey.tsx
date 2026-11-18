"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, History } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdmMonitoringCase } from "@/services/teacher/admMonitoring.service";

const VISIBLE_COUNT = 5;

const ROLE_LABEL: Record<string, string> = {
  student: "Learner",
  parent: "Parent",
  subject_teacher: "Teacher",
  adviser: "Adviser",
  nurse: "School nurse",
  adm_coordinator: "ADM coordinator",
  guidance_counselor: "Guidance",
  record_keeper: "Record keeper",
  registrar: "Registrar",
  principal: "Principal",
  admin: "Administrator",
};

const formatStamp = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

/**
 * Plain-language history of the case. The API returns every referral, session
 * and parent-meeting update oldest-first; the desk reads newest-first and only
 * shows the latest few until the reader asks for the rest.
 */
export function CaseJourney({ timeline }: { timeline: AdmMonitoringCase["timeline"] }) {
  const [expanded, setExpanded] = React.useState(false);
  const ordered = React.useMemo(
    () => [...timeline].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)),
    [timeline]
  );

  if (ordered.length === 0) {
    return (
      <section
        className="flex min-w-0 flex-col gap-3 rounded-md border bg-card p-4"
        aria-label="Case history"
      >
        <header className="flex items-center gap-1.5">
          <History size={15} className="shrink-0 text-muted-foreground" aria-hidden />
          <h2 className="m-0 truncate text-sm font-bold tracking-[-0.01em] text-foreground">
            Case history
          </h2>
        </header>
        <p className="m-0 rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
          No activity recorded yet.
        </p>
      </section>
    );
  }

  const shown = expanded ? ordered : ordered.slice(0, VISIBLE_COUNT);
  const hiddenCount = ordered.length - shown.length;

  return (
    <section
      className="flex min-w-0 flex-col gap-3 rounded-md border bg-card p-4"
      aria-label="Case history"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <History size={15} className="shrink-0 text-muted-foreground" aria-hidden />
          <h2 className="m-0 truncate text-sm font-bold tracking-[-0.01em] text-foreground">
            Case history
          </h2>
        </div>
        <span className="shrink-0 text-[12px] font-medium tabular-nums text-muted-foreground">
          {ordered.length} {ordered.length === 1 ? "update" : "updates"}
        </span>
      </header>

      <ol className="m-0 flex list-none flex-col p-0">
        {shown.map((entry, index) => {
          const last = index === shown.length - 1 && hiddenCount === 0;
          const actor = entry.byRole ? ROLE_LABEL[entry.byRole] ?? entry.byRole : null;

          return (
            <li key={`${entry.at}-${entry.action}-${index}`} className="flex gap-2.5">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    index === 0 ? "bg-blue-500" : "bg-border"
                  )}
                  aria-hidden
                />
                {!last ? <span className="w-px flex-1 bg-border" aria-hidden /> : null}
              </div>

              <div className={cn("flex min-w-0 flex-col gap-0.5", !last && "pb-3")}>
                <p className="m-0 text-[12px] font-medium leading-snug text-foreground">
                  {entry.label}
                </p>
                {entry.detail ? (
                  <p className="m-0 text-[12px] leading-snug text-muted-foreground">
                    {entry.detail}
                  </p>
                ) : null}
                <p className="m-0 text-[12px] text-muted-foreground/80">
                  {formatStamp(entry.at)}
                  {actor ? ` · ${actor}` : ""}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {ordered.length > VISIBLE_COUNT ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="inline-flex items-center justify-center gap-1 rounded-md border bg-background px-2.5 py-1 text-[12px] font-semibold text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
        >
          {expanded ? (
            <>
              Show fewer <ChevronUp size={12} aria-hidden />
            </>
          ) : (
            <>
              Show all {ordered.length} updates <ChevronDown size={12} aria-hidden />
            </>
          )}
        </button>
      ) : null}
    </section>
  );
}
