import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { uuidv7 } from "@/app/_server/db/uuidv7";
import { requireUser } from "@/app/_server/auth/getUser";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";

const CreateVehicleSchema = z.object({
  registrationNumber: z.string().min(3).max(30).transform((s) => s.toUpperCase().replace(/\s/g, "")),
  vehicleType: z.string().min(1).max(50),
  ownerType: z.enum(["owned", "contractor"]).default("owned"),
  contractorId: z.string().optional(),
  rcExpiry:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  insuranceExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  fitnessExpiry:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  pucExpiry:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

function computeVehicleStatus(dates: (string | null | undefined)[]): "clear" | "expiring" | "expired" {
  const now = Date.now();
  let worstDays = Infinity;
  for (const d of dates) {
    if (!d) continue;
    const days = Math.floor((new Date(d).getTime() - now) / 86400000);
    if (days < worstDays) worstDays = days;
  }
  if (worstDays === Infinity) return "clear";
  return worstDays < 0 ? "expired" : worstDays <= 30 ? "expiring" : "clear";
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 2000);
  const offset = Number(searchParams.get("offset") ?? 0);
  const search = searchParams.get("q");
  const status = searchParams.get("status");

  const vehicles = search
    ? await db`
        SELECT id, registration_number, vehicle_type, owner_type, contractor_id,
               rc_expiry, insurance_expiry, fitness_expiry, puc_expiry, status, is_active, created_at,
               rc_owner_name, rc_manufacturer, rc_vehicle_class, rc_fuel_type,
               rc_chassis_number, rc_engine_number, rc_color,
               rc_verify_provider, rc_verified_at, rc_verify_data
        FROM   vehicles
        WHERE  org_id = ${actor.org} AND is_active = true
          AND  registration_number ILIKE ${"%" + search.toUpperCase() + "%"}
        ORDER  BY created_at DESC LIMIT ${limit} OFFSET ${offset}
      `
    : status
    ? await db`
        SELECT id, registration_number, vehicle_type, owner_type, contractor_id,
               rc_expiry, insurance_expiry, fitness_expiry, puc_expiry, status, is_active, created_at,
               rc_owner_name, rc_manufacturer, rc_vehicle_class, rc_fuel_type,
               rc_chassis_number, rc_engine_number, rc_color,
               rc_verify_provider, rc_verified_at, rc_verify_data
        FROM   vehicles
        WHERE  org_id = ${actor.org} AND is_active = true AND status = ${status}
        ORDER  BY created_at DESC LIMIT ${limit} OFFSET ${offset}
      `
    : await db`
        SELECT id, registration_number, vehicle_type, owner_type, contractor_id,
               rc_expiry, insurance_expiry, fitness_expiry, puc_expiry, status, is_active, created_at,
               rc_owner_name, rc_manufacturer, rc_vehicle_class, rc_fuel_type,
               rc_chassis_number, rc_engine_number, rc_color,
               rc_verify_provider, rc_verified_at, rc_verify_data
        FROM   vehicles
        WHERE  org_id = ${actor.org} AND is_active = true
        ORDER  BY created_at DESC LIMIT ${limit} OFFSET ${offset}
      `;

  return applySecurityHeaders(NextResponse.json({ vehicles, limit, offset }));
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  if (!["superadmin", "company_admin", "wh_manager", "regional_manager", "guard"].includes(actor.role)) {
    return applySecurityHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  const parsed = CreateVehicleSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }

  const data = parsed.data;

  const [dup] = await db`
    SELECT id FROM vehicles
    WHERE  org_id = ${actor.org} AND registration_number = ${data.registrationNumber} AND is_active = true
    LIMIT  1
  `;
  if (dup) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Vehicle with this registration already exists" }, { status: 409 }),
    );
  }

  const status = computeVehicleStatus([
    data.rcExpiry, data.insuranceExpiry, data.fitnessExpiry, data.pucExpiry,
  ]);

  const id = uuidv7();
  await db`
    INSERT INTO vehicles (
      id, org_id, contractor_id, registration_number, vehicle_type, owner_type,
      rc_expiry, insurance_expiry, fitness_expiry, puc_expiry, status
    ) VALUES (
      ${id}, ${actor.org}, ${data.contractorId ?? null},
      ${data.registrationNumber}, ${data.vehicleType}, ${data.ownerType},
      ${data.rcExpiry ?? null}, ${data.insuranceExpiry ?? null},
      ${data.fitnessExpiry ?? null}, ${data.pucExpiry ?? null}, ${status}
    )
  `;

  await writeAuditEvent({
    orgId: actor.org,
    actorId: actor.sub,
    actorRole: actor.role,
    action: "vehicle.created",
    resourceType: "vehicle",
    resourceId: id,
    payload: { registrationNumber: data.registrationNumber, status },
  });

  return applySecurityHeaders(NextResponse.json({ id, status }, { status: 201 }));
}
