import { Router, type Request } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { invalidateTags } from "../../lib/cache.js";
import { validate } from "../../middleware/validate.js";
import {
  activateScheduleConfigPreset,
  clearAll,
  clearEntry,
  clearSection,
  clearTeacherNames,
  createScheduleConfigPreset,
  createSubject,
  createSection,
  createSchoolYear,
  createTeacherName,
  deleteScheduleConfigPreset,
  deleteSchoolYear,
  deleteSection,
  deleteSubject,
  deleteTeacherName,
  getSchedule,
  getScheduleConflicts,
  getScheduleConfig,
  listScheduleSchoolYears,
  listScheduleSubjects,
  listScheduleTeachers,
  setTimetableStatus,
  updateScheduleConfig,
  updateScheduleConfigPreset,
  updateSubject,
  updateTermDates,
  writeEntry,
} from "../../services/schedule/schedule.service.js";

const router = Router();

// Timetable configuration belongs to the administrator desk alone. Admin is a
// term-steering role, so `req.termScope` follows the term picked in the shell.
router.use(requireAuth, requireRole("admin"));

function ctxOf(req: Request) {
  return {
    userId: req.user!.id,
    role: req.user!.role,
    termId: req.termScope?.termId ?? null,
    schoolYearId: req.termScope?.schoolYearId ?? null,
  };
}

/** Every editor write invalidates teacher-facing class lists and desks. */
const SCHEDULE_TAGS = [
  "teacher",
  "schedule",
  "academics",
  "principal",
  "attendance",
  "grades",
  "overview",
];

router.get("/", async (req, res, next) => {
  try {
    const summary = req.query.summary === "1" || req.query.summary === "true";
    const sectionId = String(req.query.sectionId ?? "").trim();
    const gradeLevel = String(req.query.gradeLevel ?? "").trim();
    res.json(
      await getSchedule(ctxOf(req), {
        summary,
        ...(sectionId ? { sectionId } : {}),
        ...(gradeLevel ? { gradeLevel } : {}),
      }),
    );
  } catch (e) {
    next(e);
  }
});

router.get("/subjects", async (req, res, next) => {
  try {
    res.json(await listScheduleSubjects(ctxOf(req)));
  } catch (e) {
    next(e);
  }
});

router.get("/teachers", async (req, res, next) => {
  try {
    res.json(await listScheduleTeachers());
  } catch (e) {
    next(e);
  }
});

router.get("/config", async (req, res, next) => {
  try {
    res.json(await getScheduleConfig(ctxOf(req)));
  } catch (e) {
    next(e);
  }
});

router.get("/conflicts", async (req, res, next) => {
  try {
    res.json(
      await getScheduleConflicts(ctxOf(req), {
        maxDailyPeriods: req.query.maxDailyPeriods,
        maxWeeklyPeriods: req.query.maxWeeklyPeriods,
      }),
    );
  } catch (e) {
    next(e);
  }
});

const scheduleConfigBodySchema = z
  .object({
    startTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .refine((v) => {
        const [h, m] = v.split(":").map(Number);
        return h >= 0 && h <= 23 && m >= 0 && m <= 59;
      }, { message: "startTime must be a valid HH:MM time" }),
    periodMins: z.number().int().min(15).max(120),
    lunch: z.object({
      afterPeriod: z.number().int().min(1).max(8),
      mins: z.number().int().min(15).max(180),
    }),
    morningRecess: z.object({
      enabled: z.boolean(),
      afterPeriod: z.number().int().min(1).max(4),
      mins: z.number().int().min(5).max(45),
    }),
    afternoonRecess: z.object({
      enabled: z.boolean(),
      afterPeriod: z.number().int().min(5).max(8),
      mins: z.number().int().min(5).max(45),
    }),
  })
  .passthrough();

