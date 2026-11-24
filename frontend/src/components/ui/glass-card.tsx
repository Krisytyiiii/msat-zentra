"use client";

import * as React from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";
import { cn } from "@/lib/utils";

/* Glass-card pointer choreography: a spring-damped 3D tilt that follows the
   cursor plus a soft glare that tracks it across the surface. The glass
   surface itself is painted by the consumer (see student-list.module.css) so
   this wrapper stays markup-agnostic — it only adds the motion + glare. */

const TILT_SPRING = { stiffness: 220, damping: 26, mass: 0.7 };
const GLARE_RADIUS = 320;

export function GlassCard({
  children,
  className,
  intensity = 6,
  disabled = false,
}: {
  children: React.ReactNode;
  className?: string;
  /** Max rotation in degrees at the card's corners. */
  intensity?: number;
  /** Skip tilt/glare entirely (reduced-motion or non-interactive cards). */
  disabled?: boolean;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const interactive = !disabled && !reduceMotion;

  const rotateXRaw = useMotionValue(0);
  const rotateYRaw = useMotionValue(0);
  const rotateX = useSpring(rotateXRaw, TILT_SPRING);
  const rotateY = useSpring(rotateYRaw, TILT_SPRING);

  const glareX = useMotionValue(50);
  const glareY = useMotionValue(50);
  const glare = useMotionTemplate`radial-gradient(${GLARE_RADIUS}px circle at ${glareX}% ${glareY}%, rgba(245,158,11,0.22), transparent 65%)`;

  const [glowing, setGlowing] = React.useState(false);

  const handlePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!interactive) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const px = (event.clientX - rect.left) / rect.width;
      const py = (event.clientY - rect.top) / rect.height;
      rotateYRaw.set((px - 0.5) * intensity * 2);
      rotateXRaw.set((0.5 - py) * intensity * 2);
      glareX.set(px * 100);
      glareY.set(py * 100);
    },
    [interactive, intensity, rotateXRaw, rotateYRaw, glareX, glareY],
  );

  const reset = React.useCallback(() => {
    rotateXRaw.set(0);
    rotateYRaw.set(0);
    setGlowing(false);
  }, [rotateXRaw, rotateYRaw]);

  return (
    <div
      className={cn("group/glass relative [perspective:1000px]", className)}
      onPointerMove={handlePointerMove}
      onPointerEnter={() => {
        if (interactive) setGlowing(true);
      }}
      onPointerLeave={reset}
    >
      <motion.div
        className="relative h-full w-full [transform-style:preserve-3d]"
        style={{ rotateX, rotateY, willChange: "transform" }}
      >
        {children}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20 rounded-xl"
          style={{ background: glare }}
          initial={false}
          animate={{ opacity: glowing ? 1 : 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        />
      </motion.div>
    </div>
  );
}
