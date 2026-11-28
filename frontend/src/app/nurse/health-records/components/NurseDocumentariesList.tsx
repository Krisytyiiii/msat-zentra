"use client";

import * as React from "react";
import { ArrowLeft, HelpCircle } from "lucide-react";
import { AnecdotalRecordKanbanCard } from "@/components/anecdotal/anecdotal-record-kanban-card";
import { PolaroidStack } from "@/components/aicanvas/polaroid-stack";
import { ImageViewer } from "@/components/image-viewer/ImageViewer";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { InsightCallout } from "@/components/ui/insight-callout";
import { KanbanOverlay } from "@/components/ui/kanban-overlay";
import { SearchField } from "@/components/ui/search-field";
import { ZentraPagination } from "@/components/shared/pagination";
import { HealthRecordPhotoPolaroid } from "./HealthRecordPolaroid";
import { TYPE_COLORS, TYPE_TONES } from "./record-tones";
import {
  fileHref,
  type DocEntry,
  type TypeFilter,
} from "./documentaries-utils";
import styles from "./NurseDocumentariesList.module.css";

const TYPE_TABS: ReadonlyArray<{
  value: TypeFilter;
  label: string;
  tone: "neutral" | "blue" | "green";
}> = [
  { value: "", label: "All types", tone: "neutral" },
  { value: "ADM", label: "ADM", tone: "blue" },
  { value: "Clinic", label: "Clinic", tone: "green" },
];

function recordTitle(entry: DocEntry): string {
  if (entry.row.type === "ADM") return "ADM consultation";
  if (entry.session) return "Clinic session";
  return "Resolved case";
}

interface NurseDocumentariesListProps {
  entries: DocEntry[];
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  query: string;
  onQueryChange: (value: string) => void;
  type: TypeFilter;
  onTypeChange: (value: TypeFilter) => void;
}

/**
 * Nurse health records — one folder card per finished clinic session /
 * resolved case, laid out on the same 5-per-row grid, header and pager as the
 * guidance session-documents board. Clicking a card fans out its attached
 * documentation photos so the nurse can look through every shot filed with it.
 * Search, type tabs and paging are owned by the page (URL-synced), so this
 * board only renders what it is handed.
 */
