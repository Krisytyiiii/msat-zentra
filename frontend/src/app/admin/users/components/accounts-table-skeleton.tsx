"use client";

import { ShimmerGroup, ShimmerSkeleton } from "@/components/ui/shimmer-skeleton";
import { PAGE_SIZE } from "@/components/shared/pagination";

const HEAD_CLASS =
  "px-4 py-2.5 text-left text-[12px] font-medium tracking-[0.02em] whitespace-nowrap text-muted-foreground";

/**
 * Loading state for the account directory — the same data table as
 * `AccountsTable` (hairline header row, five columns, mascot + name/email,
 * action cell) with shimmer placeholders, so the swap to live rows causes no
 * layout shift. Wrapped in `ShimmerGroup` so every shape sweeps together.
 */
export function AccountsTableSkeleton() {
  return (
    <ShimmerGroup>
      <div
        className="overflow-x-auto rounded-lg border border-border bg-card"
        role="status"
        aria-label="Loading accounts"
        aria-busy="true"
      >
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border">
              {["Account", "Role", "Status", "Created"].map((label) => (
                <th key={label} scope="col" className={HEAD_CLASS}>
                  {label}
                </th>
              ))}
              <th scope="col" className={`${HEAD_CLASS} text-right`}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: PAGE_SIZE }).map((_, row) => (
              <tr
                key={row}
                className="border-b border-border/60 last:border-b-0"
                aria-hidden="true"
              >
                <td className="px-4 py-2.5 align-middle">
                  <div className="flex items-center gap-2.5">
                    <ShimmerSkeleton className="size-8 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1">
                      <ShimmerSkeleton className="h-3 w-32 max-w-full" />
                      <ShimmerSkeleton className="mt-1 h-2.5 w-44 max-w-full" />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5 align-middle">
                  <ShimmerSkeleton className="h-3 w-20" />
                </td>
                <td className="px-4 py-2.5 align-middle">
                  <ShimmerSkeleton className="h-5 w-16 rounded-full" />
                </td>
                <td className="px-4 py-2.5 align-middle">
                  <ShimmerSkeleton className="h-3 w-20" />
                </td>
                <td className="px-4 py-2.5 text-right align-middle">
                  <ShimmerSkeleton className="ml-auto h-6 w-24 rounded-md" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ShimmerGroup>
  );
}
