/**
 * GET /api/v2/driver-profile?driverId=<uuid>
 *
 * Returns driver record + latest gate event (with DL/crime data) + vehicle
 * in a single server call. Replaces the two sequential client calls that
 * handleSelectCachedDriver used to make.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/_server/db/client";
import { requireUser } from "@/app/_server/auth/getUser";
import { applySecurityHeaders } from "@/app/_server/security/headers";
import { lookupLicense } from "@/app/_server/licenseLookup/lookup";

// postgres.js returns DATE/TIMESTAMPTZ as JS Date objects, not strings.
function isoDate(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string") return v.slice(0, 10);
  return null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const driverId = new URL(req.url).searchParams.get("driverId");
  if (!driverId) {
    return applySecurityHeaders(NextResponse.json({ error: "driverId required" }, { status: 400 }));
  }

  try {
    // ── 1. Driver + best gate event in parallel ───────────────────────────────
    // "Best" = most recent event that has DL verify data; fallback to latest event.
    const [driverRows, eventWithDlRows, latestEventRows] = await Promise.all([
      db`
        SELECT id, full_name, dl_number, dl_expiry, dl_status, bg_status,
               face_photo_url, contractor_id, registered_at
        FROM   drivers
        WHERE  id = ${driverId} AND org_id = ${actor.org} AND is_active = true
        LIMIT  1
      `,
      db`
        SELECT id, vehicle_reg, occurred_at, guard_name, warehouse_id,
               contractor_name, metadata
        FROM   gate_events
        WHERE  driver_id = ${driverId}
          AND  org_id    = ${actor.org}
          AND  (metadata->>'dlVerifyData') IS NOT NULL
        ORDER  BY occurred_at DESC
        LIMIT  1
      `,
      db`
        SELECT id, vehicle_reg, occurred_at, guard_name, warehouse_id,
               contractor_name, metadata
        FROM   gate_events
        WHERE  driver_id = ${driverId}
          AND  org_id    = ${actor.org}
        ORDER  BY occurred_at DESC
        LIMIT  1
      `,
    ]);

    if (!driverRows.length) {
      return applySecurityHeaders(NextResponse.json({ error: "Driver not found" }, { status: 404 }));
    }

    const driver = driverRows[0] as Record<string, unknown>;
    // Prefer event with DL verify data; fall back to most recent event.
    const eventRow = (eventWithDlRows.length ? eventWithDlRows : latestEventRows)[0] as Record<string, unknown> | undefined;

    // ── 2. Vehicle lookup (sequential — reg comes from event) ─────────────────
    const vehicleReg = (eventRow?.vehicle_reg as string | null)?.trim().toUpperCase() ?? null;
    let vehicle: Record<string, unknown> | null = null;

    if (vehicleReg) {
      const vRows = await db`
        SELECT id, registration_number, vehicle_type, owner_type, contractor_id,
               rc_expiry, insurance_expiry, fitness_expiry, puc_expiry, status,
               is_active, rc_owner_name, rc_manufacturer, rc_vehicle_class,
               rc_fuel_type, rc_chassis_number, rc_engine_number, rc_color,
               rc_verify_provider, created_at, updated_at
        FROM   vehicles
        WHERE  org_id    = ${actor.org}
          AND  is_active = true
          AND  UPPER(REPLACE(REPLACE(registration_number, ' ', ''), '-', ''))
               = ${vehicleReg.replace(/[\s-]/g, "")}
        LIMIT  1
      `;
      if (vRows.length) vehicle = vRows[0] as Record<string, unknown>;
    }

    // ── 3. Shape response ─────────────────────────────────────────────────────
    const meta = (eventRow?.metadata ?? {}) as Record<string, unknown>;

    // Crime cases aren't stored in gate_events.metadata.crimeCheckData (it only
    // holds {provider, caseId, capturedAt}). When the truck-entry page renders
    // a cached driver, it needs `pollData` to translate cases — so we fetch it
    // from the DocuFast lookup here. Same cost model as /api/v2/verify: zero
    // crime-vendor calls when DocuFast already has the data.
    let crimeCheckData = (meta.crimeCheckData ?? null) as
      | { provider?: string; caseId?: string; pollData?: Record<string, unknown> | null;
          initiateData?: Record<string, unknown>; capturedAt?: string } | null;
    const dlNumber = (driver.dl_number as string | null) ?? "";
    if (dlNumber && (!crimeCheckData?.pollData || !crimeCheckData?.provider)) {
      const hit = await lookupLicense(dlNumber).catch(() => null);
      if (hit?.crime && hit.crimeProvider) {
        const dlNorm = dlNumber.toUpperCase().replace(/[\s\-]/g, "");
        crimeCheckData = {
          provider:     hit.crimeProvider,
          caseId:       crimeCheckData?.caseId ?? `lookup_${dlNorm}`,
          pollData:     hit.crime,
          initiateData: crimeCheckData?.initiateData ?? {},
          capturedAt:   crimeCheckData?.capturedAt ?? new Date().toISOString(),
        };
      }
    }

    return applySecurityHeaders(NextResponse.json({
      driver: {
        id:           driver.id,
        fullName:     driver.full_name      ?? "",
        dlNumber:     driver.dl_number      ?? "",
        dlExpiry:     driver.dl_expiry      ?? null,
        dlStatus:     driver.dl_status      ?? null,
        bgStatus:     driver.bg_status      ?? null,
        facePhotoUrl: driver.face_photo_url ?? null,
        contractorId: driver.contractor_id  ?? null,
        registeredAt: driver.registered_at  ?? null,
      },
      latestEvent: eventRow ? {
        id:            eventRow.id,
        occurredAt:    eventRow.occurred_at,
        vehicleReg:    eventRow.vehicle_reg  ?? null,
        guardName:     eventRow.guard_name   ?? null,
        warehouseId:   eventRow.warehouse_id ?? null,
        contractorId:  (meta.contractorIds as string[] | undefined)?.[0] ?? null,
        contractorIds: (meta.contractorIds as string[] | undefined) ?? [],
        dlVerifyData:  meta.dlVerifyData    ?? null,
        crimeCheckData,
        dlNumber:      meta.dlNumber        ?? null,
        driverDob:     meta.driverDob       ?? null,
      } : null,
      vehicle: vehicle ? {
        id:                 vehicle.id,
        registrationNumber: vehicle.registration_number  ?? "",
        vehicleType:        vehicle.vehicle_type          ?? "unknown",
        ownerType:          vehicle.owner_type            ?? "owned",
        contractorId:       vehicle.contractor_id         ?? null,
        rcExpiry:        isoDate(vehicle.rc_expiry),
        insuranceExpiry: isoDate(vehicle.insurance_expiry),
        fitnessExpiry:   isoDate(vehicle.fitness_expiry),
        pucExpiry:       isoDate(vehicle.puc_expiry),
        status:             vehicle.status               ?? "clear",
        isActive:           vehicle.is_active            ?? true,
        rcOwnerName:        vehicle.rc_owner_name        ?? null,
        rcManufacturer:     vehicle.rc_manufacturer      ?? null,
        rcVehicleClass:     vehicle.rc_vehicle_class     ?? null,
        rcFuelType:         vehicle.rc_fuel_type         ?? null,
        rcChassisNumber:    vehicle.rc_chassis_number    ?? null,
        rcEngineNumber:     vehicle.rc_engine_number     ?? null,
        rcColor:            vehicle.rc_color             ?? null,
        rcVerifyProvider:   vehicle.rc_verify_provider   ?? null,
      } : null,
    }));
  } catch (err) {
    console.error("[driver-profile]", err);
    return applySecurityHeaders(
      NextResponse.json({ error: "Internal server error", detail: err instanceof Error ? err.message : String(err) }, { status: 500 }),
    );
  }
}
