import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/_server/db/client";
import { triggerAdvisoryPipeline, triggerNearbyDiscoveryPipeline } from "@/app/_server/advisory/trigger-pipeline";

export const maxDuration = 300;

const BATCH_SIZE = 10;
const RADIUS_M = 40_000;
const MAX_RESULTS = 30;

interface WarehouseRow {
  id: string;
  org_id: string;
  name: string;
  lat: number;
  lng: number;
  region_id: string | null;
}

interface PlacesResult {
  name: string;
  geometry: { location: { lat: number; lng: number } };
}

interface PlacesResponse {
  status: string;
  results: PlacesResult[];
  error_message?: string;
}

function distanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
) {
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

function googleKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY ?? "";
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY is not set");
  return key;
}

async function fetchNearbyCitiesFromGoogle(
  lat: number,
  lng: number,
): Promise<Array<{ name: string; lat: number; lng: number }>> {
  const allCities = new Map<string, { name: string; lat: number; lng: number }>();

  // Break the radius into a grid of points
  const gridSteps = 4; // Reduced to 4x4 = 16 API calls max
  const radiusKm = RADIUS_M / 1000;

  // Shuffle grid points to get better distribution
  const gridPoints: Array<{ lat: number, lng: number }> = [];

  for (let i = 0; i <= gridSteps; i++) {
    for (let j = 0; j <= gridSteps; j++) {
      const latOffset = (i - gridSteps / 2) * (radiusKm * 2 / gridSteps) / 111;
      const lngOffset = (j - gridSteps / 2) * (radiusKm * 2 / gridSteps) / (111 * Math.cos(lat * Math.PI / 180));
      gridPoints.push({
        lat: lat + latOffset,
        lng: lng + lngOffset
      });
    }
  }

  // Shuffle to get varied results if we hit the limit early
  for (let i = gridPoints.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [gridPoints[i], gridPoints[j]] = [gridPoints[j], gridPoints[i]];
  }

  for (const point of gridPoints) {
    // Stop if we've reached MAX_RESULTS
    if (allCities.size >= MAX_RESULTS) break;

    try {
      const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
      url.searchParams.set("location", `${point.lat},${point.lng}`);
      url.searchParams.set("radius", "20000");
      url.searchParams.set("type", "locality");
      url.searchParams.set("key", googleKey());

      const res = await fetch(url.toString());
      const data = (await res.json()) as PlacesResponse;

      if (data.status === "OK") {
        for (const r of data.results) {
          if (allCities.size >= MAX_RESULTS) break;

          const key = `${r.name}-${r.geometry.location.lat.toFixed(3)}`;
          if (!allCities.has(key)) {
            allCities.set(key, {
              name: r.name,
              lat: r.geometry.location.lat,
              lng: r.geometry.location.lng,
            });
          }
        }
      }

      await new Promise(resolve => setTimeout(resolve, 100)); // Rate limiting
    } catch (err) {
      console.warn(`Grid search error:`, err);
    }
  }

  const results = Array.from(allCities.values())
    .map((city) => ({
      ...city,
      distance: distanceKm(
        lat,
        lng,
        city.lat,
        city.lng
      ),
    }))
    .filter((city) => city.distance <= 40)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 10);

  return results.map(({ name, lat, lng }) => ({
    name,
    lat,
    lng,
  }));
}

// POST /api/cron/discover-warehouse-cities
export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get("x-vercel-cron-auth") ?? "";
  const hasCronAuth = !process.env.CRON_SECRET || cronSecret === process.env.CRON_SECRET;
  if (!hasCronAuth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Pick warehouses where none of their nearby cities have been saved yet.
  // We track this by checking if any adv_cities row was created from this
  // warehouse — we use a simple processed flag via a dedicated column or
  // reuse the NOT EXISTS pattern against adv_cities by warehouse origin.
  // Simplest: add a warehouse_processed table or just track via a Set.
  // Here we use a separate small tracking table (see migration below).
  const warehouses = (await db`
    SELECT w.id, w.org_id, w.name,
           w.lat::float AS lat,
           w.lng::float AS lng,
           (
             SELECT r.id FROM adv_regions r
             WHERE  w.state = ANY(r.states)
             LIMIT  1
           ) AS region_id
    FROM   warehouses w
    WHERE  w.lat IS NOT NULL
      AND  w.lng IS NOT NULL
      AND  w.is_active = true
      AND  NOT EXISTS (
        SELECT 1 FROM adv_warehouse_discovery_log l
        WHERE  l.warehouse_id = w.id
      )
    ORDER  BY w.created_at ASC
    LIMIT  ${BATCH_SIZE}
  `) as unknown as WarehouseRow[];

  if (warehouses.length === 0) {
    return NextResponse.json({ ok: true, message: "No warehouses pending discovery" });
  }

  let processed = 0;
  let totalSaved = 0;

  for (const warehouse of warehouses) {
    if (!warehouse.region_id) {
      console.warn(`[warehouse-cities] no region found for warehouse "${warehouse.name}", skipping`);
      // Still log it so we don't retry forever
      await db`
        INSERT INTO adv_warehouse_discovery_log (warehouse_id, cities_found)
        VALUES (${warehouse.id}, 0)
        ON CONFLICT (warehouse_id) DO NOTHING
      `;
      processed++;
      continue;
    }

    try {
      const googleCities = await fetchNearbyCitiesFromGoogle(warehouse.lat, warehouse.lng);

      for (const city of googleCities) {
        await db`
          INSERT INTO adv_cities
            (org_id, region_id, name, lat, lng)
          VALUES
            (${warehouse.org_id}, ${warehouse.region_id}, ${city.name}, ${city.lat}, ${city.lng})
          ON CONFLICT (org_id, name) DO UPDATE SET
            lat = COALESCE(adv_cities.lat, EXCLUDED.lat),
            lng = COALESCE(adv_cities.lng, EXCLUDED.lng)
        `;
        totalSaved++;
      }

      // Mark warehouse as processed
      await db`
        INSERT INTO adv_warehouse_discovery_log (warehouse_id, cities_found)
        VALUES (${warehouse.id}, ${googleCities.length})
        ON CONFLICT (warehouse_id) DO NOTHING
      `;

      processed++;
    } catch (err) {
      console.error(`[warehouse-cities] failed for ${warehouse.name}:`, err);
    }
  }

  if (totalSaved > 0) triggerNearbyDiscoveryPipeline();
  triggerAdvisoryPipeline();

  return NextResponse.json({ ok: true, processed, totalSaved });
}