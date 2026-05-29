import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/_server/db/client";
import { triggerNearbyCityIntelligence } from "@/app/_server/advisory/trigger-pipeline";

export const maxDuration = 300;

/** How many parent cities to process per invocation. */
const BATCH_SIZE = 10;

/** Radius in metres (40 km). */
const RADIUS_M = 40_000;

/** Max nearby cities to store per parent. */
const MAX_NEARBY = 20;

interface ParentCityRow {
  id: string;
  org_id: string;
  name: string;
  state: string | null;
  lat: number;
  lng: number;
}

interface PlacesResult {
  name: string;
  geometry: { location: { lat: number; lng: number } };
  vicinity?: string;
}

interface PlacesResponse {
  status: string;
  results: PlacesResult[];
  error_message?: string;
}

function googleKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY ?? "";
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY is not set");
  return key;
}

/** Haversine distance in km between two lat/lng points. */
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

/**
 * Use Google Places "Nearby Search" to find cities/towns within 40 km.
 * We query for type=locality which maps to cities and towns in India.
 */
async function fetchNearbyCities(
  lat: number,
  lng: number,
): Promise<Array<{ name: string; lat: number; lng: number; distanceKm: number }>> {
  const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
  url.searchParams.set("location", `${lat},${lng}`);
  url.searchParams.set("radius", String(RADIUS_M));
  url.searchParams.set("type", "locality");
  url.searchParams.set("key", googleKey());

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Places API HTTP ${res.status}`);
  const data = (await res.json()) as PlacesResponse;

  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new Error(
      `Places API: ${data.status}${data.error_message ? ` — ${data.error_message}` : ""}`,
    );
  }

  return (data.results ?? [])
    .slice(0, MAX_NEARBY)
    .map((r) => ({
      name: r.name,
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
      distanceKm: Math.round(haversineKm(lat, lng, r.geometry.location.lat, r.geometry.location.lng) * 10) / 10,
    }))
    .filter((c) => c.distanceKm > 0); // exclude the city itself if it appears
}

/**
 * Extract state from a Places result's vicinity or fall back to parent's state.
 * In practice we just carry the parent's state since Places locality results
 * are within the same state >95% of the time for a 40 km radius.
 */

// POST /api/cron/discover-nearby-cities
// Processes one batch of parent cities that have never had nearby-city discovery
// run, or that were added most recently (no entry in adv_nearby_cities yet).
export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get("x-vercel-cron-auth") ?? "";
  const hasCronAuth =
    !process.env.CRON_SECRET || cronSecret === process.env.CRON_SECRET;
  if (!hasCronAuth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Pick cities that have no nearby-city records yet (never processed),
  // ordered by creation date so newly added cities are handled first.
  const parents = (await db`
    SELECT c.id, c.org_id, c.name, c.state,
           c.lat::float AS lat, c.lng::float AS lng
    FROM   adv_cities c
    WHERE  c.lat IS NOT NULL
      AND  c.lng IS NOT NULL
      AND  NOT EXISTS (
        SELECT 1 FROM adv_nearby_cities nc WHERE nc.parent_city_id = c.id
      )
    ORDER  BY c.created_at ASC
    LIMIT  ${BATCH_SIZE}
  `) as unknown as ParentCityRow[];

  if (parents.length === 0) {
    return NextResponse.json({ ok: true, message: "No cities pending discovery" });
  }

  let processed = 0;
  let totalNearby = 0;

  for (const parent of parents) {
    try {
      const nearby = await fetchNearbyCities(parent.lat, parent.lng);

      if (nearby.length === 0) {
        // Insert a sentinel so we don't keep retrying (insert parent itself as 0 km
        // is filtered, so insert nothing — just mark by inserting a dummy row is
        // wrong; instead we rely on the WHERE NOT EXISTS clause being satisfied
        // by at least one real row or we skip). To avoid infinite retries for
        // cities with no nearby results, insert a single placeholder.
        await db`
          INSERT INTO adv_nearby_cities
            (org_id, parent_city_id, name, state, lat, lng, distance_km)
          VALUES
            (${parent.org_id}, ${parent.id}, ${parent.name + " (self)"}, ${parent.state ?? null},
             ${parent.lat}, ${parent.lng}, 0)
          ON CONFLICT (parent_city_id, name) DO NOTHING
        `;
      } else {
        // Bulk insert all nearby cities
        for (const city of nearby) {
          await db`
            INSERT INTO adv_nearby_cities
              (org_id, parent_city_id, name, state, lat, lng, distance_km)
            VALUES
              (${parent.org_id}, ${parent.id}, ${city.name}, ${parent.state ?? null},
               ${city.lat}, ${city.lng}, ${city.distanceKm})
            ON CONFLICT (parent_city_id, name) DO UPDATE SET
              lat         = EXCLUDED.lat,
              lng         = EXCLUDED.lng,
              distance_km = EXCLUDED.distance_km
          `;
        }
        totalNearby += nearby.length;
      }

      processed++;
    } catch (err) {
      console.error(`[nearby-discovery] failed for ${parent.name}:`, err);
    }
  }

  if (totalNearby > 0) triggerNearbyCityIntelligence();

  return NextResponse.json({ ok: true, processed, totalNearby });
}