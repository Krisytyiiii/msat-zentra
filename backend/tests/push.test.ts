import { beforeEach, describe, expect, it, vi, beforeAll } from "vitest";
import express from "express";
import request from "supertest";

beforeAll(() => {
  process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/db";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon";
  process.env.JWT_ACCESS_SECRET = "a";
  process.env.JWT_REFRESH_SECRET = "b";
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
});

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    deviceToken: { upsert: mocks.upsert, deleteMany: mocks.deleteMany, findMany: vi.fn() },
    notification: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  },
}));
vi.mock("../src/services/presence.service.js", () => ({ touchActivity: vi.fn() }));
vi.mock("../src/lib/jwt.js", () => ({
  verifyAccess: (token: string) => {
    const [sub, role] = token.split(":");
    if (!sub || !role) throw new Error("Invalid token");
    return { sub, role, type: "access" };
  },
}));

import router from "../src/modules/notifications/notifications.routes.js";
import { errorHandler, notFound } from "../src/lib/errors.js";
import { pushConfigured, pushTitle } from "../src/lib/push.js";

const app = express();
app.use(express.json());
app.use("/api/notifications", router);
app.use(notFound);
app.use(errorHandler);

const auth = { Authorization: "Bearer user-1:adviser" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("push delivery config", () => {
  it("is a no-op without a service account", () => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    expect(pushConfigured()).toBe(false);
  });

  it("gives every family a human title", () => {
    expect(pushTitle("referral_status_change")).toBe("Referral update");
    expect(pushTitle("intervention_detected")).toBe("Advisee needs support");
    expect(pushTitle("module_released")).toBe("New module released");
    // Unknown types still read like a Zentra notice, never a raw code.
    expect(pushTitle("generic_adm_devices_issue", "adm_devices")).toContain("Zentra");
  });
});

describe("device token registration", () => {
  it("registers (upserts) a token for the signed-in user", async () => {
    mocks.upsert.mockResolvedValue({ id: "d1", platform: "android" });
    const res = await request(app)
      .post("/api/notifications/device-token")
      .set(auth)
      .send({ token: "fcm-token-12345", platform: "android" });
    expect(res.status).toBe(201);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { token: "fcm-token-12345" },
        update: expect.objectContaining({ userId: "user-1", platform: "android" }),
        create: expect.objectContaining({ userId: "user-1", token: "fcm-token-12345" }),
      }),
    );
  });

  it("rejects an empty token", async () => {
    const res = await request(app)
      .post("/api/notifications/device-token")
      .set(auth)
      .send({ token: "", platform: "android" });
    expect(res.status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("removes only this user's token on sign-out", async () => {
    mocks.deleteMany.mockResolvedValue({ count: 1 });
    const res = await request(app)
      .post("/api/notifications/device-token/unregister")
      .set(auth)
      .send({ token: "fcm-token-12345" });
    expect(res.status).toBe(200);
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { token: "fcm-token-12345", userId: "user-1" },
    });
  });
});
