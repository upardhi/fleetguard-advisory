import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/app/_server/auth/getUser";
import { db } from "@/app/_server/db/client";
import { applySecurityHeaders } from "@/app/_server/security/headers";

// GET /api/advisory/v1/watched-routes/[id]
// Returns the route header + all segments grouped by variant
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { id } = await params;

  const [route] = (await db`
    SELECT id, org_id, name, origin, destination, is_active,
           routes_fetched, last_intel_at, max_risk_level, disruption_count, created_at
    FROM   adv_watched_routes
    WHERE  id = ${id} AND org_id = ${actor.org}
    LIMIT  1
  `) as unknown as Array<Record<string, unknown>>;

  if (!route) {
    return applySecurityHeaders(NextResponse.json({ error: "Not found" }, { status: 404 }));
  }

  const segments = await db`
    SELECT id, route_variant, segment_type, name, state, seq, lat, lng,
           has_disruption, disruption_risk_level, disruption_title,
           disruption_summary, disruption_eta_hours, disruption_category,
           last_checked_at
    FROM   adv_watched_segments
    WHERE  watched_route_id = ${id}
    ORDER  BY route_variant, seq
  `;

  return applySecurityHeaders(NextResponse.json({ route, segments }));
}

// DELETE /api/advisory/v1/watched-routes/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { id } = await params;

  await db`
    UPDATE adv_watched_routes
    SET    is_active = false, updated_at = now()
    WHERE  id = ${id} AND org_id = ${actor.org}
  `;

  return applySecurityHeaders(NextResponse.json({ ok: true }));
}
