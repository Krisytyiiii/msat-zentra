"use client";

import * as React from "react";
import { ArrowLeft, HelpCircle } from "lucide-react";
import { PolaroidStack } from "@/components/aicanvas/polaroid-stack";
import { AnecdotalRecordKanbanCard } from "@/components/anecdotal/anecdotal-record-kanban-card";
import { ImageViewer } from "@/components/image-viewer/ImageViewer";
import { PrivacyNoticeDialog } from "@/components/privacy-notice-dialog";
import { Button } from "@/components/ui/button";
import { InsightCallout } from "@/components/ui/insight-callout";
import { KanbanOverlay } from "@/components/ui/kanban-overlay";
import { ZentraPagination } from "@/components/shared/pagination";
import type { GuidanceAnecdotalRecord } from "@/services/guidance/anecdotal.types";
import {
  GuidanceAnecdotalSearch,
  GuidanceAnecdotalTypeTabs,
  type TypeFilter,
} from "@/app/guidance/anecdotal/components/guidance-anecdotal-filters";
import { docSlipsFor } from "./session-doc-slips";
import { SessionDocumentPhotoPolaroid } from "./SessionDocumentPolaroid";
import styles from "./guidance-session-documents-folders.module.css";

function isEndorsedCase(type: string | undefined, status: string): boolean {
  return type === "ADM" && status === "in_progress";
}

function caseTypeLabel(record: GuidanceAnecdotalRecord): string {
  if (record.referralType === "ADM") return "ADM consultation";
  if (record.hasInterventionDocs) return "Intervention";
  return "Counseling";
}

