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
 * Use a shuffled 4×4 grid of Google Places "Nearby Search" calls to find
 * cities/towns within 40 km. Mirrors the warehouse discovery approach for
 * better spatial coverage vs a single centre-point query.
 */
async function fetchNearbyCities(
  lat: number,
  lng: number,
): Promise<Array<{ name: string; lat: number; lng: number; distanceKm: number }>> {
  const allCities = new Map<string, { name: string; lat: number; lng: number }>();

  const gridSteps = 4;
  const radiusKm = RADIUS_M / 1000;

  // Build a grid of search centres spread across the bounding box.
  const gridPoints: Array<{ lat: number; lng: number }> = [];
  for (let i = 0; i <= gridSteps; i++) {
    for (let j = 0; j <= gridSteps; j++) {
      const latOffset =
        ((i - gridSteps / 2) * (radiusKm * 2)) / gridSteps / 111;
      const lngOffset =
        ((j - gridSteps / 2) * (radiusKm * 2)) /
        gridSteps /
        (111 * Math.cos((lat * Math.PI) / 180));
      gridPoints.push({ lat: lat + latOffset, lng: lng + lngOffset });
    }
  }

  // Shuffle so we get varied coverage if we hit MAX_NEARBY early.
  for (let i = gridPoints.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [gridPoints[i], gridPoints[j]] = [gridPoints[j], gridPoints[i]];
  }

  for (const point of gridPoints) {
    if (allCities.size >= MAX_NEARBY) break;

    try {
      const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
      url.searchParams.set("location", `${point.lat},${point.lng}`);
      url.searchParams.set("radius", "20000"); // 20 km sub-radius per grid point
      url.searchParams.set("type", "locality");
      url.searchParams.set("key", googleKey());

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Places API HTTP ${res.status}`);
      const data = (await res.json()) as PlacesResponse;

      if (data.status === "OK") {
        for (const r of data.results) {
          if (allCities.size >= MAX_NEARBY) break;
          // Deduplicate by name + rounded coords to avoid minor coordinate drift.
          const key = `${r.name}-${r.geometry.location.lat.toFixed(3)}`;
          if (!allCities.has(key)) {
            allCities.set(key, {
              name: r.name,
              lat: r.geometry.location.lat,
              lng: r.geometry.location.lng,
            });
          }
        }
      } else if (data.status !== "ZERO_RESULTS") {
        console.warn(
          `[nearby-discovery] Places API: ${data.status}${
            data.error_message ? ` — ${data.error_message}` : ""
          }`,
        );
      }

      // Respect Google's QPS limits.
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (err) {
      console.warn(`[nearby-discovery] grid point error:`, err);
    }
  }

  return Array.from(allCities.values())
    .map((city) => ({
      ...city,
      distanceKm:
        Math.round(haversineKm(lat, lng, city.lat, city.lng) * 10) / 10,
    }))
    .filter((c) => c.distanceKm > 0 && c.distanceKm <= 40) // exclude self + out-of-radius
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, MAX_NEARBY);
}

// POST /api/cron/discover-nearby-cities
// Processes one batch of parent cities that have never had nearby-city discovery
// run, ordered by creation date so newly added cities are handled first.
export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get("x-vercel-cron-auth") ?? "";
  const hasCronAuth =
    !process.env.CRON_SECRET || cronSecret === process.env.CRON_SECRET;
  if (!hasCronAuth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
        // Insert a self-sentinel so the NOT EXISTS guard is satisfied and we
        // don't retry this city on the next cron tick.
        await db`
          INSERT INTO adv_nearby_cities
            (org_id, parent_city_id, name, state, lat, lng, distance_km)
          VALUES
            (${parent.org_id}, ${parent.id}, ${parent.name + " (self)"},
             ${parent.state ?? null}, ${parent.lat}, ${parent.lng}, 0)
          ON CONFLICT (parent_city_id, name) DO NOTHING
        `;
      } else {
        for (const city of nearby) {
          await db`
            INSERT INTO adv_nearby_cities
              (org_id, parent_city_id, name, state, lat, lng, distance_km)
            VALUES
              (${parent.org_id}, ${parent.id}, ${city.name},
               ${parent.state ?? null}, ${city.lat}, ${city.lng}, ${city.distanceKm})
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