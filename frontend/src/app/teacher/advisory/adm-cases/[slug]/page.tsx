"use client";

import { useParams } from "next/navigation";
import { AdmCaseWorkspace } from "../components/AdmCaseWorkspace";

/**
 * Direct-link route for one ADM case. The adviser's desk opens cases inline
 * (see `/teacher/advisory/adm-cases`); this route keeps old links, notification
 * links and bookmarks working.
 */
export default function AdmMonitoringPage() {
  const params = useParams();
  const rawSlug = params?.slug;
  const caseRef = Array.isArray(rawSlug) ? (rawSlug[0] ?? "") : (rawSlug ?? "");

  return <AdmCaseWorkspace caseRef={caseRef} />;
}
