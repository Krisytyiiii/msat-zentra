"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import styles from "./kanban-modal.module.css";

export type KanbanModalSize = "sm" | "md" | "lg" | "xl";

interface KanbanModalProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Fixed footer below the scroll body — always bottom-right. */
  footer?: React.ReactNode;
  children: React.ReactNode;
  size?: KanbanModalSize;
  dismissable?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** Paint above the dialog that opened it (nested modal). */
  raised?: boolean;
}

/**
 * Generic shareable modal shell for kanban-board content.
 * Same dialog behavior as CardModal (portal, Escape, overlay-click,
 * body scroll lock) without shadows or scroll hints — the body uses a
 * thin amber scrollbar that only shows on card hover, and every action
 * lives in the bottom-right footer.
 */
export function KanbanModal({
  open,
  onClose,
  title,
  description,
  footer,
  children,
  size = "lg",
  dismissable = true,
  initialFocusRef,
  raised = false,
}: KanbanModalProps) {
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const overlayRef = React.useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!open || !dismissable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, dismissable]);

  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (initialFocusRef?.current ?? cardRef.current)?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, initialFocusRef]);

  React.useEffect(() => {
    // A drawer behind this dialog runs Radix RemoveScroll, whose document-level
    // wheel/touch listener cancels scroll events that don't start inside its
    // own layer — the dialog (portalled to <body>) is outside it, so the wheel
    // used to be swallowed and only the scrollbar thumb worked. Let these
    // events stay inside the dialog: no bubbling to the document means no
    // cancel, so the inner .body scrolls natively (default scroll is untouched;
    // the listener is passive).
    if (!open || !mounted) return;
    const node = overlayRef.current;
    if (!node) return;
    const keep = (event: Event) => event.stopPropagation();
    node.addEventListener("wheel", keep, { passive: true });
    node.addEventListener("touchmove", keep, { passive: true });
    return () => {
      node.removeEventListener("wheel", keep);
      node.removeEventListener("touchmove", keep);
    };
  }, [open, mounted]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      ref={overlayRef}
      className={`${styles.overlay} pointer-events-auto${raised ? ` ${styles.raised}` : ""}`}
      // A raised modal is opened from inside a sheet/drawer: mark it as the
      // active nested layer so the drawer underneath doesn't treat clicks
      // (or Escape) as "outside" and close itself first.
      data-nested-overlay={raised ? "" : undefined}
      onMouseDown={(e) => {
        if (dismissable && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        tabIndex={-1}
        className={`${styles.card} ${styles[size]}`}
      >
        <div className={styles.header}>
          <div className={styles.headText}>
            <h2 className={styles.title}>{title}</h2>
            {description ? (
              <p className={styles.description}>{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            disabled={!dismissable}
            aria-label="Close dialog"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className={styles.body}>{children}</div>
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

/** Generic shareable grid for kanban columns (any KanbanBoard set). */
export function KanbanGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`${styles.boardGrid} ${className ?? ""}`}>{children}</div>
  );
}
