"use client";

import * as React from "react";
import { Download, Eye, FileSpreadsheet, FileText, History, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { SidePanel } from "@/components/ui/side-panel";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import { SharedTermPill } from "@/components/shared/shared-term-pill";
import { toast } from "@/components/ui/sonner";
import { useTerm } from "@/lib/term/TermContext";
import { formatManilaDateLong, formatManilaTime } from "@/lib/labels/datetime";
import { useSf10History, type Sf10HistoryVersion } from "@/services/teacher/sf10Access.service";
import { downloadSf10FileFromUrl } from "@/services/teacher/sf10Autofill.service";
import { StudentMascot } from "../../referrals/components/StudentMascot";
import { fileExtOf, type Sf10DeskRow } from "./sf10-desk-row";
import listStyles from "../../list/components/advisory-list.module.css";

type Format = "xlsx" | "pdf";

interface Sf10AccessDrawerProps {
  row: Sf10DeskRow | null;
  open: boolean;
  onClose: () => void;
  canAct: boolean;
  onDownload: (row: Sf10DeskRow, format: Format) => void;
  downloading: { lrn: string; format: Format } | null;
  onView: (fileUrl: string) => void;
}

function VersionCard({
  version,
  name,
  onView,
}: {
  version: Sf10HistoryVersion;
  name: string;
  onView: (fileUrl: string) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const fileUrl = version.fileUrl;
  const ext = fileUrl ? fileExtOf(fileUrl) || "file" : "file";

  async function save() {
    if (!fileUrl || busy) return;
    setBusy(true);
    try {
      await downloadSf10FileFromUrl(
        fileUrl,
        `SF10-${name.replace(/[^A-Za-z0-9]+/g, "-")}-v${version.versionNumber}.${ext}`,
      );
    } catch (err) {
      toast.error({
        title: "Could not download this version",
        description: err instanceof Error ? err.message : "Try again in a moment.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-md border border-border bg-card px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <Pill tone="blue" className="shrink-0">
          v{version.versionNumber}
        </Pill>
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">
          {version.reason || "SF10 auto-filled from locked grades"}
        </span>
        <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
          {formatManilaDateLong(version.at)} · {formatManilaTime(version.at)}
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-6 gap-1 px-2 text-[12px]"
          disabled={!fileUrl}
          onClick={() => fileUrl && onView(fileUrl)}
          aria-label={`Preview ${name}'s SF10 v${version.versionNumber}${
            ext === "pdf" ? " as PDF" : ext === "xlsx" || ext === "xls" ? " as Excel" : ""
          }`}
        >
          <Eye size={12} aria-hidden />
          {ext === "pdf" ? "Preview PDF" : ext === "file" ? "Preview" : "Preview Excel"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-6 gap-1 px-2 text-[12px]"
          disabled={!fileUrl || busy}
          onClick={save}
        >
          {busy ? (
            <Loader2 size={12} className="animate-spin" aria-hidden />
          ) : (
            <Download size={12} aria-hidden />
          )}
          Download
        </Button>
      </div>
    </li>
  );
}

/**
 * Right drawer for one advisee's SF10: the build/download actions and every
 * Bama auto-fill version filed on the record, each with its own
 * format-labelled preview and download.
 */
export function Sf10AccessDrawer({
  row,
  open,
  onClose,
  canAct,
  onDownload,
  downloading,
  onView,
}: Sf10AccessDrawerProps) {
  const [showAllVersions, setShowAllVersions] = React.useState(false);
  const { activeTerm } = useTerm();

  const historyQuery = useSf10History(
    open && row?.record ? row.sectionId : null,
    open && row?.record ? row.lrn : null,
  );

  const versions = historyQuery.data?.versions ?? [];
  const shownVersions = showAllVersions ? versions : versions.slice(0, 3);
  const busy = row ? downloading?.lrn === row.lrn : false;

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      label={row ? `${row.name} — SF10` : "SF10 record"}
      width="3xl"
      showCloseButton
    >
      {row ? (
        <div className="flex h-full min-h-0 flex-col">
          <header className="flex shrink-0 flex-col gap-2 border-b border-border px-4 py-3">
            <div className="flex items-center gap-2.5">
              <StudentMascot
                name={row.name}
                seed={row.lrn}
                character={row.mascot ?? undefined}
                size={36}
              />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-semibold leading-tight text-foreground">
                  {row.name}
                </h2>
                <p className="mt-0.5 truncate font-mono text-[12px] tabular-nums text-muted-foreground">
                  LRN {row.lrn}
                </p>
              </div>
            </div>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted-foreground">
              <span>
                Section:{" "}
                <span className="font-medium text-foreground">{row.section || "—"}</span>
              </span>
              <span aria-hidden className="text-border">
                |
              </span>
              <span>
                Grade level:{" "}
                <span className="font-medium text-foreground">
                  {row.gradeLevel ? row.gradeLevel.replace(/^G/, "Grade ") : "—"}
                </span>
              </span>
              <span aria-hidden className="text-border">
                |
              </span>
              <span>
                Term:{" "}
                <span className="font-medium text-foreground">
                  {activeTerm ? `Term ${activeTerm.termNumber}` : "—"}
                </span>
              </span>
              <span aria-hidden className="text-border">
                |
              </span>
              <span>
                School year:{" "}
                <span className="font-medium text-foreground">
                  {activeTerm?.schoolYearName ?? "—"}
                </span>
              </span>
            </p>
          </header>

          <div className={`${listStyles.thinScrollbar} min-h-0 flex-1 overflow-y-auto`}>
            <div className="flex flex-col gap-4 px-4 py-4">
              {row.missing ? (
                <PageEmptyCallout>
                  <strong>No SF10 on file yet.</strong> Build one from this learner&apos;s
                  locked grades after the registrar or record keeper files an SF10, or ask
                  them to add it.
                </PageEmptyCallout>
              ) : (
                <>
                  {/* ---- Build + download ---- */}
                  <section className="flex flex-col gap-2" aria-label="Build and download">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        className="gap-1.5"
                        disabled={!canAct || busy}
                        onClick={() => onDownload(row, "xlsx")}
                        aria-label={`Build and download ${row.name}'s SF10 as Excel`}
                      >
                        <FileSpreadsheet size={14} aria-hidden />
                        {busy && downloading?.format === "xlsx" ? "Building…" : "Build Excel"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={!canAct || busy}
                        onClick={() => onDownload(row, "pdf")}
                        aria-label={`Build and download ${row.name}'s SF10 as PDF`}
                      >
                        <FileText size={14} aria-hidden />
                        {busy && downloading?.format === "pdf" ? "Building…" : "Build PDF"}
                      </Button>
                      {row.record?.fileUrl ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="gap-1.5"
                          onClick={() => onView(row.record!.fileUrl as string)}
                        >
                          <Eye size={14} aria-hidden />
                          Original file
                        </Button>
                      ) : null}
                      {!canAct ? (
                        <span className="text-[12px] text-muted-foreground">
                          Access is view-only until the registry desk approves this learner.
                        </span>
                      ) : null}
                    </div>
                  </section>

                  {/* ---- Version history ---- */}
                  <section className="flex flex-col gap-2" aria-label="Auto-fill versions">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <History size={13} aria-hidden />
                        Auto-fill versions
                      </h3>
                      <span className="text-[12px] text-muted-foreground">
                        {versions.length === 0
                          ? "No auto-fill renders yet"
                          : `${versions.length} filed`}
                      </span>
                      <div className="ml-auto flex items-center gap-2">
                        {row.grantedTermNumber != null ? (
                          <SharedTermPill termNumber={row.grantedTermNumber} action="Granted" />
                        ) : null}
                        {row.record ? (
                          <span className="text-[12px] tabular-nums text-muted-foreground">
                            current v{row.record.currentVersion}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {historyQuery.isPending ? (
                      <div className="flex h-24 items-center justify-center rounded-md border border-border">
                        <Loader2 size={16} className="animate-spin text-muted-foreground" aria-hidden />
                      </div>
                    ) : historyQuery.isError ? (
                      <PageEmptyCallout fit>
                        Could not load this learner&apos;s version history. Close and try
                        again.
                      </PageEmptyCallout>
                    ) : versions.length === 0 ? (
                      <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-[12px] text-muted-foreground">
                        Auto-fill this learner to file the first render. Each run keeps its
                        own version here.
                      </p>
                    ) : (
                      <>
                        <ul className="flex flex-col gap-2">
                          {shownVersions.map((v) => (
                            <VersionCard
                              key={v.versionNumber}
                              version={v}
                              name={row.name}
                              onView={onView}
                            />
                          ))}
                        </ul>
                        {versions.length > 3 ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="w-fit px-2 text-[12px]"
                            onClick={() => setShowAllVersions((prev) => !prev)}
                          >
                            {showAllVersions
                              ? "Show latest 3"
                              : `Show all ${versions.length} versions`}
                          </Button>
                        ) : null}
                      </>
                    )}
                  </section>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </SidePanel>
  );
}
