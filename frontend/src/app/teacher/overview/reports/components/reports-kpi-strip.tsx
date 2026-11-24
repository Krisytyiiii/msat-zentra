"use client";

import {
  AlertTriangle,
  BookOpen,
  CalendarCheck,
  ClipboardList,
  GraduationCap,
  Users,
} from "lucide-react";
import { StatDeck, type StatDeckItem } from "@/components/ui/stat-deck";
import type { TeacherReportsPayload } from "@/services/teacher/reports.types";
import { formatGrade, formatPercent } from "./reports-format";

/**
 * Term KPIs for the teacher reports desk — rendered through the shared
 * `StatDeck`, the same stat strip every other desk uses.
 */
export function ReportsKpiStrip({ summary }: { summary: TeacherReportsPayload["summary"] }) {
  const incomplete = summary.assessments - summary.gradedAssessments;

  const tiles: StatDeckItem[] = [
    {
      key: "classes",
      icon: BookOpen,
      label: "Classes",
      unit: "classes",
      value: summary.classes,
      hint: "Subject × section load",
    },
    {
      key: "learners",
      icon: Users,
      label: "Learners",
      unit: "learners",
      value: summary.learners,
      hint: "Unique learners in your classes",
    },
    {
      key: "average",
      icon: GraduationCap,
      label: "Class average",
      unit: "",
      value: formatGrade(summary.transmutedAverage, 1),
      hint: `Computed ${formatGrade(summary.average, 1)} · pass ${formatPercent(
        summary.passRate,
      )}`,
      tone:
        summary.transmutedAverage != null && summary.transmutedAverage < 75
          ? "red"
          : undefined,
    },
    {
      key: "attendance",
      icon: CalendarCheck,
      label: "Attendance",
      unit: "",
      value: formatPercent(summary.attendanceRate),
      hint: `${summary.attendancePresent}/${summary.attendanceTotal} present this term`,
      tone:
        summary.attendanceRate != null && summary.attendanceRate < 0.8
          ? "red"
          : undefined,
    },
    {
      key: "assessments",
      icon: ClipboardList,
      label: "Assessments graded",
      unit: "",
      value: `${summary.gradedAssessments}/${summary.assessments}`,
      hint: `${incomplete} not fully scored`,
      tone: incomplete > 0 ? "amber" : undefined,
    },
    {
      key: "risk",
      icon: AlertTriangle,
      label: "High-risk learners",
      unit: "learners",
      value: summary.highRisk,
      hint: `${summary.highRiskAdvisees} advisees · ${summary.highRiskSubjectStudents} subject students`,
      tone: summary.highRisk > 0 ? "red" : undefined,
    },
  ];

  return (
    <StatDeck
      columns={6}
      ariaLabel="Term report KPIs"
      items={tiles}
    />
  );
}
