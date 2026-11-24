"use client";

import { NotificationsBell } from "@/components/notifications/NotificationsBell";
import {
  adminNotificationTarget,
  adminNotificationTitle,
} from "@/lib/notifications/label";

/**
 * Admin accounts receive the pending sign-up alerts — the administrator owns
 * every account approval — plus system notices. Pending sign-ups deep-link into
 * the approval board; anything else just marks read.
 */
export function AdminBell() {
  return (
    <NotificationsBell
      queryKey={["admin-notifications"]}
      refreshKeys={[["admin-notifications"]]}
      resolveTarget={adminNotificationTarget}
      titleFor={adminNotificationTitle}
    />
  );
}
