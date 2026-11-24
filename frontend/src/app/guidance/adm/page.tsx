import { redirect } from "next/navigation";

/** Legacy path — the referrals report lives at /guidance/reports. */
export default function GuidanceAdmRedirect() {
  redirect("/guidance/reports");
}
