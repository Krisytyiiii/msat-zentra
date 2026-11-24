import { redirect } from "next/navigation";

/** Legacy URL — the academics desk now lives at /teacher/advisory/academics. */
export default function LegacyAdvisoryStudentsPage() {
  redirect("/teacher/advisory/academics");
}
