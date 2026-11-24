"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { KanbanBoard } from "@/components/ui/kanban-board";

/**
 * Overlay for the desk's "Clinic sessions for …" board.
 *
 * Same shape as the teacher-shell overlays (`ClassWorkspace` /
 * `ReferralTrackDialog`): one focused panel on a blurred backdrop, portaled
 * over the page — no shadcn Dialog card wrapping a second card. The board
 * itself is the panel, so the sessions board and the case board behind it
 * don't stack two identical borders.
 */
export function SessionBoardOverlay({
  title,
  icon,
  count,
  description,
  widthClass = "sm:max-w-md",
  onClose,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  count?: React.ReactNode;
  description?: React.ReactNode;
  /** Dialog max-width utility, e.g. `sessionBoardDialogWidth(n)`. */
  widthClass?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  React.useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/55 p-4 backdrop-blur-[2px] animate-in fade-in-0 duration-150 dark:bg-black/70"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full min-w-0 ${widthClass}`}
      >
        <KanbanBoard
          className="bg-card max-h-[85vh] overflow-y-auto shadow-2xl [font-family:var(--font-inter)]"
          title={title}
          icon={icon}
          count={count}
          description={description}
          actions={
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X size={14} aria-hidden="true" />
            </button>
          }
        >
          {children}
        </KanbanBoard>
      </div>
    </div>,
    document.body,
  );
}
