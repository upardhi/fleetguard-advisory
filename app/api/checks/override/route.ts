/**
 * POST /api/checks/override
 *
 * Manager override for a blocked compliance check.
 * Every override MUST produce an audit record with reason + manager UID (brief §14 rule 6).
 *
 * Body: { checkId, entityType, entityId, reason, managerUid, managerName, warehouseId, orgId }
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/_server/db/client";
import { writeAuditEvent } from "@/app/_server/db/audit";

export async function POST(req: NextRequest) {
  let body: {
    checkId: string; entityType: string; entityId: string;
    reason: string; managerUid: string; managerName: string;
    warehouseId: string; orgId: string;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { checkId, entityType, entityId, reason, managerUid, warehouseId, orgId } = body;

  if (!checkId || !reason || !managerUid || !warehouseId)
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  if (reason.trim().length < 10)
    return NextResponse.json({ error: "Override reason must be at least 10 characters" }, { status: 400 });

  const [check] = await db`SELECT id FROM compliance_checks WHERE id = ${checkId} LIMIT 1`;
  if (!check) return NextResponse.json({ error: "Compliance check not found" }, { status: 404 });

  // Store override in metadata (compliance_checks has no dedicated override columns)
  await db`
    UPDATE compliance_checks
    SET    metadata = metadata || ${db.json({
      overridden: true,
      overriddenByUid: managerUid,
      overrideReason: reason,
      overriddenAt: new Date().toISOString(),
    })},
           notes = ${reason}
    WHERE  id = ${checkId}
  `;

  await writeAuditEvent({
    orgId: orgId || null, actorId: managerUid, actorRole: "wh_manager",
    action: "compliance_override", resourceType: entityType, resourceId: entityId,
    warehouseId: warehouseId || null,
    payload: { checkId, reason, overriddenAt: new Date().toISOString() },
  });

  return NextResponse.json({ ok: true, overrideId: checkId });
}
