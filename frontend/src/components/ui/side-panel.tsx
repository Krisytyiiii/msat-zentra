"use client"

import * as React from "react"

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

const SIDE_CLASSES = {
  right:
    "data-[side=right]:inset-y-4 data-[side=right]:right-4 data-[side=right]:h-auto data-[side=right]:max-h-[calc(100dvh-2rem)] data-[side=right]:w-[calc(100vw-2rem)]",
  left:
    "data-[side=left]:inset-y-4 data-[side=left]:left-4 data-[side=left]:h-auto data-[side=left]:max-h-[calc(100dvh-2rem)] data-[side=left]:w-[calc(100vw-2rem)]",
} as const

/**
 * Panel width presets. `md` is the default: a 28rem column that fits a form
 * without eating the board underneath — pass a larger step only when the
 * panel really carries a table.
 */
const SIDE_WIDTH_CLASSES = {
  right: {
    sm: "data-[side=right]:sm:max-w-sm",
    md: "data-[side=right]:sm:max-w-md",
    lg: "data-[side=right]:sm:max-w-lg",
    xl: "data-[side=right]:sm:max-w-xl",
    "2xl": "data-[side=right]:sm:max-w-2xl",
    "3xl": "data-[side=right]:sm:max-w-3xl",
    "4xl": "data-[side=right]:sm:max-w-4xl",
  },
  left: {
    sm: "data-[side=left]:sm:max-w-sm",
    md: "data-[side=left]:sm:max-w-md",
    lg: "data-[side=left]:sm:max-w-lg",
    xl: "data-[side=left]:sm:max-w-xl",
    "2xl": "data-[side=left]:sm:max-w-2xl",
    "3xl": "data-[side=left]:sm:max-w-3xl",
    "4xl": "data-[side=left]:sm:max-w-4xl",
  },
} as const

export type SidePanelWidth = keyof (typeof SIDE_WIDTH_CLASSES)["right"]

interface SidePanelProps {
  open: boolean
  onClose: () => void
  /** Accessible name; the visible heading stays in the panel content. */
  label: string
  width?: SidePanelWidth
  side?: "left" | "right"
  /** The panel content usually owns its own close control. */
  showCloseButton?: boolean
  className?: string
  children: React.ReactNode
}

/**
 * Floating side panel: a Radix sheet anchored to the screen edge, inset by 1rem
 * so it reads as a card over the board instead of a full-height rail. Shared by
 * every "add / detail" drawer so width and elevation stay consistent.
 */
export function SidePanel({
  open,
  onClose,
  label,
  width = "md",
  side = "right",
  showCloseButton = false,
  className,
  children,
}: SidePanelProps) {
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <SheetContent
        side={side}
        showCloseButton={showCloseButton}
        // A nested message overlay portals to <body>, so Radix sees its clicks
        // as "outside" the sheet and would close the drawer before the overlay's
        // own buttons receive the click. Keep the sheet open while it is up —
        // the overlay is the active layer.
        onPointerDownOutside={(event) => {
          const target = event.target;
          if (
            target instanceof Element &&
            target.closest("[data-message-overlay]")
          ) {
            event.preventDefault();
          }
        }}
        onEscapeKeyDown={(event) => {
          if (typeof document !== "undefined" && document.querySelector("[data-message-overlay]")) {
            event.preventDefault();
          }
        }}
        className={cn(
          "gap-0 overflow-hidden rounded-xl border border-border bg-card p-0 shadow-xl",
          SIDE_CLASSES[side],
          SIDE_WIDTH_CLASSES[side][width],
          className,
        )}
      >
        <SheetTitle className="sr-only">{label}</SheetTitle>
        {children}
      </SheetContent>
    </Sheet>
  )
}
