"use client";

import * as React from "react";
import { CalendarCheck2, FileText, Laptop, LifeBuoy } from "lucide-react";
import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";
import { formStatusLabel, formStatusTone } from "@/lib/labels/status-tone";
import type { AdmMonitoringCase } from "@/services/teacher/admMonitoring.service";

const dayLabel = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const stampLabel = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

type TabKey = "devices" | "meetings" | "documents";

/** Support the learner received during monitoring — devices, meetings, forms. */
export function CaseSupport({ data }: { data: AdmMonitoringCase }) {
  const { devices, meetings, forms } = data;
  const [tab, setTab] = React.useState<TabKey>("devices");

  const tabs = [
    { key: "devices" as const, label: "Devices", count: devices.length, icon: Laptop },
    { key: "meetings" as const, label: "Meetings", count: meetings.length, icon: CalendarCheck2 },
    { key: "documents" as const, label: "Documents", count: forms.length, icon: FileText },
  ];

  return (
    <section
      className="flex min-w-0 flex-col gap-3 rounded-md border bg-card p-4"
      aria-label="Learner support"
    >
      <header className="flex items-center gap-1.5">
        <LifeBuoy size={15} className="shrink-0 text-muted-foreground" aria-hidden />
        <h2 className="m-0 truncate text-sm font-bold tracking-[-0.01em] text-foreground">
          Support &amp; documents
        </h2>
      </header>

      <div role="tablist" aria-label="Support records" className="flex items-center gap-1">
        {tabs.map(({ key, label, count, icon: Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(key)}
              className={cn(
                "inline-flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold transition-colors duration-150",
                active
                  ? "bg-blue-500/10 text-blue-700 dark:text-blue-400"
                  : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground"
              )}
            >
              <Icon size={12} aria-hidden />
              <span className="truncate">{label}</span>
              <span className="tabular-nums opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {tab === "devices" ? (
        devices.length === 0 ? (
          <p className="m-0 rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
            No device issued yet.
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {devices.map((d) => (
              <li key={d.id} className="flex flex-col gap-1 rounded-md border bg-background p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="m-0 truncate text-xs font-semibold text-foreground">
                    {d.deviceType}
                  </p>
                  <Pill tone={d.returnedDate ? "neutral" : "green"} label="Device status">
                    {d.returnedDate ? "Returned" : "Issued"}
                  </Pill>
                </div>
                <p className="m-0 text-[12px] text-muted-foreground">
                  Serial {d.deviceSerial} · issued {dayLabel(d.issuedDate)}
                  {d.returnedDate ? ` · returned ${dayLabel(d.returnedDate)}` : ""}
                </p>
                {d.conditionNotes ? (
                  <p className="m-0 text-[12px] text-muted-foreground">{d.conditionNotes}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === "meetings" ? (
        meetings.length === 0 ? (
          <p className="m-0 rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
            No parent meeting recorded yet.
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {meetings.map((m) => (
              <li key={m.id} className="flex flex-col gap-1 rounded-md border bg-background p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="m-0 text-xs font-semibold text-foreground">
                    {stampLabel(m.meetingDatetime)}
                  </p>
                  <Pill tone={m.attended ? "green" : "amber"} label="Attendance">
                    {m.attended ? "Attended" : "Missed"}
                  </Pill>
                </div>
                <p className="m-0 truncate text-[12px] text-muted-foreground" title={m.venue}>
                  {m.venue}
                </p>
                {m.minutesOfMeeting ? (
                  <p className="m-0 line-clamp-2 text-[12px] text-muted-foreground">
                    {m.minutesOfMeeting}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === "documents" ? (
        forms.length === 0 ? (
          <p className="m-0 rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
            No linked forms yet.
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {forms.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between gap-2 rounded-md border bg-background p-2.5"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="m-0 truncate text-xs font-semibold text-foreground" title={f.title}>
                    {f.title}
                  </p>
                  <p className="m-0 text-[12px] text-muted-foreground">
                    {dayLabel(f.uploadedAt)}
                  </p>
                </div>
                <Pill tone={formStatusTone(f.status)} label="Form status">
                  {formStatusLabel(f.status)}
                </Pill>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  );
}
