import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/app/_server/auth/getUser";
import { db } from "@/app/_server/db/client";
import { uuidv7 } from "@/app/_server/db/uuidv7";
import { getDirections } from "@/app/_server/advisory/google";
import { decomposeRoute, type RouteSegment } from "@/app/_server/advisory/decompose";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/advisory/v1/trips/[id]/routes
// Fetches route options from Google Directions, decomposes each into
// district / tehsil / highway segments, and replaces any prior routes.
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const claims = await requireUser(req);
    const { id } = await params;

    const [trip] = (await db`
      SELECT id, origin_name, origin_lat, origin_lng,
             destination_name, destination_lat, destination_lng
      FROM   adv_trips WHERE id = ${id} AND org_id = ${claims.org}
    `) as unknown as Array<{
      id: string;
      origin_name: string;
      origin_lat: string | null;
      origin_lng: string | null;
      destination_name: string;
      destination_lat: string | null;
      destination_lng: string | null;
    }>;
    if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const origin = trip.origin_lat && trip.origin_lng
      ? `${trip.origin_lat},${trip.origin_lng}`
      : trip.origin_name;
    const destination = trip.destination_lat && trip.destination_lng
      ? `${trip.destination_lat},${trip.destination_lng}`
      : trip.destination_name;

    let directions;
    try {
      directions = await getDirections(origin, destination);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Routing failed";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
    if (directions.length === 0) {
      return NextResponse.json({ error: "No routes found" }, { status: 404 });
    }

    // Replace existing routes (segments cascade).
    await db`DELETE FROM adv_routes WHERE trip_id = ${id}`;

    const savedRoutes = [];
    for (let i = 0; i < directions.length; i++) {
      const d = directions[i];
      const routeId = uuidv7();
      await db`
        INSERT INTO adv_routes
          (id, trip_id, label, summary, distance_km, duration_hours, polyline, is_primary)
        VALUES (
          ${routeId}, ${id}, ${`Route ${i + 1}`}, ${d.summary},
          ${d.distanceKm}, ${d.durationHours}, ${d.polyline}, ${i === 0}
        )
      `;

      // Decompose into segments.
      let segments: RouteSegment[];
      try {
        segments = await decomposeRoute(d.polyline, d.highways);
      } catch (err) {
        console.error("[routes] decompose failed:", err);
        segments = d.highways.map((hw, seq) => ({
          segmentType: hw.startsWith("NH") ? ("national_highway" as const) : ("state_highway" as const),
          name: hw,
          seq,
        }));
      }

      for (const s of segments) {
        await db`
          INSERT INTO adv_route_segments
            (id, route_id, segment_type, name, state, seq, lat, lng)
          VALUES (
            ${uuidv7()}, ${routeId}, ${s.segmentType}, ${s.name},
            ${s.state ?? null}, ${s.seq}, ${s.lat ?? null}, ${s.lng ?? null}
          )
        `;
      }
      savedRoutes.push({ routeId, label: `Route ${i + 1}`, segments: segments.length });
    }

    // Move the trip into monitoring so the pipeline picks it up.
    await db`UPDATE adv_trips SET status = 'monitoring', updated_at = now() WHERE id = ${id}`;

    return NextResponse.json({ routes: savedRoutes }, { status: 201 });
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 401)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("trip routes error", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
