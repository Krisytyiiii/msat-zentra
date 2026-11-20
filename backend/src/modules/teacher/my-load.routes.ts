import { Router, type Request } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { getTeacherLoad } from "../../services/teacher/timetable.read.service.js";

const router = Router();

function ctxOf(req: Request) {
  return {
    userId: req.user!.id,
    role: req.user!.role,
    termId: req.termScope?.termId ?? null,
    schoolYearId: req.termScope?.schoolYearId ?? null,
  };
}

/**
 * Published teaching load for the teacher's own desks. Data only — the teacher
 * shell has no timetable surface; attendance needs the class pairs and the
 * weekdays each class meets.
 */
router.get(
  "/my-load",
  requireAuth,
  requireRole("subject_teacher", "adviser"),
  async (req, res, next) => {
    try {
      res.json(await getTeacherLoad(ctxOf(req)));
    } catch (e) {
      next(e);
    }
  },
);

export default router;
