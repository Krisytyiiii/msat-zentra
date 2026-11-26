"use client";

import { Download, Upload } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export type PublishConfirmMode = "publish" | "unpublish";

interface Props {
  mode: PublishConfirmMode;
  title: string;
  description: string;
  /** Current state of the affected grid, so the labels read correctly. */
  published?: boolean;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Publish / draft confirmation — the question, the consequence in one
 * sentence, and the two actions. Message-only: no counts, no slot list. The
 * write only runs on confirm; the shared Dock reports the progress afterwards.
 */
export function ScheduleStatusConfirm({
  mode,
  title,
  description,
  published = false,
  pending,
  onCancel,
  onConfirm,
}: Props) {
  const publishing = mode === "publish";

  return (
    <ConfirmDialog
      tone="primary"
      title={title}
      description={description}
      icon={publishing ? <Upload size={16} /> : <Download size={16} />}
      cancelLabel={publishing ? "Keep as draft" : published ? "Keep published" : "Cancel"}
      confirmLabel={publishing ? "Publish timetable" : published ? "Move to draft" : "Save draft"}
      confirmIcon={publishing ? <Upload size={13} /> : <Download size={13} />}
      pendingLabel={publishing ? "Publishing…" : "Saving…"}
      pending={pending}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