router.patch("/config", validate("body", scheduleConfigBodySchema), async (req, res, next) => {
  try {
    const body = req.body as {
      startTime: string;
      periodMins: number;
      lunch: { afterPeriod: number; mins: number };
      morningRecess: { enabled: boolean; afterPeriod: number; mins: number };
      afternoonRecess: { enabled: boolean; afterPeriod: number; mins: number };
    };
    const result = await updateScheduleConfig(ctxOf(req), body);
    await invalidateTags(SCHEDULE_TAGS);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

const presetNameSchema = z.string().trim().min(1).max(80);

const presetCreateSchema = scheduleConfigBodySchema.extend({
  name: presetNameSchema,
  activate: z.boolean().optional(),
});

const presetUpdateSchema = scheduleConfigBodySchema.partial().extend({
  name: presetNameSchema.optional(),
  activate: z.boolean().optional(),
});

/** Add a named day-shape preset to the current school year. */
router.post("/configs", validate("body", presetCreateSchema), async (req, res, next) => {
  try {
    const result = await createScheduleConfigPreset(
      ctxOf(req),
      req.body as Parameters<typeof createScheduleConfigPreset>[1],
    );
    await invalidateTags(SCHEDULE_TAGS);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

router.patch("/configs/:id", validate("body", presetUpdateSchema), async (req, res, next) => {
  try {
    const result = await updateScheduleConfigPreset(
      ctxOf(req),
      String(req.params.id),
      req.body as Parameters<typeof updateScheduleConfigPreset>[2],
    );
    await invalidateTags(SCHEDULE_TAGS);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.post("/configs/:id/activate", async (req, res, next) => {
  try {
    const result = await activateScheduleConfigPreset(ctxOf(req), String(req.params.id));
    await invalidateTags(SCHEDULE_TAGS);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.delete("/configs/:id", async (req, res, next) => {
  try {
    const result = await deleteScheduleConfigPreset(ctxOf(req), String(req.params.id));
    await invalidateTags(SCHEDULE_TAGS);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

const statusSchema = z.object({
  sectionId: z.string().optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]),
});

router.post("/status", validate("body", statusSchema), async (req, res, next) => {
  try {
    const result = await setTimetableStatus(ctxOf(req), req.body as { sectionId?: string; status: "DRAFT" | "PUBLISHED" });
    await invalidateTags(SCHEDULE_TAGS);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

/** Publish (draft → published) shorthand used by the workspace dock. */
router.post("/publish", async (req, res, next) => {
  try {
    const sectionId = (req.body as { sectionId?: string }).sectionId;
    const result = await setTimetableStatus(ctxOf(req), { ...(sectionId ? { sectionId } : {}), status: "PUBLISHED" });
    await invalidateTags(SCHEDULE_TAGS);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

/** Switch a published section back to draft so its slots can be edited. */
router.post("/unlock", async (req, res, next) => {
  try {
    const sectionId = (req.body as { sectionId?: string }).sectionId;
    if (!sectionId) {
      res.status(404).json({ code: "NOTHING_LOCKED", message: "No section to unlock" });
      return;
    }
    const result = await setTimetableStatus(ctxOf(req), { sectionId, status: "DRAFT" });
    await invalidateTags(SCHEDULE_TAGS);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

const entrySchema = z.object({
  sectionId: z.string(),
  subjectId: z.string(),
  teacherNameId: z.string(),
  day: z.number().int().min(1).max(5),
  period: z.number().int().min(0).max(7),
});

router.post("/entries", validate("body", entrySchema), async (req, res, next) => {
  try {
    const { sectionId, subjectId, teacherNameId, day, period } = req.body as {
      sectionId: string;
      subjectId: string;
      teacherNameId: string;
      day: number;
      period: number;
    };
    const ctx = ctxOf(req);
    const { entry, status, warnings } = await writeEntry(ctx, {
      sectionId,
      subjectId,
      teacherNameId,
      day,
      period,
    });
    await invalidateTags(SCHEDULE_TAGS);
    res.status(status).json({ entry, warnings: warnings ?? [] });
  } catch (e) {
    next(e);
  }
});

router.delete("/entries", async (req, res, next) => {
  try {
    const sectionId = String(req.query.sectionId ?? "");
    const day = Number(req.query.day);
    const period = Number(req.query.period);
    const result = await clearEntry(ctxOf(req), sectionId, day, period);
    await invalidateTags(SCHEDULE_TAGS);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.delete("/entries/all", async (req, res, next) => {
  try {
    const sectionId = String(req.query.sectionId ?? "");
    const result = await clearSection(ctxOf(req), sectionId);
    await invalidateTags(SCHEDULE_TAGS);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.delete("/entries/clear-all", async (req, res, next) => {
  try {
    const result = await clearAll(ctxOf(req));
    await invalidateTags(SCHEDULE_TAGS);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

const teacherNameSchema = z.object({ fullName: z.string().min(1).max(120) });

router.post("/teachers", validate("body", teacherNameSchema), async (req, res, next) => {
  try {
    const { fullName } = req.body as { fullName: string };
    const teacher = await createTeacherName(ctxOf(req), fullName);
    await invalidateTags([...SCHEDULE_TAGS, "directory"]);
    res.status(201).json(teacher);
  } catch (e) {
    next(e);
  }
});

router.delete("/teachers/:id", async (req, res, next) => {
  try {
    const result = await deleteTeacherName(ctxOf(req), req.params.id as string);
    await invalidateTags([...SCHEDULE_TAGS, "directory"]);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.delete("/teachers", async (req, res, next) => {
  try {
    const result = await clearTeacherNames(ctxOf(req));
    await invalidateTags([...SCHEDULE_TAGS, "directory"]);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

const sectionSchema = z.object({
  name: z.string().min(1).max(80),
  gradeLevel: z.enum(["G7", "G8", "G9", "G10", "G11", "G12"]),
  // The workspace's selected scope. Sent explicitly so a section can never land
  // in a different school year than the one on screen; falls back to the
  // request's term scope when omitted.
  schoolYearId: z.string().uuid().optional(),
  termId: z.string().uuid().optional(),
});

/** Sections are seeded here so a fresh school year can be timetabled. */
router.post("/sections", validate("body", sectionSchema), async (req, res, next) => {
  try {
    const section = await createSection(ctxOf(req), req.body as {
      name: string;
      gradeLevel: "G7" | "G8" | "G9" | "G10" | "G11" | "G12";
      schoolYearId?: string;
      termId?: string;
    });
    await invalidateTags(SCHEDULE_TAGS);
    res.status(201).json(section);
  } catch (e) {
    next(e);
  }
});

router.delete("/sections/:id", async (req, res, next) => {
  try {
    const result = await deleteSection(ctxOf(req), req.params.id as string);
    await invalidateTags(SCHEDULE_TAGS);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

/** School years + their delete lock (empty years can be removed). */
router.get("/school-years", async (_req, res, next) => {
  try {
    res.json(await listScheduleSchoolYears());
  } catch (e) {
    next(e);
  }
});

const schoolYearSchema = z.object({
  name: z.string().min(1).max(60),
  startDate: z.string().min(10),
  endDate: z.string().min(10),
  makeActive: z.boolean().optional(),
});

/**
 * Seed a school year (and its three trimesters) from the timetable desk so a
 * future scope can be prepared. Admin-only, like every route in this router.
 */
router.post("/school-years", validate("body", schoolYearSchema), async (req, res, next) => {
  try {
    const year = await createSchoolYear(ctxOf(req), req.body as {
      name: string;
      startDate: string;
      endDate: string;
      makeActive?: boolean;
    });
    await invalidateTags(SCHEDULE_TAGS);
    res.status(201).json(year);
  } catch (e) {
    next(e);
  }
});

router.delete("/school-years/:id", async (req, res, next) => {
  try {
    const result = await deleteSchoolYear(ctxOf(req), req.params.id as string);
    await invalidateTags(SCHEDULE_TAGS);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

const termDatesSchema = z.object({
  terms: z
    .array(
      z.object({
        termId: z.string().uuid(),
        startDate: z.string().min(10),
        endDate: z.string().min(10),
      }),
    )
    .min(1)
    .max(3),
});

/**
 * Trimesters are fixed at 1–3; only their date windows are configured, after
 * the school year exists.
 */
router.patch(
  "/school-years/:schoolYearId/terms",
  validate("body", termDatesSchema),
  async (req, res, next) => {
    try {
      const result = await updateTermDates(
        ctxOf(req),
        req.params.schoolYearId as string,
        (req.body as { terms: Array<{ termId: string; startDate: string; endDate: string }> })
          .terms,
      );
      await invalidateTags(SCHEDULE_TAGS);
      res.json(result);
    } catch (e) {
      next(e);
    }
  },
);

const SUBJECT_CATEGORIES = ["CORE", "APPLIED", "SPECIALIZED"] as const;

const subjectSchema = z.object({
  name: z.string().min(1).max(120),
  /** Optional: the system mints one from the name when omitted. */
  code: z.string().min(1).max(24).optional(),
  gradeLevel: z.enum(["G7", "G8", "G9", "G10", "G11", "G12"]),
  category: z.enum(SUBJECT_CATEGORIES).optional().default("CORE"),
});

router.post("/subjects", validate("body", subjectSchema), async (req, res, next) => {
  try {
    const { name, code, gradeLevel, category } = req.body as {
      name: string;
      code?: string;
      gradeLevel: "G7" | "G8" | "G9" | "G10" | "G11" | "G12";
      category: "CORE" | "APPLIED" | "SPECIALIZED";
    };
    const subject = await createSubject(ctxOf(req), { name, code, gradeLevel, category });
    await invalidateTags(SCHEDULE_TAGS);
    res.status(201).json(subject);
  } catch (e) {
    next(e);
  }
});

const subjectUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  category: z.enum(SUBJECT_CATEGORIES).optional(),
});

router.patch("/subjects/:id", validate("body", subjectUpdateSchema), async (req, res, next) => {
  try {
    const { name, category } = req.body as {
      name?: string;
      category?: "CORE" | "APPLIED" | "SPECIALIZED";
    };
    const subject = await updateSubject(ctxOf(req), req.params.id as string, { name, category });
    await invalidateTags(SCHEDULE_TAGS);
    res.json(subject);
  } catch (e) {
    next(e);
  }
});

router.delete("/subjects/:id", async (req, res, next) => {
  try {
    const result = await deleteSubject(ctxOf(req), req.params.id as string);
    await invalidateTags(SCHEDULE_TAGS);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

export default router;
