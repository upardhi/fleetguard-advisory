/**
 * POST /api/checks/driver
 *
 * DL + BG compliance check for a driver.
 * Writes a compliance_checks record and raises alerts if needed.
 *
 * Body: { driverId, warehouseId, orgId, guardUid, guardName }
 * Returns: { ok, dlStatus, bgStatus, blocked, reason?, checkId, alertIds[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/_server/db/client";
import { uuidv7 } from "@/app/_server/db/uuidv7";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { config } from "@/app/_lib/config";
import { createBridgedAlert } from "@/app/_server/alerts/createBridged";
import type { CheckStatus, BGStatus } from "@/app/_lib/types";

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function computeDlStatus(expiry: Date): CheckStatus {
  const days = daysBetween(new Date(), expiry);
  if (days < 0) return "expired";
  if (days <= config.dlExpiry.warningDays) return "expiring";
  return "clear";
}

export async function POST(req: NextRequest) {
  let body: { driverId: string; warehouseId: string; orgId: string; guardUid: string; guardName: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { driverId, warehouseId, orgId, guardUid, guardName } = body;
  if (!driverId || !warehouseId || !orgId || !guardUid)
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  const [driver] = await db`
    SELECT id, full_name, dl_number, dl_expiry, dl_status, bg_status
    FROM   drivers
    WHERE  id = ${driverId}
    LIMIT  1
  `;
  if (!driver) return NextResponse.json({ error: "Driver not found" }, { status: 404 });

  const dlExpiry = new Date(driver.dl_expiry as string);
  const dlStatus: CheckStatus = computeDlStatus(dlExpiry);
  const bgStatus: BGStatus = driver.bg_status as BGStatus;
  const blocked = dlStatus === "expired" || bgStatus === "flagged";

  const reasons: string[] = [];
  if (dlStatus === "expired")  reasons.push("DL expired");
  if (dlStatus === "expiring") reasons.push(`DL expires in ${daysBetween(new Date(), dlExpiry)} days`);
  if (bgStatus === "flagged")  reasons.push("Background check flagged");
  if (bgStatus === "pending")  reasons.push("Background check pending");

  // Update dl_status on driver if it changed
  if (dlStatus !== (driver.dl_status as string)) {
    await db`UPDATE drivers SET dl_status = ${dlStatus}, updated_at = now() WHERE id = ${driverId}`;
  }

  // Write compliance check record
  const checkId = uuidv7();
  await db`
    INSERT INTO compliance_checks (id, org_id, entity_type, entity_id, check_type, status, expiry_date, checked_by, metadata)
    VALUES (
      ${checkId}, ${orgId}, 'driver', ${driverId}, 'dl',
      ${dlStatus}, ${driver.dl_expiry},
      ${guardUid},
      ${db.json({ bgStatus, blocked, guardName, warehouseId })}
    )
  `;

  // DL expired / expiring alerts are dropped (operational nudges).
  // BG-flagged still escalates via the bridged-alert helper.
  const alertIds: string[] = [];
  if (bgStatus === "flagged") {
    const r = await createBridgedAlert({
      orgId, warehouseId, type: "bg_flagged", severity: "critical",
      message: `Driver ${driver.full_name as string} — background check flagged`,
      entityType: "driver", entityId: driverId,
      raisedBy: guardUid, actorRole: "guard",
    });
    if (!r.skipped && r.alertId) alertIds.push(r.alertId);
  }

  await writeAuditEvent({
    orgId, actorId: guardUid, actorRole: "guard",
    action: "driver_check", resourceType: "driver", resourceId: driverId,
    warehouseId, payload: { dlStatus, bgStatus, blocked, checkId, alertIds },
  });

  return NextResponse.json({
    ok: true, dlStatus, bgStatus, blocked,
    reason: reasons.join("; ") || null,
    checkId, alertIds,
    driver: { id: driverId, fullName: driver.full_name, dlNumber: driver.dl_number },
  });
}
