import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/app/_server/auth/getUser";
import { db } from "@/app/_server/db/client";
import { applySecurityHeaders } from "@/app/_server/security/headers";

// POST /api/advisory/v1/watched-routes/[id]/run-intelligence
// Creates an async intelligence job — processing is handled by the Vercel Cron
// at /api/cron/run-intelligence (fires every minute).
// Returns { jobId } immediately; poll /api/advisory/v1/intelligence-jobs/[jobId] for progress.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { id: routeId } = await params;

  const [route] = (await db`
    SELECT id, routes_fetched
    FROM   adv_watched_routes
    WHERE  id = ${routeId} AND org_id = ${actor.org} AND is_active = true
    LIMIT  1
  `) as unknown as Array<{ id: string; routes_fetched: boolean }>;

  if (!route) {
    return applySecurityHeaders(NextResponse.json({ error: "Not found" }, { status: 404 }));
  }
  if (!route.routes_fetched) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Fetch route segments first" }, { status: 400 }),
    );
  }

  // Cancel any existing pending/running jobs for this route
  await db`
    UPDATE adv_intel_jobs
    SET    status = 'cancelled', finished_at = now()
    WHERE  route_id = ${routeId}
      AND  status IN ('pending', 'running')
  `;

  // Count total segments
  const [{ count }] = (await db`
    SELECT COUNT(*)::int AS count
    FROM   adv_watched_segments
    WHERE  watched_route_id = ${routeId}
  `) as unknown as Array<{ count: number }>;

  if (count === 0) {
    return applySecurityHeaders(
      NextResponse.json({ error: "No segments — fetch route first" }, { status: 400 }),
    );
  }

  const jobId = crypto.randomUUID();
  await db`
    INSERT INTO adv_intel_jobs
      (id, org_id, route_id, status, segments_total, triggered_by)
    VALUES
      (${jobId}, ${actor.org}, ${routeId}, 'pending', ${count}, ${actor.sub})
  `;

  return applySecurityHeaders(
    NextResponse.json({ ok: true, jobId, segmentsTotal: count, status: "pending" }, { status: 202 }),
  );
}
