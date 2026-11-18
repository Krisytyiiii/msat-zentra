"use client";

import * as React from "react";
import { SubjectCatalogPage } from "@/components/registry/academics/subject-catalog-page";

const GRADES = [7, 8, 9, 10] as const;
const QUERY_KEY = ["record-keeper-subjects"] as const;

export default function RecordKeeperSubjectsPage() {
  return (
    <React.Suspense>
      <SubjectCatalogPage desk="record-keeper" grades={GRADES} queryKey={QUERY_KEY} />
    </React.Suspense>
  );
}
