"use client";

import dynamic from "next/dynamic";
import { roleLabel } from "@/lib/auth/roles";
import { useAdminLoginActivity, useAdminPresence } from "@/services/admin/admin.service";
import GlobeSkeleton from "./components/globe-skeleton";
import LoginActivityChart, { LatestAccess } from "./components/login-activity-chart";
import LoginActivityChartSkeleton, {
  LatestAccessSkeleton,
} from "./components/login-activity-chart-skeleton";
import { LEGEND_ROLES, roleColor } from "./components/role-colors";
import styles from "./overview.module.css";

// `three` needs `window`; the globe is client-only around a canvas.
const PresenceGlobe = dynamic(() => import("./components/presence-globe"), {
  ssr: false,
  loading: () => <GlobeSkeleton />,
});

export default function AdminOverviewPage() {
  const { data, isPending, isError, refetch } = useAdminPresence();
  const { data: activity } = useAdminLoginActivity(24);
  const active = data?.active ?? [];

  return (
    <section className={styles.stage} aria-busy={isPending || undefined}>
      <div className={styles.left}>
        {/* Login-activity area chart, above the globe. */}
        <aside className={styles.activity} aria-label="Login activity">
          {activity ? (
            <LoginActivityChart
              events={activity.events}
              total={activity.total}
              signOuts={activity.signOuts}
              windowHours={activity.windowHours}
              withLatest={false}
            />
          ) : (
            <LoginActivityChartSkeleton withLatest={false} />
          )}
        </aside>

        {/* Live presence globe, smaller and tucked under the activity chart. */}
        <div className={styles.globeCard}>
          {/* Mount immediately so the three.js chunk downloads while presence
              loads, instead of waiting for the API before starting. */}
          <PresenceGlobe users={active} />
          {isPending ? <GlobeSkeleton /> : null}

          <div className={styles.chip}>
            <span className={styles.liveDot} aria-hidden="true" />
            <strong className={styles.chipCount}>{active.length}</strong>
            <span>active now</span>
          </div>
        </div>
      </div>

      {/* Right rail: latest logins/sign-outs list + role legend. */}
      <aside className={styles.rail} aria-label="Latest activity">
        {isError ? (
          <div className={styles.error} role="alert">
            <span>Could not load live presence.</span>
            <button type="button" onClick={() => void refetch()} className={styles.retry}>
              Try again
            </button>
          </div>
        ) : null}

        <div className={styles.railCard}>
          <p className={styles.railTitle}>Role legend</p>
          <ul className={styles.legendList}>
            {LEGEND_ROLES.map((role) => (
              <li key={role} className={styles.legendItem}>
                <span
                  className={styles.legendDot}
                  style={{ backgroundColor: roleColor(role) }}
                  aria-hidden="true"
                />
                <span>{roleLabel(role)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.latestCard}>
          {activity ? (
            <LatestAccess events={activity.events} />
          ) : (
            <LatestAccessSkeleton />
          )}
        </div>

        {data?.approximate ? (
          <p className={styles.note}>
            Some markers are approximate — those sessions came from a private network.
          </p>
        ) : null}
      </aside>
    </section>
  );
}
