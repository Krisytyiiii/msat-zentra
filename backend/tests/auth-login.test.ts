import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  verify: vi.fn(),
  recordLogin: vi.fn(),
  signAccess: vi.fn(() => "access"),
  signRefresh: vi.fn(() => "refresh"),
}));

vi.mock("../src/lib/prisma.js", () => ({
  prisma: { user: { findUnique: mocks.findUnique } },
}));
vi.mock("argon2", () => ({ default: { verify: mocks.verify } }));
vi.mock("../src/services/presence.service.js", () => ({ recordLogin: mocks.recordLogin }));
vi.mock("../src/lib/jwt.js", () => ({
  signAccess: mocks.signAccess,
  signRefresh: mocks.signRefresh,
  verifyRefresh: vi.fn(),
}));
vi.mock("../src/lib/audit.js", () => ({ writeAudit: vi.fn() }));
vi.mock("../src/lib/notify.js", () => ({ fanoutToRole: vi.fn() }));
vi.mock("../src/lib/contact-crypto.js", () => ({ encryptContact: vi.fn() }));

const { login } = await import("../src/services/auth/session.service.js");
const { loginSchema } = await import("../src/modules/auth/auth.schemas.js");

const credentials = { email: "account@zentra.test", password: "secret" };
const account = { id: "u1", role: "student", status: "active", passwordHash: "hash" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUnique.mockResolvedValue(account);
  mocks.verify.mockResolvedValue(true);
});

describe("unified password sign-in", () => {
  it("accepts omitted role but rejects invalid explicit roles and credentials", () => {
    expect(loginSchema.parse(credentials)).toEqual(credentials);
    expect(loginSchema.safeParse({ ...credentials, role: "auto" }).success).toBe(false);
    expect(loginSchema.safeParse({ ...credentials, password: "" }).success).toBe(false);
    expect(loginSchema.safeParse({ ...credentials, email: "invalid" }).success).toBe(false);
  });

  it.each(["student", "parent", "subject_teacher", "adviser", "adm_coordinator"])(
    "returns the authenticated %s role without a requested portal",
    async (role) => {
      mocks.findUnique.mockResolvedValue({ ...account, role });
      await expect(login(credentials)).resolves.toEqual({
        accessToken: "access", refreshToken: "refresh", role,
      });
      expect(mocks.verify).toHaveBeenCalledWith("hash", "secret");
      expect(mocks.signAccess).toHaveBeenCalledWith(expect.objectContaining({ sub: "u1", role }));
      expect(mocks.recordLogin).toHaveBeenCalledWith("u1", null);
    },
  );

  it("requires the dedicated admin portal", async () => {
    mocks.findUnique.mockResolvedValue({ ...account, role: "admin" });
    await expect(login(credentials)).rejects.toMatchObject({ status: 403, code: "ROLE_MISMATCH" });
    await expect(login({ ...credentials, role: "staff" })).rejects.toMatchObject({ status: 403 });
    expect(mocks.signAccess).not.toHaveBeenCalled();
    await expect(login({ ...credentials, role: "admin" })).resolves.toMatchObject({ role: "admin" });
  });

  it.each(["staff", "parent", "admin"] as const)(
    "preserves the explicit %s portal restriction for a student",
    async (role) => {
      await expect(login({ ...credentials, role })).rejects.toMatchObject({
        status: 403, code: "ROLE_MISMATCH",
      });
      expect(mocks.signAccess).not.toHaveBeenCalled();
    },
  );

  it("still permits the matching explicit web portal", async () => {
    await expect(login({ ...credentials, role: "student" })).resolves.toMatchObject({ role: "student" });
  });

  it.each([
    ["pending", "ACCOUNT_PENDING"],
    ["suspended", "ACCOUNT_SUSPENDED"],
  ] as const)("rejects %s accounts with a clear account state", async (status, code) => {
    mocks.findUnique.mockResolvedValue({ ...account, status });
    await expect(login(credentials)).rejects.toMatchObject({ status: 403, code });
    expect(mocks.verify).toHaveBeenCalled();
    expect(mocks.signAccess).not.toHaveBeenCalled();
  });

  it("does not reveal the account state before the password is verified", async () => {
    mocks.findUnique.mockResolvedValue({ ...account, status: "pending" });
    mocks.verify.mockResolvedValue(false);
    await expect(login(credentials)).rejects.toMatchObject({
      status: 401,
      code: "INVALID_CREDENTIALS",
    });
    expect(mocks.signAccess).not.toHaveBeenCalled();
  });

  it("rejects unknown accounts and incorrect passwords without issuing a session", async () => {
    mocks.findUnique.mockResolvedValueOnce(null);
    await expect(login(credentials)).rejects.toMatchObject({ status: 401 });
    mocks.verify.mockResolvedValue(false);
    await expect(login(credentials)).rejects.toMatchObject({ status: 401, code: "INVALID_CREDENTIALS" });
    expect(mocks.recordLogin).not.toHaveBeenCalled();
    expect(mocks.signAccess).not.toHaveBeenCalled();
  });
});
