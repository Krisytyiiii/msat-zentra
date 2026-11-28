import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { matchLrn } from "../../lib/lrnMatch.js";
import {
  paginated,
  paginationQuerySchema,
  resolvePaging,
} from "../../lib/pagination.js";
import { writeAudit } from "../../lib/audit.js";
import { AppError } from "../../lib/errors.js";
import { invalidateTags } from "../../lib/cache.js";
import { clearNoClassCache } from "../../services/noClass.js";
import { listAudit, summarizeAudit } from "../../services/audit/audit.service.js";
import { getAdminNavQueues } from "../../services/admin/navCounts.service.js";
import { listActivePresence, listLoginActivity } from "../../services/presence.service.js";
import {
  approveAccount,
  listPending,
  rejectAccount,
} from "../../services/auth/approval.service.js";
import {
  approveSchema,
  pendingAccountsQuerySchema,
  rejectSchema,
} from "../auth/auth.schemas.js";
import {
  approveLearnerLink,
  listAdminLinkRequests,
  rejectLearnerLink,
} from "../../services/parent/link.service.js";
import { linkDecisionSchema } from "../parent/link.schemas.js";
import type { GradeLevel } from "../../generated/prisma/client.js";

const router = Router();

// Every admin endpoint is behind the dedicated administrator role. Admin
// accounts have no desk data of their own; they only read system aggregates.
router.use(requireAuth, requireRole("admin"));

function countByRole(rows: { role: string; _count: { _all: number } }[]): Record<string, number> {
  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.role] = row._count._all;
    return acc;
  }, {});
}

function countByStatus(rows: { status: string; _count: { _all: number } }[]): Record<string, number> {
  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = row._count._all;
    return acc;
  }, {});
}

/**
 * Live presence for the overview globe. Deliberately uncached: the board polls
 * it every 20 s and must reflect the last five minutes exactly.
 */
router.get("/presence", async (_req, res, next) => {
  try {
    res.json(await listActivePresence());
  } catch (e) {
    next(e);
  }
});

/** Sign-ins per hour (default 24h) for the overview login-activity chart. */
router.get("/login-activity", async (req, res, next) => {
  try {
    const raw = Number(req.query.hours ?? 24);
    const hours = Number.isFinite(raw) ? raw : 24;
    res.json(await listLoginActivity(hours));
  } catch (e) {
    next(e);
  }
});

/**
 * The administrator's own account card. Admin accounts are created without a
 * staff profile, so the mascot falls back to the sprite derived from the name
 * on the client — this endpoint only reports what is stored.
 */
