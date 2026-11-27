"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { SidePanel, type SidePanelWidth } from "@/components/ui/side-panel";

interface Props {
  open: boolean;
  onClose: () => void;
  label: string;
  /**
   * `dialog` is the centered sheet used by the small edit forms. `drawer`
   * slides in from the right edge — the same shape the admin section creator
   * uses — for the longer add form.
   */
  variant?: "dialog" | "drawer";
  /** Dialog width; the default matches the admin schedule template forms. */
  widthClassName?: string;
  /** Drawer width; `md` (28rem) unless the form needs a table. */
  drawerWidth?: SidePanelWidth;
  children: React.ReactNode;
}

/**
 * Backdrop + sheet for the advisory add/edit forms — mirrors the admin
 * schedule template overlay (`TemplateFormOverlay`): the form itself is a card
 * (header strip, body, footer), so this only supplies the scrim, Escape/backdrop
 * close and the scroll box while the list stays put underneath.
 */
export function FormOverlay({
  open,
  onClose,
  label,
  variant = "dialog",
  widthClassName = "max-w-xl",
  drawerWidth = "md",
  children,
}: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Guards the document.body portal during prerender.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (variant === "drawer") {
    return (
      <SidePanel open={open} onClose={onClose} label={label} width={drawerWidth}>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-card [&>div]:rounded-none [&>div]:border-0 [&>div]:shadow-none">
          {children}
        </div>
      </SidePanel>
    );
  }

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-[2px] dark:bg-black/70"
      />
      <div className={`relative max-h-[85dvh] w-full ${widthClassName} overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
