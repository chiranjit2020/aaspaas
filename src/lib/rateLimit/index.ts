import { getDb } from "@/lib/db/connect";
import type { RateLimitCounterDoc } from "@/types/domain";

export const RATE_LIMIT_COUNTERS_COLLECTION = "rate_limit_counters";

/**
 * Fixed-window rate limiting backed by a Mongo counters collection — per
 * roadmap §2.1: "Mongo-backed counters collection checked in route
 * middleware. No Redis." When this becomes an actual bottleneck, Upstash
 * Redis is the drop-in replacement; nothing outside this module needs to
 * change (that's the whole point of it being its own module).
 *
 * Each (key, window) pair gets its own document, named so the window boundary
 * is baked into the _id (`key:windowIndex`). A TTL index on `expiresAt`
 * (see scripts/createIndexes.ts) cleans up old windows automatically.
 *
 * Simplification vs. the roadmap's "exponential backoff" note for login: this
 * is a plain fixed window, not a growing lockout. Five failed attempts lock
 * for the rest of the current 15-minute window, which is meaningful
 * protection on its own; true exponential backoff can layer on top later
 * without changing this module's interface.
 */

export interface RateLimitParams {
  key: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  remaining: number;
  resetAt: Date;
}

export async function checkRateLimit({
  key,
  limit,
  windowMs,
}: RateLimitParams): Promise<RateLimitResult> {
  const db = await getDb();
  const counters = db.collection<RateLimitCounterDoc>(RATE_LIMIT_COUNTERS_COLLECTION);

  const now = Date.now();
  const windowIndex = Math.floor(now / windowMs);
  const windowStart = new Date(windowIndex * windowMs);
  const expiresAt = new Date(windowStart.getTime() + windowMs);
  const docId = `${key}:${windowIndex}`;

  const result = await counters.findOneAndUpdate(
    { _id: docId },
    { $inc: { count: 1 }, $setOnInsert: { windowStart, expiresAt } },
    { upsert: true, returnDocument: "after" },
  );

  const count = result?.count ?? 1;
  return {
    allowed: count <= limit,
    count,
    remaining: Math.max(0, limit - count),
    resetAt: expiresAt,
  };
}
