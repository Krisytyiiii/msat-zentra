"use client";

import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { cn } from "@/lib/utils";
import styles from "./glass-dock.module.css";

export type GlassDockItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Small count pill (e.g. the admin pending-approvals queue). */
  badge?: string;
  /** Red "new or updated" marker (from each desk's nav-counts feed). */
  dot?: boolean;
};

export type GlassDockGroup = {
  label: string;
  items: GlassDockItem[];
};

/** Base tile edge and the hovered edge (px) the dock magnifies to. */
const BASE_SIZE = 40;
const PEAK_SIZE = 58;
/** Cursor distance (px) over which a tile reaches full magnification. */
const MAGNIFY_RADIUS = 130;
/** Shared per-browser preference: expanded (labels) or icon-only. */
const EXPANDED_KEY = "zentra.dock.expanded";

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduce(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return reduce;
}

/** null = the user never chose; then desktop opens expanded, mobile collapsed. */
let storedExpanded: boolean | null = null;
let storedExpandedRead = false;
const expandedListeners = new Set<() => void>();

function readExpandedPreference(): boolean | null {
  if (!storedExpandedRead && typeof window !== "undefined") {
    storedExpandedRead = true;
    try {
      const stored = window.localStorage.getItem(EXPANDED_KEY);
      if (stored === "1") storedExpanded = true;
      else if (stored === "0") storedExpanded = false;
    } catch {
      // Private mode / storage disabled: fall back to the default.
    }
  }
  return storedExpanded;
}

function subscribeExpanded(listener: () => void): () => void {
  expandedListeners.add(listener);
  return () => {
    expandedListeners.delete(listener);
  };
}

function setExpandedPreference(next: boolean) {
  storedExpanded = next;
  storedExpandedRead = true;
  try {
    window.localStorage.setItem(EXPANDED_KEY, next ? "1" : "0");
  } catch {
    // Private mode / storage disabled: the session still toggles.
  }
  for (const listener of expandedListeners) listener();
}

/**
 * Whether the dock is in its labelled (expanded) form. Reads the remembered
 * choice through an external store so SSR hydration never mismatches; with no
 * stored choice it opens expanded on desktop and icon-only on narrow screens
 * (where the expanded panel floats over the page).
 */
