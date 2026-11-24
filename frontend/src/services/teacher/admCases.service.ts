import { apiClient } from "@/lib/api/client";
import { pickList } from "@/lib/api/payload";
import type { AdmCase, MyAdmCasesPage } from "./admCases.types";
import { PAGE_SIZE } from "@/components/shared/pagination";

export async function fetchMyAdmCases(
  params: { q?: string; page?: number; pageSize?: number; highlight?: string; signal?: AbortSignal } = {}
): Promise<MyAdmCasesPage> {
  const search = new URLSearchParams();
  if (params.q?.trim()) search.set("q", params.q.trim());
  search.set("page", String(Math.max(1, params.page ?? 1)));
  search.set("pageSize", String(params.pageSize ?? PAGE_SIZE));
  if (params.highlight) search.set("highlight", params.highlight);
  const { data } = await apiClient.get<
    MyAdmCasesPage | AdmCase[] | { cases: AdmCase[] }
  >(`/api/adm/my-cases${search.toString() ? `?${search.toString()}` : ""}`, {
    signal: params.signal,
  });

  if (Array.isArray(data)) {
    return {
      cases: data,
      total: data.length,
      unfilteredTotal: data.length,
      page: params.page ?? 1,
      totalPages: 1,
      pageSize: params.pageSize ?? data.length,
    };
  }
  const cases = pickList<AdmCase>(data, "cases");
  const fallback = data as Partial<MyAdmCasesPage>;
  const total = fallback.total ?? cases.length;
  return {
    cases,
    total,
    unfilteredTotal: fallback.unfilteredTotal ?? cases.length,
    page: fallback.page ?? params.page ?? 1,
    totalPages:
      fallback.totalPages ??
      Math.max(1, Math.ceil(total / (params.pageSize ?? PAGE_SIZE))),
    pageSize: fallback.pageSize ?? params.pageSize ?? PAGE_SIZE,
    summary: fallback.summary,
    stageCounts: fallback.stageCounts,
    recent: fallback.recent,
  };
}

/**
 * The ADM desk filters locally so search is instant (same as the interventions
 * board), so it loads every case once instead of refetching on each keystroke.
 * The endpoint caps pageSize at 15, hence the page fan-out.
 */
export async function fetchAllAdmCases(
  opts: { signal?: AbortSignal } = {},
): Promise<MyAdmCasesPage> {
  const first = await fetchMyAdmCases({ page: 1, pageSize: PAGE_SIZE, signal: opts.signal });
  if (first.totalPages <= 1) return first;
  // Pages are independent — fetch in parallel instead of sequentially.
  const rest = await Promise.all(
    Array.from({ length: first.totalPages - 1 }, (_, i) =>
      fetchMyAdmCases({ page: i + 2, pageSize: PAGE_SIZE, signal: opts.signal }),
    ),
  );
  return {
    ...first,
    cases: [first.cases, ...rest.map((page) => page.cases)].flat(),
    page: 1,
  };
}
