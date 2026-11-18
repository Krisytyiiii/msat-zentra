import { fetchRegistryOverview, type RegistryDesk } from "@/services/registry/overview.service";

/**
 * One query descriptor for every registry-overview widget on a desk.
 * `RegistrarChannel` invalidates `["registrar-overview"]` and
 * `recordKeeperChannel` invalidates `["record-keeper-overview"]`, so sharing
 * the exact key/options keeps a whole overview page on a single cache entry.
 */
export const registryOverviewKey = (desk: RegistryDesk) =>
  desk === "registrar"
    ? (["registrar-overview"] as const)
    : (["record-keeper-overview"] as const);

export const registryOverviewQuery = (desk: RegistryDesk) => ({
  queryKey: registryOverviewKey(desk),
  queryFn: () => fetchRegistryOverview(desk),
  staleTime: 30_000,
});

/** Desk route root — every overview card links to a page under it. */
export const registryBase = (desk: RegistryDesk) =>
  desk === "registrar" ? "/registrar" : "/record-keeper";
