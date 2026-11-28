"use client";

import * as React from "react";
import { Images, Info, Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KanbanOverlay } from "@/components/ui/kanban-overlay";
import { KanbanBoard, KanbanBoardEmpty } from "@/components/ui/kanban-board";
import {
  clinicAttachmentError,
  deleteClinicAttachment,
  uploadClinicAttachments,
} from "@/services/nurse/sessions.service";
import type {
  ClinicAttachment,
  NurseSessionItem,
} from "@/services/nurse/nurse.types";
import { useNurseMutation } from "../../overview/components/use-nurse-mutation";
import { cn } from "@/lib/utils";
import { useActiveNowTick } from "@/lib/clock";
import type { DialogProps } from "./NurseSessionDialogs";

/**
 * Clinic session documentation — the exact same filed-photos + attach boards
 * the guidance desk uses, so documentation looks identical on both desks.
 * Photos file on pick (the shared Dock reports the outcome); the overlay stays
 * open so the filed grid updates in place.
 */
export function SessionDocsDialog({
  referralId,
  session,
  open,
  onClose,
  onChanged,
}: DialogProps & {
  referralId: string;
  session: NurseSessionItem;
  /** Kept for the dialog-host contract; the overlay stays open after filing. */
  onConfirmed: () => void;
}) {
  const [docs, setDocs] = React.useState<ClinicAttachment[]>(
    session.attachments ?? [],
  );
  const [error, setError] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const now = useActiveNowTick(open);
  const uploadMutation = useNurseMutation({
    mutationFn: (picked: File[]) =>
      uploadClinicAttachments(referralId, session.id, picked),
    sourceId: referralId,
    scopes: "alerts",
    successTitle: "Photos filed",
    successDescription: (_picked, added) =>
      `${added.length} photo${added.length === 1 ? "" : "s"} attached to this session.`,
    errorFallback: "Could not upload the photos. Try again.",
    silentError: true,
    dockMessage: (_picked, added) =>
      `${added.length} photo${added.length === 1 ? "" : "s"} filed`,
    onSuccessExtra: (added) => {
      setDocs((prev) => [...prev, ...added]);
      setError(null);
      onChanged();
    },
  });
  const removeMutation = useNurseMutation({
    mutationFn: (id: string) => deleteClinicAttachment(referralId, session.id, id),
    sourceId: referralId,
    scopes: "alerts",
    successTitle: "Photo removed",
    successDescription: () => "The photo was removed from this session.",
    errorFallback: "Could not remove that photo. Try again.",
    silentError: true,
    dockMessage: () => "Photo removed",
    onSuccessExtra: (_data, id) => {
      setDocs((prev) => prev.filter((d) => d.id !== id));
      setError(null);
      onChanged();
    },
  });
  const uploading = uploadMutation.isPending;
  const busy = uploading || removeMutation.isPending;
  const removingId = removeMutation.isPending
    ? ((removeMutation.variables as string | undefined) ?? null)
    : null;
  const mutationError = uploadMutation.error ?? removeMutation.error;
  const displayError = error ?? (mutationError ? mutationError.message : null);

  if (!open) return null;

  const docsLocked =
    session.status === "scheduled" &&
    new Date(session.scheduledAt).getTime() > now;

  function onPick(list: FileList | null) {
    if (!list || uploading) return;
    if (docsLocked) {
      setError(
        "This session hasn't started yet — you can file documentation once the scheduled time arrives.",
      );
      return;
    }
    const picked = Array.from(list).slice(0, 5);
    const problem = clinicAttachmentError(picked);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    // File through the Dock and close at once — a slow upload never leaves the
    // overlay (or the drawer behind it) stuck on screen.
    uploadMutation.mutate(picked);
    onClose();
  }

  function onRemove(id: string) {
    if (removeMutation.isPending) return;
    setError(null);
    removeMutation.mutate(id);
  }

  const dropDisabled = uploading || docsLocked;

  return (
    <KanbanOverlay
      open={open}
      onClose={() => {
        if (busy) return;
        onClose();
        setError(null);
      }}
      dismissable={!busy}
      busy={busy}
      width="lg"
      title="Session documentation"
      icon={
        <span className="text-primary" aria-hidden>
          <Paperclip size={14} />
        </span>
      }
      description="Optional photos for this session — JPG, PNG or WEBP, 5 MB each."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-1">
          <p className="text-[12px] text-muted-foreground">
            {docs.length === 0
              ? "No photos filed yet"
              : `${docs.length} photo${docs.length === 1 ? "" : "s"} filed`}
          </p>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Done
          </Button>
        </div>
      }
    >
      <div
        className="flex flex-col gap-3 px-1 pb-1"
        aria-busy={busy || undefined}
      >
        {docsLocked ? (
          <div
            className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] leading-4 text-amber-800 dark:text-amber-200"
            role="status"
          >
            <Info className="mt-px size-3.5 shrink-0" aria-hidden />
            <span>
              This session hasn&apos;t started yet — filing unlocks once the
              scheduled time arrives. Filed photos below stay viewable.
            </span>
          </div>
        ) : null}

        <KanbanBoard
          title="Filed photos"
          icon={
            <span className="text-muted-foreground" aria-hidden>
              <Images size={14} />
            </span>
          }
          count={docs.length}
        >
          {docs.length === 0 ? (
            <KanbanBoardEmpty>
              No photos filed yet — attach the first one below.
            </KanbanBoardEmpty>
          ) : (
            <div className="grid grid-cols-2 gap-2 px-1 sm:grid-cols-3">
              {docs.map((d) => (
                <figure
                  key={d.id}
                  className="group relative flex min-w-0 flex-col overflow-hidden rounded-md border border-border bg-card"
                >
                  <a
                    href={d.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block"
                    aria-label={`Open ${d.fileName}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={d.fileUrl}
                      alt={d.fileName}
                      loading="lazy"
                      className="h-24 w-full object-cover"
                    />
                  </a>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    disabled={removingId === d.id || uploading}
                    onClick={() => void onRemove(d.id)}
                    aria-label={`Remove ${d.fileName}`}
                    title={`Remove ${d.fileName}`}
                    className="absolute right-1 top-1 size-7 rounded-md bg-card/90 opacity-0 shadow-sm transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    {removingId === d.id ? (
                      <Loader2 className="animate-spin" aria-hidden />
                    ) : (
                      <Trash2 aria-hidden />
                    )}
                  </Button>
                  <figcaption
                    className="truncate border-t border-border px-2 py-1 text-[12px] text-muted-foreground"
                    title={d.fileName}
                  >
                    {d.fileName}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </KanbanBoard>

        <KanbanBoard
          title="Attach photos (optional)"
          icon={
            <span className="text-muted-foreground" aria-hidden>
              <Paperclip size={14} />
            </span>
          }
          description={
            docsLocked
              ? "This session hasn't started yet — filing unlocks once the scheduled time arrives."
              : "Up to 5 images at a time."
          }
        >
          <div className="px-1 pb-1">
            <button
              type="button"
              disabled={dropDisabled}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                if (!dropDisabled) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                onPick(e.dataTransfer.files);
              }}
              aria-label="Choose photos to attach"
              className={cn(
                "flex w-full flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-4 transition-colors",
                dragging
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50 hover:bg-muted/40",
                dropDisabled &&
                  "cursor-not-allowed opacity-50 hover:border-border hover:bg-transparent",
              )}
            >
              <Upload className="size-4 text-primary" aria-hidden />
              <span className="text-[13px]">
                <span className="font-semibold text-primary">Choose files</span>{" "}
                <span className="text-muted-foreground">or drag and drop</span>
              </span>
              <span className="text-[12px] text-muted-foreground">
                JPG, PNG or WEBP · up to 5 photos · 5 MB each
              </span>
            </button>
            <input
              ref={inputRef}
              id={`nurse-docs-${session.id}`}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={dropDisabled}
              onChange={(e) => {
                onPick(e.target.files);
                e.target.value = "";
              }}
              className="sr-only"
              tabIndex={-1}
            />
            {uploading ? (
              <p
                className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                Uploading photos…
              </p>
            ) : null}
            {displayError ? (
              <p
                className="mt-2 text-[12px] leading-4 text-red-600 dark:text-red-400"
                role="alert"
              >
                {displayError}
              </p>
            ) : null}
          </div>
        </KanbanBoard>
      </div>
    </KanbanOverlay>
  );
}
