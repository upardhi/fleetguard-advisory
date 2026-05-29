// /api/advisory/v1/cities/[cityId]/nearby/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/_server/db/client";
import { requireUser } from "@/app/_server/auth/getUser"; 
import { applySecurityHeaders } from "@/app/_server/security/headers";

export const maxDuration = 30;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ cityId: string }> },
) {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { cityId } = await params;

  const [parent] = await db`
    SELECT id, name
    FROM   adv_cities
    WHERE  id     = ${cityId}
      AND  org_id = ${actor.org}
    LIMIT  1
  ` as unknown as Array<{ id: string; name: string }>;

  if (!parent) {
    return applySecurityHeaders(NextResponse.json({ error: "City not found" }, { status: 404 }));
  }

  const rows = await db`
    SELECT
      nc.id,
      nc.name,
      nc.state,
      nc.lat::float         AS lat,
      nc.lng::float         AS lng,
      nc.distance_km::float AS distance_km,
      COALESCE(ncn.has_disruption, false) AS has_disruption,
      ncn.disruption_risk_level,
      ncn.disruption_title,
      ncn.disruption_summary,
      ncn.disruption_eta_hours,
      ncn.disruption_category,
      ncn.disruption_sources,
      ncn.last_checked_at
    FROM   adv_nearby_cities nc
    LEFT   JOIN adv_nearby_city_news ncn ON ncn.nearby_city_id = nc.id
    WHERE  nc.parent_city_id = ${cityId}
      AND  nc.org_id         = ${actor.org}
      AND  nc.name           NOT LIKE '% (self)'
      AND  nc.distance_km    > 0
    ORDER BY
      (CASE ncn.disruption_risk_level
        WHEN 'critical' THEN 1
        WHEN 'high'     THEN 2
        WHEN 'medium'   THEN 3
        WHEN 'low'      THEN 4
        ELSE                 5
       END) ASC,
      nc.distance_km ASC
    LIMIT 30
  `;

  return applySecurityHeaders(NextResponse.json({
    parent_city_id: parent.id,
    parent_city_name: parent.name,
    nearby: rows,
  }));
}