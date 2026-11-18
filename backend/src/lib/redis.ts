import { Redis } from "@upstash/redis";
import { getEnv } from "../config/env.js";
import { logger } from "./pino.js";

let client: Redis | null = null;

function isConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
}

export function getRedis(): Redis | null {
  if (!getEnv().CACHE_ENABLED) return null;
  if (client) return client;
  if (!isConfigured()) {
    logger.warn("Upstash Redis not configured — caching disabled");
    return null;
  }
  const env = getEnv();
  client = new Redis({
    url: env.UPSTASH_REDIS_REST_URL!,
    token: env.UPSTASH_REDIS_REST_TOKEN!,
    // A rejected token (or an Upstash blip) is retried by the client, and each
    // REST round trip from the Philippines is ~1s — so a broken credential used
    // to add 6–20s to every cached GET, past the 25s request timeout. One retry
    // is enough: the cache is optional, the live query is not.
    retry: {
      retries: 1,
      backoff: (attempt) => Math.min(200 * 2 ** attempt, 1_000),
    },
  });
  return client;
}

/**
 * Hard budget for a single Redis operation.
 *
 * Redis is a cache, so it must never sit on the critical path for longer than
 * roughly one round trip. Call sites race their operation against this and fall
 * back to the live query on timeout; without it a misconfigured token stalled
 * every cached route for tens of seconds (fail-open only in name).
 */
export const REDIS_TIMEOUT_MS = 1_200;

export async function redisOp<T>(
  op: Promise<T>,
  timeoutMs = REDIS_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      op,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`redis op timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function redisConfigured(): boolean {
  return getEnv().CACHE_ENABLED && isConfigured();
}
