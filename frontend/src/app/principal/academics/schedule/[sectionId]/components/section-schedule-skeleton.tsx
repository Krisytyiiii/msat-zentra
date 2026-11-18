import { Fragment } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { WEEK_LABELS_SHORT } from "@/services/teacher/schedule";

/*
 * Loading shell for the section schedule review desk. Mirrors the real page
 * (back link + review rail → section review deck → weekly timetable) so the
 * swap to live data does not shift anything on screen. Row rhythm comes from
 * the default day config: 8 periods with lunch after the 4th.
 */

const DAYS = [1, 2, 3, 4, 5];
const PERIODS = 8;
const LUNCH_AFTER = 4;

function CellSkeleton() {
  return (
    <td className="border-t p-1">
      <div className="flex min-h-[3.25rem] w-full items-center justify-center rounded-md border border-solid bg-muted/30 px-1 py-1">
        <span className="flex w-full min-w-0 flex-col items-center gap-1 leading-tight">
          <Skeleton className="h-2.5 w-3/4" />
          <Skeleton className="h-2 w-1/2" />
        </span>
      </div>
    </td>
  );
}

function BreakRow() {
  return (
    <tr>
      <td
        colSpan={DAYS.length + 1}
        className="border-t bg-muted/40 px-2 py-1 text-center"
      >
        <Skeleton className="mx-auto h-2.5 w-44" />
      </td>
    </tr>
  );
}

export function SectionScheduleSkeleton() {
  return (
    <section className="flex w-full flex-col gap-4" aria-busy="true" aria-label="Loading schedule">
      <div className="flex min-w-0 items-center justify-between gap-2" aria-hidden="true">
        <Skeleton className="-ml-2 h-6 w-32 rounded-md" />
        <div className="flex gap-1">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-8 w-8 rounded-xl" />
          ))}
        </div>
      </div>

      <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3.5 py-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded-md" />
            <Skeleton className="h-3.5 w-32" />
          </div>
          <Skeleton className="h-[18px] w-20 rounded-md" />
        </div>

        <div className="grid grid-cols-1 gap-0 lg:grid-cols-[minmax(240px,0.9fr)_1px_minmax(0,2fr)]">
          <div className="flex flex-col gap-3 p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-36" />
                <div className="flex gap-1.5">
                  <Skeleton className="h-[18px] w-16 rounded-md" />
                  <Skeleton className="h-[18px] w-28 rounded-md" />
                </div>
              </div>
            </div>
            <Skeleton className="h-3 w-52" />
          </div>

          <div className="bg-border" aria-hidden="true" />

          <div className="flex flex-col gap-2.5 p-4">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-2.5 w-24" />
              <Skeleton className="h-2.5 w-40" />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[4.25rem] rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-2.5 w-48" />
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-border bg-muted/25 px-3.5 py-2">
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="h-2.5 w-36" />
          <Skeleton className="ml-auto h-2.5 w-40" />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3.5 py-2">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-2.5 w-44" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[42rem] border-collapse text-sm">
            <thead>
              <tr>
                <th scope="col" className="w-28 border-b p-2 text-left">
                  <span className="sr-only">Time</span>
                </th>
                {DAYS.map((day) => (
                  <th key={day} scope="col" className="border-b p-2 text-center">
                    <Skeleton className="mx-auto h-2.5 w-8" aria-hidden />
                    <span className="sr-only">{WEEK_LABELS_SHORT[day - 1]}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: PERIODS }).map((_, i) => (
                <Fragment key={`period-${i}`}>
                  <tr>
                    <th scope="row" className="border-t p-2 text-left">
                      <Skeleton className="h-2.5 w-20" />
                    </th>
                    {DAYS.map((day) => (
                      <CellSkeleton key={day} />
                    ))}
                  </tr>
                  {i + 1 === LUNCH_AFTER ? <BreakRow /> : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