router.get("/profile", async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        staffProfile: { select: { mascot: true, photoUrl: true } },
      },
    });
    if (!user) throw new AppError(404, "NOT_FOUND", "Account not found");
    res.json({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      mascot: user.staffProfile?.mascot ?? null,
      photoUrl: user.staffProfile?.photoUrl ?? null,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * System-wide notification feed for the administrator bell: every desk's
 * notices, newest first, each tagged with its recipient. The admin owns no
 * desk data, so its own inbox is nearly empty; the console is the place where
 * "what just happened in the school" is visible.
 */
router.get("/notifications", async (req, res, next) => {
  try {
    const rawTake = Number(req.query.take);
    const take = Number.isFinite(rawTake)
      ? Math.min(Math.max(Math.floor(rawTake), 1), 100)
      : 50;
    const rows = await prisma.notification.findMany({
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        type: true,
        message: true,
        isRead: true,
        createdAt: true,
        sourceTable: true,
        sourceId: true,
        user: { select: { fullName: true, role: true } },
      },
    });
    res.json(
      rows.map(({ user, ...note }) => ({
        ...note,
        createdAt: note.createdAt.toISOString(),
        recipientName: user.fullName,
        recipientRole: user.role,
      })),
    );
  } catch (e) {
    next(e);
  }
});

/**
 * Sidebar dots for the administrator console: one version per page, so a page
 * whose data changed since the admin last opened it shows the same red dot the
 * other desks use. Realtime cannot cover the console (RLS scopes the published
 * streams per role), so the rail polls this while the console is visible.
 */
router.get("/nav-counts", async (_req, res, next) => {
  try {
    res.json(await getAdminNavQueues());
  } catch (e) {
    next(e);
  }
});

router.get("/overview", async (_req, res, next) => {
  try {
    const [
      byRole,
      byStatus,
      sections,
      subjects,
      schoolYears,
      referralsOpen,
      interventionsOngoing,
      admOpen,
      sf10Pending,
      recentUsers,
    ] = await Promise.all([
      prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
      prisma.user.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.section.count(),
      prisma.subject.count(),
      prisma.schoolYear.count(),
      prisma.referral.count({
        where: { status: { notIn: ["resolved", "dismissed"] } },
      }),
      prisma.intervention.count({ where: { outcomeStatus: "ongoing" } }),
      prisma.admLearnerProfile.count({ where: { stage: { not: "completion" } } }),
      prisma.sf10Record.count({ where: { status: { not: "released" } } }),
      prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          status: true,
          createdAt: true,
        },
      }),
    ]);

    const roleCounts = countByRole(byRole);
    const statusCounts = countByStatus(byStatus);
    const totalUsers = Object.values(statusCounts).reduce((sum, n) => sum + n, 0);

    res.json({
      users: {
        total: totalUsers,
        active: statusCounts.active ?? 0,
        pending: statusCounts.pending ?? 0,
        suspended: statusCounts.suspended ?? 0,
        byRole: roleCounts,
      },
      academics: { sections, subjects, schoolYears },
      operations: {
        referralsOpen,
        interventionsOngoing,
        admOpen,
        sf10Pending,
      },
      recentUsers: recentUsers.map((u) => ({
        ...u,
        createdAt: u.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    next(e);
  }
});

const usersQuerySchema = paginationQuerySchema().extend({
  role: z.string().trim().max(40).optional(),
  status: z.enum(["pending", "active", "suspended"]).optional(),
});

router.get(
  "/users",
  validate("query", usersQuerySchema),
  async (req, res, next) => {
    try {
      const { page, pageSize } = resolvePaging(req.query);
      const q = req.query as { q?: string; role?: string; status?: string };

      const where: Record<string, unknown> = {};
      if (q.role) where.role = q.role;
      if (q.status) where.status = q.status;
      const search = q.q?.trim();
      if (search) {
        where.OR = [
          { fullName: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ];
      }

      const [rows, total] = await Promise.all([
        prisma.user.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
            status: true,
            createdAt: true,
            studentProfile: { select: { mascot: true } },
            staffProfile: { select: { mascot: true } },
          },
        }),
        prisma.user.count({ where }),
      ]);

      res.json(
        paginated(
          rows.map(({ studentProfile, staffProfile, createdAt, ...u }) => ({
            ...u,
            createdAt: createdAt.toISOString(),
            mascot: staffProfile?.mascot ?? studentProfile?.mascot ?? null,
          })),
          total,
          page,
          pageSize,
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);

const updateStatusSchema = z.object({
  status: z.enum(["active", "suspended"]),
});

router.patch(
  "/users/:id/status",
  validate("body", updateStatusSchema),
  async (req, res, next) => {
    try {
      const target = await prisma.user.findUnique({
        where: { id: String(req.params.id) },
        select: { id: true, role: true, status: true, email: true },
      });
      if (!target) throw new AppError(404, "NOT_FOUND", "Account not found");
      if (target.role === "admin") {
        throw new AppError(
          403,
          "FORBIDDEN",
          "Administrator accounts cannot be changed from this console.",
        );
      }
      if (target.status === "pending") {
        throw new AppError(
          409,
          "PENDING_ACCOUNT",
          "Pending sign-ups are approved from the pending approvals queue on this page.",
        );
      }

      const status = (req.body as { status: "active" | "suspended" }).status;
      const updated = await prisma.user.update({
        where: { id: target.id },
        data: { status },
        select: { id: true, status: true },
      });

      await writeAudit({
        userId: req.user!.id,
        actionType: "update",
        sourceTable: "users",
        sourceId: target.id,
        reason: `Administrator set ${target.email} to ${status}.`,
        oldValue: { status: target.status },
        newValue: { status },
      });

      res.json(updated);
    } catch (e) {
      next(e);
    }
  },
);

/* ---- Account approvals ---------------------------------------------------
 * Self-registered students, parents and teachers all land here. The registry
 * desks no longer review sign-ups: identity approval is a system decision, so
 * the administrator owns the queue (and the LRN verification behind it).
 */
const ALL_GRADES: GradeLevel[] = ["G7", "G8", "G9", "G10", "G11", "G12"];

router.get(
  "/account-approvals",
  validate("query", pendingAccountsQuerySchema),
  async (req, res, next) => {
    try {
      const q = req.query as Record<string, unknown>;
      const roleFilter = typeof q.role === "string" && q.role ? q.role : "student";
      const search = typeof q.q === "string" ? q.q.trim().toLowerCase() : "";
      res.json(
        await listPending({
          band: ALL_GRADES,
          roleFilter,
          q: search,
          page: q.page !== undefined ? Number(q.page) : 1,
          pageSize: q.pageSize !== undefined ? Number(q.pageSize) : 15,
          hasPaging: true,
        }),
      );
    } catch (e) {
      next(e);
    }
  },
);

router.get("/account-approvals/lrn-match", async (req, res, next) => {
  try {
    const lrn = typeof req.query.lrn === "string" ? req.query.lrn.trim() : "";
    const name = typeof req.query.name === "string" ? req.query.name : "";
    if (!lrn) throw new AppError(400, "LRN_REQUIRED", "lrn query parameter is required");
    res.json(await matchLrn(lrn, name));
  } catch (e) {
    next(e);
  }
});

router.post(
  "/account-approvals/:userId/approve",
  validate("params", approveSchema),
  async (req, res, next) => {
    try {
      res.json(
        await approveAccount(
          { userId: req.user!.id, role: req.user!.role },
          String(req.params.userId),
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/account-approvals/:userId/reject",
  validate("params", approveSchema),
  validate("body", rejectSchema),
  async (req, res, next) => {
    try {
      res.json(
        await rejectAccount(
          { userId: req.user!.id, role: req.user!.role },
          String(req.params.userId),
          (req.body as { reason: string }).reason,
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);

/* ---- Guardian link requests ---------------------------------------------
 * A parent files an LRN-based request from the parent workspace; the admin
 * approves (stamps `ParentStudentLink.approvedBy`) or declines (row removed).
 * Lives on the same approval desk as guardian sign-ups.
 */
router.get(
  "/link-requests",
  validate("query", paginationQuerySchema()),
  async (req, res, next) => {
    try {
      const q = req.query as unknown as { page: number; pageSize: number; q: string };
      res.json(
        await listAdminLinkRequests({ page: q.page, pageSize: q.pageSize, q: q.q }),
      );
    } catch (e) {
      next(e);
    }
  },
);

router.post("/link-requests/:id/approve", async (req, res, next) => {
  try {
    res.json(await approveLearnerLink(req.user!.id, String(req.params.id)));
  } catch (e) {
    next(e);
  }
});

router.post(
  "/link-requests/:id/reject",
  validate("body", linkDecisionSchema),
  async (req, res, next) => {
    try {
      res.json(
        await rejectLearnerLink(
          req.user!.id,
          String(req.params.id),
          (req.body as { reason?: string }).reason,
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);

// ---------------------------------------------------------------------------
// No-class days — administrator-declared suspensions of classes for a date.
// Whole-day (or AM/PM) cancellations are honored by every attendance
// denominator and by the auto-absent sweep, and teachers cannot submit a sheet
// for a cancelled meetup.
// ---------------------------------------------------------------------------
const noClassDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

const noClassQuerySchema = z.object({
  schoolYearId: z.string().uuid().optional(),
  from: noClassDateSchema.optional(),
  to: noClassDateSchema.optional(),
});

const noClassBodySchema = z.object({
  date: noClassDateSchema,
  scope: z.enum(["whole_day", "am", "pm"]),
  reason: z.string().trim().min(3).max(500),
  schoolYearId: z.string().uuid().optional(),
});

async function resolveNoClassSchoolYear(
  req: { termScope?: { schoolYearId?: string } },
  explicit?: string,
): Promise<string> {
  if (explicit) return explicit;
  if (req.termScope?.schoolYearId) return req.termScope.schoolYearId;
  const active = await prisma.schoolYear.findFirst({
    where: { isActive: true },
    select: { id: true },
  });
  if (!active) {
    throw new AppError(400, "NO_SCHOOL_YEAR", "No active school year to file this date under");
  }
  return active.id;
}

function noClassDto(row: {
  id: string;
  date: Date;
  scope: string;
  reason: string;
  schoolYearId: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    date: row.date.toISOString().slice(0, 10),
    scope: row.scope,
    reason: row.reason,
    schoolYearId: row.schoolYearId,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const NO_CLASS_CACHE_TAGS = [
  "attendance",
  "overview",
  "principal",
  "teacher",
  "risk",
  "reports",
  "guidance",
  "alerts",
];

router.get(
  "/no-class-days",
  validate("query", noClassQuerySchema),
  async (req, res, next) => {
    try {
      const schoolYearId = await resolveNoClassSchoolYear(
        req as { termScope?: { schoolYearId?: string } },
        (req.query as { schoolYearId?: string }).schoolYearId,
      );
      const year = await prisma.schoolYear.findUnique({
        where: { id: schoolYearId },
        select: { startDate: true, endDate: true },
      });
      if (!year) throw new AppError(404, "NOT_FOUND", "School year not found");
      const q = req.query as { from?: string; to?: string };
      const from = q.from ?? year.startDate.toISOString().slice(0, 10);
      const to = q.to ?? year.endDate.toISOString().slice(0, 10);

      const rows = await prisma.noClassDay.findMany({
        where: {
          schoolYearId,
          date: {
            gte: new Date(`${from}T00:00:00Z`),
            lte: new Date(`${to}T00:00:00Z`),
          },
        },
        orderBy: { date: "desc" },
      });
      res.json({ schoolYearId, from, to, entries: rows.map(noClassDto) });
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/no-class-days",
  validate("body", noClassBodySchema),
  async (req, res, next) => {
    try {
      const body = req.body as {
        date: string;
        scope: "whole_day" | "am" | "pm";
        reason: string;
        schoolYearId?: string;
      };
      const schoolYearId = await resolveNoClassSchoolYear(
        req as { termScope?: { schoolYearId?: string } },
        body.schoolYearId,
      );
      const date = new Date(`${body.date}T00:00:00Z`);
      if (Number.isNaN(date.getTime())) {
        throw new AppError(400, "BAD_DATE", "Invalid calendar date");
      }
      const existing = await prisma.noClassDay.findUnique({ where: { date } });
      const row = existing
        ? await prisma.noClassDay.update({
            where: { id: existing.id },
            data: { scope: body.scope, reason: body.reason, schoolYearId },
          })
        : await prisma.noClassDay.create({
            data: {
              date,
              scope: body.scope,
              reason: body.reason,
              schoolYearId,
              createdBy: req.user!.id,
            },
          });

      await writeAudit({
        userId: req.user!.id,
        actionType: existing ? "no_class_day_update" : "no_class_day_create",
        sourceTable: "NoClassDay",
        sourceId: row.id,
        reason: `No class on ${body.date} (${body.scope}): ${body.reason}`,
      });
      await invalidateTags(NO_CLASS_CACHE_TAGS);
      clearNoClassCache();
      res.status(existing ? 200 : 201).json(noClassDto(row));
    } catch (e) {
      next(e);
    }
  },
);

router.delete("/no-class-days/:id", async (req, res, next) => {
  try {
    const row = await prisma.noClassDay.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!row) throw new AppError(404, "NOT_FOUND", "No-class day not found");
    await prisma.noClassDay.delete({ where: { id: row.id } });
    await writeAudit({
      userId: req.user!.id,
      actionType: "no_class_day_delete",
      sourceTable: "NoClassDay",
      sourceId: row.id,
      reason: `Removed no-class day ${row.date.toISOString().slice(0, 10)}`,
    });
    await invalidateTags(NO_CLASS_CACHE_TAGS);
    clearNoClassCache();
    res.json({ id: row.id, removed: true });
  } catch (e) {
    next(e);
  }
});

const auditQuerySchema = paginationQuerySchema().extend({
  actionType: z.string().trim().max(80).optional(),
  sourceTable: z.string().trim().max(80).optional(),
  from: z.string().trim().max(30).optional(),
  to: z.string().trim().max(30).optional(),
  q: z.string().trim().max(200).optional(),
});

router.get(
  "/audit/summary",
  validate("query", auditQuerySchema),
  async (req, res, next) => {
    try {
      const { actionType, sourceTable, from, to, q } = req.query as Record<
        string,
        string | undefined
      >;
      res.json(
        await summarizeAudit({
          actionType: actionType == null ? undefined : String(actionType),
          sourceTable: sourceTable == null ? undefined : String(sourceTable),
          from: from == null ? undefined : String(from),
          to: to == null ? undefined : String(to),
          q: q == null ? undefined : String(q),
        }),
      );
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/audit",
  validate("query", auditQuerySchema),
  async (req, res, next) => {
    try {
      const { actionType, sourceTable, from, to, q, page, pageSize } = req.query as Record<
        string,
        string | number | undefined
      >;
      res.json(
        await listAudit({
          actionType: actionType == null ? undefined : String(actionType),
          sourceTable: sourceTable == null ? undefined : String(sourceTable),
          from: from == null ? undefined : String(from),
          to: to == null ? undefined : String(to),
          q: q == null ? undefined : String(q),
          page: String(page ?? "1"),
          pageSize: String(pageSize ?? "15"),
        }),
      );
    } catch (e) {
      next(e);
    }
  },
);

export default router;
