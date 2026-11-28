import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  studentFindUnique: vi.fn(),
  linkFindUnique: vi.fn(),
  linkFindMany: vi.fn(),
  linkCreate: vi.fn(),
  linkDeleteMany: vi.fn(),
  linkCount: vi.fn(),
  linkUpdateMany: vi.fn(),
  linkFindUniqueTx: vi.fn(),
  linkFindFirstTx: vi.fn(),
  linkDelete: vi.fn(),
  transaction: vi.fn(),
}));

const tx = {
  parentStudentLink: {
    updateMany: mocks.linkUpdateMany,
    findUnique: mocks.linkFindUniqueTx,
    findFirst: mocks.linkFindFirstTx,
    delete: mocks.linkDelete,
  },
};

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    studentProfile: { findUnique: mocks.studentFindUnique },
    parentStudentLink: {
      findUnique: mocks.linkFindUnique,
      findMany: mocks.linkFindMany,
      create: mocks.linkCreate,
      deleteMany: mocks.linkDeleteMany,
      count: mocks.linkCount,
    },
    $transaction: mocks.transaction,
  },
}));
vi.mock("../src/lib/notify.js", () => ({ fanoutNotification: vi.fn(), fanoutToRole: vi.fn() }));
vi.mock("../src/lib/audit.js", () => ({ writeAudit: vi.fn() }));

import {
  approveLearnerLink,
  cancelLearnerLink,
  rejectLearnerLink,
  requestLearnerLink,
} from "../src/services/parent/link.service.js";
import { fanoutNotification, fanoutToRole } from "../src/lib/notify.js";

const student = {
  userId: "child",
  lrn: "123456789012",
  gradeLevel: "G7",
  user: { fullName: "Juan Dela Cruz", status: "active" },
  section: { name: "Rizal" },
};

const createdLink = {
  id: "link-1",
  relationship: "Mother",
  createdAt: new Date("2026-11-28T00:00:00.000Z"),
  approvedBy: null,
  student,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.userFindUnique.mockResolvedValue({ fullName: "Maria Dela Cruz" });
  mocks.studentFindUnique.mockResolvedValue(student);
  mocks.transaction.mockImplementation(async (fn: (client: typeof tx) => unknown) => fn(tx));
});

describe("guardian learner link requests", () => {
  it("files a pending request and notifies the administrator desk", async () => {
    mocks.linkFindUnique.mockResolvedValue(null);
    mocks.linkCreate.mockResolvedValue(createdLink);

    const dto = await requestLearnerLink("parent", {
      lrn: " 123456789012 ",
      relationship: "Mother",
    });

    expect(mocks.linkCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { parentId: "parent", studentId: "child", relationship: "Mother" },
      }),
    );
    expect(fanoutToRole).toHaveBeenCalledWith(
      "admin",
      expect.objectContaining({ sourceTable: "parent_student_links", action: "create" }),
    );
    expect(dto).toMatchObject({
      id: "link-1",
      relationship: "Mother",
      approved: false,
      student: { studentId: "child", lrn: "123456789012", sectionName: "Rizal" },
    });
  });

  it("rejects an unknown LRN and an inactive learner", async () => {
    mocks.studentFindUnique.mockResolvedValue(null);
    await expect(
      requestLearnerLink("parent", { lrn: "000000000000", relationship: "Guardian" }),
    ).rejects.toMatchObject({ status: 404, code: "LEARNER_NOT_FOUND" });

    mocks.studentFindUnique.mockResolvedValue({
      ...student,
      user: { ...student.user, status: "pending" },
    });
    await expect(
      requestLearnerLink("parent", { lrn: "123456789012", relationship: "Guardian" }),
    ).rejects.toMatchObject({ status: 409, code: "LEARNER_NOT_ACTIVE" });
  });

  it("does not duplicate an approved link or a pending request", async () => {
    mocks.linkFindUnique.mockResolvedValue({ id: "link-1", approvedBy: "admin" });
    await expect(
      requestLearnerLink("parent", { lrn: "123456789012", relationship: "Mother" }),
    ).rejects.toMatchObject({ status: 409, code: "ALREADY_LINKED" });

    mocks.linkFindUnique.mockResolvedValue({ id: "link-2", approvedBy: null });
    await expect(
      requestLearnerLink("parent", { lrn: "123456789012", relationship: "Mother" }),
    ).rejects.toMatchObject({ status: 409, code: "LINK_REQUEST_PENDING" });
    expect(mocks.linkCreate).not.toHaveBeenCalled();
  });

  it("withdraws only the guardian's own pending request", async () => {
    mocks.linkDeleteMany.mockResolvedValue({ count: 0 });
    await expect(cancelLearnerLink("parent", "link-1")).rejects.toMatchObject({
      status: 404,
      code: "LINK_REQUEST_NOT_FOUND",
    });
    expect(mocks.linkDeleteMany).toHaveBeenCalledWith({
      where: { id: "link-1", parentId: "parent", approvedBy: null },
    });
  });

  it("approves by stamping the admin and notifies the guardian", async () => {
    mocks.linkUpdateMany.mockResolvedValue({ count: 1 });
    mocks.linkFindUniqueTx.mockResolvedValue({ parentId: "parent", student });

    await expect(approveLearnerLink("admin", "link-1")).resolves.toEqual({
      id: "link-1",
      status: "approved",
    });
    expect(mocks.linkUpdateMany).toHaveBeenCalledWith({
      where: { id: "link-1", approvedBy: null },
      data: { approvedBy: "admin" },
    });
    expect(fanoutNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "parent", action: "approve" }),
    );
  });

  it("declines by removing the request and telling the guardian they may retry", async () => {
    mocks.linkFindFirstTx.mockResolvedValue({
      parentId: "parent",
      relationship: "Mother",
      student,
    });
    mocks.linkDelete.mockResolvedValue({});

    await expect(rejectLearnerLink("admin", "link-1", "LRN mismatch")).resolves.toEqual({
      id: "link-1",
      status: "declined",
    });
    expect(mocks.linkDelete).toHaveBeenCalledWith({ where: { id: "link-1" } });
    expect(fanoutNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "parent",
        action: "reject",
        message: expect.stringContaining("was not approved"),
      }),
    );
  });
});
