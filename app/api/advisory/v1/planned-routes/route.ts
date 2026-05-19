import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/app/_server/auth/getUser";
import { db } from "@/app/_server/db/client";
import { uuidv7 } from "@/app/_server/db/uuidv7";
import { applySecurityHeaders } from "@/app/_server/security/headers";
import { fetchPlannedRouteSegments } from "@/app/_server/advisory/planned-pipeline";

// GET /api/advisory/v1/planned-routes — list all planned routes for the org
export async function GET(req: NextRequest) {
  try {
    const claims = await requireUser(req);
    const rows = await db`
      SELECT * FROM adv_planned_routes
      WHERE org_id = ${claims.org}
      ORDER BY created_at DESC
    `;
    return applySecurityHeaders(NextResponse.json({ routes: rows }));
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 401)
      return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    console.error("[planned-routes] GET error", err);
    return applySecurityHeaders(NextResponse.json({ error: "Internal error" }, { status: 500 }));
  }
}

const CreateSchema = z.object({
  name: z.string().max(160).optional(),
  origin: z.string().min(1).max(200),
  destination: z.string().min(1).max(200),
  cargoType: z.string().max(80).optional(),
  vehicleType: z.string().max(80).optional(),
});

// POST /api/advisory/v1/planned-routes — create a new planned route
export async function POST(req: NextRequest) {
  try {
    const claims = await requireUser(req);
    const parsed = CreateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return applySecurityHeaders(
        NextResponse.json({ error: "Invalid request data" }, { status: 422 }),
      );
    }
    const d = parsed.data;
    const id = uuidv7();

    await db`
      INSERT INTO adv_planned_routes
        (id, org_id, name, origin, destination, cargo_type, vehicle_type)
      VALUES (
        ${id}, ${claims.org},
        ${d.name ?? ""},
        ${d.origin},
        ${d.destination},
        ${d.cargoType ?? null},
        ${d.vehicleType ?? null}
      )
    `;

    // Background segment fetch — do not await, failures are logged only.
    fetchPlannedRouteSegments(id, d.origin, d.destination).catch((err) =>
      console.error(`[planned-routes] background fetchSegments failed for ${id}:`, err),
    );

    return applySecurityHeaders(NextResponse.json({ id }, { status: 201 }));
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 401)
      return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    console.error("[planned-routes] POST error", err);
    return applySecurityHeaders(NextResponse.json({ error: "Internal error" }, { status: 500 }));
  }
}
