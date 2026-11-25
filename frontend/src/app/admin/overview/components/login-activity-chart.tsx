"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AdminLoginActivityEvent } from "@/services/admin/admin.service";
import { roleLabel } from "@/lib/auth/roles";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { Pill } from "@/components/ui/pill";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import styles from "./login-activity-chart.module.css";

/* Amber ramp — same shade steps as the teacher/guidance/nurse overview charts
   so every role's boards read as one system. Plain hex on purpose: the chart
   paints these into SVG gradient stops, where wide `oklch()` support is not
   guaranteed. */
const AMBER = "#f59e0b";
const SIGN_OUT = "rgba(245, 158, 11, 0.55)";
const BUCKET_MS = 60 * 60 * 1000;
const TOOLTIP_Z_INDEX = { zIndex: 50 };

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Axis tick for an hourly bucket, e.g. "1 PM". */
function hourLabel(date: Date): string {
  return date.toLocaleTimeString([], { hour: "numeric" });
}

/** Tooltip heading for an hourly bucket, e.g. "Nov 20, 1:00 PM". */
function bucketLabel(date: Date): string {
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Same swatch colours as the role legend, used as plain text, not a chip. */

/** Same popover tooltip the teacher/guidance/nurse overview charts use. */
function ActivityTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  label?: string | number;
  payload?: ReadonlyArray<{
    name?: string | number;
    value?: number | string;
    color?: string;
    dataKey?: string | number;
  }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const items = payload.filter((item) => item.value !== undefined && item.value !== null);
  if (items.length === 0) return null;

  return (
    <div className={styles.chartTooltip} role="tooltip">
      {label !== undefined && label !== null && label !== "" ? (
        <p className={styles.chartTooltipLabel}>{label}</p>
      ) : null}
      <ul className={styles.chartTooltipList}>
        {items.map((item, index) => {
          const isLogin = item.dataKey === "Logins";
          return (
            <li key={`${String(item.dataKey ?? item.name)}-${index}`}>
              <Pill
                tone={isLogin ? "amber" : "neutral"}
                label={
                  isLogin
                    ? "Sign-ins in this hour"
                    : "Sign-outs in this hour"
                }
              >
                {item.name}
                <span className={styles.chartTooltipValue}>{item.value}</span>
              </Pill>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function LoginActivityChart({
  events,
  total,
  signOuts,
  windowHours,
}: {
  events: AdminLoginActivityEvent[];
  total: number;
  signOuts: number;
  windowHours: number;
}) {
  // Hourly buckets across the window, each carrying its own sign-in / sign-out
  // count — an area chart needs per-interval activity so it rises and falls
  // instead of drawing one monotone cumulative ramp.
  //
  // The window end is frozen at mount (`useState` lazy init) so the render stays
  // pure and the buckets don't shift under a polling refetch.
  const [windowEnd] = React.useState(() => Math.ceil(Date.now() / BUCKET_MS) * BUCKET_MS);
  const points = React.useMemo(() => {
    const start = windowEnd - windowHours * BUCKET_MS;
    const rows = Array.from({ length: windowHours }, (_, index) => {
      const at = new Date(start + index * BUCKET_MS);
      return {
        at: at.toISOString(),
        label: bucketLabel(at),
        Logins: 0,
        "Sign-outs": 0,
      };
    });
    for (const event of events) {
      const index = Math.floor((new Date(event.at).getTime() - start) / BUCKET_MS);
      if (index < 0 || index >= rows.length) continue;
      if (event.kind === "logout") rows[index]["Sign-outs"] += 1;
      else rows[index].Logins += 1;
    }
    return rows;
  }, [events, windowHours, windowEnd]);

  const hasEvents = events.length > 0;

  return (
    <div className={styles.chart}>
      <div className={styles.head}>
        <span className={styles.title}>Logins &amp; sign-outs</span>
        <span className={styles.meta}>
          <Pill tone="amber" label="Sign-ins in the last 24 hours">
            {total} in
          </Pill>
          <Pill tone="neutral" label="Sign-outs in the last 24 hours">
            {signOuts} out
          </Pill>
          <Pill tone="neutral" label="Chart time window">
            last {windowHours}h
          </Pill>
        </span>
      </div>

      <div className={styles.plot}>
        {hasEvents ? (
          <div
            className={styles.areaChart}
            role="img"
            aria-label={`Logins and sign-outs over the last ${windowHours} hours: ${total} sign-ins, ${signOuts} sign-outs`}
          >
            <ResponsiveContainer width="100%" height={168}>
              <AreaChart data={points} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="admin-logins-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={AMBER} stopOpacity={0.55} />
                    <stop offset="100%" stopColor={AMBER} stopOpacity={0.04} />
                  </linearGradient>
                  <linearGradient id="admin-signouts-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={AMBER} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={AMBER} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="at"
                  tickFormatter={(value: string) => hourLabel(new Date(value))}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  tick={{ fontSize: 12 }}
                  height={18}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  fontSize={12}
                  width={34}
                />
                <Tooltip
                  content={<ActivityTooltip />}
                  wrapperStyle={TOOLTIP_Z_INDEX}
                  labelFormatter={(_, payload) =>
                    payload?.[0]?.payload?.label ?? ""
                  }
                />
                <Area
                  type="monotone"
                  dataKey="Sign-outs"
                  stroke={SIGN_OUT}
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  fill="url(#admin-signouts-fill)"
                  fillOpacity={1}
                  dot={false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="Logins"
                  stroke={AMBER}
                  strokeWidth={2}
                  fill="url(#admin-logins-fill)"
                  fillOpacity={1}
                  dot={false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className={styles.empty}>No sign-ins yet</p>
        )}
      </div>

      {hasEvents ? (
        <ul className={styles.legend}>
          <li className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: AMBER }} aria-hidden="true" />
            <span className={styles.legendLabel}>Logins</span>
            <span className={styles.legendValue}>{total}</span>
          </li>
          <li className={styles.legendItem}>
            <span
              className={styles.swatch}
              style={{ background: SIGN_OUT }}
              aria-hidden="true"
            />
            <span className={styles.legendLabel}>Sign-outs</span>
            <span className={styles.legendValue}>{signOuts}</span>
          </li>
        </ul>
      ) : null}

      <LatestAccess events={events} />
    </div>
  );
}

/** Twelve most recent sign-ins or sign-outs, switched with the shared tag tabs. */
function LatestAccess({ events }: { events: AdminLoginActivityEvent[] }) {
  const [tab, setTab] = React.useState<"login" | "logout">("login");
  const rows = React.useMemo(
    () =>
      events
        .filter((event) => event.kind === tab)
        .slice(-12)
        .reverse(),
    [events, tab],
  );

  return (
    <div className={styles.latest}>
      <div className={styles.filterTabs}>
        <FilterTabs
          label="Latest activity"
          variant="tags"
          options={[
            { value: "login", label: "Latest logins", tone: "amber" },
            { value: "logout", label: "Latest sign-outs", tone: "neutral" },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {rows.length === 0 ? (
        <p className={styles.latestEmpty}>
          {tab === "login" ? "No sign-ins in this window." : "No sign-outs in this window."}
        </p>
      ) : (
        <ul key={tab} className={styles.latestList}>
          {rows.map((event, index) => (
            <li
              key={`${event.id}-${event.at}-${index}`}
              className={styles.latestRow}
              style={{ "--row-index": index } as React.CSSProperties}
            >
              <span className={styles.latestAvatar} aria-hidden="true">
                <StudentMascot
                  name={event.fullName}
                  seed={event.id}
                  character={event.mascot ?? undefined}
                  size={22}
                />
              </span>
              <span className={styles.latestName}>{event.fullName}</span>
              <span className={styles.latestRole}>
                {roleLabel(event.role)}
              </span>
              <span className={styles.latestTime}>{timeLabel(event.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

