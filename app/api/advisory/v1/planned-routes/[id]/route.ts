import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/app/_server/auth/getUser";
import { db } from "@/app/_server/db/client";
import { applySecurityHeaders } from "@/app/_server/security/headers";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/advisory/v1/planned-routes/[id]
// Returns the route plus all segments grouped: highways first, then districts/tehsils.
export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const claims = await requireUser(req);
    const { id } = await params;

    const [route] = await db`
      SELECT * FROM adv_planned_routes
      WHERE id = ${id} AND org_id = ${claims.org}
    `;
    if (!route) {
      return applySecurityHeaders(NextResponse.json({ error: "Not found" }, { status: 404 }));
    }

    // Highways first (national_highway, state_highway), then districts, then tehsils.
    const segments = await db`
      SELECT * FROM adv_planned_segments
      WHERE planned_route_id = ${id}
      ORDER BY
        CASE segment_type
          WHEN 'national_highway' THEN 0
          WHEN 'state_highway'    THEN 1
          WHEN 'district'         THEN 2
          WHEN 'tehsil'           THEN 3
          ELSE 4
        END,
        seq
    `;

    return applySecurityHeaders(NextResponse.json({ route, segments }));
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 401)
      return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    console.error("[planned-routes/id] GET error", err);
    return applySecurityHeaders(NextResponse.json({ error: "Internal error" }, { status: 500 }));
  }
}
