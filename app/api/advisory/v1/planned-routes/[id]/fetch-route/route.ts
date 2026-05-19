import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/app/_server/auth/getUser";
import { db } from "@/app/_server/db/client";
import { applySecurityHeaders } from "@/app/_server/security/headers";
import { fetchPlannedRouteSegments } from "@/app/_server/advisory/planned-pipeline";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/advisory/v1/planned-routes/[id]/fetch-route
// Synchronously fetches and stores route segments via Google Directions.
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const claims = await requireUser(req);
    const { id } = await params;

    const [route] = (await db`
      SELECT id, origin, destination FROM adv_planned_routes
      WHERE id = ${id} AND org_id = ${claims.org}
    `) as unknown as Array<{ id: string; origin: string; destination: string }>;

    if (!route) {
      return applySecurityHeaders(NextResponse.json({ error: "Not found" }, { status: 404 }));
    }

    await fetchPlannedRouteSegments(id, route.origin, route.destination);

    const segments = await db`
      SELECT COUNT(*) AS count FROM adv_planned_segments
      WHERE planned_route_id = ${id}
    `;
    const segmentCount = Number((segments[0] as { count: string }).count);

    return applySecurityHeaders(NextResponse.json({ ok: true, segmentCount }));
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 401)
      return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    console.error("[planned-routes/fetch-route] POST error", err);
    const msg = err instanceof Error ? err.message : "Internal error";
    return applySecurityHeaders(NextResponse.json({ error: msg }, { status: 500 }));
  }
}
