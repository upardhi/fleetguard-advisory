import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/app/_server/auth/getUser";
import { db } from "@/app/_server/db/client";
import { applySecurityHeaders } from "@/app/_server/security/headers";

const GEOFENCE_RADIUS_KM = 40;

// Haversine distance in km
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

// EAST region depot city coordinates (used when DB has no lat/lng yet)
const EAST_CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  "Agartala":       { lat: 23.8315, lng: 91.2868 },
  "Andal":          { lat: 23.6060, lng: 87.2011 },
  "Chandaka":       { lat: 20.3372, lng: 85.7380 },
  "Cuttack":        { lat: 20.4625, lng: 85.8828 },
  "Dhulagarh New":  { lat: 22.5448, lng: 88.2356 },
  "Jamshedpur New": { lat: 22.8046, lng: 86.2029 },
  "Jorhat":         { lat: 26.7500, lng: 94.2167 },
  "Madanpur":       { lat: 22.4177, lng: 88.3668 },
  "Panchla New":    { lat: 22.4845, lng: 88.1567 },
  "Patna":          { lat: 25.5941, lng: 85.1376 },
  "Sambalpur":      { lat: 21.4669, lng: 83.9756 },
  "Siliguri New":   { lat: 26.7271, lng: 88.3953 },
  "Vijayawada PC":  { lat: 16.5062, lng: 80.6480 },
  "Vizag 2":        { lat: 17.6868, lng: 83.2185 },
};

const RISK_ORDER: Record<string, number> = {
  critical: 5, high: 4, medium: 3, low: 2, safe: 1,
};

// GET /api/advisory/v1/warehouse-geofence
// Returns each warehouse with EAST cities within 40 km and active disruptions in those states.
export async function GET(req: NextRequest) {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  // All active warehouses for the org
  const warehouses = await db`
    SELECT id, name, city, state, lat, lng
    FROM   warehouses
    WHERE  org_id = ${actor.org} AND is_active = TRUE
    ORDER  BY name ASC
  ` as { id: string; name: string; city: string; state: string; lat: number | null; lng: number | null }[];

  // EAST cities from DB — fall back to hardcoded coords if DB has no lat/lng
  const dbCities = await db`
    SELECT name, state, lat, lng
    FROM   adv_cities
    WHERE  org_id = ${actor.org} AND region_id = 'east'
    ORDER  BY name ASC
  ` as { name: string; state: string | null; lat: number | null; lng: number | null }[];

  const cities = dbCities
    .map((c) => {
      const coords = EAST_CITY_COORDS[c.name];
      return {
        name:  c.name,
        state: c.state ?? "",
        lat:   c.lat ?? coords?.lat ?? null,
        lng:   c.lng ?? coords?.lng ?? null,
      };
    })
    .filter((c): c is typeof c & { lat: number; lng: number } =>
      c.lat !== null && c.lng !== null,
    );

  // If no DB cities yet (first run), fall back to hardcoded list
  const effectiveCities =
    cities.length > 0
      ? cities
      : Object.entries(EAST_CITY_COORDS).map(([name, coords]) => ({
          name,
          state: "",
          ...coords,
        }));

  // Active disruptions via watched segments (36 h freshness window)
  const segments = await db`
    SELECT DISTINCT s.state, s.disruption_risk_level, s.disruption_title, s.disruption_category
    FROM   adv_watched_segments s
    JOIN   adv_watched_routes   r ON r.id = s.watched_route_id
    WHERE  r.org_id          = ${actor.org}
      AND  r.is_active        = TRUE
      AND  s.has_disruption   = TRUE
      AND  s.disruption_risk_level IN ('critical', 'high', 'medium')
      AND  s.last_checked_at >= now() - interval '36 hours'
  ` as {
    state: string | null;
    disruption_risk_level: string;
    disruption_title: string | null;
    disruption_category: string | null;
  }[];

  function stateMatches(a: string, b: string): boolean {
    const al = a.toLowerCase(), bl = b.toLowerCase();
    return al.includes(bl) || bl.includes(al);
  }

  const result = warehouses.map((wh) => {
    if (wh.lat === null || wh.lng === null) {
      return {
        id: wh.id, name: wh.name, city: wh.city, state: wh.state,
        lat: null, lng: null,
        nearbyCities: [], nearbyDisruptions: [], worstRisk: "unknown",
      };
    }

    // Cities within GEOFENCE_RADIUS_KM
    const nearbyCities = effectiveCities
      .map((c) => ({
        ...c,
        distanceKm: Math.round(haversineKm(wh.lat!, wh.lng!, c.lat, c.lng)),
      }))
      .filter((c) => c.distanceKm <= GEOFENCE_RADIUS_KM)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    // States covered by the geofence (warehouse state + nearby city states)
    const nearbyStates = new Set<string>();
    if (wh.state) nearbyStates.add(wh.state);
    nearbyCities.forEach((c) => { if (c.state) nearbyStates.add(c.state); });

    // Disruptions whose state overlaps the geofence
    const nearbyDisruptions = segments
      .filter((s) => {
        if (!s.state) return false;
        for (const st of nearbyStates) {
          if (stateMatches(s.state, st)) return true;
        }
        return false;
      })
      .map((s) => ({
        title:    s.disruption_title ?? "Disruption",
        riskLevel: s.disruption_risk_level,
        state:    s.state ?? "",
        category: s.disruption_category ?? "traffic",
      }));

    const worstRisk = nearbyDisruptions.reduce(
      (best, d) =>
        (RISK_ORDER[d.riskLevel] ?? 0) > (RISK_ORDER[best] ?? 0) ? d.riskLevel : best,
      "safe" as string,
    );

    return {
      id: wh.id, name: wh.name, city: wh.city, state: wh.state,
      lat: wh.lat, lng: wh.lng,
      nearbyCities,
      nearbyDisruptions,
      worstRisk,
    };
  });

  return applySecurityHeaders(
    NextResponse.json({ warehouses: result, geofenceRadiusKm: GEOFENCE_RADIUS_KM }),
  );
}
