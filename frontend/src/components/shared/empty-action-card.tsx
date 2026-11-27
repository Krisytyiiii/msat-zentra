"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import { ChevronRight } from "lucide-react";

/**
 * Shared empty-state card: one centered card with a heading and the real
 * starter actions as rows, so an empty desk never dead-ends on a bare
 * callout. Used by the admin schedule desks and the teacher grading
 * workspace.
 */

export type ActionIcon = ComponentType<{
  size?: number | string;
  className?: string;
  "aria-hidden"?: boolean;
}>;

export interface EmptyAction {
  href?: string;
  onClick?: () => void;
  title: string;
  description: string;
  icon: ActionIcon;
  accent?: string;
}

function ActionRow({
  href,
  onClick,
  title,
  description,
  icon: Icon,
  accent,
}: EmptyAction) {
  const content = (
    <>
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
        aria-hidden
      >
        <Icon size={14} className={accent} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] font-semibold leading-snug text-foreground">
          {title}
        </span>
        <span className="truncate text-[12px] leading-snug text-muted-foreground">
          {description}
        </span>
      </span>
      <ChevronRight
        size={15}
        aria-hidden
        className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
      />
    </>
  );

  const className =
    "group flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5 text-left transition-colors hover:border-primary/60 hover:bg-muted/40";

  if (href) {
    return (
      <Link href={href} aria-label={`Open ${title}`} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} aria-label={title} className={className}>
      {content}
    </button>
  );
}

export function EmptyActionCard({
  icon: HeaderIcon,
  title,
  description,
  actions,
}: {
  icon: ActionIcon;
  title: string;
  description: string;
  actions: EmptyAction[];
}) {
  return (
    <div className="w-full max-w-md">
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm [font-family:var(--font-inter)]">
        <div className="flex items-start gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500"
            aria-hidden
          >
            <HeaderIcon size={17} />
          </span>
          <div className="min-w-0">
            <h2 className="m-0 text-[0.9375rem] font-bold tracking-[-0.01em] text-foreground">
              {title}
            </h2>
            <p className="m-0 mt-1 text-[0.8125rem] leading-[1.45] text-muted-foreground">
              {description}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {actions.map((action) => (
            <ActionRow key={action.href ?? action.title} {...action} />
          ))}
        </div>
      </div>
    </div>
  );
}
