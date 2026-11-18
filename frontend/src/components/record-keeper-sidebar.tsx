"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";

import styles from "./record-keeper-sidebar.module.css";
import BranchedMenu from "./nav/BranchedMenu";
import { NAV_ICONS } from "./nav/sidebar-icons";
import { SidebarIconRail } from "./nav/SidebarIconRail";
import { ScrollDownHint } from "@/components/ui/scroll-down-hint";
import {
  useRecordKeeperNavDotInvalidation,
  useRecordKeeperNavDots,
  type RecordKeeperNavDots,
} from "@/services/record-keeper/navCounts.service";

type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
  dot?: boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { title: "Overview", href: "/record-keeper/overview", icon: NAV_ICONS.overview },
    ],
  },
  {
    label: "Records",
    items: [
      { title: "Final Grades", href: "/record-keeper/final-grades", icon: NAV_ICONS.finalGrades },
      { title: "Account Approvals", href: "/record-keeper/accounts", icon: NAV_ICONS.accountApprovals },
      {
        title: "Adviser Access Requests",
        href: "/record-keeper/adviser-access",
        icon: NAV_ICONS.adviserAccessRequests,
      },
      { title: "Report Cards", href: "/record-keeper/report-cards", icon: NAV_ICONS.reportCards },
      { title: "SF10 Records", href: "/record-keeper/sf10", icon: NAV_ICONS.sf10Records },
      { title: "Upload SF10", href: "/record-keeper/sf10/upload", icon: NAV_ICONS.uploadSf10 },
      { title: "Subjects", href: "/record-keeper/academics", icon: NAV_ICONS.subjects },
    ],
  },
  {
    label: "Settings",
    items: [
      {
        title: "General Settings",
        href: "/record-keeper/settings",
        icon: NAV_ICONS.settings,
      },
    ],
  },
];

/* Which live queue each nav entry watches. The dot comes from
   `/api/record-keeper/nav-counts`; a page with nothing unseen shows no dot. */
const QUEUE_FOR_HREF: Record<string, keyof RecordKeeperNavDots> = {
  "/record-keeper/overview": "overview",
  "/record-keeper/final-grades": "finalGrades",
  "/record-keeper/accounts": "accounts",
  "/record-keeper/adviser-access": "adviserAccess",
  "/record-keeper/sf10": "sf10",
  "/record-keeper/academics": "subjects",
};

function withDots(groups: NavGroup[], dots: RecordKeeperNavDots): NavGroup[] {
  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      dot: Boolean(QUEUE_FOR_HREF[item.href] && dots[QUEUE_FOR_HREF[item.href]]),
    })),
  }));
}

function matches(href: string, pathname: string, exactRoot: string) {
  if (href === exactRoot) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function findActiveHref(tabs: NavItem[], pathname: string) {
  let best: string | null = null;
  for (const t of tabs) {
    if (!matches(t.href, pathname, "/record-keeper/overview")) continue;
    if (best === null || t.href.length > best.length) best = t.href;
  }
  return best ?? "/record-keeper/overview";
}

function useIsActive() {
  const pathname = usePathname();
  return React.useCallback(
    (href: string) => matches(href, pathname, "/record-keeper/overview"),
    [pathname],
  );
}

function RecordKeeperNavbar({ tabs }: { tabs: NavItem[] }) {
  const isActive = useIsActive();

  return (
    <nav className={styles.navbar} aria-label="Record Keeper sections">
      <ul className={styles.tabs}>
        {tabs.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href} className={styles.tabItem}>
              <Link
                href={item.href}
                className={`${styles.tab} ${active ? styles.tabActive : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <item.icon className={styles.tabIcon} aria-hidden="true" />
                <span className={styles.tabLabel}>{item.title}</span>
                {item.dot ? <span className={styles.dot} aria-hidden="true" /> : null}
                {item.dot ? <span className="sr-only">New activity</span> : null}
                {item.badge ? <span className={styles.badge}>{item.badge}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function RecordKeeperRail({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const tabs = groups.flatMap((group) => group.items);
  const activeHref = findActiveHref(tabs, pathname);
  const defaultOpen = groups.map((_, i) => i);
  return (
    <BranchedMenu
      items={groups.map((group) => ({
        label: group.label,
        children: group.items.map((t) => ({
          value: t.href,
          label: t.title,
          href: t.href,
          dot: t.dot,
          icon: <t.icon size={16} strokeWidth={1.8} aria-hidden="true" />,
        })),
      }))}
      defaultOpen={defaultOpen.length > 0 ? defaultOpen : [0]}
      defaultActive={activeHref}
      activeValue={activeHref}
      onSelect={(_value, item) => {
        if ("href" in item && item.href) router.push(item.href);
      }}
      width={208}
    />
  );
}

export function RecordKeeperSidebar({
  collapsed = true,
}: {
  collapsed?: boolean;
} = {}) {
  const pathname = usePathname();
  const railScrollRef = React.useRef<HTMLDivElement | null>(null);
  const dots = useRecordKeeperNavDots();
  useRecordKeeperNavDotInvalidation(dots);
  const nav = React.useMemo(() => withDots(NAV, dots), [dots]);
  const tabs = React.useMemo(() => nav.flatMap((group) => group.items), [nav]);
  const activeHref = findActiveHref(tabs, pathname);

  return (
    <>
      <aside
        className={`${styles.rail} ${styles.railDesktop} ${collapsed ? styles.railCollapsed : ""}`}
        aria-label="Record Keeper sections"
      >
        {collapsed ? (
          <SidebarIconRail
            groups={nav}
            ariaLabel="Record Keeper sections, icon only"
            activeHref={activeHref}
          />
        ) : (
          <>
            <div ref={railScrollRef} className={styles.railScroll}>
              <RecordKeeperRail groups={nav} />
            </div>
            <div className={styles.railHintWrap}>
              <ScrollDownHint
                scrollRef={railScrollRef}
                watchKey="record-keeper-nav"
                label="Scroll for more"
                className="pointer-events-auto rounded-full border border-border bg-card px-3 py-1 shadow-sm"
              />
            </div>
          </>
        )}
      </aside>
      <div className={styles.tabsMobile}>
        <RecordKeeperNavbar tabs={tabs} />
      </div>
    </>
  );
}
