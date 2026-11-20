import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { cache } from "../../lib/cache.js";
import { resolveActiveTermId } from "../../services/risk.js";
import { activeScheduleConfigForTerm } from "../../lib/schedule-config.js";
import { AppError } from "../../lib/errors.js";
import {
  SCHEDULE_CONFIG_DEFAULTS,
  toScheduleConfig,
} from "../../modules/teacher/teacher.labels.js";

const router = Router();

/**
 * Principal read-only view of section timetables. The administrator desk owns
 * configuration and publishing; there is no submit/approve step, so drafts
 * stay private to the admin workspace and only published grids are shown here.
 */
router.get(
  "/schedule/sections",
  requireAuth,
  requireRole("principal"),
  cache({ tags: ["academics", "principal"] }),
  async (req, res, next) => {
    try {
      const termId = await resolveActiveTermId(req);
      if (!termId) {
        throw new AppError(400, "NO_ACTIVE_TERM", "No active term selected");
      }
      const config = await activeScheduleConfigForTerm(termId);
      const sections = await prisma.section.findMany({
        where: {
          gradeLevel: { in: ["G7", "G8", "G9", "G10", "G11", "G12"] },
        },
        select: {
          id: true,
          name: true,
          gradeLevel: true,
          adviser: { select: { fullName: true } },
          timetableEntries: {
            where: { termId, status: "APPROVED" },
            select: {
              day: true,
              period: true,
              status: true,
              subject: { select: { id: true, name: true, code: true } },
              teacherName: { select: { id: true, name: true } },
              reviewedAt: true,
              reviewer: { select: { fullName: true } },
            },
            orderBy: [{ day: "asc" }, { period: "asc" }],
          },
        },
        orderBy: [{ gradeLevel: "asc" }, { name: "asc" }],
      });
      res.json({ sections, config: config ? toScheduleConfig(config) : SCHEDULE_CONFIG_DEFAULTS });
    } catch (e) {
      next(e);
    }
  }
);

export default router;
