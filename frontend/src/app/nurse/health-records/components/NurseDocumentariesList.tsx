"use client";

import * as React from "react";
import { ArrowLeft } from "lucide-react";
import { SearchField } from "@/components/ui/search-field";
import { Button } from "@/components/ui/button";
import { ImageViewer } from "@/components/image-viewer/ImageViewer";
import { InsightCallout } from "@/components/ui/insight-callout";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import { type NurseAlertItem } from "@/services/nurse/nurse.types";
import { PolaroidStack } from "@/components/aicanvas/polaroid-stack";
import {
  HealthRecordPhotoPolaroid,
  HealthRecordPolaroid,
} from "./HealthRecordPolaroid";
import {
  buildEntries,
  entryStatusLabel,
  fileHref,
  type DocEntry,
} from "./documentaries-utils";
import { ZentraPagination } from "@/components/shared/pagination";

/**
 * One Polaroid stack holds a desk-friendly handful of records; the pager steps
 * through the term's records five at a time.
 */
const STACK_PAGE_SIZE = 5;

/**
 * Nurse health records — one Polaroid per finished clinic session / resolved
 * case, piled on a desk. Clicking a record spreads its attached documentation
 * photos into an arc so the nurse can look through every shot filed with it.
 */
export function NurseDocumentariesList({ alerts }: { alerts: NurseAlertItem[] }) {
  const entries = React.useMemo(() => buildEntries(alerts), [alerts]);
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(1);
  /* The record whose attached photos are fanned out on the desk. */
  const [photoEntry, setPhotoEntry] = React.useState<DocEntry | null>(null);
  /* Auto-spread the newest record once on arrival; after that the desk
     respects the nurse's choice (Back to records stays closed). */
  const autoOpened = React.useRef(false);
  React.useEffect(() => {
    if (autoOpened.current || photoEntry) return;
    const first = entries.find((entry) => entry.files.length > 0);
    if (!first) return;
    autoOpened.current = true;
    setPhotoEntry(first);
  }, [entries, photoEntry]);
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

  const needle = query.trim().toLowerCase();
  const visible = React.useMemo(() => {
    if (!needle) return entries;
    return entries.filter((e) =>
      `${e.row.student} ${e.row.lrn} ${e.row.section} ${e.row.type} ${entryStatusLabel(e)}`
        .toLowerCase()
        .includes(needle),
    );
  }, [entries, needle]);

  const totalPages = Math.max(1, Math.ceil(visible.length / STACK_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageEntries = visible.slice(
    (safePage - 1) * STACK_PAGE_SIZE,
    safePage * STACK_PAGE_SIZE,
  );

  if (entries.length === 0) {
    return (
      <PageEmptyCallout>
        <strong>No files stored yet.</strong> Finished clinic sessions and resolved
        cases will appear here, one polaroid per record.
      </PageEmptyCallout>
    );
  }

  if (photoEntry) {
    const total = photoEntry.files.length;
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
            {photoEntry.row.student} · {total} photo{total === 1 ? "" : "s"}
          </p>
        </div>
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
            `Open photo ${photo.index + 1} of ${total} for ${photoEntry.row.student}`
          }
          renderCard={(photo) => (
            <HealthRecordPhotoPolaroid
              entry={photoEntry}
              file={photo.file}
              index={photo.index}
              total={total}
            />
          )}
          onActivate={(photo) => openViewer(photoEntry, photo.index)}
          hint="Click a photo to open it full size."
        />

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

  return (
    <section aria-label="Student health records" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <SearchField
          className="w-60"
          placeholder="Search student, LRN, section…"
          value={query}
          onChange={(next) => {
            setQuery(next);
            setPage(1);
          }}
          aria-label="Search health records"
        />
      </div>

      {visible.length === 0 ? (
        <div className="flex w-full justify-center px-1 py-6">
          <InsightCallout role="status" className="w-full max-w-xl text-left">
            <strong>No records match your search.</strong> Try a different
            student name, LRN, section, or type — or clear the search to see
            every record.
          </InsightCallout>
        </div>
      ) : (
        <>
          <PolaroidStack
            align="left"
            items={pageEntries.map((entry) => ({ ...entry, id: entry.key }))}
            ariaLabel="Health record photos"
            labelFor={(entry) =>
              `${entry.row.student} — ${entry.row.type} ${
                entry.session ? "clinic session" : "case record"
              } from ${entry.dateDay}, ${entry.files.length} attached photo${
                entry.files.length === 1 ? "" : "s"
              }`
            }
            renderCard={(entry) => <HealthRecordPolaroid entry={entry} />}
            onActivate={(entry) => {
              if (entry.files.length > 0) setPhotoEntry(entry);
            }}
            hint="Click a record to fan out its photos."
          />
          <ZentraPagination
            currentPage={safePage}
            totalItems={visible.length}
            pageSize={STACK_PAGE_SIZE}
            onPageChange={setPage}
          />
        </>
      )}
    </section>
  );
}
