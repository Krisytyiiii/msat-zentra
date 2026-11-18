"use client";

import * as React from "react";
import {
  CalendarDays,
  FileText,
  History,
  Laptop,
  MessagesSquare,
} from "lucide-react";
import { Pill, type PillTone } from "@/components/ui/pill";
import { cn } from "@/lib/utils";
import type { AdmMonitoringCase } from "@/services/teacher/admMonitoring.service";

const FORM_LABELS: Record<string, string> = {
  REFERRAL_FORM: "Referral form",
  ANECDOTAL_REPORT: "Anecdotal report",
  MINUTES_OF_MEETING: "Minutes of meeting",
  HV_FORM: "Home visitation form",
  CERTIFICATION: "ADM certification",
  PRINCIPAL_SIGNAGE: "Principal signage",
};

const FORM_TONES: Record<string, PillTone> = {
  verified: "green",
  submitted: "amber",
  pending: "neutral",
};

const ROLE_LABELS: Record<string, string> = {
  adm_coordinator: "ADM coordinator",
  guidance_counselor: "Guidance",
  nurse: "Nurse",
  principal: "Principal",
  adviser: "Adviser",
  subject_teacher: "Teacher",
};

function external(url: string | null | undefined) {
  if (!url) return false;
  return /^https?:\/\//i.test(url) || url.startsWith("data:");
}

