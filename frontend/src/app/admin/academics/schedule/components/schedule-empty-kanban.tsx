"use client";

import {
  BookOpen,
  CalendarRange,
  GraduationCap,
  Layers,
  Settings2,
} from "lucide-react";
import { EmptyActionCard } from "@/components/shared/empty-action-card";

/**
 * Admin schedule empty states. `/admin/academics/schedule` (no sections yet)
 * and the template workspace (no subjects/teachers yet) render the shared
 * centered action card from `components/shared/empty-action-card` with the
 * real starter actions as rows, so an empty desk never dead-ends on a bare
 * callout.
 */

export { EmptyActionCard } from "@/components/shared/empty-action-card";
export type {
  ActionIcon,
  EmptyAction,
} from "@/components/shared/empty-action-card";

export function ScheduleEmptyKanban() {
  return (
    <EmptyActionCard
      icon={CalendarRange}
      title="No sections yet"
      description="Create the first section inside the schedule template workspace, then build and publish its weekly grid."
      actions={[
        {
          href: "/admin/academics/schedule/subjects",
          title: "Add subjects",
          description: "Create the subjects this year's grids can use",
          icon: BookOpen,
          accent: "text-amber-500",
        },
        {
          href: "/admin/academics/schedule/teachers",
          title: "Add teachers",
          description: "Register the teachers available to take a class",
          icon: GraduationCap,
          accent: "text-sky-500",
        },
        {
          href: "/admin/academics/schedule/sections",
          title: "Create the first section",
          description: "Add its name and grade, then timetable it",
          icon: Layers,
          accent: "text-muted-foreground",
        },
        {
          href: "/admin/academics/schedule/timetable",
          title: "Open schedule template",
          description: "Build and publish each section's weekly grid",
          icon: CalendarRange,
          accent: "text-amber-500",
        },
        {
          href: "/admin/academics/schedule/configure",
          title: "Open school day",
          description: "Set the bell schedule, lunch and breaks",
          icon: Settings2,
          accent: "text-sky-500",
        },
      ]}
    />
  );
}

/**
 * Template-workspace empty state: no subject or no teacher exists yet, so a
 * timetable cell has nothing to offer. The rows jump straight into each add
 * form in the same workspace.
 */
export function TemplateSetupEmptyCard() {
  return (
    <EmptyActionCard
      icon={BookOpen}
      title="Add subjects and teachers first"
      description="A timetable cell needs a subject and a teacher. Add at least one of each, then create or pick a section to fill its weekly grid."
      actions={[
        {
          href: "/admin/academics/schedule/subjects",
          title: "Add subjects",
          description: "Create the subjects this year's grids can use",
          icon: BookOpen,
          accent: "text-amber-500",
        },
        {
          href: "/admin/academics/schedule/teachers",
          title: "Add teachers",
          description: "Register the teachers available to take a class",
          icon: GraduationCap,
          accent: "text-sky-500",
        },
        {
          href: "/admin/academics/schedule/sections",
          title: "Create a section",
          description: "Add its grade and adviser, then timetable it",
          icon: Layers,
          accent: "text-muted-foreground",
        },
      ]}
    />
  );
}
