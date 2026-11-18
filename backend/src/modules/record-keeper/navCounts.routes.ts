import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { cache } from "../../lib/cache.js";
import { etag } from "../../lib/etag.js";
import { CACHE_TAGS, CACHE_TTLS } from "../../lib/cacheTags.js";
import { getRecordKeeperNavQueues } from "../../services/registry/navCounts.service.js";

const router = Router();

/**
 * Record-keeper sidebar badge queues. Kept separate from every page payload so
 * the rail can poll a tiny `{id, v}` map instead of the full board — the dot
 * means "new or updated since you last opened that page".
 */
router.get(
  "/nav-counts",
  requireAuth,
  requireRole("record_keeper"),
  cache({
    tags: [
      CACHE_TAGS.recordKeeper,
      CACHE_TAGS.overview,
      CACHE_TAGS.academics,
      CACHE_TAGS.notifications,
      CACHE_TAGS.roster,
    ],
    // Must not outlive one poll: a cached row would leave the dot dark for a
    // whole interval after the data already changed. The realtime channel sets
    // `x-zentra-fresh`, which bypasses the read in the same tick as the write.
    ttl: CACHE_TTLS.counts,
  }),
  etag(),
  async (req, res, next) => {
    try {
      res.json(await getRecordKeeperNavQueues(req.user!.id));
    } catch (e) {
      next(e);
    }
  },
);

export default router;
