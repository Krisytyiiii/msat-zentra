"use client";

import { useLiveQuery } from "@/lib/api/live";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardList } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { liveQueryOptions } from "@/lib/api/live";
import { useTerm } from "@/lib/term/TermContext";
import { TeacherGateCard } from "../components/TeacherGateCard";
import { useTeacherOverviewGradebook } from "@/services/teacher/overview.service";
import { GradebookCards } from "./components/GradebookCards";
import styles from "./components/gradebook.module.css";

export default function TeacherGradebookPage() {

  const gradebook = useTeacherOverviewGradebook();
  const { activeTerm } = useTerm();
  const termKey = `${activeTerm?.schoolYearId ?? ""}:${activeTerm?.termId ?? ""}`;

  // Same shared-code source as the classes page: subjects only display
  // when this login is linked AND this term is entered there.
  const meQuery = useLiveQuery({
    queryKey: ["teacher-schedule-me", termKey],
    queryFn: async () => {
      const { data } = await apiClient.get<{
        teacherName: { id: string; name: string; code: string | null } | null;
        termGrant: { via: string; attendanceVerified: boolean } | null;
      }>("/api/teacher/schedule/teachers/me");
      return data;
    },
    ...liveQueryOptions,
  });

  const linked = meQuery.data?.teacherName ?? null;
  const termGrant = meQuery.data?.termGrant ?? null;
  const termLabel = activeTerm
    ? `${activeTerm.schoolYearName} · Term ${activeTerm.termNumber}`
    : "this term";

  if (gradebook.isPending || meQuery.isPending) {
    return (
      <section className={styles.page} aria-busy="true" aria-label="Loading gradebook">
        <div className={styles.skelGrid} aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={styles.skelCard}>
              <Skeleton className={styles.skelSubject} />
              <Skeleton className={styles.skelMeta} />
              <div className={styles.skelStats}>
                {[0, 1].map((s) => (
                  <div key={s} className={styles.skelStatCol}>
                    <Skeleton className={styles.skelStatValue} />
                    <Skeleton className={styles.skelStatLabel} />
                  </div>
                ))}
              </div>
              <Skeleton className={styles.skelBar} />
              <Skeleton className={styles.skelProgressLabel} />
              <div className={styles.skelFoot}>
                <Skeleton className={styles.skelBtn} />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (gradebook.isError || !gradebook.data) {
    return (
      <section className={styles.page}>
        <p className={styles.error}>Could not load your gradebook. Check your connection and try again.</p>
      </section>
    );
  }

  // No link code on the classes page => no display on the grading page.
  // Every teacher — master included — must link a code first.
  if (!linked) {
    return (
      <section className={styles.page} aria-label="Gradebook">
        <TeacherGateCard
          title="Link your teacher code"
          subtitle="Grading needs your linked teacher row"
          status="Not linked yet"
          description="Your subjects appear here only after you link the teacher code printed beside your name. Without a code, nothing is displayed — the link button opens the form on My Classes."
          termLabel={termLabel}
          facts={[
            "The code sits beside your name in the administrator's teacher list.",
            "Linking attaches your subject × section load to this login.",
            "Encoding scores and finals lock open once the term is entered.",
          ]}
          actionLabel="Link now"
        />
      </section>
    );
  }

  // Linked but this term not entered on the classes page => still no display.
  // Code entry lives only on /teacher/classes; this page just links there.
  if (!termGrant) {
    return (
      <section className={styles.page} aria-label="Gradebook">
        <TeacherGateCard
          title="Open this term"
          subtitle={`${linked.name} · code on file`}
          status="Term not entered"
          description={`Grading is closed for ${termLabel}. Enter your teacher code once on My Classes and this page fills with the term's subjects.`}
          termLabel={termLabel}
          facts={[
            "Nothing needs relinking — only this term has to be opened.",
            "One code covers every term of this school year.",
            "The term picker in the top bar decides which grid you see.",
          ]}
          actionLabel="Enter term"
        />
      </section>
    );
  }

  if (gradebook.data.classes.length === 0) {
    return (
      <section className={styles.page} aria-label="Gradebook">
        <TeacherGateCard
          icon={ClipboardList}
          title="No classes assigned yet"
          subtitle="Your linked load is empty for this term"
          status="No classes"
          tone="neutral"
          description="Nothing is gradeable yet — the administrator publishes section schedules, and your subjects appear here as soon as your teacher row carries them."
          termLabel={termLabel}
          facts={[
            "Your load follows the linked teacher row, not a manual pick.",
            "Ask the administrator if your subjects are missing from the grid.",
            "Other terms keep their own records — switching term does not erase scores.",
          ]}
          actionLabel="Open classes"
          href="/teacher/classes"
        />
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Gradebook</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {gradebook.data.classes.length === 1
            ? "1 subject"
            : `${gradebook.data.classes.length} subjects`}{" "}
          for this term — open a workspace to encode scores.
        </p>
      </div>
      <GradebookCards
        classes={gradebook.data.classes}
        assessments={gradebook.data.assessments}
        standings={gradebook.data.standings}
      />
    </section>
  );
}
