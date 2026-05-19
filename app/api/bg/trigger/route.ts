/**
 * POST /api/bg/trigger
 *
 * Requests a background check. Stores a compliance_checks record with
 * check_type='bg', updates driver bg_status to 'pending', optionally calls
 * the configured BG vendor API.
 *
 * Body: { driverId, warehouseId, orgId, requestedByUid, requestedByName }
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/_server/db/client";
import { thirdPartyFetch } from "@/app/_server/thirdParty/fetch";
import { uuidv7 } from "@/app/_server/db/uuidv7";
import { writeAuditEvent } from "@/app/_server/db/audit";

export async function POST(req: NextRequest) {
  let body: { driverId: string; warehouseId: string; orgId: string; requestedByUid: string; requestedByName: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { driverId, warehouseId, orgId, requestedByUid, requestedByName } = body;
  if (!driverId || !warehouseId || !requestedByUid)
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  const [driver] = await db`
    SELECT id, full_name, dl_number FROM drivers WHERE id = ${driverId} LIMIT 1
  `;
  if (!driver) return NextResponse.json({ error: "Driver not found" }, { status: 404 });

  let vendorReferenceId: string | null = null;
  const vendorApiUrl = process.env.BG_VENDOR_API_URL;
  const vendorApiKey = process.env.BG_VENDOR_API_KEY;

  if (vendorApiUrl && vendorApiKey) {
    try {
      const res = await thirdPartyFetch(`${vendorApiUrl}/requests`, {
        _service: "bg_vendor",
        _operation: "bg_check_trigger",
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": vendorApiKey },
        body: JSON.stringify({ name: driver.full_name, dlNumber: driver.dl_number, warehouseId }),
      });
      const json = (await res.json()) as { referenceId?: string };
      vendorReferenceId = json.referenceId ?? null;
    } catch { /* vendor call failed — still create the record */ }
  }

  const screeningId = uuidv7();
  await db`
    INSERT INTO compliance_checks (id, org_id, entity_type, entity_id, check_type, status, checked_by, metadata)
    VALUES (
      ${screeningId}, ${orgId}, 'driver', ${driverId}, 'bg', 'pending',
      ${requestedByUid},
      ${db.json({
        vendor: vendorApiUrl ? "configured_vendor" : "manual",
        vendorReferenceId,
        requestedByName,
        warehouseId,
        requestedAt: new Date().toISOString(),
      })}
    )
  `;

  await db`UPDATE drivers SET bg_status = 'pending', updated_at = now() WHERE id = ${driverId}`;

  await writeAuditEvent({
    orgId, actorId: requestedByUid, actorRole: "wh_manager",
    action: "bg_check_requested", resourceType: "driver", resourceId: driverId,
    warehouseId, payload: { screeningId, vendorReferenceId },
  });

  return NextResponse.json({ ok: true, screeningId, vendorReferenceId });
}
