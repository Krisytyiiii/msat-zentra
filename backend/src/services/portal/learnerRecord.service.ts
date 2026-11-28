import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import { isFinalLock } from "../../lib/grades.js";
import { learnerSectionForTerm, type PortalTerm } from "../../lib/portalAccess.js";
import { COMPONENT_LABELS } from "../../modules/teacher/grading.repository.js";
import { isAdmExempt } from "../adm/attendancePolicy.js";

const COMPONENT_ORDER = ["WRITTEN_WORK", "PERFORMANCE_TASK", "EXAM"];

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface LearnerRecordAssessment {
  id: string;
  title: string;
  maxScore: number;
  dateGiven: string | null;
  rawScore: number | null;
  percentage: number | null;
}

export interface LearnerRecordComponent {
  id: string;
  type: string;
  label: string;
  weight: number;
  earned: number;
  possible: number;
  percentage: number | null;
  assessments: LearnerRecordAssessment[];
}

/**
 * One subject's assessment record for the signed-in learner — the read-only
 * counterpart of the adviser Grade Record. Only the learner's own scores are
 * ever selected; components/weights are the class-wide grading setup.
 */
export async function getLearnerSubjectRecord(
  studentId: string,
  subjectId: string,
  term: PortalTerm,
) {
  const sectionId = await learnerSectionForTerm(studentId, term);
  if (!sectionId) {
    throw new AppError(409, "NOT_PLACED", "Your account is not linked to a class yet");
  }

  const [subject, section, finalRow, onGrid, hasRows, admExempt] = await Promise.all([
    prisma.subject.findUnique({
      where: { id: subjectId },
      select: { id: true, name: true, code: true, category: true },
    }),
    prisma.section.findUnique({
      where: { id: sectionId },
      select: { id: true, name: true, gradeLevel: true },
    }),
    prisma.finalGrade.findFirst({
      where: { studentId, subjectId, termId: term.id },
      select: {
        computedAverage: true,
        transmutedGrade: true,
        remarks: true,
        lockStatus: true,
        finalizedAt: true,
      },
    }),
    prisma.sectionTimetableEntry.findFirst({
      where: { sectionId, subjectId, termId: term.id },
      select: { id: true },
    }),
    prisma.studentGrade.findFirst({
      where: {
        studentId,
        assessment: { gradeComponent: { subjectId, termId: term.id } },
      },
      select: { id: true },
    }),
    isAdmExempt(studentId, term.id),
  ]);

  if (!subject || !section) {
    throw new AppError(404, "SUBJECT_NOT_FOUND", "That subject is not part of your class load");
  }
  if (!finalRow && !onGrid && !hasRows) {
    throw new AppError(404, "SUBJECT_NOT_FOUND", "That subject is not part of your class load");
  }

  const sectionFilter = { OR: [{ sectionId }, { sectionId: null as string | null }] };
  // Same audience rule as grading: a signed ADM learner is scored from `adm`
  // assessments when the subject has any, otherwise from the regular pool.
  let audience: "regular" | "adm" = "regular";
  if (admExempt) {
    const admRows = await prisma.assessment.count({
      where: {
        audience: "adm",
        gradeComponent: { subjectId, termId: term.id },
        ...sectionFilter,
      },
    });
    if (admRows > 0) audience = "adm";
  }

  const components = await prisma.gradeComponent.findMany({
    where: { subjectId, termId: term.id },
    include: {
      assessments: {
        where: { audience, ...sectionFilter },
        select: {
          id: true,
          title: true,
          maxScore: true,
          dateGiven: true,
          studentGrades: {
            where: { studentId },
            select: { rawScore: true },
          },
        },
        orderBy: [{ dateGiven: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  const ordered = [...components].sort(
    (a, b) =>
      COMPONENT_ORDER.indexOf(a.componentType) - COMPONENT_ORDER.indexOf(b.componentType),
  );

  return {
    subject: {
      id: subject.id,
      name: subject.name,
      code: subject.code,
      category: subject.category,
    },
    section: {
      id: section.id,
      name: section.name,
      gradeLevel: section.gradeLevel,
    },
    term,
    components: ordered.map((component) => {
      const assessments = component.assessments.map((assessment) => {
        const raw = assessment.studentGrades[0]?.rawScore ?? null;
        return {
          id: assessment.id,
          title: assessment.title,
          maxScore: assessment.maxScore,
          dateGiven: iso(assessment.dateGiven),
          rawScore: raw,
          percentage:
            raw != null && assessment.maxScore > 0
              ? round((raw / assessment.maxScore) * 100)
              : null,
        };
      });
      const scored = assessments.filter((a) => a.rawScore != null);
      const earned = round(scored.reduce((sum, a) => sum + (a.rawScore ?? 0), 0));
      const possible = round(scored.reduce((sum, a) => sum + a.maxScore, 0));
      return {
        id: component.id,
        type: component.componentType,
        label: COMPONENT_LABELS[component.componentType] ?? component.componentType,
        weight: component.weightPercentage,
        earned,
        possible,
        percentage: possible > 0 ? round((earned / possible) * 100) : null,
        assessments,
      };
    }),
    final: finalRow
      ? {
          computedAverage: finalRow.computedAverage,
          transmutedGrade: finalRow.transmutedGrade,
          remarks: finalRow.remarks,
          lockStatus: finalRow.lockStatus,
          isFinal: isFinalLock(finalRow.lockStatus),
          finalizedAt: iso(finalRow.finalizedAt),
        }
      : null,
  };
}
