"use client";
import * as React from "react";
import type { NurseAlertItem } from "@/services/nurse/nurse.types";
import {
  countActions,
  matchesActionFilter,
  type ActionFilter,
  type TypeFilter,
} from "./nurse-referrals-format";
import { PAGE_SIZE } from "@/components/shared/pagination";

export function useNurseAlertFilters({
  alerts,
  initialType = "",
  highlightId,
  serverDriven,
  serverPage,
  serverTotal,
  serverTotalPages,
  search = "",
  pageSize = PAGE_SIZE,
}: {
  alerts: NurseAlertItem[];
  initialType?: TypeFilter;
  highlightId?: string | null;
  serverDriven: boolean;
  serverPage?: number;
  serverTotal?: number;
  serverTotalPages?: number;
  /** Live search text — filters the loaded page as the user types. */
  search?: string;
  /** Records per page. Defaults to the global 15; the ADM kanban pages 16. */
  pageSize?: number;
}) {
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>(initialType);
  const [actionFilter, setActionFilter] = React.useState<ActionFilter>("");
  const [page, setPage] = React.useState(1);
  const [paged, setPaged] = React.useState(false);
  const highlightPage = React.useMemo(() => {
    if (!highlightId || alerts.length === 0) return null;
    const sorted = [...alerts].sort((a, b) => {
      const aDate = a.row.date === "—" ? "" : a.row.date;
      const bDate = b.row.date === "—" ? "" : b.row.date;
      const dateCmp = bDate.localeCompare(aDate);
      if (dateCmp !== 0) return dateCmp;
      return b.sortTime - a.sortTime;
    });
    const idx = sorted.findIndex((a) => a.row.id === highlightId);
    return idx >= 0 ? Math.floor(idx / pageSize) + 1 : null;
  }, [alerts, highlightId, pageSize]);
  const effPage = serverDriven
    ? (serverPage ?? 1)
    : !paged && highlightPage !== null
      ? highlightPage
      : page;
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = alerts.filter((a) => {
      if (typeFilter !== "" && a.row.type !== typeFilter) return false;
      if (actionFilter !== "" && !matchesActionFilter(a.row, actionFilter)) return false;
      // Instant search on the loaded page (the debounced server query then
      // brings in matches from the rest of the desk).
      if (
        q !== "" &&
        !`${a.row.student} ${a.row.lrn} ${a.row.section} ${a.row.reason} ${a.row.category}`
          .toLowerCase()
          .includes(q)
      )
        return false;
      return true;
    });
    rows.sort((a, b) => {
      const aDate = a.row.date === "—" ? "" : a.row.date;
      const bDate = b.row.date === "—" ? "" : b.row.date;
      const dateCmp = bDate.localeCompare(aDate);
      if (dateCmp !== 0) return dateCmp;
      return b.sortTime - a.sortTime;
    });
    return rows;
  }, [alerts, typeFilter, actionFilter, search]);
  const actionCounts = React.useMemo(() => countActions(alerts), [alerts]);
  const total = serverDriven
    ? actionFilter !== ""
      ? filtered.length
      : (serverTotal ?? filtered.length)
    : filtered.length;
  const totalPages = serverDriven
    ? actionFilter !== ""
      ? 1
      : Math.max(1, serverTotalPages ?? 1)
    : Math.max(1, Math.ceil(total / pageSize));
  const safePage =
    actionFilter !== "" ? 1 : Math.min(effPage, totalPages);
  return {
    typeFilter,
    setTypeFilter,
    actionFilter,
    setActionFilter,
    page,
    setPage,
    paged,
    setPaged,
    highlightPage,
    effPage,
    filtered,
    actionCounts,
    total,
    totalPages,
    safePage,
  };
}
