"use client";
import { ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  GUIDANCE_TYPES,
  type GuidanceAction,
  type GuidanceTypeFilter,
} from "./guidance-referrals-format";
import styles from "./guidance-referrals-table.module.css";
export function GuidanceReferralsToolbar({
  title,
  query,
  onQueryChange,
  typeFilter,
  onTypeChange,
  onActionChange,
  onPageChange,
  hasActiveFilters,
  onClear,
  typeFilterLabel,
}: {
  title: string;
  query: string;
  onQueryChange: (v: string) => void;
  typeFilter: GuidanceTypeFilter;
  onTypeChange: (v: GuidanceTypeFilter) => void;
  onActionChange: (v: GuidanceAction) => void;
  onPageChange?: (p: number) => void;
  hasActiveFilters: boolean;
  onClear: () => void;
  typeFilterLabel: string;
}) {
  const goToPage = (next: number) => onPageChange?.(next);
  return (
    <div className={`${styles.toolbar} ${styles.toolbarSticky}`}>
      <div>
        <p className={styles.pageTitle}>{title}</p>
      </div>
      <div className={styles.toolbarFilters}>
        <SearchField
          className="w-60"
          placeholder="Search by student name or keyword…"
          value={query}
          onChange={(next) => onQueryChange(next)}
          aria-label="Search your cases"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              aria-label={`Filter cases by type, currently showing: ${typeFilterLabel}`}
              className={`${styles.filterBtn} ${typeFilter !== "" ? styles.filterActive : ""}`}
            >
              {typeFilterLabel}
              {typeFilter !== "" && <span className={styles.filterDot} aria-hidden />}
              <ChevronDown aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className={styles.filterMenu}>
            {GUIDANCE_TYPES.map((item) => (
              <DropdownMenuCheckboxItem
                key={item.label}
                checked={typeFilter === item.value}
                onCheckedChange={() => {
                  onTypeChange(item.value);
                  onActionChange("");
                  goToPage(1);
                }}
              >
                {item.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
          >
            <X aria-hidden />
            Show all
          </Button>
        )}
      </div>
    </div>
  );
}
