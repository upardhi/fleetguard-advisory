/**
 * POST /api/checks/vehicle
 *
 * RC + insurance + fitness + PUC compliance check.
 * Body: { vehicleId, warehouseId, orgId, guardUid, guardName }
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/_server/db/client";
import { uuidv7 } from "@/app/_server/db/uuidv7";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { config } from "@/app/_lib/config";
import type { CheckStatus } from "@/app/_lib/types";

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function expiryStatus(expiry: Date): CheckStatus {
  const days = daysBetween(new Date(), expiry);
  if (days < 0) return "expired";
  if (days <= config.vehicleExpiry.warningDays) return "expiring";
  return "clear";
}

function worstStatus(statuses: CheckStatus[]): CheckStatus {
  if (statuses.includes("expired"))  return "expired";
  if (statuses.includes("expiring")) return "expiring";
  if (statuses.includes("blocked"))  return "blocked";
  return "clear";
}

export async function POST(req: NextRequest) {
  let body: { vehicleId: string; warehouseId: string; orgId: string; guardUid: string; guardName: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { vehicleId, warehouseId, orgId, guardUid, guardName } = body;
  if (!vehicleId || !warehouseId || !orgId || !guardUid)
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  const [v] = await db`
    SELECT id, registration_number, vehicle_type, rc_expiry, insurance_expiry, fitness_expiry, puc_expiry
    FROM   vehicles
    WHERE  id = ${vehicleId}
    LIMIT  1
  `;
  if (!v) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });

  const rc        = new Date(v.rc_expiry as string);
  const insurance = new Date(v.insurance_expiry as string);
  const fitness   = new Date(v.fitness_expiry as string);
  const puc       = new Date(v.puc_expiry as string);

  const expiryMap = {
    rc:        { status: expiryStatus(rc),        expiry: rc.toISOString() },
    insurance: { status: expiryStatus(insurance), expiry: insurance.toISOString() },
    fitness:   { status: expiryStatus(fitness),   expiry: fitness.toISOString() },
    puc:       { status: expiryStatus(puc),        expiry: puc.toISOString() },
  };

  const overallStatus = worstStatus(Object.values(expiryMap).map((e) => e.status));
  const blocked = overallStatus === "expired";

  const expiredFields  = Object.entries(expiryMap).filter(([, v]) => v.status === "expired").map(([k]) => k.toUpperCase());
  const expiringFields = Object.entries(expiryMap).filter(([, v]) => v.status === "expiring").map(([k]) => k.toUpperCase());
  const reasons: string[] = [];
  if (expiredFields.length)  reasons.push(`Expired: ${expiredFields.join(", ")}`);
  if (expiringFields.length) reasons.push(`Expiring soon: ${expiringFields.join(", ")}`);

  // Update vehicle status
  await db`UPDATE vehicles SET status = ${overallStatus}, updated_at = now() WHERE id = ${vehicleId}`;

  // Compliance check record
  const checkId = uuidv7();
  const worstExpiry = [rc, insurance, fitness, puc].sort((a, b) => a.getTime() - b.getTime())[0]!;
  await db`
    INSERT INTO compliance_checks (id, org_id, entity_type, entity_id, check_type, status, expiry_date, checked_by, metadata)
    VALUES (
      ${checkId}, ${orgId}, 'vehicle', ${vehicleId}, 'rc',
      ${overallStatus}, ${worstExpiry.toISOString().slice(0, 10)},
      ${guardUid},
      ${db.json({ expiryMap, blocked, guardName, warehouseId })}
    )
  `;

  // vehicle_expired alerts have been removed — surfaced on the vehicle list.
  const alertIds: string[] = [];

  await writeAuditEvent({
    orgId, actorId: guardUid, actorRole: "guard",
    action: "vehicle_check", resourceType: "vehicle", resourceId: vehicleId,
    warehouseId, payload: { overallStatus, blocked, checkId },
  });

  return NextResponse.json({
    ok: true, status: overallStatus, blocked,
    reason: reasons.join("; ") || null,
    expiryMap, checkId, alertIds,
    vehicle: { id: vehicleId, registrationNumber: v.registration_number, vehicleType: v.vehicle_type },
  });
}
