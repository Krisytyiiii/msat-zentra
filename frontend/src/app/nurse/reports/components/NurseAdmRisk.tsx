"use client";

import { AdmRiskBoards } from "../../../guidance/adm/components/GuidanceAdmRisk";
import { useNurseAdmRiskData } from "./use-nurse-report-data";

/**
 * Risk section for /nurse/reports — renders the exact boards /guidance/reports
 * uses, fed by the clinic desk's own cases from the shared nurse report
 * payload (no extra request).
 */
export function NurseAdmRisk() {
  return <AdmRiskBoards data={useNurseAdmRiskData()} desk="nurse" />;
}
