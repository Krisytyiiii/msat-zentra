"use client";

import * as React from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AdmMonitoringCase } from "@/services/teacher/admMonitoring.service";

const dateLabel = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

export function MonitoringReport({ data }: { data: AdmMonitoringCase }) {
  const { header, progress, modules, devices, meetings } = data;
  const [downloading, setDownloading] = React.useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const M = 14;
      const tableW = pageW - M * 2;
      const HEAD_H = 8;
      const ROW_H = 7;
      const COLS = [
        { label: "Module", w: 72 },
        { label: "Released", w: 24 },
        { label: "Due", w: 24 },
        { label: "Status", w: 22 },
        { label: "Submitted", w: 28 },
      ];

      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.setTextColor(17, 24, 39);
      doc.text("ADM Monitoring Report", M, 20);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(90, 90, 90);
      doc.text("Mati School of Arts and Trades · Flexible Learning (ADM)", M, 26);
      doc.text(`Generated ${new Date().toLocaleString()}`, pageW - M, 26, { align: "right" });

      doc.setFontSize(10);
      doc.setTextColor(17, 24, 39);
      doc.text(header.studentName, M, 36);
      doc.setFontSize(9);
      doc.setTextColor(70, 70, 70);
      doc.text(
        `LRN ${header.lrn}  ·  ${header.gradeLevel.replace("G", "Grade ")} · ${header.section}`,
        M,
        41,
      );
      doc.text(
        `${header.stageLabel} · Eligibility: ${header.eligibilityStatus} · Monitoring since ${dateLabel(header.monitoringSince)}`,
        M,
        46,
      );
      doc.text(
        `Modules submitted: ${progress.submitted}/${progress.total} (${progress.percent}%)  ·  Overdue: ${progress.overdueCount}`,
        M,
        51,
      );

      let y = 58;
      doc.setFillColor(30, 41, 59);
      doc.rect(M, y, tableW, HEAD_H, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      let x = M;
      for (const col of COLS) {
        doc.text(col.label, x + 2, y + 5.2);
        x += col.w;
      }
      y += HEAD_H;
      doc.setTextColor(17, 24, 39);
      doc.setFont("helvetica", "normal");

      const drawHead = () => {
        doc.setFillColor(30, 41, 59);
        doc.rect(M, y, tableW, HEAD_H, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        let hx = M;
        for (const col of COLS) {
          doc.text(col.label, hx + 2, y + 5.2);
          hx += col.w;
        }
        y += HEAD_H;
        doc.setTextColor(17, 24, 39);
        doc.setFont("helvetica", "normal");
      };

      if (modules.length === 0) {
        doc.setFontSize(9);
        doc.text("No modules released yet.", M + 2, y + 5);
        y += ROW_H;
      }

      modules.forEach((m, index) => {
        if (y + ROW_H > pageH - 30) {
          doc.addPage();
          y = 20;
          drawHead();
        }
        if (index % 2 === 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(M, y, tableW, ROW_H, "F");
        }
        const cells = [
          m.moduleName,
          dateLabel(m.releaseDate),
          dateLabel(m.dueDate),
          m.status === "submitted" ? "Submitted" : m.status.charAt(0).toUpperCase() + m.status.slice(1),
          m.submitted ? dateLabel(m.submissionDate) : "—",
        ];
        let cx = M;
        doc.setFontSize(8.5);
        cells.forEach((cell, i) => {
          const text = doc.splitTextToSize(String(cell), COLS[i].w - 4)[0] ?? "";
          doc.text(text, cx + 2, y + 4.8);
          cx += COLS[i].w;
        });
        y += ROW_H;
      });

      // Upload links (long URLs don't fit a table cell).
      const linked = modules.filter((m) => m.submissionUrl);
      if (linked.length > 0) {
        y += 6;
        if (y > pageH - 40) {
          doc.addPage();
          y = 20;
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text("Upload links", M, y);
        y += 5;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        for (const m of linked) {
          if (y > pageH - 25) {
            doc.addPage();
            y = 20;
          }
          doc.text(`${m.moduleName}:`, M, y);
          y += 4;
          const lines = doc.splitTextToSize(m.submissionUrl ?? "", tableW - 4) as string[];
          for (const line of lines) {
            if (y > pageH - 25) {
              doc.addPage();
              y = 20;
            }
            doc.setTextColor(37, 99, 235);
            doc.text(line, M + 3, y);
            doc.setTextColor(17, 24, 39);
            y += 4;
          }
          y += 1;
        }
      }

      // Support summary.
      y += 4;
      if (y > pageH - 40) {
        doc.addPage();
        y = 20;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("Support summary", M, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      y += 5;
      doc.text(`Devices issued: ${devices.length}`, M, y);
      doc.text(
        `Parent meetings: ${meetings.length} (${meetings.filter((m) => m.attended).length} attended)`,
        M + 60,
        y,
      );
      y += 12;

      if (y > pageH - 30) {
        doc.addPage();
        y = 20;
      }
      doc.text("_____________________________", M, y);
      doc.text("Adviser signature", M, y + 4);
      doc.text(dateLabel(new Date().toISOString()) ?? "", M + 70, y + 4);

      const safeName = header.studentName.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-");
      doc.save(`ADM-monitoring-${safeName || header.lrn}.pdf`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <section
      className="flex min-w-0 flex-col gap-3 rounded-md border bg-card p-4"
      aria-label="Monitoring report"
    >
      <header className="flex min-w-0 items-center gap-1.5">
        <FileText size={15} className="shrink-0 text-muted-foreground" aria-hidden />
        <h2 className="m-0 truncate text-sm font-bold tracking-[-0.01em] text-foreground">
          Monitoring report
        </h2>
      </header>

      <p className="m-0 text-[12px] text-muted-foreground">
        A printable summary of this case: module progress, links, devices issued and parent
        meetings held.
      </p>

      <Button
        type="button"
        variant="outline"
        className="h-8 w-full justify-center px-2.5 text-xs"
        onClick={() => void handleDownload()}
        disabled={downloading}
        aria-busy={downloading || undefined}
      >
        {downloading ? (
          <Loader2 size={13} className="animate-spin" aria-hidden />
        ) : (
          <Download size={13} aria-hidden />
        )}
        {downloading ? "Preparing report…" : "Download PDF report"}
      </Button>

      <p className="m-0 text-center text-[12px] tabular-nums text-muted-foreground">
        {progress.submitted}/{progress.total} modules in · updated{" "}
        {dateLabel(progress.lastSubmittedAt ?? null)}
      </p>
    </section>
  );
}
