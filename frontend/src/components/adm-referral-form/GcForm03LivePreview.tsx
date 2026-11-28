"use client";

import * as React from "react";
import type { GcForm03Data } from "@/services/guidance/gcform03.types";
import styles from "./gcform03-live-preview.module.css";

/** Width the official template is laid out at before it is scaled down. */
const PAPER_WIDTH = 852;
/** Typing pause before the workbook is rebuilt — keeps every keystroke cheap. */
const DEBOUNCE_MS = 400;

/**
 * Live, read-only preview of the GCForm-03 sheet: the same official workbook
 * the print/export overlay renders, rebuilt from the form draft and fitted to
 * the panel. Sits in the left half while the fill-up drawer is open, so every
 * edit is visible on the form itself without opening the print overlay.
 */
export function GcForm03LivePreview({
  data,
  title,
}: {
  data: GcForm03Data | null;
  title?: string;
}) {
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const paperRef = React.useRef<HTMLDivElement | null>(null);
  const [html, setHtml] = React.useState<string | null>(null);
  const [paperHeight, setPaperHeight] = React.useState(0);
  const [box, setBox] = React.useState({ w: 0, h: 0 });
  const [building, setBuilding] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (!data) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setHtml(null);
      setBuilding(false);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    let cancelled = false;
    setBuilding(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const [{ buildFilledGcForm03Workbook }, { renderGcForm03SheetHtml }] =
            await Promise.all([
              import("@/app/guidance/adm/components/gcform03-workbook"),
              import("@/app/guidance/adm/components/gcform03-sheet-html"),
            ]);
          const wb = await buildFilledGcForm03Workbook(data);
          if (cancelled) return;
          setHtml(renderGcForm03SheetHtml(wb));
          setFailed(false);
        } catch {
          if (!cancelled) setFailed(true);
        } finally {
          if (!cancelled) setBuilding(false);
        }
      })();
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [data]);

  // Natural paper height at PAPER_WIDTH — the fit scale needs it to keep the
  // whole sheet on screen instead of scrolling inside the panel.
  React.useLayoutEffect(() => {
    const node = paperRef.current;
    if (!node) return;
    setPaperHeight(node.offsetHeight);
  }, [html]);

  React.useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const measure = () => setBox({ w: node.clientWidth, h: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const scale = box.w > 0 ? box.w / PAPER_WIDTH : 1;
  const paperH = paperHeight * scale;

  return (
    <section className={styles.panel} aria-label="Live preview of the referral form">
      <header className={styles.header}>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>Live preview</p>
          <p className={styles.title} title={title}>
            {title ?? "GCForm-03 — referral form"}
          </p>
        </div>
        <span
          className={`${styles.status}${building ? ` ${styles.statusBusy}` : ""}`}
          role="status"
        >
          {building ? "Updating…" : failed ? "Preview unavailable" : "Up to date"}
        </span>
      </header>
      <div
        ref={viewportRef}
        className={styles.viewport}
        aria-busy={building || undefined}
      >
        {html ? (
          <>
            {/* Spacer carries the scaled height so the panel scrolls through
                the full sheet while the paper stays fixed-width and scaled. */}
            <div style={{ height: paperH, width: "100%" }} aria-hidden />
            <div
              className={styles.paper}
              style={{
                width: PAPER_WIDTH,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
            >
              <div
                ref={paperRef}
                className="gcform03-print-sheet"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>
          </>
        ) : (
          <p className={styles.placeholder}>
            {failed
              ? "The Excel preview could not be prepared. Keep editing — it retries on the next change."
              : "Preparing the filled form…"}
          </p>
        )}
      </div>
    </section>
  );
}
