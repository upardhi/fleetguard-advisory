import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/_server/db/client";
import { uuidv7 } from "@/app/_server/db/uuidv7";

export const maxDuration = 60;

// POST /api/cron/auto-intel
// Runs daily at 05:30 UTC (11:00 IST).
// For every active watched route whose intelligence hasn't run in the last 20 hours,
// cancels any stale job and queues a fresh one — picked up by the run-intelligence cron.
export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get("x-vercel-cron-auth") ?? "";
  if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Find all active routes that have segments and haven't had a completed
  // intelligence run in the last 20 hours.
  const routes = (await db`
    SELECT
      r.id        AS route_id,
      r.org_id,
      COUNT(s.id)::int AS segment_count
    FROM   adv_watched_routes r
    JOIN   adv_watched_segments s ON s.watched_route_id = r.id
    WHERE  r.is_active       = true
      AND  r.routes_fetched  = true
      AND  NOT EXISTS (
        SELECT 1 FROM adv_intel_jobs j
        WHERE  j.route_id    = r.id
          AND  j.status      = 'completed'
          AND  j.finished_at > now() - interval '20 hours'
      )
      AND  NOT EXISTS (
        SELECT 1 FROM adv_intel_jobs j
        WHERE  j.route_id = r.id
          AND  j.status IN ('pending', 'running')
      )
    GROUP  BY r.id, r.org_id
    HAVING COUNT(s.id) > 0
  `) as unknown as Array<{ route_id: string; org_id: string; segment_count: number }>;

  if (routes.length === 0) {
    return NextResponse.json({ ok: true, queued: 0, message: "All routes up to date" });
  }

  let queued = 0;
  for (const route of routes) {
    await db`
      INSERT INTO adv_intel_jobs
        (id, org_id, route_id, status, segments_total, triggered_by)
      VALUES
        (${uuidv7()}, ${route.org_id}, ${route.route_id}, 'pending', ${route.segment_count}, 'auto-cron')
      ON CONFLICT DO NOTHING
    `;
    queued++;
  }

  return NextResponse.json({ ok: true, queued, routes: routes.map((r) => r.route_id) });
}
