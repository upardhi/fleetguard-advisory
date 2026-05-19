import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/_server/db/client";
import { requireUser } from "@/app/_server/auth/getUser";
import { applySecurityHeaders } from "@/app/_server/security/headers";

/**
 * GET /api/v2/inside-check?warehouseId=X&vehicleReg=Y&dlNumber=Z
 *
 * Returns whether a vehicle or driver is currently inside the warehouse.
 * Uses gate_sessions (the authoritative "who's inside" table) with a single
 * targeted JOIN — replaces the old pattern of downloading 200 gate events
 * and filtering on the client.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { searchParams } = new URL(req.url);
  const warehouseId  = searchParams.get("warehouseId");
  const vehicleReg   = searchParams.get("vehicleReg");
  const dlNumber     = searchParams.get("dlNumber");

  if (!warehouseId) {
    return applySecurityHeaders(
      NextResponse.json({ error: "warehouseId is required" }, { status: 400 }),
    );
  }

  const vehicleRegNorm = vehicleReg?.toUpperCase().replace(/[\s\-]/g, "") ?? "";
  const dlNorm         = dlNumber?.toUpperCase().replace(/[\s\-]/g, "") ?? "";

  // Run both checks in parallel — one round trip to the DB.
  const [vehicleCheck, driverCheck] = await Promise.all([
    vehicleRegNorm
      ? db`
          SELECT gs.entry_event_id, ge.vehicle_reg, ge.person_name, ge.occurred_at
          FROM   gate_sessions gs
          JOIN   gate_events   ge ON ge.id = gs.entry_event_id
          WHERE  gs.warehouse_id = ${warehouseId}
            AND  gs.org_id       = ${actor.org}
            AND  gs.status       = 'inside'
            AND  ge.vehicle_reg IS NOT NULL
            AND  regexp_replace(ge.vehicle_reg, '[\s\-]', '', 'g') = ${vehicleRegNorm}
          LIMIT  1
        `
      : Promise.resolve([]),

    dlNorm
      ? db`
          SELECT gs.entry_event_id, ge.person_name, ge.driver_id, ge.occurred_at
          FROM   gate_sessions gs
          JOIN   gate_events   ge ON ge.id = gs.entry_event_id
          WHERE  gs.warehouse_id = ${warehouseId}
            AND  gs.org_id       = ${actor.org}
            AND  gs.status       = 'inside'
            AND  (
              ge.driver_id IN (
                SELECT id FROM drivers
                WHERE  org_id = ${actor.org} AND dl_number = ${dlNorm} LIMIT 1
              )
              OR ge.metadata->>'dlNumber' = ${dlNorm}
            )
          LIMIT  1
        `
      : Promise.resolve([]),
  ]);

  const vehicleConflict = (vehicleCheck as Record<string, unknown>[])[0] ?? null;
  const driverConflict  = (driverCheck  as Record<string, unknown>[])[0] ?? null;

  return applySecurityHeaders(
    NextResponse.json({
      vehicleConflict: vehicleConflict
        ? {
            conflictEventId: vehicleConflict.entry_event_id as string,
            vehicleReg:      vehicleConflict.vehicle_reg    as string,
            personName:      vehicleConflict.person_name    as string | null,
            occurredAt:      vehicleConflict.occurred_at    as string,
          }
        : null,
      driverConflict: driverConflict
        ? {
            conflictEventId: driverConflict.entry_event_id as string,
            personName:      driverConflict.person_name    as string | null,
            driverId:        driverConflict.driver_id      as string | null,
            occurredAt:      driverConflict.occurred_at    as string,
          }
        : null,
    }),
  );
}