export function NurseDocumentariesList({
  entries,
  page,
  pageSize,
  total,
  onPageChange,
  query,
  onQueryChange,
  type,
  onTypeChange,
}: NurseDocumentariesListProps) {
  const [helpOpen, setHelpOpen] = React.useState(false);
  /* The record whose attached photos are fanned out on the desk. */
  const [photoEntry, setPhotoEntry] = React.useState<DocEntry | null>(null);
  /* The photo opened full-size from the fan. */
  const [viewer, setViewer] = React.useState<{ entry: DocEntry; index: number } | null>(
    null,
  );

  function openViewer(entry: DocEntry, index: number) {
    if (entry.files.length === 0) return;
    setViewer({
      entry,
      index: Math.min(Math.max(index, 0), entry.files.length - 1),
    });
  }

  if (photoEntry) {
    const stackTotal = photoEntry.files.length;
    return (
      <section aria-label="Student health record photos" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setPhotoEntry(null)}
          >
            <ArrowLeft aria-hidden />
            All records
          </Button>
          <p className="m-0 text-[12px] text-muted-foreground">
            {photoEntry.row.student} · {stackTotal} photo{stackTotal === 1 ? "" : "s"}
          </p>
        </div>

        {stackTotal === 0 ? (
          <InsightCallout role="status">
            No documentation photos were filed with this record. Open the
            clinic case to read its notes and outcome.
          </InsightCallout>
        ) : (
          <PolaroidStack
            key={photoEntry.key}
            initialExpanded
            enterFromLeft
            items={photoEntry.files.map((file, index) => ({
              id: file.id,
              file,
              index,
            }))}
            ariaLabel={`Documentation photos for ${photoEntry.row.student}`}
            labelFor={(photo) =>
              `Open photo ${photo.index + 1} of ${stackTotal} for ${photoEntry.row.student}`
            }
            renderCard={(photo) => (
              <HealthRecordPhotoPolaroid
                entry={photoEntry}
                file={photo.file}
                index={photo.index}
                total={stackTotal}
              />
            )}
            onActivate={(photo) => openViewer(photoEntry, photo.index)}
            hint="Click a photo to open it full size."
          />
        )}

        {viewer ? (
          <ImageViewer
            files={viewer.entry.files}
            index={viewer.index}
            title={viewer.entry.row.student}
            subtitle={`${viewer.entry.row.lrn}${
              [viewer.entry.row.grade, viewer.entry.row.section]
                .filter((v) => v && v !== "—")
                .join(" · ")
                ? ` · ${[viewer.entry.row.grade, viewer.entry.row.section]
                    .filter((v) => v && v !== "—")
                    .join(" · ")}`
                : ""
            }`}
            resolveHref={fileHref}
            onIndexChange={(index) =>
              setViewer((v) => (v ? { ...v, index } : v))
            }
            onClose={() => setViewer(null)}
          />
        ) : null}
      </section>
    );
  }

  const activeTypeLabel =
    type === "ADM" ? "ADM consultation" : type === "Clinic" ? "Clinic" : "";

  return (
    <>
      <section aria-label="Student health records" className="flex flex-col gap-4">
        <div className={styles.header}>
          <FilterTabs
            label="Filter records by case type"
            variant="tags"
            options={TYPE_TABS}
            value={type}
            onChange={onTypeChange}
          />
          <div className={styles.headerActions}>
            <SearchField
              className="w-60"
              placeholder="Search student, LRN, section…"
              value={query}
              onChange={onQueryChange}
              aria-label="Search health records"
            />
            <button
              type="button"
              className={styles.helpBtn}
              onClick={() => setHelpOpen(true)}
              aria-label="Why do some records have no photos?"
              title="Why do some records have no photos?"
            >
              <HelpCircle aria-hidden="true" />
            </button>
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="flex min-h-[50vh] w-full flex-1 items-center justify-center py-6">
            <InsightCallout role="status" className="w-full max-w-xl text-center">
              {query.trim() !== ""
                ? `No health records match “${query.trim()}”${
                    activeTypeLabel ? ` in ${activeTypeLabel}` : ""
                  }.`
                : activeTypeLabel
                  ? `No ${activeTypeLabel} records on this page.`
                  : "No records on this page."}
            </InsightCallout>
          </div>
        ) : (
          <>
            <div className={styles.scrollArea}>
              <div className={styles.studentGrid}>
                {entries.map((entry) => {
                  const typeKey: "ADM" | "Clinic" =
                    entry.row.type === "ADM" ? "ADM" : "Clinic";
                  const photoCount = entry.files.length;
                  return (
                    <AnecdotalRecordKanbanCard
                      key={entry.key}
                      category="health"
                      headerTitle={recordTitle(entry)}
                      categoryColor={TYPE_COLORS[typeKey]}
                      folderColor={TYPE_COLORS[typeKey]}
                      tone={TYPE_TONES[typeKey]}
                      studentName={entry.row.student}
                      plainName
                      mascotSeed={entry.row.lrn}
                      mascotCharacter={entry.row.mascot ?? undefined}
                      facts={[
                        { label: "LRN", value: entry.row.lrn || "—" },
                        { label: "Grade level", value: entry.row.grade || "—" },
                        { label: "Section", value: entry.row.section || "—" },
                      ]}
                      fileName={`HealthRecord_${entry.dateDay}`}
                      fileTag={`${photoCount} photo${
                        photoCount === 1 ? "" : "s"
                      } • ${entry.row.type}`}
                      openLabel={`Open health record for ${entry.row.student}`}
                      onOpen={() => setPhotoEntry(entry)}
                    />
                  );
                })}
              </div>
            </div>
            <ZentraPagination
              currentPage={page}
              totalItems={total}
              pageSize={pageSize}
              onPageChange={onPageChange}
            />
          </>
        )}
      </section>

      <KanbanOverlay
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        width="lg"
        title="Why do some records have no photos?"
        description="Health records archive the session, even when nothing was attached."
        footer={
          <div className="flex items-center justify-end gap-1.5 px-1 pb-1">
            <Button type="button" onClick={() => setHelpOpen(false)}>
              Understood
            </Button>
          </div>
        }
      >
        <ul className={styles.helpList}>
          <li>
            <p className={styles.helpItemTitle}>Finished sessions — one card per record</p>
            <p className={styles.helpItemText}>
              Every completed clinic session and resolved case is archived here with
              the learner, the session date and how many documentation photos were
              filed with it.
            </p>
          </li>
          <li>
            <p className={styles.helpItemTitle}>Photos stay viewable</p>
            <p className={styles.helpItemText}>
              Folders marked Resolved or Closed still open because the photos are the
              case&apos;s filed evidence. Records with no attached photos are not
              listed on this board — open the clinic case to read its notes and
              outcome instead.
            </p>
          </li>
        </ul>
      </KanbanOverlay>
    </>
  );
}
