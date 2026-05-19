import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/_server/db/client";
import { requireUser } from "@/app/_server/auth/getUser";
import { applySecurityHeaders } from "@/app/_server/security/headers";

// GET /api/v2/gate-events/heatmap
// Returns a 7×24 matrix of entry counts grouped by day-of-week × hour (IST).
// Uses DB aggregation so the result is never capped by a row limit.
export async function GET(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { searchParams } = new URL(req.url);
  const warehouseId = searchParams.get("warehouseId");
  const days = Math.min(Math.max(1, Number(searchParams.get("days") ?? 30)), 90);

  const effectiveWarehouse = actor.role === "wh_manager"
    ? (await db`SELECT warehouse_id FROM users WHERE id = ${actor.sub} LIMIT 1`)[0]?.warehouse_id as string | undefined
    : warehouseId;

  if (actor.role === "wh_manager" && !effectiveWarehouse) {
    return applySecurityHeaders(NextResponse.json({ matrix: Array.from({ length: 7 }, () => Array(24).fill(0)) }));
  }

  const since = new Date();
  since.setDate(since.getDate() - days);

  // ISODOW: 1=Monday … 7=Sunday → subtract 1 → 0=Monday … 6=Sunday
  const rows = await db`
    SELECT
      (EXTRACT(ISODOW FROM occurred_at AT TIME ZONE 'Asia/Kolkata')::int - 1) AS dow,
      EXTRACT(HOUR   FROM occurred_at AT TIME ZONE 'Asia/Kolkata')::int       AS hour,
      COUNT(*)::int                                                            AS count
    FROM  gate_events
    WHERE org_id      = ${actor.org}
      ${effectiveWarehouse ? db`AND warehouse_id = ${effectiveWarehouse}` : db``}
      AND event_type IN ('inbound_entry', 'outbound_entry', 'contractor_entry')
      AND occurred_at >= ${since}
    GROUP BY 1, 2
    ORDER BY 1, 2
  `;

  const matrix: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const r of rows) {
    const dow  = r.dow  as number;
    const hour = r.hour as number;
    if (dow >= 0 && dow < 7 && hour >= 0 && hour < 24) {
      matrix[dow]![hour] = r.count as number;
    }
  }

  return applySecurityHeaders(NextResponse.json({ matrix }));
}
