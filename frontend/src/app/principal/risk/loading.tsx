import { Skeleton } from "@/components/ui/skeleton";
import styles from "./risk.module.css";

export default function PrincipalRiskLoading() {
  return (
    <section className={styles.page} aria-label="Loading risk board" aria-busy="true">
      <div className="flex flex-col gap-2" aria-hidden="true">
        <Skeleton className="h-6 w-52" />
        <Skeleton className="h-3.5 w-96 max-w-full" />
      </div>

      <div className="overflow-hidden rounded-xl border" aria-hidden="true">
        <div className="flex items-center justify-between border-b p-2.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-6 w-24" />
        </div>
        <div className="grid gap-4 p-4 md:grid-cols-[minmax(220px,0.85fr)_minmax(0,2.1fr)]">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-11 w-24" />
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-14 w-full" />
          </div>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-3 w-24" />
            <div className="grid grid-cols-3 gap-2">
              <Skeleton className="h-[4.25rem] rounded-lg" />
              <Skeleton className="h-[4.25rem] rounded-lg" />
              <Skeleton className="h-[4.25rem] rounded-lg" />
            </div>
            <Skeleton className="h-3 w-24" />
            <div className="grid grid-cols-3 gap-2">
              <Skeleton className="h-10 rounded-md" />
              <Skeleton className="h-10 rounded-md" />
              <Skeleton className="h-10 rounded-md" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border p-2.5" aria-hidden="true">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-[250px] w-full" />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border p-2.5" aria-hidden="true">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-[280px] w-full" />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border p-2.5" aria-hidden="true">
        <Skeleton className="h-4 w-56" />
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    </section>
  );
}
