import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/app/_server/auth/getUser";
import { db } from "@/app/_server/db/client";
import { applySecurityHeaders } from "@/app/_server/security/headers";
import { fetchWatchedRouteSegments } from "@/app/_server/advisory/watcher-pipeline";

// POST /api/advisory/v1/watched-routes/[id]/fetch-route
// Calls Google Directions, decomposes route into segments, saves to DB.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { id } = await params;

  const [route] = (await db`
    SELECT id, origin, destination, org_id
    FROM   adv_watched_routes
    WHERE  id = ${id} AND org_id = ${actor.org}
    LIMIT  1
  `) as unknown as Array<{ id: string; origin: string; destination: string; org_id: string }>;

  if (!route) {
    return applySecurityHeaders(NextResponse.json({ error: "Not found" }, { status: 404 }));
  }

  try {
    const { segmentCount } = await fetchWatchedRouteSegments(id, route.origin, route.destination);
    return applySecurityHeaders(NextResponse.json({ ok: true, segmentCount }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch route";
    return applySecurityHeaders(NextResponse.json({ error: msg }, { status: 500 }));
  }
}
