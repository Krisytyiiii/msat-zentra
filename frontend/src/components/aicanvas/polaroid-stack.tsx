"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Layers, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import styles from "./polaroid-stack.module.css";

export interface PolaroidKeyed {
  id: string;
}

interface Slot {
  x: number;
  y: number;
  rotate: number;
  scale: number;
  opacity: number;
  zIndex: number;
}

export interface PolaroidStackProps<T extends PolaroidKeyed> {
  items: T[];
  /** Accessible name for the card button, e.g. "Open record for Ma. Juana". */
  labelFor: (item: T) => string;
  /** Card body — the polaroid paper itself (photo + caption). */
  renderCard: (item: T, api: { expanded: boolean }) => React.ReactNode;
  /** Accessible group name for the stage. */
  ariaLabel: string;
  /** Shown under the pile; defaults to a fan hint. */
  hint?: React.ReactNode;
  className?: string;
  /** Start with the pile already fanned out. */
  initialExpanded?: boolean;
  /**
   * Overrides the built-in fan/raise click. Use it when clicking a card should
   * drill into something else (e.g. a record opens its attached photos).
   */
  onActivate?: (item: T) => void;
  /** Where a collapsed pile rests. Defaults to the middle of the stage. */
  align?: "center" | "left";
  /**
   * Entrance choreography: mount stacked at the stage's left edge, then spring
   * out into the fan with a small stagger. Used when a record's photos open.
   */
  enterFromLeft?: boolean;
}

const CARD_WIDTH = 208;

/**
 * Polaroid stack — a pile of paper photo cards from AI Canvas
 * (`@aicanvas/polaroid-stack`), rebuilt against this app's `motion` + Tailwind
 * stack so it can take a render prop per card instead of five fixed photos.
 *
 * Collapsed, the cards sit in a casual pile. Clicking any photo (or "Fan out")
 * springs them into a centred arc where every photo is visible and clickable;
 * clicking one brings it to the front of the fan, and clicking it again drops
 * it back into the arc. Hover lifts a card.
 */
