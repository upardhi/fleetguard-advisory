import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { uuidv7 } from "@/app/_server/db/uuidv7";
import { requireUser } from "@/app/_server/auth/getUser";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";

const TripStopSchema = z.object({
  dealerName: z.string().min(1).max(200),
  city: z.string().min(1).max(100),
  invoiceNumbers: z.array(z.string()).default([]),
  deliveryMode: z.enum(["simple", "secure"]).default("simple"),
});

const CreateTripSchema = z.object({
  warehouseId: z.string(),
  vehicleId: z.string(),
  driverId: z.string(),
  contractorId: z.string().optional(),
  plannedReturn: z.string().datetime().optional(),
  stops: z.array(TripStopSchema).min(1).max(50),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { searchParams } = new URL(req.url);
  const warehouseId = searchParams.get("warehouseId");
  const status = searchParams.get("status");
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 2000);
  const offset = Number(searchParams.get("offset") ?? 0);

  const trips = (warehouseId && status)
    ? await db`
        SELECT t.id, t.trip_code, t.vehicle_reg, t.driver_name, t.contractor_name,
               t.status, t.total_stops, t.confirmed_stops, t.departed_at, t.planned_return, t.created_at
        FROM   trips t
        WHERE  t.org_id = ${actor.org} AND t.warehouse_id = ${warehouseId} AND t.status = ${status}
        ORDER  BY t.created_at DESC LIMIT ${limit} OFFSET ${offset}
      `
    : warehouseId
    ? await db`
        SELECT t.id, t.trip_code, t.vehicle_reg, t.driver_name, t.contractor_name,
               t.status, t.total_stops, t.confirmed_stops, t.departed_at, t.planned_return, t.created_at
        FROM   trips t
        WHERE  t.org_id = ${actor.org} AND t.warehouse_id = ${warehouseId}
        ORDER  BY t.created_at DESC LIMIT ${limit} OFFSET ${offset}
      `
    : await db`
        SELECT t.id, t.trip_code, t.vehicle_reg, t.driver_name, t.contractor_name,
               t.status, t.total_stops, t.confirmed_stops, t.departed_at, t.planned_return, t.created_at
        FROM   trips t
        WHERE  t.org_id = ${actor.org}
        ORDER  BY t.created_at DESC LIMIT ${limit} OFFSET ${offset}
      `;

  return applySecurityHeaders(NextResponse.json({ trips, limit, offset }));
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  if (!["superadmin", "company_admin", "wh_manager", "regional_manager"].includes(actor.role)) {
    return applySecurityHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  const parsed = CreateTripSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }

  const data = parsed.data;

  const [[vehicle], [driver], [wh]] = await Promise.all([
    db`SELECT registration_number FROM vehicles WHERE id = ${data.vehicleId} AND org_id = ${actor.org} LIMIT 1`,
    db`SELECT full_name, contractor_id FROM drivers WHERE id = ${data.driverId} AND org_id = ${actor.org} LIMIT 1`,
    db`SELECT id FROM warehouses WHERE id = ${data.warehouseId} AND org_id = ${actor.org} LIMIT 1`,
  ]);

  if (!vehicle || !driver || !wh) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Vehicle, driver, or warehouse not found" }, { status: 404 }),
    );
  }

  // Generate trip code: TRP-YYYYMMDD-XXXX
  const date = new Date();
  const datePart = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  const tripCode = `TRP-${datePart}-${suffix}`;

  // Resolve contractor
  let contractorName: string | null = null;
  const contractorId = data.contractorId ?? (driver.contractor_id as string | null);
  if (contractorId) {
    const [c] = await db`SELECT name FROM contractors WHERE id = ${contractorId} AND org_id = ${actor.org} LIMIT 1`;
    contractorName = (c?.name as string) ?? null;
  }

  const tripId = uuidv7();
  await db`
    INSERT INTO trips (
      id, org_id, warehouse_id, trip_code, vehicle_id, vehicle_reg,
      driver_id, driver_name, contractor_id, contractor_name,
      total_stops, planned_return
    ) VALUES (
      ${tripId}, ${actor.org}, ${data.warehouseId}, ${tripCode},
      ${data.vehicleId}, ${vehicle.registration_number as string},
      ${data.driverId}, ${driver.full_name as string},
      ${contractorId ?? null}, ${contractorName},
      ${data.stops.length}, ${data.plannedReturn ?? null}
    )
  `;

  // Insert stops
  const stopRows = data.stops.map((stop, i) => ({
    id: uuidv7(),
    org_id: actor.org,
    trip_id: tripId,
    stop_order: i + 1,
    dealer_name: stop.dealerName,
    city: stop.city,
    invoice_count: stop.invoiceNumbers.length,
    invoice_numbers: stop.invoiceNumbers,
    delivery_mode: stop.deliveryMode,
  }));

  for (const row of stopRows) {
    await db`
      INSERT INTO trip_stops (
        id, org_id, trip_id, stop_order, dealer_name, city,
        invoice_count, invoice_numbers, delivery_mode
      ) VALUES (
        ${row.id}, ${row.org_id}, ${row.trip_id}, ${row.stop_order},
        ${row.dealer_name}, ${row.city}, ${row.invoice_count},
        ${row.invoice_numbers}, ${row.delivery_mode}
      )
    `;
  }

  await writeAuditEvent({
    orgId: actor.org,
    actorId: actor.sub,
    actorRole: actor.role,
    action: "trip.created",
    resourceType: "trip",
    resourceId: tripId,
    warehouseId: data.warehouseId,
    payload: { tripCode, stops: data.stops.length },
  });

  return applySecurityHeaders(
    NextResponse.json({ id: tripId, tripCode, stops: data.stops.length }, { status: 201 }),
  );
}
