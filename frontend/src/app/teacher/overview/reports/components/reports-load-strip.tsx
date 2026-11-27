"use client";

import * as React from "react";
import { GraduationCap, Layers, NotebookPen, UserRound } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { toast } from "@/components/ui/sonner";
import { StatDeck, type StatDeckItem } from "@/components/ui/stat-deck";
import { UnlinkCodeDialog } from "@/app/teacher/classes/components/UnlinkCodeDialog";
import type { TeacherReportsPayload } from "@/services/teacher/reports.types";

function gradeNumber(grade: string): number {
  return Number(grade.replace("G", "")) || 0;
}

/**
 * The teacher's load figures (subject assignments, sections, grade levels and
 * the linked code) moved off My Classes onto the reports desk. The code tile
 * keeps the unlink action it had on the classes board.
 */
export function ReportsLoadStrip({
  teacher,
  classes,
}: {
  teacher: TeacherReportsPayload["teacher"];
  classes: TeacherReportsPayload["classes"];
}) {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const sectionCount = new Set(classes.map((row) => row.sectionId)).size;
  const gradeLevels = [...new Set(classes.map((row) => row.gradeLevel))].sort(
    (a, b) => gradeNumber(a) - gradeNumber(b),
  );

  const release = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.delete("/api/teacher/schedule/teachers/me");
      return data;
    },
    onSuccess: () => {
      setConfirmOpen(false);
      for (const key of [
        "teacher-reports",
        "teacher-schedule-me",
        "teacher-my-load",
        "teacher-overview",
        "teacher-overview-gradebook",
        "teacher-overview-secondary",
        "offered-subjects",
        "attendance-sheet-marks",
        "attendance-section-roster",
        "teacher-grading-class",
      ]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
      toast.success({
        title: "Code unlinked",
        description:
          "Your link code was removed — classes, grading, and attendance are now cleared.",
      });
    },
    onError: () => {
      toast.error({
        title: "Could not unlink code",
        description: "Try again in a moment.",
      });
    },
  });

  const items: StatDeckItem[] = [
    {
      key: "classes",
      icon: NotebookPen,
      label: "Subject assignments",
      unit: classes.length === 1 ? "class" : "classes",
      value: classes.length,
      hint: "Subject × section load",
    },
    {
      key: "sections",
      icon: Layers,
      label: "Sections",
      unit: sectionCount === 1 ? "section" : "sections",
      value: sectionCount,
      hint: "Distinct sections you handle",
    },
    {
      key: "grades",
      icon: GraduationCap,
      label: "Grade levels",
      unit: "",
      value: gradeLevels.length,
      hint: gradeLevels.join(", ") || "No grade levels",
    },
    {
      key: "linked",
      icon: UserRound,
      label: "Teacher code",
      unit: "",
      value: teacher.code ?? "—",
      hint: teacher.code ? `${teacher.name} | tap to unlink` : teacher.name,
      onClick: teacher.code ? () => setConfirmOpen(true) : undefined,
      indicator: "none",
      ariaLabel: teacher.code
        ? `Linked teacher ${teacher.name} — unlink code`
        : `Linked teacher ${teacher.name}`,
    },
  ];

  return (
    <>
      <StatDeck ariaLabel="Teaching load at a glance" items={items} />

      {confirmOpen && teacher.code ? (
        <UnlinkCodeDialog
          linked={{ id: teacher.code, name: teacher.name, code: teacher.code }}
          pending={release.isPending}
          onClose={() => {
            if (!release.isPending) setConfirmOpen(false);
          }}
          onConfirm={() => release.mutate()}
        />
      ) : null}
    </>
  );
}
