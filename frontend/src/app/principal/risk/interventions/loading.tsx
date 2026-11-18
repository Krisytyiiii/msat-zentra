import { Skeleton } from "@/components/ui/skeleton";
import styles from "./components/InterventionBriefing.module.css";

export default function PrincipalInterventionsLoading() {
  return (
    <div
      className={styles.page}
      aria-label="Loading intervention briefing"
      aria-busy="true"
    >
      <div className={styles.skeletonHero} aria-hidden="true">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="mt-3 h-7 w-96 max-w-full" />
        <Skeleton className="mt-3 h-4 w-[34rem] max-w-full" />
        <div className={styles.skeletonLanes}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
      <Skeleton className="h-8 w-full max-w-md" aria-hidden="true" />
      <div className={styles.skeletonWorkspace} aria-hidden="true">
        <Skeleton className="h-[34rem] w-full" />
        <Skeleton className="h-[34rem] w-full" />
      </div>
    </div>
  );
}
