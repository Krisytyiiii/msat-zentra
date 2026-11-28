import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { AppError } from "../../lib/errors.js";
import { resolveActiveTermId } from "../../lib/term-resolve.js";
import {
  loadPortalLearner,
  listLearnerTerms,
  resolvePortalTerm,
} from "../../lib/portalAccess.js";
import {
  placementForStudent,
  redeemLearnerCode,
} from "../../services/learnerLink.js";
import { getLearnerSubjectRecord } from "../../services/portal/learnerRecord.service.js";
import { getLearnerSubjectAttendance } from "../../services/portal/learnerAttendance.service.js";
import {
  getLearnerAttendance,
  getLearnerGrades,
  getLearnerHome,
  getLearnerMe,
  getLearnerSchedule,
  getUpcomingSessions,
} from "../../services/portal/learnerData.service.js";

const router = Router();

const learnerLinkSchema = z.object({
  code: z.string().trim().min(1, "Enter the code from your enrolment slip").max(32),
});

function termIdOf(req: { query: Record<string, unknown> }): string | undefined {
  const raw = req.query.termId;
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

async function termFor(req: { query: Record<string, unknown> }) {
  return resolvePortalTerm(termIdOf(req as { query: Record<string, unknown> }), await resolveActiveTermId());
}

router.use(requireAuth, requireRole("student"));

router.get("/me", async (req, res, next) => {
  try {
    const term = await termFor(req);
    const placement = await placementForStudent(req.user!.id, term.schoolYearId);
    // An active account with no class yet is a state, not a 404: the portal
    // needs to render the "enter your class code" gate for it.
    const learner = placement.hasProfile ? await loadPortalLearner(req.user!.id, term) : null;
    res.json({ learner, term, profile: await getLearnerMe(req.user!.id), placement });
  } catch (e) {
    next(e);
  }
});

router.post("/link", validate("body", learnerLinkSchema), async (req, res, next) => {
  try {
    const result = await redeemLearnerCode(req.user!.id, (req.body as { code: string }).code);
    const term = await termFor(req);
    res.json({
      ...result,
      placement: await placementForStudent(req.user!.id, term.schoolYearId),
    });
  } catch (e) {
    next(e);
  }
});

router.get("/terms", async (req, res, next) => {
  try {
    const activeTermId = await resolveActiveTermId();
    res.json({ terms: await listLearnerTerms(req.user!.id, activeTermId), activeTermId });
  } catch (e) {
    next(e);
  }
});

router.get("/home", async (req, res, next) => {
  try {
    const term = await termFor(req);
    const learner = await loadPortalLearner(req.user!.id, term);
    res.json(await getLearnerHome(req.user!.id, learner, term));
  } catch (e) {
    next(e);
  }
});

router.get("/grades", async (req, res, next) => {
  try {
    res.json(await getLearnerGrades(req.user!.id, await termFor(req)));
  } catch (e) {
    next(e);
  }
});

router.get("/subjects/:subjectId/record", async (req, res, next) => {
  try {
    const subjectId = String(req.params.subjectId ?? "").trim();
    if (!subjectId) throw new AppError(400, "SUBJECT_REQUIRED", "A subject is required");
    res.json(
      await getLearnerSubjectRecord(req.user!.id, subjectId, await termFor(req)),
    );
  } catch (e) {
    next(e);
  }
});

router.get("/subjects/:subjectId/attendance", async (req, res, next) => {
  try {
    const subjectId = String(req.params.subjectId ?? "").trim();
    if (!subjectId) throw new AppError(400, "SUBJECT_REQUIRED", "A subject is required");
    res.json(
      await getLearnerSubjectAttendance(req.user!.id, subjectId, await termFor(req)),
    );
  } catch (e) {
    next(e);
  }
});

router.get("/attendance", async (req, res, next) => {
  try {
    res.json(await getLearnerAttendance(req.user!.id, await termFor(req)));
  } catch (e) {
    next(e);
  }
});

router.get("/schedule", async (req, res, next) => {
  try {
    res.json(await getLearnerSchedule(req.user!.id, await termFor(req)));
  } catch (e) {
    next(e);
  }
});

router.get("/sessions", async (req, res, next) => {
  try {
    res.json({ sessions: await getUpcomingSessions(req.user!.id) });
  } catch (e) {
    next(e);
  }
});

export default router;
