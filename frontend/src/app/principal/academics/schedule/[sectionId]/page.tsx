"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrincipalEmptyCard } from "../../../components/PrincipalEmptyCard";
import { ScheduleReadonlyGrid } from "./components/schedule-readonly-grid";
import { SectionReviewHero } from "./components/section-review-hero";
import { SectionScheduleSkeleton } from "./components/section-schedule-skeleton";
import { usePrincipalScheduleSection } from "./components/use-principal-schedule-section";

export default function PrincipalSectionSchedulePage() {
  const params = useParams<{ sectionId: string }>();
  const sectionRef = params.sectionId;
  const {
    sectionsQuery,
    configQuery,
    submission,
    config,
    rows,
    entryByKey,
    counts,
    emptyCount,
    statusMeta,
  } = usePrincipalScheduleSection(sectionRef);

  if (sectionsQuery.isPending || configQuery.isPending) {
    return <SectionScheduleSkeleton />;
  }
  if (sectionsQuery.isError || !sectionsQuery.data) {
    return (
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <p role="alert" className="text-sm text-destructive">
          Could not load schedule.
        </p>
      </section>
    );
  }
  if (!submission) {
    return (
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <PrincipalEmptyCard
          icon={CalendarDays}
          title="Section not found"
          hint="This section does not exist or is outside grades 7–12."
          action={
            <Button asChild>
              <Link href="/principal/academics/schedule">Back to sections</Link>
            </Button>
          }
        />
      </section>
    );
  }

  return (
    <section className="flex w-full flex-col gap-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2 h-6 px-2 text-xs">
          <Link href="/principal/academics/schedule">
            <ArrowLeft size={14} aria-hidden />
            Back to sections
          </Link>
        </Button>
      </div>

      <SectionReviewHero
        submission={submission}
        statusMeta={statusMeta}
        counts={counts}
        emptyCount={emptyCount}
      />

      <ScheduleReadonlyGrid config={config} rows={rows} entryByKey={entryByKey} />
    </section>
  );
}
