"use client";

import type { ReactNode } from "react";
import { InsightCallout } from "@/components/ui/insight-callout";
import type { AdmMonitoringCase } from "@/services/teacher/admMonitoring.service";

const dateLabel = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

/**
 * One plain-language line that tells the reader what deserves attention next,
 * so nobody has to read four stat tiles to know what to do.
 *
 * The adviser reads it as their own to-do list; the coordinator (and principal)
 * read the same facts as supervision — who has to act, not what they must do.
 */
export function CaseNextStep({
  data,
  reader = "adviser",
}: {
  data: AdmMonitoringCase;
  /** Who is reading — decides whether the line is a to-do or an oversight note. */
  reader?: "adviser" | "coordinator";
}) {
  const { progress } = data;
  const remaining = Math.max(0, progress.total - progress.submitted);
  const isCoordinator = reader === "coordinator";

  let message: ReactNode;

  if (progress.total === 0) {
    message = isCoordinator ? (
      <>
        <strong>No modules released yet.</strong> The section adviser still has to release a module
        before this learner&apos;s submissions can be tracked.
      </>
    ) : (
      <>
        <strong>No modules released yet.</strong> Release one from the advisory Modules desk to
        start tracking this learner&apos;s submissions.
      </>
    );
  } else if (progress.overdueCount > 0) {
    message = isCoordinator ? (
      <>
        <strong>
          {progress.overdueCount} {progress.overdueCount === 1 ? "module is" : "modules are"} past
          due.
        </strong>{" "}
        The adviser follows up with the learner and records the submission once it arrives.
      </>
    ) : (
      <>
        <strong>
          {progress.overdueCount} {progress.overdueCount === 1 ? "module is" : "modules are"} past
          due.
        </strong>{" "}
        Follow up with the learner and record the submission once it arrives.
      </>
    );
  } else if (remaining > 0 && progress.nextDueAt) {
    message = isCoordinator ? (
      <>
        <strong>
          {remaining} {remaining === 1 ? "module" : "modules"} still to submit.
        </strong>{" "}
        The next deadline is {dateLabel(progress.nextDueAt)}.
      </>
    ) : (
      <>
        <strong>
          {remaining} {remaining === 1 ? "module" : "modules"} still to submit.
        </strong>{" "}
        The next deadline is {dateLabel(progress.nextDueAt)}.
      </>
    );
  } else if (progress.percent === 100) {
    message = isCoordinator ? (
      <>
        <strong>All released modules are in.</strong> Monitoring continues — check the case file
        for devices and parent meetings before closing the case.
      </>
    ) : (
      <>
        <strong>All released modules are in.</strong> Keep checking in with the learner and their
        parents while monitoring continues.
      </>
    );
  } else {
    message = isCoordinator ? (
      <>
        <strong>{remaining} to go.</strong> The adviser records each submission as the learner turns
        it in.
      </>
    ) : (
      <>
        <strong>{remaining} to go.</strong> Record submissions here as the learner turns them in.
      </>
    );
  }

  return (
    <InsightCallout role="status">{message}</InsightCallout>
  );
}
