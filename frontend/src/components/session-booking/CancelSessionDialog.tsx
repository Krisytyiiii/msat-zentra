"use client";

import * as React from "react";
import { Ban, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MessageOverlay } from "@/components/ui/message-overlay";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import styles from "./BookSessionDialog.module.css";

interface CancelSessionDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason?: string) => void;
  title?: string;
  description?: string;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  keepLabel?: string;
  submitLabel?: string;
  busy?: boolean;
  serverError?: string | null;
  idPrefix?: string;
}

/** Shared destructive confirmation for dropping a booked session — rendered on
 *  the one message-overlay surface so every desk asks the same way. */
export function CancelSessionDialog({
  open,
  onClose,
  onSubmit,
  title = "Cancel this session?",
  description = "This frees the slot. The case itself stays open.",
  reasonLabel = "Why? (optional)",
  reasonPlaceholder = "Reason for cancelling…",
  keepLabel = "Keep it",
  submitLabel = "Cancel session",
  busy = false,
  serverError = null,
  idPrefix = "cancel-session",
}: CancelSessionDialogProps) {
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const openKey = open ? idPrefix : null;
  const [prevOpenKey, setPrevOpenKey] = React.useState<string | null>(null);
  if (openKey !== prevOpenKey) {
    setPrevOpenKey(openKey);
    setReason("");
    setError(null);
  }

  if (!open) return null;

  return (
    <MessageOverlay
      role="alertdialog"
      tone="danger"
      icon={<Ban size={16} aria-hidden="true" />}
      title={title}
      description={description}
      width="md"
      dismissable={!busy}
      onDismiss={() => {
        if (busy) return;
        onClose();
        setError(null);
      }}
      footerHint="Esc to close"
      actions={
        <>
          <Button
            variant="outline"
            className="h-6 px-2.5 text-xs"
            onClick={onClose}
            disabled={busy}
          >
            {keepLabel}
          </Button>
          <Button
            variant="destructive"
            className={`${styles.btnRed} h-6 px-2.5 text-xs`}
            onClick={() => {
              setError(null);
              onSubmit(reason.trim() ? reason.trim() : undefined);
            }}
            disabled={busy}
            aria-busy={busy || undefined}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : null}
            {busy ? "Cancelling…" : submitLabel}
          </Button>
        </>
      }
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-reason`}>{reasonLabel}</Label>
        <Textarea
          id={`${idPrefix}-reason`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={reasonPlaceholder}
          rows={3}
          maxLength={500}
        />
      </div>
      {error || serverError ? (
        <div className={styles.errorBlock} role="alert">
          <p className={styles.errorText}>{error ?? serverError}</p>
        </div>
      ) : null}
    </MessageOverlay>
  );
}
