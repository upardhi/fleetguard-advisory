import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { requireUser } from "@/app/_server/auth/getUser";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";

const UpdateTripSchema = z.object({
  status: z.enum(["loading", "in_transit", "returning", "closed"]).optional(),
  departedAt: z.string().datetime().optional(),
  returnedAt: z.string().datetime().optional(),
  confirmedStops: z.number().int().min(0).optional(),
  qrTokenId: z.string().optional(),
  // Stop confirmation fields
  stopId: z.string().optional(),
  stopStatus: z.enum(["pending", "confirmed", "failed", "skipped"]).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { id } = await params;
  const [[trip], stops] = await Promise.all([
    db`
      SELECT id, trip_code, vehicle_id, vehicle_reg, driver_id, driver_name,
             contractor_id, contractor_name, status, total_stops, confirmed_stops,
             departed_at, planned_return, returned_at, warehouse_id, created_at, updated_at
      FROM   trips
      WHERE  id = ${id} AND org_id = ${actor.org}
      LIMIT  1
    `,
    db`
      SELECT id, trip_id, stop_order, dealer_name, city, invoice_count, invoice_numbers,
             delivery_mode, status, confirmed_at, dwell_minutes
      FROM   trip_stops
      WHERE  trip_id = ${id}
      ORDER  BY stop_order
    `,
  ]);

  if (!trip) return applySecurityHeaders(NextResponse.json({ error: "Not found" }, { status: 404 }));
  return applySecurityHeaders(NextResponse.json({ trip: { ...trip, stops } }));
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  if (!["superadmin", "company_admin", "guard", "wh_manager", "regional_manager"].includes(actor.role)) {
    return applySecurityHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }

  const { id } = await params;
  const [existing] = await db`SELECT id, warehouse_id FROM trips WHERE id = ${id} AND org_id = ${actor.org} LIMIT 1`;
  if (!existing) return applySecurityHeaders(NextResponse.json({ error: "Not found" }, { status: 404 }));

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  const parsed = UpdateTripSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }

  const data = parsed.data;

  // Handle stop confirmation
  if (data.stopId && data.stopStatus) {
    await db`
      UPDATE trip_stops
      SET status = ${data.stopStatus}, confirmed_at = now()
      WHERE id = ${data.stopId} AND trip_id = ${id}
    `;
    // Recount confirmed stops
    const [cnt] = await db`SELECT COUNT(*)::int AS n FROM trip_stops WHERE trip_id = ${id} AND status = 'confirmed'`;
    await db`UPDATE trips SET confirmed_stops = ${(cnt?.n as number) ?? 0}, updated_at = now() WHERE id = ${id}`;
    return applySecurityHeaders(NextResponse.json({ ok: true }));
  }

  // Handle trip-level updates
  const updates: Record<string, unknown> = { updated_at: new Date() };
  if (data.status !== undefined) updates.status = data.status;
  if (data.departedAt) updates.departed_at = data.departedAt;
  if (data.returnedAt) updates.returned_at = data.returnedAt;
  if (data.confirmedStops !== undefined) updates.confirmed_stops = data.confirmedStops;
  if (data.qrTokenId !== undefined) updates.qr_token_id = data.qrTokenId;

  await db`UPDATE trips SET ${db(updates)} WHERE id = ${id}`;

  await writeAuditEvent({
    orgId: actor.org,
    actorId: actor.sub,
    actorRole: actor.role,
    action: "trip.updated",
    resourceType: "trip",
    resourceId: id,
    warehouseId: existing.warehouse_id as string,
    payload: { status: data.status },
  });

  return applySecurityHeaders(NextResponse.json({ ok: true }));
}
