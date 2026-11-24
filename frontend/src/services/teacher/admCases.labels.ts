import type { AdmCase } from "./admCases.types";
import type { PillTone } from "@/components/ui/pill";

export const ADM_STAGES: {
  stage: string;
  order: number;
  label: string;
  /** Plain-language name — the same wording the case detail's journey uses. */
  journey: string;
  owner: string;
  principalAction: boolean;
  description: string;
}[] = [
  {
    stage: "anecdotal",
    order: 1,
    label: "Anecdotal Report Filed",
    journey: "Concern recorded",
    owner: "Adviser",
    principalAction: false,
    description: "Anecdotal report documenting the learner's concern.",
  },
  {
    stage: "consultation",
    order: 2,
    label: "Consultation & Referral",
    journey: "Consultation",
    owner: "Guidance / Nurse / LRPC",
    principalAction: false,
    description: "Reviewed by Guidance Counselor, School Nurse, or LRPC.",
  },
  {
    stage: "meeting_parents",
    order: 3,
    label: "Meeting with Parents/Guardians",
    journey: "Parent meeting",
    owner: "ADM Coordinator & Teachers",
    principalAction: false,
    description: "Meeting with parents/guardians. Attended → minutes logged; otherwise → home visitation.",
  },
  {
    stage: "home_visitation",
    order: 4,
    label: "Home Visitation (if no meeting)",
    journey: "Home visit",
    owner: "Guidance Counselor",
    principalAction: false,
    description: "Conducted only when parents did not attend the meeting.",
  },
  {
    stage: "certification",
    order: 5,
    label: "Recommendation & Certification",
    journey: "Certification",
    owner: "ADM Coordinator",
    principalAction: false,
    description: "ADM Coordinator records the recommendation and issues the certification.",
  },
  {
    stage: "principal_approval",
    order: 6,
    label: "School Head (Principal) Approval",
    journey: "Principal approval",
    owner: "Principal",
    principalAction: true,
    description: "Principal signs the certification and authorizes module release.",
  },
  {
    stage: "enrollment_monitoring",
    order: 7,
    label: "Modules Completed & Returned",
    journey: "Live monitoring",
    owner: "Student",
    principalAction: false,
    description: "Student completes the modules; Coordinator / Teacher track progress.",
  },
  {
    stage: "completion",
    order: 8,
    label: "Case Closed",
    journey: "Completed",
    owner: "ADM Coordinator",
    principalAction: false,
    description: "Learner has returned and the ADM case is closed.",
  },
];

/**
 * The journey the adviser sees on a case (and in the pipeline legend): the same
 * eight stages in order, worded in plain language. Single source so the case
 * detail, the pipeline and the empty-state legend cannot drift apart.
 */
export const ADM_JOURNEY: { key: string; label: string }[] = ADM_STAGES.map(
  (stage) => ({ key: stage.stage, label: stage.journey }),
);

/** Plain-language name for one stage (falls back to the raw key). */
export function admJourneyLabel(stage: string): string {
  return ADM_JOURNEY.find((step) => step.key === stage)?.label ?? stage;
}

export function stageOrder(stage: string): number {
  return ADM_STAGES.find((s) => s.stage === stage)?.order ?? 2;
}

/** Kanban tint per ADM stage — shared by the empty-state pipeline legend,
// the filled-board columns, and the case cards' pipeline pill. */
const ADM_STAGE_COLORS: Record<string, string> = {
  anecdotal: "#8b5cf6",
  consultation: "#3b82f6",
  meeting_parents: "#0ea5e9",
  home_visitation: "#14b8a6",
  certification: "#f59e0b",
  principal_approval: "#f97316",
  enrollment_monitoring: "#22c55e",
  completion: "#16a34a",
};

export function stageColor(stage: string): string {
  return ADM_STAGE_COLORS[stage] ?? "#f59e0b";
}

/** Shared chip tone per stage — the pipeline legend uses the standard `<Pill>`. */
const ADM_STAGE_TONES: Record<string, PillTone> = {
  anecdotal: "violet",
  consultation: "blue",
  meeting_parents: "sky",
  home_visitation: "teal",
  certification: "amber",
  principal_approval: "indigo",
  enrollment_monitoring: "green",
  completion: "green",
};

const ADM_STAGE_SHORT_LABELS: Record<string, string> = {
  anecdotal: "Concern",
  consultation: "Consultation",
  meeting_parents: "Parent meeting",
  home_visitation: "Home visit",
  certification: "Certification",
  principal_approval: "Approval",
  enrollment_monitoring: "Monitoring",
  completion: "Completed",
};