function useDockExpanded() {
  const preference = React.useSyncExternalStore(
    subscribeExpanded,
    readExpandedPreference,
    () => null,
  );
  const [mobile, setMobile] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const sync = () => setMobile(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const expanded = preference === null ? !mobile : preference;

  return { expanded, mobile, setExpanded: setExpandedPreference };
}

/**
 * Splits an item href into its path and query string, so dock entries that
 * point at one route with a different `?view=` (the timetable template panels)
 * can still be told apart.
 */
function splitHref(href: string): { path: string; query: string } {
  const queryStart = href.indexOf("?");
  return queryStart === -1
    ? { path: href, query: "" }
    : { path: href.slice(0, queryStart), query: href.slice(queryStart + 1) };
}

/**
 * The single page a desk is on: the longest matching nav href (so nested
 * pages win over their parent entry and an exact root never lights a child).
 * Hrefs carrying a query must match every one of their params, which keeps
 * the same-route query variants (template views) mutually exclusive.
 */
function resolveActiveHref(
  groups: GlassDockGroup[],
  pathname: string,
  params: URLSearchParams,
): string | null {
  let best: string | null = null;
  for (const group of groups) {
    for (const item of group.items) {
      const { path, query } = splitHref(item.href);
      let matches: boolean;
      if (query) {
        matches = pathname === path;
        for (const [key, value] of new URLSearchParams(query)) {
          if (params.get(key) !== value) {
            matches = false;
            break;
          }
        }
      } else {
        matches = pathname === path || pathname.startsWith(`${path}/`);
      }
      if (!matches) continue;
      if (best === null || item.href.length > best.length) best = item.href;
    }
  }
  return best;
}

function DockTile({
  item,
  index,
  active,
  expanded,
  mouseY,
  reduce,
  onEnter,
  onLeave,
}: {
  item: GlassDockItem;
  index: number;
  active: boolean;
  expanded: boolean;
  mouseY: MotionValue<number>;
  reduce: boolean;
  onEnter: (label: string, element: HTMLElement) => void;
  onLeave: () => void;
}) {
  const ref = React.useRef<HTMLLIElement>(null);
  const Icon = item.icon;
  const plain = expanded || reduce;

  // Cursor distance to this tile's centre, recomputed every pointer move.
  const distance = useTransform(mouseY, (y) => {
    if (!Number.isFinite(y)) return MAGNIFY_RADIUS * 2;
    const bounds = ref.current?.getBoundingClientRect();
    if (!bounds) return MAGNIFY_RADIUS * 2;
    return y - (bounds.top + bounds.height / 2);
  });
  const targetSize = useTransform(
    distance,
    [-MAGNIFY_RADIUS, 0, MAGNIFY_RADIUS],
    [BASE_SIZE, PEAK_SIZE, BASE_SIZE],
    { clamp: true },
  );
  const size = useSpring(targetSize, {
    stiffness: 320,
    damping: 26,
    mass: 0.35,
  });
  const iconScale = useTransform(size, [BASE_SIZE, PEAK_SIZE], [1, 1.26]);

  return (
    <li
      ref={ref}
      className={styles.slot}
      style={{ "--tile-index": index } as React.CSSProperties}
      onPointerEnter={
        expanded ? undefined : (event) => onEnter(item.title, event.currentTarget)
      }
      onPointerLeave={expanded ? undefined : onLeave}
      onFocus={
        expanded ? undefined : (event) => onEnter(item.title, event.currentTarget)
      }
      onBlur={expanded ? undefined : onLeave}
    >
      {/* The magnify spring writes width/height (and the icon's scale)
          straight onto the DOM node, so React never clears them when the
          style prop goes away. Remounting on a mode swap drops those stale
          inline styles — otherwise a collapsed-then-expanded dock keeps the
          40px tile and the label collapses to zero width. */}
      <motion.div
        key={expanded ? "wide" : "icon"}
        className={cn(styles.tileWrap, expanded && styles.tileWrapWide)}
        style={plain ? undefined : { width: size, height: size }}
      >
        <Link
          href={item.href}
          className={cn(
            styles.tile,
            expanded && styles.tileWide,
            active && styles.tileActive,
          )}
          aria-current={active ? "page" : undefined}
          aria-label={item.dot ? `${item.title} — new activity` : item.title}
          title={expanded ? undefined : item.title}
        >
          <motion.span
            className={styles.icon}
            style={plain ? undefined : { scale: iconScale }}
          >
            <Icon size={18} strokeWidth={1.9} aria-hidden />
          </motion.span>
          {expanded ? <span className={styles.label}>{item.title}</span> : null}
          {item.dot ? (
            <span
              className={cn(styles.dot, expanded && styles.dotInline)}
              aria-hidden
            />
          ) : null}
          {item.badge ? (
            <span
              className={cn(styles.badge, expanded && styles.badgeInline)}
              aria-hidden
            >
              {item.badge}
            </span>
          ) : null}
          {active && !expanded ? <span className={styles.here} aria-hidden /> : null}
        </Link>
      </motion.div>
    </li>
  );
}

/**
 * Floating glass navigation shared by every desk — pinned to the left edge of
 * the viewport, replacing the old left rail and top tab bar at every
 * breakpoint. It opens expanded with an icon + label per entry (so the desk is
 * readable without hovering) and collapses to the macOS-dock style icon rail,
 * where icons magnify with cursor proximity and a tooltip names the hovered
 * entry. The choice is remembered per browser; labels stay hidden on narrow
 * screens unless the user expands the dock, which then floats over the page.
 */
export function GlassDock({
  groups,
  pathname,
  search = "",
  ariaLabel = "Desk sections",
}: {
  groups: GlassDockGroup[];
  pathname: string;
  /** Current query string (no `?`); lets `?view=` variants highlight correctly. */
  search?: string;
  ariaLabel?: string;
}) {
  const mouseY = useMotionValue(Number.POSITIVE_INFINITY);
  const reduce = usePrefersReducedMotion();
  const { expanded, mobile, setExpanded } = useDockExpanded();
  const navRef = React.useRef<HTMLElement>(null);
  // Tooltip label + its centre offset from the dock's top edge.
  const [tip, setTip] = React.useState<{ label: string; top: number } | null>(
    null,
  );

  const toggle = React.useCallback(() => {
    // Any collapsed-mode tooltip goes away with the switch.
    setTip(null);
    setExpanded(!expanded);
  }, [expanded, setExpanded]);

  // Tell the shells how much left gutter the dock needs (see globals.css).
  React.useEffect(() => {
    const root = document.documentElement;
    root.dataset.dock = expanded ? "expanded" : "collapsed";
    return () => {
      delete root.dataset.dock;
    };
  }, [expanded]);

  const showTip = React.useCallback((label: string, element: HTMLElement) => {
    const nav = navRef.current;
    if (!nav) return;
    const navRect = nav.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    setTip({ label, top: rect.top - navRect.top + rect.height / 2 });
  }, []);

  const hideTip = React.useCallback(() => setTip(null), []);

  const activeHref = React.useMemo(
    () => resolveActiveHref(groups, pathname, new URLSearchParams(search)),
    [groups, pathname, search],
  );

  // Flattened render list: group headings (or hairlines when collapsed),
  // then tiles.
  const entries = React.useMemo(() => {
    const out: Array<
      | { kind: "sep"; key: string; label: string }
      | { kind: "item"; key: string; item: GlassDockItem }
    > = [];
    groups.forEach((group, groupIndex) => {
      if (expanded || groupIndex > 0) {
        out.push({
          kind: "sep",
          key: `sep-${groupIndex}`,
          label: group.label,
        });
      }
      group.items.forEach((item) =>
        out.push({ kind: "item", key: item.href, item }),
      );
    });
    return out;
  }, [groups, expanded]);

  // Stable signature of the links themselves (dots are ignored). The dock
  // remounts its list only when the desk's links swap, which replays the
  // staggered entrance instead of a hard pop-in.
  const navKey = React.useMemo(
    () => groups.map((group) => `${group.label}:${group.items.map((i) => i.href).join(",")}`).join("|"),
    [groups],
  );

  const overlay = expanded && mobile;

  return (
    <>
      {overlay ? (
        <button
          type="button"
          className={styles.backdrop}
          aria-label="Close navigation"
          onClick={toggle}
        />
      ) : null}
      <div className={styles.anchor}>
        <motion.nav
          ref={navRef}
          className={cn(
            styles.dock,
            expanded && styles.dockExpanded,
            overlay && styles.dockOverlay,
          )}
          aria-label={ariaLabel}
          onPointerMove={(event) => {
            if (!reduce && !expanded) mouseY.set(event.clientY);
          }}
          onPointerLeave={() => {
            mouseY.set(Number.POSITIVE_INFINITY);
            hideTip();
          }}
          initial={reduce ? false : { opacity: 0, x: -28 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 28, mass: 0.6 }}
        >
          <div className={styles.row}>
            <ul className={styles.list} key={navKey}>
              {entries.map((entry, index) =>
                entry.kind === "sep" ? (
                  expanded ? (
                    <li
                      key={entry.key}
                      className={styles.groupLabel}
                      style={{ "--tile-index": index } as React.CSSProperties}
                    >
                      {entry.label}
                    </li>
                  ) : (
                    <li
                      key={entry.key}
                      className={styles.sepItem}
                      style={{ "--tile-index": index } as React.CSSProperties}
                      aria-hidden
                    />
                  )
                ) : (
                  <DockTile
                    key={entry.key}
                    item={entry.item}
                    index={index}
                    active={entry.item.href === activeHref}
                    expanded={expanded}
                    mouseY={mouseY}
                    reduce={reduce}
                    onEnter={showTip}
                    onLeave={hideTip}
                  />
                ),
              )}
            </ul>
          </div>
          <button
            type="button"
            className={styles.toggle}
            onClick={toggle}
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse navigation" : "Expand navigation"}
            title={expanded ? "Collapse navigation" : "Expand navigation"}
          >
            {expanded ? (
              <ChevronLeft size={16} strokeWidth={2} aria-hidden />
            ) : (
              <ChevronRight size={16} strokeWidth={2} aria-hidden />
            )}
            {expanded ? <span className={styles.toggleLabel}>Collapse</span> : null}
          </button>
          {tip && !expanded ? (
            <span
              className={styles.tip}
              style={{ top: tip.top }}
              aria-hidden
            >
              {tip.label}
            </span>
          ) : null}
        </motion.nav>
      </div>
    </>
  );
}
