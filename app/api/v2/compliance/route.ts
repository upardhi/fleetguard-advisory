import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/_server/db/client";
import { requireUser } from "@/app/_server/auth/getUser";
import { applySecurityHeaders } from "@/app/_server/security/headers";

// GET /api/v2/compliance — expiry buckets (0-30, 31-60, 61-90 days) by entity type
export async function GET(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const now = new Date();
  const d30 = new Date(now.getTime() + 30 * 86400_000);
  const d60 = new Date(now.getTime() + 60 * 86400_000);
  const d90 = new Date(now.getTime() + 90 * 86400_000);

  // DL checks (latest per driver)
  const dlRows = await db`
    SELECT
      COUNT(*) FILTER (WHERE expiry_date < ${d30})::int  AS dl_0_30,
      COUNT(*) FILTER (WHERE expiry_date >= ${d30} AND expiry_date < ${d60})::int AS dl_31_60,
      COUNT(*) FILTER (WHERE expiry_date >= ${d60} AND expiry_date < ${d90})::int AS dl_61_90
    FROM (
      SELECT DISTINCT ON (entity_id) expiry_date
      FROM   compliance_checks
      WHERE  org_id = ${actor.org} AND entity_type = 'driver' AND check_type = 'dl'
        AND  expiry_date >= ${now}
      ORDER  BY entity_id, checked_at DESC
    ) t
  `;

  // Vehicle checks (worst-case per vehicle)
  const vehicleRows = await db`
    SELECT
      COUNT(*) FILTER (WHERE min_expiry < ${d30})::int  AS vehicle_0_30,
      COUNT(*) FILTER (WHERE min_expiry >= ${d30} AND min_expiry < ${d60})::int AS vehicle_31_60,
      COUNT(*) FILTER (WHERE min_expiry >= ${d60} AND min_expiry < ${d90})::int AS vehicle_61_90
    FROM (
      SELECT entity_id, MIN(expiry_date) AS min_expiry
      FROM (
        SELECT DISTINCT ON (entity_id, check_type) entity_id, expiry_date
        FROM   compliance_checks
        WHERE  org_id = ${actor.org} AND entity_type = 'vehicle'
          AND  expiry_date >= ${now}
        ORDER  BY entity_id, check_type, checked_at DESC
      ) sub
      GROUP BY entity_id
    ) t
  `;

  // Contractor contract expiry buckets — column dropped; nothing to track here.

  const dl   = dlRows[0]      ?? {};
  const v    = vehicleRows[0] ?? {};

  return applySecurityHeaders(
    NextResponse.json({
      dl_0_30:           Number(dl.dl_0_30 ?? 0),
      dl_31_60:          Number(dl.dl_31_60 ?? 0),
      dl_61_90:          Number(dl.dl_61_90 ?? 0),
      vehicle_0_30:      Number(v.vehicle_0_30 ?? 0),
      vehicle_31_60:     Number(v.vehicle_31_60 ?? 0),
      vehicle_61_90:     Number(v.vehicle_61_90 ?? 0),
      contractor_0_30:   0,
      contractor_31_60:  0,
      contractor_61_90:  0,
    }),
  );
}
