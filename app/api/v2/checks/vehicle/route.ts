import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { uuidv7 } from "@/app/_server/db/uuidv7";
import { requireUser } from "@/app/_server/auth/getUser";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";

const VEHICLE_WARNING_DAYS = Number(process.env.VEHICLE_WARNING_DAYS ?? 30);

const VehicleCheckSchema = z.object({
  vehicleId: z.string(),
  warehouseId: z.string().optional(),
});

function docStatus(expiryStr: string, warningDays: number): "clear" | "expiring" | "expired" {
  const days = Math.floor((new Date(expiryStr).getTime() - Date.now()) / 86400000);
  return days < 0 ? "expired" : days <= warningDays ? "expiring" : "clear";
}

// POST /api/v2/checks/vehicle — run compliance check on all vehicle documents
export async function POST(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  const parsed = VehicleCheckSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }

  const { vehicleId, warehouseId } = parsed.data;

  const [vehicle] = await db`
    SELECT id, registration_number, rc_expiry, insurance_expiry, fitness_expiry, puc_expiry, status
    FROM   vehicles
    WHERE  id = ${vehicleId} AND org_id = ${actor.org}
    LIMIT  1
  `;

  if (!vehicle) {
    return applySecurityHeaders(NextResponse.json({ error: "Vehicle not found" }, { status: 404 }));
  }

  const docStatuses = {
    rc: docStatus(vehicle.rc_expiry as string, VEHICLE_WARNING_DAYS),
    insurance: docStatus(vehicle.insurance_expiry as string, VEHICLE_WARNING_DAYS),
    fitness: docStatus(vehicle.fitness_expiry as string, VEHICLE_WARNING_DAYS),
    puc: docStatus(vehicle.puc_expiry as string, VEHICLE_WARNING_DAYS),
  };

  const worstStatus = (Object.values(docStatuses) as string[]).includes("expired")
    ? "expired"
    : (Object.values(docStatuses) as string[]).includes("expiring")
    ? "expiring"
    : "clear";

  const blocked = worstStatus === "expired";

  if (worstStatus !== vehicle.status) {
    await db`UPDATE vehicles SET status = ${worstStatus}, updated_at = now() WHERE id = ${vehicleId}`;
  }

  const checkId = uuidv7();
  await db`
    INSERT INTO compliance_checks (
      id, org_id, entity_type, entity_id, check_type, status, checked_by, metadata
    ) VALUES (
      ${checkId}, ${actor.org}, 'vehicle', ${vehicleId}, 'documents', ${worstStatus},
      ${actor.sub}, ${db.json(docStatuses as Parameters<typeof db.json>[0])}
    )
  `;

  // vehicle_expired alerts have been removed — document expiry is shown
  // on the vehicle list, not in the alert inbox.
  const alertIds: string[] = [];

  await writeAuditEvent({
    orgId: actor.org,
    actorId: actor.sub,
    actorRole: actor.role,
    action: "check.vehicle",
    resourceType: "vehicle",
    resourceId: vehicleId,
    warehouseId,
    payload: { ...docStatuses, overall: worstStatus, blocked },
  });

  return applySecurityHeaders(
    NextResponse.json({ docStatuses, overall: worstStatus, blocked, checkId, alertIds }),
  );
}
