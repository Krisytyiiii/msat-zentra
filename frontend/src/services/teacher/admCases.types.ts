export interface AdmCase {
  id: string;
  /** True once guidance has opened the case file (AdmLearnerProfile). */
  hasCase: boolean;
  studentId: string;
  studentName: string;
  lrn: string;
  /** Persisted sprite mascot (StudentMascot pool); null falls back to the derived one. */
  mascot: string | null;
  gradeLevel: string;
  section: string;
  photoUrl: string | null;
  referralId: string;

  referralStatus:
    | "pending"
    | "in_progress"
    | "escalated"
    | "info_requested"
    | "follow_up"
    | "resolved"
    | "dismissed";
  consultReviewer?: string | null;
  stage: string;
  stageLabel: string;
  eligibilityStatus: "pending" | "eligible" | "ineligible";
  approved: boolean;
  approvedAt: string | null;
  /** Term the case was filed in — the desk shows every term of the school year. */
  termNumber: number;
  /** When the referral was filed (ISO). */
  referredAt?: string | null;
  datePrepared: string | null;
  meetingAttended: boolean | null;
  lastMeetingAt?: string | null;
  hasHomeVisit: boolean;
  modulesSubmitted: number;
  modulesTotal: number;
  lastModuleAt?: string | null;
  devicesIssued: number;
  devicesReturned: number;
  certificationIssued: boolean;
  certificationAt?: string | null;
  timeline?: {
    label: string;
    detail?: string | null;
    date: string;
    at: string;
    action: string;
    byRole: string | null;
    source: "referrals" | "counseling_sessions" | "adm_parent_meetings" | "case";
    stage?: string | null;
    homeVisit?: boolean;
  }[];
}

export interface MyAdmCasesSummary {
  total: number;
  filtered: number;
  approved?: number;
  monitoring?: number;
  closed?: number;
  modulesSubmitted?: number;
  modulesTotal?: number;
  devicesOut?: number;
}

export interface MyAdmCasesPage {
  cases: AdmCase[];
  total: number;
  unfilteredTotal: number;
  page: number;
  totalPages: number;
  pageSize: number;
  /** School-year aggregates for the adviser's overview panel. */
  summary?: MyAdmCasesSummary;
  /** Case count per ADM stage key. */
  stageCounts?: Record<string, number>;
  /** Newest cases in scope (3), any status — the overview's recent list. */
  recent?: AdmCase[];
}
