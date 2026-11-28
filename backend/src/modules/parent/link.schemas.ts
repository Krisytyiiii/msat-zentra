import { z } from "zod";

/** Guardian link request from the parent workspace (learner matched by LRN). */
export const linkRequestSchema = z.object({
  lrn: z.string().trim().min(4, "Enter the learner's LRN").max(32),
  relationship: z.string().trim().min(2, "Choose a relationship").max(40).optional().default("Guardian"),
});

/** Administrator decision on a pending link request. */
export const linkDecisionSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
