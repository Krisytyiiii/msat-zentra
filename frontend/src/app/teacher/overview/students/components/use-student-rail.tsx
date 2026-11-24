"use client";
import * as React from "react";
import { BookOpen, Users } from "lucide-react";
import { useStudentList } from "@/services/teacher/studentList.service";
import type { ClassPick } from "@/services/teacher/studentList.types";
export function useStudentRail() {
  const [picked, setPicked] = React.useState<ClassPick | null>(null);
  const roster = useStudentList(picked);
  const classes = React.useMemo(() => roster.data?.classes ?? [], [roster.data]);
  const advisorySections = React.useMemo(
    () => roster.data?.advisorySections ?? [],
    [roster.data],
  );
  const rail = React.useMemo<ClassPick[]>(
    () => [
      ...advisorySections.map((s): ClassPick => ({ kind: "advisory", id: s.id })),
      ...classes.map((c): ClassPick => ({ kind: "class", id: c.id })),
    ],
    [advisorySections, classes],
  );
  const activePick =
    picked && rail.some((r) => r.kind === picked.kind && r.id === picked.id)
      ? picked
      : null;
  const selectedClass =
    activePick?.kind === "class"
      ? (classes.find((c) => c.id === activePick.id) ?? null)
      : null;
  const selectedAdvisory =
    activePick?.kind === "advisory"
      ? (advisorySections.find((s) => s.id === activePick.id) ?? null)
      : null;
  const [sectionQuery, setSectionQuery] = React.useState("");
  const railGroups = React.useMemo(() => {
    const q = sectionQuery.trim().toLowerCase();
    const advisoryKids = advisorySections
      .filter((s) =>
        q ? `advisory ${s.name} ${s.gradeLevel}`.toLowerCase().includes(q) : true,
      )
      .map((s) => ({
        value: `advisory:${s.id}`,
        label: `${s.name} · ${s.studentCount}`,
        icon: <Users size={16} strokeWidth={1.8} aria-hidden="true" />,
      }));
    const codeCounts = new Map<string, number>();
    for (const c of classes) {
      codeCounts.set(c.code, (codeCounts.get(c.code) ?? 0) + 1);
    }
    const subjectKids = classes
      .filter((c) =>
        q
          ? `${c.code} ${c.subject} ${c.section} ${c.gradeLevel}`.toLowerCase().includes(q)
          : true,
      )
      .map((c) => ({
        value: `class:${c.id}`,
        label:
          (codeCounts.get(c.code) ?? 0) > 1 ? `${c.code} · ${c.section}` : c.code,
        icon: <BookOpen size={16} strokeWidth={1.8} aria-hidden="true" />,
      }));
    const groups: { label: string; children: typeof advisoryKids }[] = [];
    if (advisoryKids.length > 0) groups.push({ label: "Advisory", children: advisoryKids });
    if (subjectKids.length > 0) groups.push({ label: "Subjects", children: subjectKids });
    return groups;
  }, [advisorySections, classes, sectionQuery]);
  const railEmpty = railGroups.length === 0;
  const activeRailValue = activePick ? `${activePick.kind}:${activePick.id}` : "";
  const rows = React.useMemo(() => roster.data?.students ?? [], [roster.data]);

  return {
    picked,
    setPicked,
    roster,
    classes,
    advisorySections,
    rail,
    activePick,
    selectedClass,
    selectedAdvisory,
    sectionQuery,
    setSectionQuery,
    railGroups,
    railEmpty,
    activeRailValue,
    rows,
  };
}
