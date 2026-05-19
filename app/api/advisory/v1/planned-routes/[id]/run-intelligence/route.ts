import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/app/_server/auth/getUser";
import { db } from "@/app/_server/db/client";
import { applySecurityHeaders } from "@/app/_server/security/headers";
import { runPlannedRouteIntelligence } from "@/app/_server/advisory/planned-pipeline";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/advisory/v1/planned-routes/[id]/run-intelligence
// Runs Firecrawl + AI analysis for every segment of the planned route.
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const claims = await requireUser(req);
    const { id } = await params;

    const [route] = await db`
      SELECT id FROM adv_planned_routes
      WHERE id = ${id} AND org_id = ${claims.org}
    `;
    if (!route) {
      return applySecurityHeaders(NextResponse.json({ error: "Not found" }, { status: 404 }));
    }

    const { segmentsChecked, disruptionsFound } = await runPlannedRouteIntelligence(id);

    return applySecurityHeaders(
      NextResponse.json({ ok: true, segmentsChecked, disruptionsFound }),
    );
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 401)
      return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    console.error("[planned-routes/run-intelligence] POST error", err);
    return applySecurityHeaders(NextResponse.json({ error: "Internal error" }, { status: 500 }));
  }
}