export function PolaroidStack<T extends PolaroidKeyed>({
  items,
  labelFor,
  renderCard,
  ariaLabel,
  hint,
  className,
  initialExpanded = false,
  onActivate,
  align = "center",
  enterFromLeft = false,
}: PolaroidStackProps<T>) {
  const reduce = useReducedMotion();
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const [stageWidth, setStageWidth] = React.useState(0);
  const [expanded, setExpanded] = React.useState(initialExpanded);
  /* The photo pulled to the front of the fan. It keeps its slot in the arc,
     so the rest of the pile stays spread out and clickable. */
  const [raisedId, setRaisedId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setStageWidth(width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const count = items.length;
  const midIndex = (count - 1) / 2;
  const cardWidth = Math.min(CARD_WIDTH, stageWidth * 0.6 || CARD_WIDTH);
  /* Fan spacing: cards overlap slightly like a hand-held spread of photos,
     and the spacing shrinks on narrow stages so the arc always fits. */
  const fanSpacing =
    count > 1 && stageWidth > 0
      ? Math.min(
          cardWidth * 0.82,
          Math.max(0, (stageWidth - cardWidth - 24) / (count - 1)),
        )
      : cardWidth * 0.82;
  /* How far the pile sits from the stage's centre when it rests at the left
     edge, and where the photo fan enters from. */
  const leftOffset = Math.max(0, stageWidth / 2 - cardWidth / 2 - 16);
  const anchorOffset = align === "left" && !expanded ? -leftOffset : 0;
  /* Wait for the first measurement before mounting the entrance animation,
     otherwise cards would start from the centre and jump left. */
  const ready = !enterFromLeft || stageWidth > 0;

  /* Identity of the current pile — a new page/filter resets the pile, but a
     re-render of the same records must not collapse it. */
  const pileKey = items.map((item) => item.id).join("|");
  const [openPile, setOpenPile] = React.useState(pileKey);

  // Adjusting state during render (not in an effect) when the pile changes:
  // the desk swapped to another page or search result, so start collapsed.
  if (openPile !== pileKey) {
    setOpenPile(pileKey);
    setExpanded(false);
    setRaisedId(null);
  }

  function slotFor(index: number): Slot {
    const offset = midIndex > 0 ? (index - midIndex) / midIndex : 0;
    const distance = Math.abs(index - midIndex);
    const base: Slot = expanded
      ? {
          // Fan out: a centred arc, the middle photo highest, the outer ones
          // dipping and tilting away — every photo stays visible and clickable.
          x: (index - midIndex) * fanSpacing,
          y: distance ** 1.2 * 20,
          rotate: offset * 13,
          scale: 1 - distance * 0.012,
          opacity: 1,
          zIndex: count - Math.round(distance),
        }
      : {
          // A physical stack of photos: the newest record on top, every older
          // record tucked underneath and peeking out below it.
          x: Math.sin(index * 1.7) * 2.5,
          y: index * 12,
          rotate: (index % 2 === 0 ? -1 : 1) * (1.1 + index * 0.35),
          scale: 1 - index * 0.008,
          opacity: 1,
          zIndex: count - index,
        };

    if (expanded && raisedId === items[index]?.id) {
      // Brought to the front of the fan: straighten, lift and enlarge, but
      // stay in its own slot so the other photos remain reachable.
      return {
        ...base,
        y: base.y - 16,
        rotate: 0,
        scale: base.scale * 1.06,
        zIndex: count + 10,
      };
    }
    return base;
  }

  function handleCardClick(item: T) {
    if (onActivate) {
      onActivate(item);
      return;
    }
    if (!expanded) {
      setExpanded(true);
      setRaisedId(item.id);
      return;
    }
    setRaisedId((current) => (current === item.id ? null : item.id));
  }

  function reset() {
    setRaisedId(null);
    setExpanded(false);
  }

  React.useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") reset();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  if (count === 0) return null;

  const spring = reduce
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 240, damping: 28, mass: 0.9 };

  return (
    <div className={`flex flex-col gap-3 ${className ?? ""}`}>
      <div className={styles.stage} ref={stageRef}>
        <div className="relative flex h-full w-full items-center justify-center">
          <ul
            className="pointer-events-none absolute inset-0 m-0 list-none p-0"
            aria-label={ariaLabel}
            aria-live="off"
            style={{ translate: `${anchorOffset}px 0` }}
          >
            {ready
              ? items.map((item, index) => {
                  const slot = slotFor(index);
                  const isRaised = expanded && raisedId === item.id;
                  return (
                    <li
                      key={item.id}
                      className={styles.slot}
                      style={{
                        zIndex: slot.zIndex,
                        opacity: slot.opacity,
                      }}
                    >
                      <motion.div
                        className="pointer-events-auto"
                        initial={
                          enterFromLeft && !reduce
                            ? { x: -leftOffset, y: 0, rotate: 0, scale: 1 }
                            : false
                        }
                        animate={{
                          x: slot.x,
                          y: slot.y,
                          rotate: slot.rotate,
                          scale: slot.scale,
                        }}
                        whileHover={{
                          y: slot.y - 12,
                          scale: slot.scale * 1.035,
                        }}
                        transition={
                          enterFromLeft && !reduce
                            ? { ...spring, delay: index * 0.045 }
                            : spring
                        }
                      >
                        <button
                          type="button"
                          className={styles.card}
                          onClick={() => handleCardClick(item)}
                          aria-label={labelFor(item)}
                          aria-pressed={isRaised}
                          aria-expanded={expanded}
                        >
                          {renderCard(item, { expanded })}
                        </button>
                      </motion.div>
                    </li>
                  );
                })
              : null}
          </ul>
        </div>
      </div>

      <div className={styles.controls}>
        <p className={styles.hint} role="status">
          {hint ??
            (expanded
              ? "Click a photo to bring it to the front of the fan — click it again to drop it back."
              : `${count} ${count === 1 ? "record" : "records"} stacked — click a photo to fan them out.`)}
        </p>
        {onActivate ? null : (
          <div className={styles.controlRow}>
            <Button
              type="button"
              size="sm"
              variant={expanded ? "outline" : "default"}
              onClick={() => (expanded ? reset() : setExpanded(true))}
            >
              {expanded ? <Layers aria-hidden /> : <Sparkles aria-hidden />}
              {expanded ? "Restack" : "Fan out"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Pile-shaped loading state — the same footprint so the page never jumps. */
export function PolaroidStackSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading records">
      <div className={`${styles.stage} overflow-hidden`}>
        <div className="relative flex h-full w-full items-center justify-center">
          {Array.from({ length: count }).map((_, index) => {
            const mid = (count - 1) / 2;
            const offset = count > 1 ? (index - mid) / mid : 0;
            return (
              <div
                key={index}
                className={styles.slot}
                style={{
                  zIndex: index + 1,
                  transform: `translate(${offset * 9}px, ${offset * 8}px) rotate(${offset * 3.4}deg)`,
                }}
              >
                <div className={styles.skeletonCard}>
                  <Skeleton className={styles.skeletonPhoto} />
                  <div className={styles.skeletonCaption}>
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-2.5 w-20" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-3 w-64 max-w-full" />
        <Skeleton className="h-8 w-24 rounded-md" />
      </div>
    </div>
  );
}
