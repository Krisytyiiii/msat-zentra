import { redirect } from "next/navigation";

/** The teacher desk opens on the class list, not the dashboard. */
export default function TeacherRootPage() {
  redirect("/teacher/classes");
}
