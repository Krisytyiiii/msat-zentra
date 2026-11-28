import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import { writeAudit } from "../../lib/audit.js";
import { fanoutNotification, fanoutToRole } from "../../lib/notify.js";
import { paginated } from "../../lib/pagination.js";
import type { Prisma } from "../../generated/prisma/client.js";

/**
 * Guardian → learner link requests.
 *
 * A `ParentStudentLink` with `approvedBy = null` is a request the parent filed
 * from the parent workspace; the administrator approves it from the Pending
 * approvals desk (which stamps `approvedBy`) or declines it (row removed, so
 * the parent may ask again). Portal reads only accept approved links
 * (`lib/portalAccess.ts`), so nothing is exposed before approval.
 */
const LINK_TABLE = "parent_student_links";

const learnerSelect = {
  userId: true,
  lrn: true,
  gradeLevel: true,
  user: { select: { fullName: true } },
  section: { select: { name: true } },
} as const;

const linkSelect = {
  id: true,
  relationship: true,
  createdAt: true,
  approvedBy: true,
  student: { select: learnerSelect },
} as const;

const adminLinkSelect = {
  id: true,
  parentId: true,
  relationship: true,
  createdAt: true,
  parent: { select: { user: { select: { fullName: true, email: true } } } },
  student: { select: learnerSelect },
} as const;

interface LinkRow {
  id: string;
  relationship: string;
  createdAt: Date;
  approvedBy: string | null;
  student: {
    userId: string;
    lrn: string;
    gradeLevel: string;
    user: { fullName: string };
    section: { name: string } | null;
  };
}

export interface ParentLinkRequestDto {
  id: string;
  relationship: string;
  requestedAt: string;
  approved: boolean;
  student: {
    studentId: string;
    name: string;
    lrn: string;
    gradeLevel: string;
    sectionName: string | null;
  };
}

function linkDto(row: LinkRow): ParentLinkRequestDto {
  return {
    id: row.id,
    relationship: row.relationship,
    requestedAt: row.createdAt.toISOString(),
    approved: row.approvedBy !== null,
    student: {
      studentId: row.student.userId,
      name: row.student.user.fullName,
      lrn: row.student.lrn,
      gradeLevel: row.student.gradeLevel,
      sectionName: row.student.section?.name ?? null,
    },
  };
}

type AdminLinkRow = Prisma.ParentStudentLinkGetPayload<{ select: typeof adminLinkSelect }>;

function adminLinkDto(row: AdminLinkRow) {
  return {
    id: row.id,
    relationship: row.relationship,
    requestedAt: row.createdAt.toISOString(),
    parent: {
      id: row.parentId,
      name: row.parent.user.fullName,
      email: row.parent.user.email,
    },
    student: {
      studentId: row.student.userId,
      name: row.student.user.fullName,
      lrn: row.student.lrn,
      gradeLevel: row.student.gradeLevel,
      sectionName: row.student.section?.name ?? null,
    },
  };
}

/** Pending requests filed by the signed-in guardian (approved ones are children). */
export async function listParentLinkRequests(parentId: string): Promise<ParentLinkRequestDto[]> {
  const rows = await prisma.parentStudentLink.findMany({
    where: { parentId, approvedBy: null },
    orderBy: { createdAt: "asc" },
    select: linkSelect,
  });
  return rows.map(linkDto);
}

/** File a link request for a learner by LRN. Idempotent guard per learner. */
export async function requestLearnerLink(
  parentId: string,
  input: { lrn: string; relationship: string },
): Promise<ParentLinkRequestDto> {
  const lrn = input.lrn.trim();

  const [parent, student] = await Promise.all([
    prisma.user.findUnique({ where: { id: parentId }, select: { fullName: true } }),
    prisma.studentProfile.findUnique({
      where: { lrn },
      select: {
        userId: true,
        lrn: true,
        gradeLevel: true,
        user: { select: { fullName: true, status: true } },
        section: { select: { name: true } },
      },
    }),
  ]);
  if (!parent) throw new AppError(404, "PARENT_NOT_FOUND", "Parent account not found");
  if (!student) {
    throw new AppError(
      404,
      "LEARNER_NOT_FOUND",
      "No learner with that LRN has a Zentra account yet. Ask the school office to create it first.",
    );
  }
  if (student.user.status !== "active") {
    throw new AppError(
      409,
      "LEARNER_NOT_ACTIVE",
      "That learner's account is not active yet. Ask the school office to activate it first.",
    );
  }

  const existing = await prisma.parentStudentLink.findUnique({
    where: { parentId_studentId: { parentId, studentId: student.userId } },
    select: { id: true, approvedBy: true },
  });
  if (existing?.approvedBy) {
    throw new AppError(409, "ALREADY_LINKED", "This learner is already linked to your account");
  }
  if (existing) {
    throw new AppError(
      409,
      "LINK_REQUEST_PENDING",
      "A link request for this learner is already waiting for approval",
    );
  }

  const created = await prisma.parentStudentLink.create({
    data: {
      parentId,
      studentId: student.userId,
      relationship: input.relationship.trim() || "Guardian",
    },
    select: linkSelect,
  });

  await writeAudit({
    userId: parentId,
    actionType: "create",
    sourceTable: LINK_TABLE,
    sourceId: created.id,
    reason: `Guardian requested a link to ${student.user.fullName} (LRN ${lrn})`,
    newValue: { relationship: created.relationship, studentId: student.userId },
  });

  await fanoutToRole("admin", {
    sourceTable: LINK_TABLE,
    action: "create",
    sourceId: created.id,
    message: `Link request: ${parent.fullName} asked to link ${student.user.fullName} (LRN ${lrn}). Review it in Pending approvals.`,
  });

  return linkDto(created);
}

