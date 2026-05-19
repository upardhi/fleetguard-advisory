import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/app/_server/auth/getUser";
import { db } from "@/app/_server/db/client";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/advisory/v1/trips/[id] — trip + its routes, segments and alerts.
export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const claims = await requireUser(req);
    const { id } = await params;

    const [trip] = await db`
      SELECT * FROM adv_trips WHERE id = ${id} AND org_id = ${claims.org}
    `;
    if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const routes = await db`
      SELECT * FROM adv_routes WHERE trip_id = ${id} ORDER BY is_primary DESC, created_at ASC
    `;
    const segments = await db`
      SELECT s.* FROM adv_route_segments s
      JOIN   adv_routes r ON r.id = s.route_id
      WHERE  r.trip_id = ${id}
      ORDER  BY s.route_id, s.seq
    `;
    const alerts = await db`
      SELECT a.*, d.category, d.risk_level, d.summary AS disruption_summary,
             d.eta_impact_hours, d.confidence
      FROM   adv_trip_alerts a
      JOIN   adv_disruptions d ON d.id = a.disruption_id
      WHERE  a.trip_id = ${id}
      ORDER  BY a.created_at DESC
    `;

    return NextResponse.json({ trip, routes, segments, alerts });
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 401)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("trip get error", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

const PatchSchema = z.object({
  status: z.enum(["planned", "monitoring", "dispatched", "completed", "cancelled"]).optional(),
  truckReg: z.string().max(40).optional(),
  driverName: z.string().max(120).optional(),
  scheduledAt: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

// PATCH /api/advisory/v1/trips/[id] — update mutable trip fields.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const claims = await requireUser(req);
    const { id } = await params;
    const parsed = PatchSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid data" }, { status: 422 });
    const p = parsed.data;

    const [trip] = await db`
      UPDATE adv_trips SET
        status       = COALESCE(${p.status ?? null}, status),
        truck_reg    = COALESCE(${p.truckReg ?? null}, truck_reg),
        driver_name  = COALESCE(${p.driverName ?? null}, driver_name),
        scheduled_at = COALESCE(${p.scheduledAt ?? null}, scheduled_at),
        notes        = COALESCE(${p.notes ?? null}, notes),
        updated_at   = now()
      WHERE id = ${id} AND org_id = ${claims.org}
      RETURNING *
    `;
    if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ trip });
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 401)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("trip patch error", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// DELETE /api/advisory/v1/trips/[id] — routes/segments/alerts cascade.
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const claims = await requireUser(req);
    const { id } = await params;
    const deleted = await db`
      DELETE FROM adv_trips WHERE id = ${id} AND org_id = ${claims.org} RETURNING id
    `;
    if (deleted.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 401)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("trip delete error", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
