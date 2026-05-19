import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/app/_server/auth/getUser";
import { db } from "@/app/_server/db/client";
import { uuidv7 } from "@/app/_server/db/uuidv7";

// GET /api/advisory/v1/trips — list trips for the user's org, with route +
// open-alert counts so the list view can render without N extra queries.
export async function GET(req: NextRequest) {
  try {
    const claims = await requireUser(req);
    const rows = await db`
      SELECT
        t.*,
        (SELECT COUNT(*) FROM adv_routes r WHERE r.trip_id = t.id)            AS route_count,
        (SELECT COUNT(*) FROM adv_trip_alerts a
           WHERE a.trip_id = t.id AND a.status <> 'resolved')                 AS alert_count
      FROM adv_trips t
      WHERE t.org_id = ${claims.org}
      ORDER BY t.created_at DESC
    `;
    return NextResponse.json({ trips: rows });
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 401)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("trips list error", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

const CreateSchema = z.object({
  originName: z.string().min(1).max(160),
  originLat: z.number().optional(),
  originLng: z.number().optional(),
  destinationName: z.string().min(1).max(160),
  destinationLat: z.number().optional(),
  destinationLng: z.number().optional(),
  truckReg: z.string().max(40).optional(),
  driverName: z.string().max(120).optional(),
  cargoType: z.string().max(80).optional(),
  scheduledAt: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

// POST /api/advisory/v1/trips — create a trip.
export async function POST(req: NextRequest) {
  try {
    const claims = await requireUser(req);
    const parsed = CreateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid trip data" }, { status: 422 });
    }
    const t = parsed.data;
    const id = uuidv7();

    const [trip] = await db`
      INSERT INTO adv_trips (
        id, org_id, origin_name, origin_lat, origin_lng,
        destination_name, destination_lat, destination_lng,
        truck_reg, driver_name, cargo_type, scheduled_at, notes, status, created_by
      ) VALUES (
        ${id}, ${claims.org}, ${t.originName}, ${t.originLat ?? null}, ${t.originLng ?? null},
        ${t.destinationName}, ${t.destinationLat ?? null}, ${t.destinationLng ?? null},
        ${t.truckReg ?? null}, ${t.driverName ?? null}, ${t.cargoType ?? null},
        ${t.scheduledAt ?? null}, ${t.notes ?? null}, 'planned', ${claims.sub}
      )
      RETURNING *
    `;
    return NextResponse.json({ trip }, { status: 201 });
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 401)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("trip create error", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
