"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { KanbanBoard } from "@/components/ui/kanban-board";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UserRound } from "lucide-react";
import { Pill } from "@/components/ui/pill";
import menuStyles from "./timetable-menu.module.css";

export interface LinkedName {
  id: string;
  name: string;
  code: string | null;
}

function CodePill({ code }: { code: string }) {
  return (
    <Pill tone="amber" label="Teacher code">
      {code}
    </Pill>
  );
}

const MENU_PANEL =
  "absolute top-0 right-12 z-50 max-h-[calc(100dvh-6rem)] w-72 overflow-y-auto rounded-xl bg-card text-card-foreground shadow-xl ring-1 ring-border sm:w-80";

/**
 * The small code-link card on My Classes: shows which teacher-name code this
 * login is linked to and lets the teacher unlink it. The timetable itself is
 * managed by the administrator desk — teachers never edit it.
 */
export function TimetableSidebar({
  linked,
  onReleaseRequest,
}: {
  linked: LinkedName;
  onReleaseRequest: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const railRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (target?.closest?.('[data-slot="popover-content"], [data-slot="tooltip-content"]')) {
        return;
      }
      if (railRef.current && !railRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const title = `Linked as ${linked.name}`;

  return (
    <TooltipProvider delayDuration={100}>
      <div
        ref={railRef}
        className="flex flex-row justify-end gap-2 self-start lg:sticky lg:top-16 lg:flex-col lg:items-end"
      >
        <div className="relative">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                aria-expanded={open}
                aria-haspopup="dialog"
                aria-label={open ? `Close ${title}` : `Open ${title}`}
                className={`relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border transition-colors ${
                  open
                    ? "border-amber-500/60 bg-amber-500/10"
                    : "border-border bg-card hover:border-amber-500/60 hover:bg-amber-500/10"
                }`}
              >
                <span className="text-amber-500" aria-hidden>
                  <UserRound size={16} />
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" sideOffset={10}>
              <span className="font-medium">Linked teacher</span>
              <span className="opacity-60">
                {linked.code ? `${linked.name} · ${linked.code}` : linked.name}
              </span>
            </TooltipContent>
          </Tooltip>
          <div
            role="dialog"
            aria-label={title}
            aria-hidden={open ? undefined : true}
            className={`${MENU_PANEL} ${menuStyles.menu} ${open ? menuStyles.menuOpen : menuStyles.menuClosed}`}
          >
            <KanbanBoard
              title={title}
              icon={
                <span className="text-amber-500" aria-hidden>
                  <UserRound size={14} />
                </span>
              }
              description={
                <>
                  {linked.code ? <CodePill code={linked.code} /> : null}
                  {" "}Your classes follow this teacher code.
                </>
              }
              className="border-0"
              footer={
                <div className="flex justify-end gap-1.5 px-1 pb-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onReleaseRequest}
                    className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                  >
                    Unlink code
                  </Button>
                </div>
              }
            >
              <p className="px-1 text-xs text-muted-foreground">
                Unlinking clears your classes, grading, and attendance until you link again.
              </p>
            </KanbanBoard>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