/** Withdraw a pending request. Approved links are managed by the admin desk. */
export async function cancelLearnerLink(parentId: string, linkId: string): Promise<void> {
  const removed = await prisma.parentStudentLink.deleteMany({
    where: { id: linkId, parentId, approvedBy: null },
  });
  if (removed.count === 0) {
    throw new AppError(404, "LINK_REQUEST_NOT_FOUND", "That link request is no longer waiting");
  }
  await writeAudit({
    userId: parentId,
    actionType: "delete",
    sourceTable: LINK_TABLE,
    sourceId: linkId,
    reason: "Guardian withdrew a pending learner link request",
  });
}

export interface AdminLinkQuery {
  page: number;
  pageSize: number;
  q?: string;
}

/** Every pending guardian link request, oldest first, for the admin desk. */
export async function listAdminLinkRequests(query: AdminLinkQuery) {
  const q = query.q?.trim() ?? "";
  const where: Prisma.ParentStudentLinkWhereInput = {
    approvedBy: null,
    ...(q
      ? {
          OR: [
            { student: { user: { fullName: { contains: q, mode: "insensitive" } } } },
            { student: { lrn: { contains: q, mode: "insensitive" } } },
            { parent: { user: { fullName: { contains: q, mode: "insensitive" } } } },
            { parent: { user: { email: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.parentStudentLink.count({ where }),
    prisma.parentStudentLink.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: adminLinkSelect,
    }),
  ]);

  return paginated(rows.map(adminLinkDto), total, query.page, query.pageSize);
}

export async function approveLearnerLink(adminId: string, linkId: string) {
  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.parentStudentLink.updateMany({
      where: { id: linkId, approvedBy: null },
      data: { approvedBy: adminId },
    });
    if (updated.count === 0) {
      throw new AppError(
        404,
        "LINK_REQUEST_NOT_FOUND",
        "That link request is no longer waiting for approval",
      );
    }
    const found = await tx.parentStudentLink.findUnique({
      where: { id: linkId },
      select: { parentId: true, student: { select: learnerSelect } },
    });
    if (!found) {
      throw new AppError(404, "LINK_REQUEST_NOT_FOUND", "That link request no longer exists");
    }
    await writeAudit(
      {
        userId: adminId,
        actionType: "account_approval",
        sourceTable: LINK_TABLE,
        sourceId: linkId,
        reason: `Approved guardian link to ${found.student.user.fullName} (LRN ${found.student.lrn})`,
        newValue: { approvedBy: adminId },
      },
      tx,
    );
    return found;
  });

  await fanoutNotification({
    userId: row.parentId,
    sourceTable: LINK_TABLE,
    action: "approve",
    sourceId: linkId,
    message: `${row.student.user.fullName} (LRN ${row.student.lrn}) is now linked to your account. Open the parent workspace to view their records.`,
  });

  return { id: linkId, status: "approved" as const };
}

export async function rejectLearnerLink(adminId: string, linkId: string, reason?: string) {
  const row = await prisma.$transaction(async (tx) => {
    const found = await tx.parentStudentLink.findFirst({
      where: { id: linkId, approvedBy: null },
      select: {
        parentId: true,
        relationship: true,
        student: { select: learnerSelect },
      },
    });
    if (!found) {
      throw new AppError(
        404,
        "LINK_REQUEST_NOT_FOUND",
        "That link request is no longer waiting for approval",
      );
    }
    await tx.parentStudentLink.delete({ where: { id: linkId } });
    await writeAudit(
      {
        userId: adminId,
        actionType: "delete",
        sourceTable: LINK_TABLE,
        sourceId: linkId,
        reason:
          reason?.trim() ||
          `Declined guardian link to ${found.student.user.fullName} (LRN ${found.student.lrn})`,
        oldValue: { relationship: found.relationship, studentId: found.student.userId },
      },
      tx,
    );
    return found;
  });

  await fanoutNotification({
    userId: row.parentId,
    sourceTable: LINK_TABLE,
    action: "reject",
    sourceId: linkId,
    message: `Your request to link ${row.student.user.fullName} (LRN ${row.student.lrn}) was not approved. You can send a new request from the parent workspace.`,
  });

  return { id: linkId, status: "declined" as const };
}
