"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FileText, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { SidePanel } from "@/components/ui/side-panel";
import { formStatusLabel, formStatusTone } from "@/lib/labels/status-tone";
import { OcForm01PreviewDialog } from "@/components/ocform01/OcForm01PreviewDialog";
import { fetchOcForm01Detail } from "@/components/ocform01/ocform01";
import { GcForm03PreviewDialog } from "@/app/guidance/adm/components/GcForm03PreviewDialog";
import { buildGcForm03Data } from "@/services/guidance/gcform03.service";
import type { GcForm03Source } from "@/services/guidance/gcform03.types";
import type { AdmMonitoringCase } from "@/services/teacher/admMonitoring.service";

type DocForm = AdmMonitoringCase["forms"][number];

const dayLabel = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const fileHref = (fileUrl: string): string => {
  if (/^(https?:|data:|blob:)/i.test(fileUrl)) return fileUrl;
  const base = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");
  return `${base}/${fileUrl.replace(/^\//, "")}`;
};

const isImageFile = (url: string) =>
  /^data:image\//i.test(url) || /\.(png|jpe?g|gif|webp|svg)(\?|#|$)/i.test(url);
const isPdfFile = (url: string) => /\.pdf(\?|#|$)/i.test(url);

const FORM_TYPE_LABELS: Record<string, string> = {
  REFERRAL_FORM: "GCForm-03 · Referral form",
  ANECDOTAL_REPORT: "GCForm-01 · Anecdotal report",
  CERTIFICATION: "ADM certification",
  MINUTES_OF_MEETING: "Minutes of meeting",
  HV_FORM: "Home visitation form",
  PRINCIPAL_SIGNAGE: "Principal signage",
};

/**
 * One document opened as an overlay — never a raw navigation. The official
 * GCForm-01 and GCForm-03 sheets render through the same preview dialogs the
 * guidance desk uses; every other record shows its case details plus the
 * attached file inline.
 */
export function CaseDocumentOverlay({
  data,
  form,
  onClose,
}: {
  data: AdmMonitoringCase;
  form: DocForm | null;
  onClose: () => void;
}) {
  if (!form) return null;

  if (form.formType === "ANECDOTAL_REPORT" && data.header.anecdotalRecordId) {
    return (
      <OcForm01PreviewDialog
        recordId={data.header.anecdotalRecordId}
        onClose={onClose}
      />
    );
  }

  if (form.formType === "REFERRAL_FORM" && data.header.anecdotalRecordId) {
    return <GcForm03CaseOverlay data={data} onClose={onClose} />;
  }

  return <DocumentFileOverlay form={form} onClose={onClose} />;
}

/** GCForm-03 sheet built from the same anecdotal record the referral came from. */
function GcForm03CaseOverlay({
  data,
  onClose,
}: {
  data: AdmMonitoringCase;
  onClose: () => void;
}) {
  const anecdotalId = data.header.anecdotalRecordId;
  const reportQuery = useQuery({
    queryKey: ["ocform01-detail", anecdotalId],
    queryFn: () => fetchOcForm01Detail(anecdotalId ?? ""),
    enabled: Boolean(anecdotalId),
    staleTime: 30_000,
    retry: false,
  });

  const gcData = React.useMemo(() => {
    const report = reportQuery.data ?? null;
    const row: GcForm03Source = {
      student: data.header.studentName,
      grade: data.header.gradeLevel.replace(/^G/, "Grade "),
      section: data.header.section,
      category: report?.category,
      anecdotalExcerpt: report?.descriptionOfIncident,
      reason: data.header.referralReason ?? "",
      recommendations: report?.notesRecommendationsActions ?? "",
      referredBy: data.header.referredByName ?? report?.adviserName ?? "",
      date: report?.observationDate ?? "",
    };
    return buildGcForm03Data(
      row,
      report,
      data.header.referralNotes ?? "",
      report?.adviserName ?? ""
    );
  }, [reportQuery.data, data.header]);

  return (
    <GcForm03PreviewDialog
      open
      data={gcData}
      confirming={false}
      onClose={onClose}
      onConfirm={() => {}}
      viewOnly
    />
  );
}

function DocumentFileOverlay({
  form,
  onClose,
}: {
  form: DocForm;
  onClose: () => void;
}) {
  const typeLabel = FORM_TYPE_LABELS[form.formType] ?? form.title;
  return (
    <SidePanel
      open
      onClose={onClose}
      label={form.title}
      width="3xl"
      showCloseButton
    >
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex shrink-0 items-center gap-2.5 border-b border-border px-4 py-3 pr-12">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/50 text-primary">
            <FileText size={15} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 truncate text-sm font-semibold leading-tight text-foreground">
              {form.title}
            </h2>
            <p className="m-0 truncate text-[12px] text-muted-foreground">{typeLabel}</p>
          </div>
          <Pill tone={formStatusTone(form.status)} label="Form status">
            {formStatusLabel(form.status)}
          </Pill>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="flex min-w-0 flex-col gap-4">
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="m-0 text-[12px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                  Document
                </dt>
                <dd className="m-0 text-sm font-medium text-foreground">{typeLabel}</dd>
              </div>
              <div>
                <dt className="m-0 text-[12px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                  Uploaded
                </dt>
                <dd className="m-0 text-sm text-foreground">{dayLabel(form.uploadedAt)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="m-0 text-[12px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                  Notes
                </dt>
                <dd className="m-0 text-sm text-muted-foreground">
                  {form.notes?.trim() || "No notes on file."}
                </dd>
              </div>
            </dl>

            {form.fileUrl ? (
              isImageFile(form.fileUrl) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={fileHref(form.fileUrl)}
                  alt={`${form.title} attachment`}
                  className="mx-auto max-h-[60vh] w-auto max-w-full rounded-md border object-contain"
                />
              ) : isPdfFile(form.fileUrl) ? (
                <iframe
                  src={fileHref(form.fileUrl)}
                  title={`${form.title} attachment`}
                  className="h-[60vh] w-full rounded-md border"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-8 text-center">
                  <Paperclip size={16} className="text-muted-foreground" aria-hidden />
                  <p className="m-0 text-sm text-muted-foreground">
                    This record's attachment can only be opened in a new tab.
                  </p>
                  <Button asChild variant="outline" size="sm" className="gap-1">
                    <a href={fileHref(form.fileUrl)} target="_blank" rel="noreferrer">
                      <ExternalLink size={13} aria-hidden />
                      Open attachment
                    </a>
                  </Button>
                </div>
              )
            ) : (
              <p className="m-0 rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                No file attached to this record.
              </p>
            )}
          </div>
        </div>
      </div>
    </SidePanel>
  );
}
