"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { logout } from "@/lib/api/client";
import { AdminSidebar } from "@/components/admin-sidebar";
import { GlassUserMenu } from "@/components/account/glass-user-menu";
import { AppBreadcrumbs } from "@/components/nav/AppBreadcrumbs";
import { useRoleGuard } from "@/lib/auth/useRoleGuard";
import { ActiveTermBadge } from "@/components/term/ActiveTermBadge";
import { AdminBell } from "./components/admin-bell";
import styles from "./admin.module.css";

function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { allowed } = useRoleGuard(["admin"]);

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
        <section
          className={styles.main}
          aria-busy="true"
          aria-label="Checking access"
          role="status"
        >
          <p>Checking access…</p>
        </section>
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
            <ShieldCheck className={styles.avatarIcon} aria-hidden="true" />
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
