import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/app/_server/auth/getUser";
import { db } from "@/app/_server/db/client";
import { applySecurityHeaders } from "@/app/_server/security/headers";

// POST /api/advisory/v1/intelligence-jobs
// Creates an async intelligence job for a watched corridor.
// Returns immediately with a jobId — the Vercel Cron picks it up within 60s.
export async function POST(req: NextRequest) {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const body = await req.json() as { routeId?: string };
  const { routeId } = body;
  if (!routeId) {
    return applySecurityHeaders(NextResponse.json({ error: "routeId required" }, { status: 400 }));
  }

  // Verify route belongs to this org and is ready
  const [route] = (await db`
    SELECT id, routes_fetched
    FROM   adv_watched_routes
    WHERE  id = ${routeId} AND org_id = ${actor.org} AND is_active = true
    LIMIT  1
  `) as unknown as Array<{ id: string; routes_fetched: boolean }>;

  if (!route) {
    return applySecurityHeaders(NextResponse.json({ error: "Route not found" }, { status: 404 }));
  }
  if (!route.routes_fetched) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Fetch route segments first before running intelligence" }, { status: 400 }),
    );
  }

  // Cancel any pending/running jobs for this route (avoid duplicates)
  await db`
    UPDATE adv_intel_jobs
    SET    status = 'cancelled', finished_at = now()
    WHERE  route_id = ${routeId}
      AND  status IN ('pending', 'running')
  `;

  // Count segments
  const [{ count }] = (await db`
    SELECT COUNT(*)::int AS count
    FROM   adv_watched_segments
    WHERE  watched_route_id = ${routeId}
  `) as unknown as Array<{ count: number }>;

  if (count === 0) {
    return applySecurityHeaders(
      NextResponse.json({ error: "No segments found — fetch route first" }, { status: 400 }),
    );
  }

  // Create job
  const jobId = crypto.randomUUID();
  await db`
    INSERT INTO adv_intel_jobs
      (id, org_id, route_id, status, segments_total, triggered_by)
    VALUES
      (${jobId}, ${actor.org}, ${routeId}, 'pending', ${count}, ${actor.sub})
  `;

  return applySecurityHeaders(
    NextResponse.json({ jobId, segmentsTotal: count, status: "pending" }, { status: 202 }),
  );
}