/** Pipeline legend rows: short label + the full stage name as the tooltip. */
export const ADM_STAGE_LEGEND: {
  key: string;
  label: string;
  hint: string;
  tone: PillTone;
}[] = ADM_STAGES.map((stage) => ({
  key: stage.stage,
  label: ADM_STAGE_SHORT_LABELS[stage.stage] ?? stage.label,
  hint: `Stage ${stage.order} · ${stage.label}`,
  tone: ADM_STAGE_TONES[stage.stage] ?? "neutral",
}));

const GRADE_LABELS: Record<string, string> = {
  G7: "Grade 7",
  G8: "Grade 8",
  G9: "Grade 9",
  G10: "Grade 10",
  G11: "Grade 11",
  G12: "Grade 12",
};

export function gradeLabel(gradeLevel: string): string {
  return GRADE_LABELS[gradeLevel] ?? gradeLevel;
}

export function initialsOf(name: string): string {
  const parts = (name ?? "").trim().split(/\s+/);
  return `${(parts[0] ?? "S").charAt(0)}${(parts[1] ?? "").charAt(0)}`.toUpperCase();
}

export function toneOf(key: string): 1 | 2 | 3 | 4 | 5 {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return ((Math.abs(hash) % 5) + 1) as 1 | 2 | 3 | 4 | 5;
}

export const ELIGIBILITY_LABELS: Record<string, string> = {
  pending: "For review",
  eligible: "Eligible",
  ineligible: "Ineligible",
};

export function stageStatus(caseData: AdmCase, stage: string): string {
  switch (stage) {
    case "anecdotal":
      return "Filed";
    case "consultation":
      return "Referred";
    case "meeting_parents":
      return caseData.meetingAttended === null
        ? "If needed"
        : caseData.meetingAttended
          ? "Attended"
          : "Scheduled";
    case "home_visitation":
      return caseData.hasHomeVisit ? "Done" : "If no meeting";
    case "certification":
      return caseData.certificationIssued
        ? (ELIGIBILITY_LABELS[caseData.eligibilityStatus] ?? "Issued")
        : "Pending issuance";
    case "principal_approval":
      return caseData.approved ? "Signed" : "Pending signature";
    case "enrollment_monitoring":
      return `Modules ${caseData.modulesSubmitted}/${caseData.modulesTotal}`;
    case "completion":
      return caseData.referralStatus === "resolved" ? "Closed" : "Pending";
    default:
      return "";
  }
}

export function caseHeadline(caseData: AdmCase): string {
  if (caseData.referralStatus === "resolved" || caseData.stage === "completion") {
    return "Case closed — the ADM process is complete.";
  }
  switch (caseData.stage) {
    case "anecdotal":
      return "Anecdotal filed — referral is being prepared.";
    case "consultation":
      return "Referral submitted — now waiting for Guidance Counselor / Nurse / LRPC review.";
    case "meeting_parents":
      if (caseData.meetingAttended === true) {
        return "Consultation done — parent meeting attended, moving to Coordinator recommendation.";
      }
      if (caseData.meetingAttended === false) {
        return "Consultation done — parent meeting scheduled, waiting on the ADM Coordinator & Teachers.";
      }
      return "Consultation done — now waiting on the parent meeting.";
    case "home_visitation":
      if (caseData.hasHomeVisit) {
        return "Home visit done — now waiting on Coordinator recommendation & certification.";
      }
      return "Parents did not attend — now waiting on home visitation by the Guidance Counselor.";
    case "certification":
      if (caseData.certificationIssued) {
        return `Certified (${ELIGIBILITY_LABELS[caseData.eligibilityStatus] ?? caseData.eligibilityStatus}) — now waiting for the Principal's signature.`;
      }
      return "Parent engagement done — now waiting for ADM Coordinator recommendation & certification.";
    case "principal_approval":
      if (caseData.approved) {
        return "Principal signed — student is now completing modules under monitoring.";
      }
      if (caseData.eligibilityStatus === "ineligible") {
        return "Not eligible — waiting on the ADM Coordinator to complete the requirements.";
      }
      return "Certification done — now waiting for the Principal's signature.";
    case "enrollment_monitoring":
      return `Approved — now tracking module completion (${caseData.modulesSubmitted}/${caseData.modulesTotal} submitted).`;
    default:
      return "Case is moving through the ADM pipeline.";
  }
}
