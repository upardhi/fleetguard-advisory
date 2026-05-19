import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { requireUser } from "@/app/_server/auth/getUser";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";

const PatchVehicleSchema = z.object({
  vehicleType:  z.string().max(50).optional(),
  ownerType:    z.enum(["owned", "contractor"]).optional(),
  contractorId: z.string().nullable().optional(),
  status:       z.enum([
    "clear", "expiring", "expired", "blocked",
    "not_found", "verify_failed",
  ]).optional(),
  rcExpiry:        z.string().optional(),
  insuranceExpiry: z.string().optional(),
  fitnessExpiry:   z.string().optional(),
  pucExpiry:       z.string().optional(),
  isActive:        z.boolean().optional(),
  // RC background verification fields (from /api/verify/rc)
  rcVerifyProvider: z.string().optional(),
  rcVerifyData:     z.record(z.string(), z.unknown()).optional(),
  rcVerifiedAt:     z.string().optional(),
  rcOwnerName:      z.string().optional(),
  rcManufacturer:   z.string().optional(),
  rcVehicleClass:   z.string().optional(),
  rcFuelType:       z.string().optional(),
  rcChassisNumber:  z.string().optional(),
  rcEngineNumber:   z.string().optional(),
  rcColor:          z.string().optional(),
});

function computeStatus(dates: (string | null | undefined)[]): "clear" | "expiring" | "expired" {
  const now = Date.now();
  let worst = Infinity;
  for (const d of dates) {
    if (!d) continue;
    const days = Math.ceil((new Date(d).getTime() - now) / 86_400_000);
    if (days < worst) worst = days;
  }
  if (worst === Infinity) return "clear";
  return worst < 0 ? "expired" : worst <= 30 ? "expiring" : "clear";
}

// GET /api/v2/vehicles/:id
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { id } = await params;

  const [v] = await db`
    SELECT id, registration_number, vehicle_type, owner_type, contractor_id,
           rc_expiry, insurance_expiry, fitness_expiry, puc_expiry, status, is_active, created_at,
           rc_owner_name, rc_manufacturer, rc_vehicle_class, rc_fuel_type,
           rc_chassis_number, rc_engine_number, rc_color,
           rc_verify_provider, rc_verified_at, rc_verify_data
    FROM   vehicles
    WHERE  id = ${id} AND org_id = ${actor.org}
    LIMIT  1
  `;

  if (!v) {
    return applySecurityHeaders(NextResponse.json({ error: "Vehicle not found" }, { status: 404 }));
  }

  return applySecurityHeaders(NextResponse.json({ vehicle: v }));
}

// PATCH /api/v2/vehicles/:id
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { id } = await params;

  const [existing] = await db`
    SELECT id, rc_expiry, insurance_expiry, fitness_expiry, puc_expiry
    FROM   vehicles WHERE id = ${id} AND org_id = ${actor.org} LIMIT 1
  `;
  if (!existing) {
    return applySecurityHeaders(NextResponse.json({ error: "Vehicle not found" }, { status: 404 }));
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  const parsed = PatchVehicleSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }

  const col: Record<string, unknown> = {};
  if (parsed.data.vehicleType  !== undefined) col.vehicle_type  = parsed.data.vehicleType;
  if (parsed.data.ownerType    !== undefined) col.owner_type    = parsed.data.ownerType;
  if (parsed.data.contractorId !== undefined) col.contractor_id = parsed.data.contractorId;
  if (parsed.data.status       !== undefined) col.status        = parsed.data.status;
  if (parsed.data.rcExpiry         !== undefined) col.rc_expiry         = parsed.data.rcExpiry;
  if (parsed.data.insuranceExpiry  !== undefined) col.insurance_expiry  = parsed.data.insuranceExpiry;
  if (parsed.data.fitnessExpiry    !== undefined) col.fitness_expiry    = parsed.data.fitnessExpiry;
  if (parsed.data.pucExpiry        !== undefined) col.puc_expiry        = parsed.data.pucExpiry;
  if (parsed.data.isActive         !== undefined) col.is_active         = parsed.data.isActive;
  if (parsed.data.rcVerifyProvider !== undefined) col.rc_verify_provider = parsed.data.rcVerifyProvider;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (parsed.data.rcVerifyData     !== undefined) col.rc_verify_data    = db.json(parsed.data.rcVerifyData as any);
  if (parsed.data.rcVerifiedAt     !== undefined) col.rc_verified_at    = parsed.data.rcVerifiedAt;
  if (parsed.data.rcOwnerName      !== undefined) col.rc_owner_name     = parsed.data.rcOwnerName;
  if (parsed.data.rcManufacturer   !== undefined) col.rc_manufacturer   = parsed.data.rcManufacturer;
  if (parsed.data.rcVehicleClass   !== undefined) col.rc_vehicle_class  = parsed.data.rcVehicleClass;
  if (parsed.data.rcFuelType       !== undefined) col.rc_fuel_type      = parsed.data.rcFuelType;
  if (parsed.data.rcChassisNumber  !== undefined) col.rc_chassis_number = parsed.data.rcChassisNumber;
  if (parsed.data.rcEngineNumber   !== undefined) col.rc_engine_number  = parsed.data.rcEngineNumber;
  if (parsed.data.rcColor          !== undefined) col.rc_color          = parsed.data.rcColor;

  // Auto-recompute status when expiry dates are updated (unless caller explicitly set status)
  const expiryUpdated = parsed.data.rcExpiry || parsed.data.insuranceExpiry ||
                        parsed.data.fitnessExpiry || parsed.data.pucExpiry;
  if (expiryUpdated && parsed.data.status === undefined) {
    const rc  = (parsed.data.rcExpiry        ?? existing.rc_expiry)        as string | null;
    const ins = (parsed.data.insuranceExpiry ?? existing.insurance_expiry) as string | null;
    const fit = (parsed.data.fitnessExpiry   ?? existing.fitness_expiry)   as string | null;
    const puc = (parsed.data.pucExpiry       ?? existing.puc_expiry)       as string | null;
    col.status = computeStatus([rc, ins, fit, puc]);
  }

  if (Object.keys(col).length > 0) {
    await db`UPDATE vehicles SET ${db(col)}, updated_at = now() WHERE id = ${id}`;
  }

  await writeAuditEvent({
    orgId: actor.org, actorId: actor.sub, actorRole: actor.role,
    action: "vehicle.updated", resourceType: "vehicle", resourceId: id, payload: col,
  });

  return applySecurityHeaders(NextResponse.json({ ok: true }));
}
