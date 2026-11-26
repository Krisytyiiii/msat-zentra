import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { cache } from "../../lib/cache.js";
import { etag } from "../../lib/etag.js";
import { CACHE_TAGS, CACHE_TTLS } from "../../lib/cacheTags.js";
import { MAX_PAGE_SIZE, PAGE_SIZE } from "../../lib/pagination.js";

const router = Router();

const notificationsQuerySchema = z.object({
  type: z.string().trim().max(80).optional(),
  unreadOnly: z.enum(["0", "1", "true", "false"]).optional(),
  since: z.string().trim().max(30).optional(),
  take: z.coerce.number().int().min(1).max(50).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional().default(PAGE_SIZE),
});

// FCM registration token per signed-in device. Clients re-post on every
// sign-in and on token refresh; `token` is unique so an account switch on the
// same device re-points the row instead of duplicating it.
const deviceTokenSchema = z.object({
  token: z.string().trim().min(10).max(4096),
  platform: z.enum(["android", "ios", "web"]).default("android"),
});

router.get(
  "/",
  requireAuth,
  validate("query", notificationsQuerySchema),
  cache({ tags: [CACHE_TAGS.notifications], ttl: CACHE_TTLS.dashboard }),
  etag(),
  async (req, res, next) => {
  try {
    const q = req.query as Record<string, unknown>;
    const where: any = { userId: req.user!.id };
    if (typeof q.type === "string" && q.type) where.type = q.type;

    if (q.unreadOnly === "1" || q.unreadOnly === "true") {
      where.isRead = false;
    }
    if (typeof q.since === "string" && q.since.trim()) {
      const since = new Date(q.since.trim());
      if (!Number.isNaN(since.getTime())) where.createdAt = { gt: since };
    }
    // Paginated slice (15/page); legacy `take` (≤50) preserved for badge polls.
    const rawTake = Number(q.take);
    const pageSize = Math.max(1, Math.min(Number(q.pageSize) || PAGE_SIZE, MAX_PAGE_SIZE));
    const take =
      Number.isFinite(rawTake) && rawTake > 0 ? Math.min(Math.floor(rawTake), 50) : pageSize;
    const page = Math.max(1, Number(q.page) || 1);
    const skip = (page - 1) * take;
    const notes = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      select: {
        id: true,
        userId: true,
        type: true,
        message: true,
        isRead: true,
        createdAt: true,
        sourceTable: true,
        sourceId: true,
      },
    });
    res.json(notes);
  } catch (e) { next(e); }
});

// True unread total for the bell badge. The list endpoint is paged (15/page),
// so counting within a fetched page under-reports when there are many unread.
router.get("/unread-count", requireAuth, async (req, res, next) => {
  try {
    const count = await prisma.notification.count({
      where: { userId: req.user!.id, isRead: false },
    });
    res.json({ count });
  } catch (e) { next(e); }
});

router.post("/read/:id", requireAuth, async (req, res, next) => {
  try {
    const note = await prisma.notification.findUnique({ where: { id: String(req.params.id) } });
    if (!note || note.userId !== req.user!.id) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Notification not found" } });
    const updated = await prisma.notification.update({ where: { id: note.id }, data: { isRead: true } });
    res.json(updated);
  } catch (e) { next(e); }
});

router.post("/read-all", requireAuth, async (req, res, next) => {
  try {
    const result = await prisma.notification.updateMany({ where: { userId: req.user!.id, isRead: false }, data: { isRead: true } });
    res.json({ updated: result.count });
  } catch (e) { next(e); }
});

// --- Push: device registration ---
// The mobile app calls this after sign-in and whenever FCM rotates the token.
router.post(
  "/device-token",
  requireAuth,
  validate("body", deviceTokenSchema),
  async (req, res, next) => {
    try {
      const { token, platform } = req.body as z.infer<typeof deviceTokenSchema>;
      const device = await prisma.deviceToken.upsert({
        where: { token },
        create: { token, platform, userId: req.user!.id },
        update: { userId: req.user!.id, platform, lastSeenAt: new Date() },
        select: { id: true, platform: true },
      });
      res.status(201).json(device);
    } catch (e) { next(e); }
  },
);

// Sign-out (or account switch) stops this device from receiving pushes.
router.post(
  "/device-token/unregister",
  requireAuth,
  validate("body", deviceTokenSchema.pick({ token: true })),
  async (req, res, next) => {
    try {
      const { token } = req.body as { token: string };
      await prisma.deviceToken.deleteMany({ where: { token, userId: req.user!.id } });
      res.json({ removed: true });
    } catch (e) { next(e); }
  },
);

export default router;
