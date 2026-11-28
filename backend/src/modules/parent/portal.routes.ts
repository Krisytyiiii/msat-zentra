import { Router, type Request } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { resolveActiveTermId } from "../../lib/term-resolve.js";
import { AppError } from "../../lib/errors.js";
import { validate } from "../../middleware/validate.js";
import { studentModulesQuerySchema } from "../student/modules.schemas.js";
import type { ModuleStatus } from "../teacher/advisory-modules.schemas.js";
import {
  assertLearnerAccess,
  listLearnerTerms,
  listLinkedChildren,
  loadPortalLearner,
  resolvePortalTerm,
} from "../../lib/portalAccess.js";
import {
  getLearnerAttendance,
  getLearnerGrades,
  getLearnerHome,
  getLearnerModules,
  getLearnerSchedule,
  getUpcomingSessions,
} from "../../services/portal/learnerData.service.js";
import {
  getLearnerSubjectAttendance,
} from "../../services/portal/learnerAttendance.service.js";
import {
  getLearnerSubjectRecord,
} from "../../services/portal/learnerRecord.service.js";
import {
  cancelLearnerLink,
  listParentLinkRequests,
  requestLearnerLink,
} from "../../services/parent/link.service.js";
import { linkRequestSchema } from "./link.schemas.js";

const router = Router();

function termIdOf(req: { query: Record<string, unknown> }): string | undefined {
  const raw = req.query.termId;
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

async function termFor(req: { query: Record<string, unknown> }) {
  return resolvePortalTerm(termIdOf(req), await resolveActiveTermId());
}

/** Resolve + authorize the child in one step for every child-scoped route. */
async function childOf(req: Request) {
  const studentId = String(req.params.studentId);
  await assertLearnerAccess(
    { id: req.user!.id, role: req.user!.role },
    studentId,
  );
  return { studentId, learner: await loadPortalLearner(studentId) };
}

router.use(requireAuth, requireRole("parent"));

router.get("/me", async (req, res, next) => {
  try {
    const [parent, children] = await Promise.all([
      prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { fullName: true, email: true },
      }),
      listLinkedChildren(req.user!.id),
    ]);
    res.json({ parent, children });
  } catch (e) {
    next(e);
  }
});

router.get("/children", async (req, res, next) => {
  try {
    res.json({ children: await listLinkedChildren(req.user!.id) });
  } catch (e) {
    next(e);
  }
});

/* ---- Guardian link requests ---------------------------------------------
 * A parent with no linked child (or adding another one) files an LRN-based
 * request here. It stays invisible to portal reads until the administrator
 * approves it from the Pending approvals desk; approval fanouts a notification
 * so the workspace can refetch and pick the new child up.
 */
router.get("/link-requests", async (req, res, next) => {
  try {
    res.json({ requests: await listParentLinkRequests(req.user!.id) });
  } catch (e) {
    next(e);
  }
});

router.post("/link-requests", validate("body", linkRequestSchema), async (req, res, next) => {
  try {
    const body = req.body as { lrn: string; relationship: string };
    res.status(201).json({ request: await requestLearnerLink(req.user!.id, body) });
  } catch (e) {
    next(e);
  }
});

router.delete("/link-requests/:id", async (req, res, next) => {
  try {
    await cancelLearnerLink(req.user!.id, String(req.params.id));
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

router.get("/children/:studentId/terms", async (req, res, next) => {
  try {
    const { studentId } = await childOf(req);
    const activeTermId = await resolveActiveTermId();
    res.json({ terms: await listLearnerTerms(studentId, activeTermId), activeTermId });
  } catch (e) {
    next(e);
  }
});

router.get("/children/:studentId/home", async (req, res, next) => {
  try {
    const { studentId } = await childOf(req);
    const term = await termFor(req);
    const learner = await loadPortalLearner(studentId, term);
    res.json(await getLearnerHome(studentId, learner, term));
  } catch (e) {
    next(e);
  }
});

router.get("/children/:studentId/grades", async (req, res, next) => {
  try {
    const { studentId } = await childOf(req);
    res.json(await getLearnerGrades(studentId, await termFor(req)));
  } catch (e) {
    next(e);
  }
});

router.get("/children/:studentId/subjects/:subjectId/record", async (req, res, next) => {
  try {
    const { studentId } = await childOf(req);
    const subjectId = String(req.params.subjectId ?? "").trim();
    if (!subjectId) throw new AppError(400, "SUBJECT_REQUIRED", "A subject is required");
    res.json(await getLearnerSubjectRecord(studentId, subjectId, await termFor(req)));
  } catch (e) {
    next(e);
  }
});

router.get("/children/:studentId/subjects/:subjectId/attendance", async (req, res, next) => {
  try {
    const { studentId } = await childOf(req);
    const subjectId = String(req.params.subjectId ?? "").trim();
    if (!subjectId) throw new AppError(400, "SUBJECT_REQUIRED", "A subject is required");
    res.json(await getLearnerSubjectAttendance(studentId, subjectId, await termFor(req)));
  } catch (e) {
    next(e);
  }
});

router.get("/children/:studentId/attendance", async (req, res, next) => {
  try {
    const { studentId } = await childOf(req);
    res.json(await getLearnerAttendance(studentId, await termFor(req)));
  } catch (e) {
    next(e);
  }
});

router.get("/children/:studentId/schedule", async (req, res, next) => {
  try {
    const { studentId } = await childOf(req);
    res.json(await getLearnerSchedule(studentId, await termFor(req)));
  } catch (e) {
    next(e);
  }
});

router.get("/children/:studentId/modules", validate("query", studentModulesQuerySchema), async (req, res, next) => {
  try {
    const { studentId } = await childOf(req);
    const { page, pageSize, status } = req.query as unknown as {
      page: number; pageSize: number; status?: ModuleStatus;
    };
    res.json(await getLearnerModules(studentId, (await termFor(req)).id, { page, pageSize, status }));
  } catch (e) {
    next(e);
  }
});

router.get("/children/:studentId/sessions", async (req, res, next) => {
  try {
    const { studentId } = await childOf(req);
    res.json({ sessions: await getUpcomingSessions(studentId) });
  } catch (e) {
    next(e);
  }
});

export default router;
