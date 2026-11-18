import { redirect } from "next/navigation";

/** The desk was renamed from "Certifications" to "Files" — keep old links working. */
export default function CoordinatorCertificationsRedirect() {
  redirect("/coordinator/files");
}
