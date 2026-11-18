import { Skeleton } from "@/components/ui/skeleton";
import styles from "./components/attendance.module.css";

export default function PrincipalAttendanceHeatmapLoading() {
  return (
    <section className={styles.page} aria-label="Loading attendance heatmap" aria-busy="true">
      <Skeleton className="h-8 w-64" aria-hidden="true" />
      <Skeleton className="h-36 w-full" aria-hidden="true" />
      <Skeleton className="h-72 w-full" aria-hidden="true" />
      <Skeleton className="h-96 w-full" aria-hidden="true" />
    </section>
  );
}
