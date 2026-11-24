"use client";

import * as React from "react";
import { NAV_ICONS } from "@/components/nav/sidebar-icons";
import type { TeacherNavMode } from "@/components/teacher-sidebar";
import { useSession } from "@/lib/auth/useSession";
import { useTeacherOverview } from "@/services/teacher/overview.service";
import { useCachedAdviser } from "@/services/teacher/flagCache";
import styles from "../record-teacher.module.css";

/**
 * Adviser-only topbar pill that narrows the desk rail: Advisory focus shows the
 * overview + advisory links, Workspace focus shows the overview + class links.
 * The label names the view the click switches to, so the advisory swing reads
 * "Advisory" until it is active and "Workspace" while it is.
 */
export function TeacherNavModePill({
  mode,
  onToggle,
}: {
  mode: TeacherNavMode;
  onToggle: () => void;
}) {
  const session = useSession();
  const overview = useTeacherOverview();
  const cachedAdviser = useCachedAdviser(session?.sub);
  // The adviser flag only resolves in the browser (cache + async query), so gate
  // the first render exactly like TeacherBamaPill to avoid a hydration mismatch.
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const isAdviser = overview.data?.isAdviser ?? cachedAdviser ?? false;

  if (!mounted || !isAdviser) return null;

  const target: "Advisory" | "Workspace" =
    mode === "advisory" ? "Workspace" : "Advisory";
  const Icon = target === "Advisory" ? NAV_ICONS.advisoryList : NAV_ICONS.class;

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`${styles.modePill} ${styles.bamaToneAmber}`}
      aria-label={`Switch the sidebar to ${target} links`}
      title={`Switch the sidebar to ${target} links`}
    >
      <span className={styles.modePillIcon} aria-hidden>
        <Icon size={14} strokeWidth={2} />
      </span>
      <span className={styles.modePillLabel}>{target}</span>
    </button>
  );
}
