"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogOut, Moon, Settings, Sun } from "lucide-react";
import { useTheme } from "@/components/providers";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import styles from "./glass-user-menu.module.css";

type GlassUserMenuProps = {
  /** Desk settings route, e.g. "/teacher/settings". */
  settingsHref: string;
  /** Desk logout handler (clears caches and session, then redirects). */
  onLogout: () => void;
  /** The desk's avatar button, used unchanged as the trigger. */
  children: React.ReactNode;
};

/**
 * Frosted-glass account menu shared by every desk navbar (AI Canvas glass
 * user-menu pattern): the avatar opens a glass panel with grouped rows —
 * Account, Appearance (theme) — a hairline rule, then Log Out in red. Rows
 * glide on hover and the panel slides/fades in with a soft blur.
 */
export function GlassUserMenu({
  settingsHref,
  onLogout,
  children,
}: GlassUserMenuProps) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();

  const isDark = resolvedTheme === "dark";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className={styles.menu}
        aria-label="Account menu"
      >
        <p className={styles.groupLabel}>Account</p>
        <DropdownMenuItem
          className={styles.item}
          onSelect={(event) => {
            event.preventDefault();
            router.push(settingsHref);
          }}
        >
          <span className={styles.glyph} data-tone="violet" aria-hidden>
            <Settings size={16} />
          </span>
          <span className={styles.itemLabel}>Settings</span>
        </DropdownMenuItem>

        <p className={styles.groupLabel}>Appearance</p>
        <DropdownMenuItem
          className={styles.item}
          onSelect={(event) => {
            event.preventDefault();
            setTheme("light");
          }}
        >
          <span className={styles.glyph} data-tone="amber" aria-hidden>
            <Sun size={16} />
          </span>
          <span className={styles.itemLabel}>Light</span>
          {isDark ? null : <span className={styles.activeBadge}>Active</span>}
        </DropdownMenuItem>
        <DropdownMenuItem
          className={styles.item}
          onSelect={(event) => {
            event.preventDefault();
            setTheme("dark");
          }}
        >
          <span className={styles.glyph} data-tone="indigo" aria-hidden>
            <Moon size={16} />
          </span>
          <span className={styles.itemLabel}>Dark</span>
          {isDark ? <span className={styles.activeBadge}>Active</span> : null}
        </DropdownMenuItem>

        <div className={styles.rule} aria-hidden />

        <DropdownMenuItem
          className={`${styles.item} ${styles.danger}`}
          onSelect={(event) => {
            event.preventDefault();
            onLogout();
          }}
        >
          <span className={styles.glyph} data-tone="red" aria-hidden>
            <LogOut size={16} />
          </span>
          <span className={styles.itemLabel}>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
