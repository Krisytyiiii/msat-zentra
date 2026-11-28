import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { canSteerTerm } from "../src/lib/roles.js";

beforeAll(() => {
  process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/db";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon";
  process.env.JWT_ACCESS_SECRET = "a";
  process.env.JWT_REFRESH_SECRET = "b";
});

describe("Admin timetable ownership", () => {
  it("lets staff desks steer the term scope", () => {
    expect(canSteerTerm("admin")).toBe(true);
    expect(canSteerTerm("nurse")).toBe(true);
    expect(canSteerTerm("guidance_counselor")).toBe(true);
    expect(canSteerTerm("student")).toBe(false);
  });

  it("guards the admin schedule workspace behind auth", async () => {
    const { createApp } = await import("../src/app.js");
    const app = createApp();
    const res = await request(app).get("/api/admin/schedule");
    expect(res.status).toBe(401);
  });

  it("no longer exposes the teacher timetable editor", async () => {
    const { createApp } = await import("../src/app.js");
    const app = createApp();
    for (const path of ["/api/teacher/schedule", "/api/teacher/schedule/submit", "/api/teacher/schedule/my-slots"]) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(404);
    }
  });
});
