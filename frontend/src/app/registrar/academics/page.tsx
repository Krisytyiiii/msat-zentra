"use client";

import * as React from "react";
import { SubjectCatalogPage } from "@/components/registry/academics/subject-catalog-page";

const GRADES = [11, 12] as const;
const QUERY_KEY = ["registrar-subjects"] as const;

export default function RegistrarSubjectsPage() {
  return (
    <React.Suspense>
      <SubjectCatalogPage desk="registrar" grades={GRADES} queryKey={QUERY_KEY} />
    </React.Suspense>
  );
}
