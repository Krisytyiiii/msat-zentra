"use client";

import { useQueryClient } from "@tanstack/react-query";

/**
 * Refresh every admin schedule query after an editor write. The admin shell
 * has no realtime channel; the workspace polls, and this makes an in-page
 * write land immediately. Prefix invalidation is array-element based, so each
 * root key is listed explicitly.
 */
export function useAdminScheduleInvalidate() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-schedule-summary"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-schedule-config"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-schedule-conflicts"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-schedule-section"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-schedule-subjects"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-schedule-teachers"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-schedule-school-years"] });
  };
}
