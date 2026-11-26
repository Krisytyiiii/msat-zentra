"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { logout } from "@/lib/api/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { AdminSidebar } from "@/components/admin-sidebar";
import { GlassUserMenu } from "@/components/account/glass-user-menu";
import { AppBreadcrumbs } from "@/components/nav/AppBreadcrumbs";
import { useRoleGuard } from "@/lib/auth/useRoleGuard";
import { ActiveTermBadge } from "@/components/term/ActiveTermBadge";
import { AdminBell } from "./components/admin-bell";
import { useAdminProfile } from "@/services/admin/admin.service";
import styles from "./admin.module.css";

function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { allowed } = useRoleGuard(["admin"]);
  const profile = useAdminProfile();

  const handleLogout = () => {
    void logout();
    queryClient.clear();
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith("zentra."))
      .forEach((key) => window.localStorage.removeItem(key));
    router.push("/login/admin");
  };

  if (!allowed) {
    return (
      <div className={styles.wrapper}>
        <ShimmerGroup>
          <section
            className={styles.main}
            aria-busy="true"
            aria-label="Checking access"
            role="status"
          >
            <div className="flex flex-col gap-4">
              <Skeleton className="h-8 w-56 rounded-md" />
              <Skeleton className="h-40 w-full rounded-lg" />
              <Skeleton className="h-64 w-full rounded-lg" />
            </div>
          </section>
        </ShimmerGroup>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <header className={styles.topbar}>
        <Link href="/admin/overview" className={styles.brand}>
          <span className={styles.brandText}>Zentra</span>
        </Link>

        <AppBreadcrumbs role="Administrator" />

        <div className={styles.spacer} />

        <ActiveTermBadge />

        <AdminBell />

        <GlassUserMenu
          settingsHref="/admin/settings"
          onLogout={handleLogout}
        >
          <button
            type="button"
            className={styles.avatarButton}
            aria-label="Account menu"
          >
            <span className="flex size-8 items-center justify-center overflow-hidden rounded-full border border-border bg-muted/40">
              <StudentMascot
                name={profile.data?.fullName || "Administrator"}
                character={profile.data?.mascot ?? undefined}
                size={32}
              />
            </span>
          </button>
        </GlassUserMenu>
      </header>

      <Suspense fallback={null}>
        <AdminSidebar />
      </Suspense>

      <div className={`${styles.shell} ${styles.shellWithDock}`}>
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminShell>{children}</AdminShell>;
}
