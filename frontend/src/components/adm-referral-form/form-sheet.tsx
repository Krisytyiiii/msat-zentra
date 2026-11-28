"use client";
import * as React from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import sheetStyles from "./adm-referral-form-sheet.module.css";
export function FormSheet({
  onClose,
  children,
  aside,
}: {
  onClose: () => void;
  children: React.ReactNode;
  /** Optional left-hand panel (live form preview) shown beside the drawer. */
  aside?: React.ReactNode;
}) {
  return (
    <Sheet open onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent
        side="right"
        className={
          aside
            ? "w-full max-w-none gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-none"
            : "w-1/2 max-w-none data-[side=right]:w-1/2 data-[side=right]:sm:max-w-none"
        }
      >
        <SheetTitle className="sr-only">Referral form</SheetTitle>
        {aside ? (
          // The preview lives *inside* the sheet: anything outside the dialog
          // is scroll-locked (react-remove-scroll cancels the wheel), so a
          // fixed panel beside it could not be scrolled.
          <div className={sheetStyles.split}>
            <aside className={sheetStyles.livePanel}>{aside}</aside>
            <div className={sheetStyles.scrollBody}>{children}</div>
          </div>
        ) : (
          <div className={sheetStyles.scrollBody}>{children}</div>
        )}
      </SheetContent>
    </Sheet>
  );
}
