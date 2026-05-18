import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/app/_server/auth/getUser";
import { db } from "@/app/_server/db/client";

// Returns all active warehouses for the authenticated user's organisation.
// Reads from the same `warehouses` table as FleetGuard — no duplication.
export async function GET(req: NextRequest) {
  try {
    const claims = await requireUser(req);

    const rows = await db`
      SELECT
        w.id,
        w.name,
        w.code,
        w.city,
        w.state,
        w.region,
        w.address,
        w.org_id,
        w.is_active,
        w.lat,
        w.lng,
        w.created_at
      FROM warehouses w
      WHERE w.org_id = ${claims.org}
        AND w.is_active = TRUE
      ORDER BY w.name ASC
    `;

    return NextResponse.json({ warehouses: rows });
  } catch (err: unknown) {
    const code = (err as { code?: number }).code;
    if (code === 401) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("warehouses fetch error", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
