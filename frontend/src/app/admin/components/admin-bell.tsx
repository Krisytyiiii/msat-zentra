"use client";

import * as React from "react";
import { NotificationsBell } from "@/components/notifications/NotificationsBell";
import { roleLabel } from "@/lib/auth/roles";
import {
  adminNotificationTarget,
  adminNotificationTitle,
} from "@/lib/notifications/label";

const SEEN_KEY = "zentra.admin.notifications.seen";

/**
 * The administrator console is the system-wide desk: its bell reads every
 * notification any desk received (pending sign-ups, schedule changes,
 * referrals, ADM moves…), newest first, tagged with the recipient. The feed is
 * read-only — the rows belong to other users, so they only deep-link into the
 * matching console page. "New" is measured against the last time this browser
 * opened the bell, which keeps the red dot meaningful without pretending the
 * admin read someone else's inbox.
 */
export function AdminBell() {
  const [seenAt, setSeenAt] = React.useState<string | null>(null);

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SEEN_KEY);
      if (stored) {
        setSeenAt(stored);
        return;
      }
      // First visit: seed to now so the whole backlog does not read as new.
      const now = new Date().toISOString();
      window.localStorage.setItem(SEEN_KEY, now);
      setSeenAt(now);
    } catch {
      // Private mode: no stamp, the dot simply stays off.
    }
  }, []);

  const markSeen = React.useCallback((latestIso: string | null) => {
    const stamp = latestIso ?? new Date().toISOString();
    try {
      window.localStorage.setItem(SEEN_KEY, stamp);
    } catch {
      // Private mode: keep the in-memory stamp only.
    }
    setSeenAt(stamp);
  }, []);

  return (
    <NotificationsBell
      queryKey={["admin-notifications"]}
      refreshKeys={[["admin-notifications"]]}
      fetchPath="/api/admin/notifications"
      readOnly
      seenAt={seenAt}
      onSeen={markSeen}
      recipientLabel={(n) =>
        n.recipientName
          ? `${n.recipientName} · ${roleLabel(n.recipientRole ?? "")}`
          : null
      }
      resolveTarget={adminNotificationTarget}
      titleFor={adminNotificationTitle}
    />
  );
}