function dateLabel(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function dateTimeLabel(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Card({
  icon: Icon,
  title,
  hint,
  count,
  children,
}: {
  icon: typeof FileText;
  title: string;
  hint: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section
      className="flex min-w-0 flex-col gap-3 rounded-md border bg-card p-4"
      aria-label={title}
    >
      <header className="flex min-w-0 items-center gap-1.5">
        <Icon size={15} className="shrink-0 text-muted-foreground" aria-hidden />
        <h2 className="m-0 min-w-0 flex-1 truncate text-sm font-bold tracking-[-0.01em] text-foreground">
          {title}
        </h2>
        {typeof count === "number" ? (
          <Pill tone="neutral" label="Count" className="tabular-nums">
            {count}
          </Pill>
        ) : null}
      </header>
      <p className="m-0 text-[12px] text-muted-foreground">{hint}</p>
      {children}
    </section>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <p className="m-0 rounded-md border border-dashed px-3 py-4 text-center text-[12px] text-muted-foreground">
      {children}
    </p>
  );
}

/**
 * Read-only case file for the coordinator desk: the paperwork, the devices out
 * on loan, the parent meetings on record and the case history, all from the
 * same payload the adviser's monitoring desk uses.
 */
export function CaseFile({ data }: { data: AdmMonitoringCase }) {
  const { forms, devices, meetings, timeline } = data;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-3">
        <Card
          icon={FileText}
          title="Documents"
          hint="Forms attached to this case by the adviser and the coordinator."
          count={forms.length}
        >
          {forms.length === 0 ? (
            <EmptyRow>No forms uploaded yet.</EmptyRow>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {forms.map((form) => (
                <li
                  key={form.id}
                  className="flex min-w-0 items-start justify-between gap-2 rounded-md border bg-background px-2.5 py-2"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="min-w-0 truncate text-xs font-semibold text-foreground">
                      {FORM_LABELS[form.formType] ?? form.title}
                    </span>
                    <span className="text-[12px] text-muted-foreground">
                      {form.uploadedAt
                        ? `Uploaded ${dateLabel(form.uploadedAt)}`
                        : "Not uploaded"}
                    </span>
                  </div>
                  <Pill
                    tone={FORM_TONES[form.status] ?? "neutral"}
                    label="Status"
                    className="capitalize"
                  >
                    {form.status}
                  </Pill>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          icon={Laptop}
          title="Devices on loan"
          hint="Equipment issued to this learner for home study."
          count={devices.length}
        >
          {devices.length === 0 ? (
            <EmptyRow>No devices issued yet.</EmptyRow>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {devices.map((device) => (
                <li
                  key={device.id}
                  className="flex min-w-0 flex-col gap-1 rounded-md border bg-background px-2.5 py-2"
                >
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <span className="min-w-0 text-xs font-semibold text-foreground">
                      {device.deviceType}
                    </span>
                    <Pill tone={device.returnedDate ? "neutral" : "green"} label="Loan state">
                      {device.returnedDate ? "Returned" : "On loan"}
                    </Pill>
                  </div>
                  <span className="font-mono text-[12px] text-muted-foreground">
                    {device.deviceSerial}
                  </span>
                  <span className="text-[12px] text-muted-foreground">
                    Issued {dateLabel(device.issuedDate)}
                    {device.returnedDate
                      ? ` · returned ${dateLabel(device.returnedDate)}`
                      : ""}
                  </span>
                  {device.conditionNotes ? (
                    <span className="line-clamp-2 text-[12px] text-muted-foreground">
                      {device.conditionNotes}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          icon={MessagesSquare}
          title="Parent meetings"
          hint="Conferences logged by the coordinator on this case."
          count={meetings.length}
        >
          {meetings.length === 0 ? (
            <EmptyRow>No parent meetings logged yet.</EmptyRow>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {meetings.map((meeting) => (
                <li
                  key={meeting.id}
                  className="flex min-w-0 flex-col gap-1 rounded-md border bg-background px-2.5 py-2"
                >
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <span className="min-w-0 text-xs font-semibold text-foreground">
                      {dateTimeLabel(meeting.meetingDatetime)}
                    </span>
                    <Pill
                      tone={meeting.attended ? "green" : "amber"}
                      label="Attendance"
                    >
                      {meeting.attended ? "Attended" : "Not attended"}
                    </Pill>
                  </div>
                  <span className="text-[12px] capitalize text-muted-foreground">
                    {meeting.venue}
                  </span>
                  {meeting.minutesOfMeeting ? (
                    <span className="line-clamp-3 text-[12px] text-muted-foreground">
                      {meeting.minutesOfMeeting}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <section
        className="flex min-w-0 flex-col gap-3 rounded-md border bg-card p-4"
        aria-label="Case history"
      >
        <header className="flex min-w-0 items-center gap-1.5">
          <History size={15} className="shrink-0 text-muted-foreground" aria-hidden />
          <h2 className="m-0 min-w-0 flex-1 truncate text-sm font-bold tracking-[-0.01em] text-foreground">
            Case history
          </h2>
          {timeline.length > 0 ? (
            <Pill tone="neutral" label="Events" className="tabular-nums">
              {timeline.length}
            </Pill>
          ) : null}
        </header>
        <p className="m-0 text-[12px] text-muted-foreground">
          Every step recorded from the anecdotal report through monitoring —
          newest last.
        </p>

        {timeline.length === 0 ? (
          <EmptyRow>No history recorded for this case yet.</EmptyRow>
        ) : (
          <ol className="m-0 flex list-none flex-col gap-0 p-0">
            {timeline.map((entry, index) => {
              const url = external(entry.detail) ? entry.detail : null;
              return (
                <li key={`${entry.at}-${index}`} className="flex min-w-0 gap-3">
                  <div className="flex shrink-0 flex-col items-center">
                    <span
                      className="mt-1.5 size-2 shrink-0 rounded-full bg-primary/70"
                      aria-hidden
                    />
                    {index < timeline.length - 1 ? (
                      <span className="w-px flex-1 bg-border" aria-hidden />
                    ) : null}
                  </div>
                  <div
                    className={cn(
                      "flex min-w-0 flex-col gap-0.5 pb-3",
                      index === timeline.length - 1 && "pb-0",
                    )}
                  >
                    <span className="text-xs font-medium text-foreground">
                      {entry.label}
                    </span>
                    {entry.detail && !url ? (
                      <span className="break-words text-[12px] text-muted-foreground">
                        {entry.detail}
                      </span>
                    ) : null}
                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-fit break-all text-[12px] font-medium text-primary hover:underline"
                      >
                        Open attachment
                      </a>
                    ) : null}
                    <span className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
                      <CalendarDays size={11} aria-hidden />
                      {dateTimeLabel(entry.at)}
                      {entry.byRole ? (
                        <>
                          <span aria-hidden>·</span>
                          {ROLE_LABELS[entry.byRole] ?? entry.byRole}
                        </>
                      ) : null}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
