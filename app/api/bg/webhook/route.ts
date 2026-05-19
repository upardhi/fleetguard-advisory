/**
 * POST /api/bg/webhook
 *
 * Receives BG check result callbacks from the vendor.
 * Validates shared secret, updates the compliance_checks record, and updates
 * driver bg_status.
 *
 * Body: { referenceId, status, notes, secret, driverId? }
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/_server/db/client";
import { writeAuditEvent } from "@/app/_server/db/audit";
import type { BGStatus } from "@/app/_lib/types";

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.BG_VENDOR_WEBHOOK_SECRET;

  let body: { referenceId: string; status: string; notes?: string; secret: string; driverId?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (webhookSecret && body.secret !== webhookSecret)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { referenceId, status, notes } = body;
  if (!referenceId || !status)
    return NextResponse.json({ error: "Missing referenceId or status" }, { status: 400 });

  const bgStatus: BGStatus =
    status === "CLEAR"   ? "clear" :
    status === "FLAGGED" ? "flagged" :
    "pending";

  // Find the pending BG check by vendorReferenceId in metadata
  const checks = await db`
    SELECT id, entity_id, org_id, metadata
    FROM   compliance_checks
    WHERE  check_type = 'bg'
      AND  metadata->>'vendorReferenceId' = ${referenceId}
    LIMIT  1
  `;

  if (checks.length === 0)
    return NextResponse.json({ error: "Screening request not found" }, { status: 404 });

  const check = checks[0]!;
  const driverId = (body.driverId ?? check.entity_id) as string;

  // Update the check record
  await db`
    UPDATE compliance_checks
    SET    status   = ${bgStatus},
           notes    = ${notes ?? null},
           metadata = metadata || ${db.json({ completedAt: new Date().toISOString(), notes })}
    WHERE  id = ${check.id}
  `;

  // Update driver bg_status
  await db`UPDATE drivers SET bg_status = ${bgStatus}, updated_at = now() WHERE id = ${driverId}`;

  const meta = check.metadata as Record<string, unknown>;

  await writeAuditEvent({
    orgId: check.org_id as string,
    actorId: "bg_vendor_webhook",
    actorRole: "system",
    action: "bg_check_completed",
    resourceType: "driver",
    resourceId: driverId,
    warehouseId: (meta?.warehouseId as string) ?? null,
    payload: { referenceId, bgStatus, checkId: check.id },
  });

  return NextResponse.json({ ok: true, bgStatus });
}
