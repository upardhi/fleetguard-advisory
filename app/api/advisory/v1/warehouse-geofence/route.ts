import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/app/_server/auth/getUser";
import { db } from "@/app/_server/db/client";
import { applySecurityHeaders } from "@/app/_server/security/headers";

const GEOFENCE_RADIUS_KM = 40;

const RISK_ORDER: Record<string, number> = {
  critical: 5, high: 4, medium: 3, low: 2, safe: 1,
};

// Haversine distance in km between two lat/lng points
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function stateMatches(a: string, b: string): boolean {
  const al = a.toLowerCase().trim();
  const bl = b.toLowerCase().trim();
  return al.includes(bl) || bl.includes(al);
}

// GET /api/advisory/v1/warehouse-geofence
// For each active warehouse, returns:
//   - All depot cities within 40 km (across all regions, using DB lat/lng)
//   - Active disruptions in those states (from adv_disruptions + adv_watched_segments)
export async function GET(req: NextRequest) {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  // ── 1. All active warehouses ──────────────────────────────────────────────
  const warehouses = await db`
    SELECT id, name, city, state, lat, lng
    FROM   warehouses
    WHERE  org_id    = ${actor.org}
      AND  is_active = TRUE
    ORDER  BY name ASC
  ` as { id: string; name: string; city: string; state: string; lat: number | null; lng: number | null }[];

  // ── 2. All depot cities across all regions (now all have lat/lng) ─────────
  const dbCities = await db`
    SELECT c.name, c.state, c.lat, c.lng, c.region_id, r.label AS region_label, r.color AS region_color
    FROM   adv_cities  c
    JOIN   adv_regions r ON r.id = c.region_id
    WHERE  c.org_id = ${actor.org}
      AND  c.lat    IS NOT NULL
      AND  c.lng    IS NOT NULL
    ORDER  BY c.name ASC
  ` as { name: string; state: string | null; lat: number; lng: number; region_id: string; region_label: string; region_color: string }[];

  // ── 3a. Disruptions from adv_disruptions (direct, state-based) ───────────
  //   is_active = true means the disruption is current.
  //   36-hour fallback: if is_active flag isn't reliable, also include recent ones.
  const directDisruptions = await db`
    SELECT id, category, title, summary, risk_level, state,
           affected_location, affected_highway, eta_impact_hours, starts_at
    FROM   adv_disruptions
    WHERE  is_active = TRUE
       OR  created_at >= now() - interval '36 hours'
    ORDER  BY created_at DESC
  ` as {
    id: string;
    category: string | null;
    title: string;
    summary: string | null;
    risk_level: string;
    state: string | null;
    affected_location: string | null;
    affected_highway: string | null;
    eta_impact_hours: number | null;
    starts_at: string | null;
  }[];

  // ── 3b. Disruptions from corridor segments (legacy, still useful if corridors exist) ─
  const segmentDisruptions = await db`
    SELECT DISTINCT s.state, s.disruption_risk_level AS risk_level,
                    s.disruption_title              AS title,
                    s.disruption_category           AS category,
                    NULL::text                      AS summary,
                    NULL::text                      AS affected_highway
    FROM   adv_watched_segments s
    JOIN   adv_watched_routes   r ON r.id = s.watched_route_id
    WHERE  r.org_id                  = ${actor.org}
      AND  r.is_active                = TRUE
      AND  s.has_disruption           = TRUE
      AND  s.disruption_risk_level   IN ('critical', 'high', 'medium')
      AND  s.last_checked_at         >= now() - interval '36 hours'
  ` as {
    state: string | null;
    risk_level: string;
    title: string | null;
    category: string | null;
    summary: string | null;
    affected_highway: string | null;
  }[];

  // Normalise both sources into a single shape
  type NormDisruption = {
    title: string;
    riskLevel: string;
    state: string;
    category: string;
    summary: string | null;
    highway: string | null;
  };

  const allDisruptions: NormDisruption[] = [
    ...directDisruptions
      .filter((d) => d.state)
      .map((d) => ({
        title:     d.title,
        riskLevel: d.risk_level,
        state:     d.state!,
        category:  d.category ?? "traffic",
        summary:   d.summary ?? null,
        highway:   d.affected_highway ?? null,
      })),
    ...segmentDisruptions
      .filter((s) => s.state)
      .map((s) => ({
        title:     s.title ?? "Disruption",
        riskLevel: s.risk_level,
        state:     s.state!,
        category:  s.category ?? "traffic",
        summary:   s.summary ?? null,
        highway:   s.affected_highway ?? null,
      })),
  ];

  // ── 4. Build per-warehouse geofences ─────────────────────────────────────
  const result = warehouses.map((wh) => {
    if (wh.lat === null || wh.lng === null) {
      return {
        id: wh.id, name: wh.name, city: wh.city, state: wh.state,
        lat: null, lng: null,
        nearbyCities: [], nearbyDisruptions: [], worstRisk: "unknown",
      };
    }

    const whLat = Number(wh.lat);
    const whLng = Number(wh.lng);

    // Cities within GEOFENCE_RADIUS_KM
    const nearbyCities = dbCities
      .map((c) => ({
        name:         c.name,
        state:        c.state ?? "",
        lat:          c.lat,
        lng:          c.lng,
        regionId:     c.region_id,
        regionLabel:  c.region_label,
        regionColor:  c.region_color,
        distanceKm:   Math.round(haversineKm(whLat, whLng, c.lat, c.lng)),
      }))
      .filter((c) => c.distanceKm <= GEOFENCE_RADIUS_KM)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    // States covered: warehouse state + all nearby city states
    const nearbyStates = new Set<string>();
    if (wh.state) nearbyStates.add(wh.state);
    nearbyCities.forEach((c) => { if (c.state) nearbyStates.add(c.state); });

    // Disruptions whose state intersects the geofence
    const nearbyDisruptions = allDisruptions.filter((d) => {
      for (const st of nearbyStates) {
        if (stateMatches(d.state, st)) return true;
      }
      return false;
    });

    // Deduplicate by title
    const seen = new Set<string>();
    const deduped = nearbyDisruptions.filter((d) => {
      const key = d.title.toLowerCase().slice(0, 50);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const worstRisk = deduped.reduce(
      (best, d) => (RISK_ORDER[d.riskLevel] ?? 0) > (RISK_ORDER[best] ?? 0) ? d.riskLevel : best,
      "safe" as string,
    );

    return {
      id: wh.id, name: wh.name, city: wh.city, state: wh.state,
      lat: whLat, lng: whLng,
      nearbyCities,
      nearbyDisruptions: deduped,
      worstRisk,
    };
  });

  // Summary stats
  const totalCitiesInZone = new Set(result.flatMap((w) => w.nearbyCities.map((c) => c.name))).size;
  const totalDisruptions  = new Set(result.flatMap((w) => w.nearbyDisruptions.map((d) => d.title))).size;

  return applySecurityHeaders(
    NextResponse.json({
      warehouses: result,
      geofenceRadiusKm: GEOFENCE_RADIUS_KM,
      summary: {
        warehouseCount:       result.length,
        warehousesWithCoords: result.filter((w) => w.lat !== null).length,
        totalCitiesInZone,
        totalDisruptions,
      },
    }),
  );
}