interface GuidanceSessionDocumentsFoldersProps {
  records: GuidanceAnecdotalRecord[];
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
 * Guidance session documents — one Polaroid per referred case, piled on a desk
 * (the same presentation as the nurse health-records board). Clicking a record
 * fans out the photos filed on its sessions; each photo opens full size.
 */
export function GuidanceSessionDocumentsFolders({
  records,
  page,
  pageSize,
  total,
  onPageChange,
  query,
  onQueryChange,
  type,
  onTypeChange,
}: GuidanceSessionDocumentsFoldersProps) {
  const [endorsedFor, setEndorsedFor] = React.useState<string | null>(null);
  const [helpOpen, setHelpOpen] = React.useState(false);
  /* The record whose filed photos are fanned out on the desk. */
  const [photoEntry, setPhotoEntry] = React.useState<GuidanceAnecdotalRecord | null>(
    null,
  );
  /* The photo opened full-size from the fan. */
  const [gallery, setGallery] = React.useState<{
    record: GuidanceAnecdotalRecord;
    index: number;
  } | null>(null);
  const [galleryIndex, setGalleryIndex] = React.useState(0);

  const activeTypeLabel =
    type === "ADM" ? "ADM consultation" : type === "Counseling" ? "Counseling" : "";

  const openRecord = (record: GuidanceAnecdotalRecord) => {
    // Photos stay viewable even on finished cases; only ADM-endorsed folders
    // are blocked because the case (and its files) moved to the ADM queue.
    if (isEndorsedCase(record.referralType, record.referralStatus)) {
      setEndorsedFor(record.student);
      return;
    }
    setPhotoEntry(record);
  };

  const openGallery = (record: GuidanceAnecdotalRecord, index: number) => {
    setGallery({ record, index });
    setGalleryIndex(index);
  };

  let body: React.ReactNode;

  if (photoEntry) {
    const files = docSlipsFor(photoEntry, 50).map((doc) => doc.image);
    const totalFiles = files.length;

    body = (
      <section
        aria-label="Session document photos"
        className="flex flex-col gap-3"
      >
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
            {photoEntry.student} · {totalFiles} photo{totalFiles === 1 ? "" : "s"}
          </p>
        </div>
        <PolaroidStack
          key={photoEntry.referralId}
          initialExpanded
          enterFromLeft
          items={files.map((file, index) => ({ ...file, index }))}
          ariaLabel={`Session photos for ${photoEntry.student}`}
          labelFor={(photo) =>
            `Open photo ${photo.index + 1} of ${totalFiles} for ${photoEntry.student}`
          }
          renderCard={(photo) => (
            <SessionDocumentPhotoPolaroid
              record={photoEntry}
              file={photo}
              index={photo.index}
              total={totalFiles}
            />
          )}
          onActivate={(photo) => openGallery(photoEntry, photo.index)}
          hint="Click a photo to open it full size."
        />
      </section>
    );
  } else {
    body = (
      <section aria-label="Session documents" className="flex flex-col gap-4">
        <div className={styles.header}>
          <GuidanceAnecdotalTypeTabs type={type} onTypeChange={onTypeChange} />
          <div className={styles.headerActions}>
            <GuidanceAnecdotalSearch query={query} onQueryChange={onQueryChange} />
            <button
              type="button"
              className={styles.helpBtn}
              onClick={() => setHelpOpen(true)}
              aria-label="Why can't I open some folders?"
              title="Why can't I open some folders?"
            >
              <HelpCircle aria-hidden="true" />
            </button>
          </div>
        </div>

        {records.length === 0 ? (
          <div className="flex min-h-[50vh] w-full flex-1 items-center justify-center py-6">
            <InsightCallout role="status" className="w-full max-w-xl text-center">
              {query.trim() !== ""
                ? `No session documents match “${query.trim()}”${
                    activeTypeLabel ? ` in ${activeTypeLabel}` : ""
                  }.`
                : activeTypeLabel
                  ? `No ${activeTypeLabel} session documents on this page.`
                  : "No session documents on this page."}
            </InsightCallout>
          </div>
        ) : (
          <>
            <div className={styles.scrollArea}>
              <div className={styles.studentGrid}>
                {records.map((record) => {
                  const photoCount = docSlipsFor(record, 50).length;
                  return (
                    <AnecdotalRecordKanbanCard
                      key={record.referralId}
                      category={record.category}
                      studentName={record.student}
                      plainName
                      mascotSeed={record.lrn}
                      mascotCharacter={record.mascot ?? undefined}
                      facts={[
                        { label: "LRN", value: record.lrn || "—" },
                        { label: "Grade level", value: record.grade || "—" },
                        { label: "Section", value: record.section || "—" },
                      ]}
                      fileName={`SessionDocs_${record.date}`}
                      fileTag={`${photoCount} photo${photoCount === 1 ? "" : "s"} • ${caseTypeLabel(
                        record,
                      )}`}
                      openLabel={`Open session photos for ${record.student}`}
                      onOpen={() => openRecord(record)}
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
    );
  }

  return (
    <>
      {body}

      {gallery ? (
        <ImageViewer
          files={docSlipsFor(gallery.record, 50).map((d) => ({
            ...d.image,
            fileName: `${d.file.tag.split(" • ")[0]} — ${d.image.fileName}`,
          }))}
          index={galleryIndex}
          title={gallery.record.student}
          subtitle={`${gallery.record.lrn} · ${gallery.record.section} · ${gallery.record.grade}`}
          onIndexChange={setGalleryIndex}
          onClose={() => setGallery(null)}
        />
      ) : null}

      <PrivacyNoticeDialog
        open={endorsedFor !== null}
        onClose={() => setEndorsedFor(null)}
        studentName={endorsedFor ?? undefined}
        reason="endorsed"
      />

      <KanbanOverlay
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        width="lg"
        title="Why can&apos;t I open some folders?"
        description="Some folders stay listed but their photos never open."
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
            <p className={styles.helpItemTitle}>Finished cases — photos stay viewable</p>
            <p className={styles.helpItemText}>
              Folders marked Resolved or Closed still open because the photos are the
              case&apos;s filed evidence. Only the full GCForm-01 write-up stays private on
              the Anecdotal Records page.
            </p>
          </li>
          <li>
            <p className={styles.helpItemTitle}>Endorsed cases — with the ADM coordinator</p>
            <p className={styles.helpItemText}>
              Folders marked Endorsed can&apos;t be opened because the case was endorsed to
              the ADM coordinator. Its files moved with the case.
            </p>
          </li>
        </ul>
      </KanbanOverlay>
    </>
  );
}
