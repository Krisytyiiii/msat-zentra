import * as React from "react"

import { cn } from "@/lib/utils"
import styles from "./shimmer-skeleton.module.css"

/**
 * Skeleton with a left-to-right sheen instead of the default opacity pulse.
 * Use it in place of `<Skeleton>` when a placeholder should read as a sweep.
 */
function ShimmerSkeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("rounded-md bg-muted", styles.skeleton, className)}
      {...props}
    />
  )
}

/**
 * Applies the sheen to every `<Skeleton>` inside it. Use it around trees the
 * caller does not build itself (e.g. shared skeleton kits) so the whole board
 * sweeps together rather than pulsing one shape at a time.
 */
function ShimmerGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn(styles.group, className)} {...props} />
}

export { ShimmerSkeleton, ShimmerGroup }
