"use client";

import * as React from "react";
import Link from "next/link";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  Clock,
  FileCheck,
  Files,
  FolderOpen,
  Loader2,
  Paperclip,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup, ShimmerSkeleton } from "@/components/ui/shimmer-skeleton";
import { Sf10UploadPanel } from "@/components/registry/sf10/Sf10UploadPanel";
import { Sf10RecordOverlay } from "@/components/registry/sf10/Sf10RecordOverlay";
import { Sf10RecordKanbanGrid } from "@/components/registry/sf10/sf10-folders";
import { useSf10BulkUpload } from "@/components/registry/sf10/sf10-bulk-upload-context";
import { fetchSf10Records, type Sf10ListResult } from "@/services/registry/sf10.service";
import styles from "@/components/registry/sf10/sf10.module.css";

const LATEST_TAKE = 5;

export function Sf10UploadPage({ desk }: { desk: "registrar" | "record-keeper" }) {
  const qc = useQueryClient();
  const bulk = useSf10BulkUpload();
  const [openRecordId, setOpenRecordId] = React.useState<string | null>(null);
  const [filedIds, setFiledIds] = React.useState<string[]>([]);
  const lastId = filedIds.length > 0 ? filedIds[filedIds.length - 1] : null;
  const deskLabel = desk === "registrar" ? "registrar" : "record keeper";
  const isRegistrar = desk === "registrar";

  const refresh = () => {
    qc.invalidateQueries({ queryKey: [`${desk}-sf10`] });
    qc.invalidateQueries({ queryKey: [`${desk}-overview`] });
    qc.invalidateQueries({ queryKey: [`${desk}-notifications`] });
  };

  const latestQuery = useQuery<Sf10ListResult>({
    queryKey: [`${desk}-sf10`, "latest", LATEST_TAKE],
    queryFn: ({ signal }) => fetchSf10Records({ page: 1, pageSize: LATEST_TAKE, signal }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const latest = latestQuery.data?.records ?? [];
  const counts = latestQuery.data?.counts ?? { attach: 0, available: 0, released: 0, total: 0 };
  const openRecord = (r: { id: string }) => {
    setOpenRecordId(r.id);
  };

  // Filing flow — the rail mirrors the queue so the page reads as one
  // workbench: pick → read/file → review. A step is done once the queue has
  // moved past it, and the final step lights up as soon as anything is filed.
  const hasFiles = bulk.items.length > 0;
  const filedNow = bulk.items.filter((i) => i.status === "done").length;
  const hasFiled = filedIds.length > 0 || filedNow > 0 || counts.total > 0;
  const steps = [
    {
      key: "pick",
      label: "Pick the files",
      hint: hasFiles
        ? `${bulk.items.length} file${bulk.items.length === 1 ? "" : "s"} in the queue`
        : "Drop a PDF or XLSX batch, or browse",
      done: hasFiles,
      active: !hasFiles,
    },
    {
      key: "file",
      label: "Read & file by LRN",
      hint: bulk.uploading
        ? `Reading ${Math.min(bulk.progress.done + 1, bulk.progress.total)} of ${bulk.progress.total}…`
        : filedNow > 0
          ? `${filedNow} filed into folders`
          : "Each file is read and stored under its own LRN",
      done: filedNow > 0 && !bulk.uploading,
      active: bulk.uploading,
    },
    {
      key: "review",
      label: "Review the folder",
      hint: hasFiled
        ? "Open a folder to check the extracted subjects"
        : "Filed records open in the report overlay",
      done: false,
      active: hasFiled && !bulk.uploading,
    },
  ];

  const railStats = [
    { key: "attach", icon: Paperclip, label: "Attached", value: counts.attach },
    { key: "available", icon: FileCheck, label: "Available", value: counts.available },
    { key: "total", icon: Files, label: "Total records", value: counts.total },
  ];

  return (
    <section className={`${styles.page} ${styles.uploadPage}`}>
      <div className={styles.stack}>
        <header className={styles.hero}>
          <div className={styles.heroMain}>
            <h1 className={styles.heroTitle}>Upload SF10</h1>
            <p className={styles.heroSubtitle}>
              File learner SF10 forms on the {deskLabel} desk — drag a batch in,
              watch each file get read, then open its folder to review the
              subjects.{" "}
              {isRegistrar
                ? "Only the Grade 11–12 rows are extracted; grades below SHS stay on the record keeper's desk."
                : null}{" "}
              Uploads keep running in the dock if you leave this page.
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="h-7 shrink-0 px-2.5 text-[12px] font-medium">
            <Link href={`/${desk}/sf10`}>
              <FolderOpen size={13} aria-hidden />
              All records
            </Link>
          </Button>
        </header>

        <div className={styles.uploadLayout}>
          <div className={styles.uploadMain}>
            <Sf10UploadPanel
              desk={desk}
              onChanged={refresh}
              onUploaded={(id) => setFiledIds((prev) => [...prev, id])}
            />
          </div>

          <aside className={styles.uploadRail} aria-label="Upload guide">
            <section className={styles.railCard}>
              <header className={styles.railHead}>
                <span className={styles.railTitle}>
                  <Upload size={13} aria-hidden />
                  Filing flow
                </span>
                <span className={styles.railBadge}>{hasFiled ? "In progress" : "Ready"}</span>
              </header>
              <ol className={styles.flowList}>
                {steps.map((step, index) => (
                  <li
                    key={step.key}
                    className={`${styles.flowStep} ${step.done ? styles.flowStepDone : ""} ${
                      step.active ? styles.flowStepActive : ""
                    }`}
                    aria-current={step.active ? "step" : undefined}
                  >
                    <span className={styles.flowDot} aria-hidden>
                      {step.done ? (
                        <Check size={12} />
                      ) : step.active && bulk.uploading ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <span className={styles.flowBody}>
                      <span className={styles.flowLabel}>{step.label}</span>
                      <span className={styles.flowHint}>{step.hint}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <div className={styles.railActions}>
                {lastId ? (
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 w-full px-2.5 text-xs"
                    onClick={() => setOpenRecordId(lastId)}
                  >
                    Open latest record
                    <ArrowRight size={13} aria-hidden />
                  </Button>
                ) : (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="h-7 w-full px-2.5 text-xs"
                  >
                    <Link href={`/${desk}/sf10`}>
                      Browse records
                      <ArrowRight size={13} aria-hidden />
                    </Link>
                  </Button>
                )}
              </div>
            </section>

            <section className={styles.railCard} aria-busy={latestQuery.isPending || undefined}>
              <header className={styles.railHead}>
                <span className={styles.railTitle}>
                  <Files size={13} aria-hidden />
                  Desk snapshot
                </span>
              </header>
              <ul className={styles.railStats}>
                {railStats.map((stat) => {
                  const Icon = stat.icon;
                  return (
                    <li key={stat.key} className={styles.railStat}>
                      <span className={styles.railStatLabel}>
                        <Icon size={12} aria-hidden />
                        {stat.label}
                      </span>
                      {latestQuery.isPending ? (
                        <ShimmerSkeleton className="h-5 w-8" />
                      ) : (
                        <span className={styles.railStatValue}>{stat.value}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className={styles.railNote}>
                One SF10 file per learner per desk — uploads never overwrite
                another desk&apos;s file.
              </p>
            </section>
          </aside>
        </div>

        {latestQuery.isPending || latest.length > 0 ? (
          <KanbanBoard
            title="Recently filed"
            icon={<Clock size={14} className="text-amber-500" aria-hidden />}
            ariaLabel="Recently filed"
            description={`The ${LATEST_TAKE} most recently filed records — open a folder to read the extracted subjects.`}
            actions={
              <Button asChild variant="outline" size="sm" className="h-6 px-2 text-xs">
                <Link href={`/${desk}/sf10`}>
                  View all
                  <ArrowRight size={12} aria-hidden />
                </Link>
              </Button>
            }
          >
            {latestQuery.isPending ? (
              <ShimmerGroup>
                <div className={styles.folderKanbanGrid} aria-hidden="true">
                  {Array.from({ length: LATEST_TAKE }).map((_, i) => (
                    <Skeleton key={i} className={styles.folderKanbanSkel} />
                  ))}
                </div>
              </ShimmerGroup>
            ) : (
              <Sf10RecordKanbanGrid records={latest} onOpen={openRecord} />
            )}
          </KanbanBoard>
        ) : null}
      </div>
      <Sf10RecordOverlay
        desk={desk}
        recordId={openRecordId}
        onClose={() => setOpenRecordId(null)}
      />
    </section>
  );
}
