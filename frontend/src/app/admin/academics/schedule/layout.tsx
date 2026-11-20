"use client";

import { TemplateSaveProvider } from "./components/template-save-context";

/**
 * The schedule workspace reports slot saves into the one shared Dock, so the
 * provider wraps both the index and the per-section template pages.
 */
export default function AdminAcademicsScheduleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TemplateSaveProvider>{children}</TemplateSaveProvider>;
}
