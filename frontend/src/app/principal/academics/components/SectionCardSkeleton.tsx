import { Skeleton } from "@/components/ui/skeleton";
import styles from "./SectionCardGrid.module.css";

/**
 * Loading placeholder that mirrors a real section card: a hairline head with
 * the section name and sharing state, the three-figure row, and the foot
 * affordance. Kept structurally identical so the board doesn't jump.
 */
export function SectionCardSkeleton() {
  return (
    <div className={styles.cardSkeleton} aria-hidden>
      <div className={styles.skeletonHead}>
        <Skeleton className={styles.skeletonName} />
        <Skeleton className={styles.skeletonSource} />
      </div>
      <div className={styles.skeletonMetrics}>
        {Array.from({ length: 3 }).map((_, i) => (
          <span key={i} className={styles.skeletonMetric}>
            <Skeleton className={styles.skeletonValue} />
            <Skeleton className={styles.skeletonLabel} />
          </span>
        ))}
      </div>
      <Skeleton className={styles.skeletonFoot} />
    </div>
  );
}
