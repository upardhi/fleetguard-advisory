import { db } from "../db/client";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

// Atomic upsert increment — safe under concurrent requests.
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const resetAt = new Date(windowStart.getTime() + windowMs);

  const [row] = await db`
    INSERT INTO rate_limit_counters (key, window_start, count)
    VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT (key, window_start) DO UPDATE
      SET count = rate_limit_counters.count + 1
    RETURNING count
  `;

  const count = row.count as number;
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt,
  };
}

export async function cleanupRateLimitCounters(): Promise<void> {
  await db`
    DELETE FROM rate_limit_counters
    WHERE window_start < now() - INTERVAL '2 hours'
  `;
}
