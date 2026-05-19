/**
 * POST /api/pin/generate
 *
 * Generates a random dealer PIN, bcrypt-hashes it, stores the hash on the
 * trip_stop, then sends the plain PIN via SMS.
 * The plain PIN is NEVER returned in the response (S7).
 *
 * Body: { tripId, stopId?, dealerMobile, tripCode, warehouseId, orgId, guardUid, guardName }
 * Returns: { ok, smsSent } — NO pin field
 */

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { db } from "@/app/_server/db/client";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { sendPinSms } from "@/app/_lib/sms";
import { config } from "@/app/_lib/config";

function generatePin(length: number): string {
  let pin = "";
  for (let i = 0; i < length; i++) pin += Math.floor(Math.random() * 10).toString();
  return pin;
}

export async function POST(req: NextRequest) {
  let body: {
    tripId: string; stopId?: string; dealerMobile: string;
    tripCode: string; warehouseId: string; orgId: string;
    guardUid: string; guardName: string;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { tripId, stopId, dealerMobile, tripCode, warehouseId, orgId, guardUid, guardName } = body;
  if (!tripId || !dealerMobile || !tripCode || !warehouseId || !guardUid)
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  // Resolve which stop to update
  let resolvedStopId = stopId;
  if (!resolvedStopId) {
    const [firstStop] = await db`
      SELECT id FROM trip_stops WHERE trip_id = ${tripId} ORDER BY stop_order ASC LIMIT 1
    `;
    if (!firstStop) return NextResponse.json({ error: "Trip not found or has no stops" }, { status: 404 });
    resolvedStopId = firstStop.id as string;
  } else {
    const [stop] = await db`SELECT id FROM trip_stops WHERE id = ${resolvedStopId} AND trip_id = ${tripId} LIMIT 1`;
    if (!stop) return NextResponse.json({ error: "Stop not found" }, { status: 404 });
  }

  const plainPin = generatePin(config.pin.length);
  const pinHash  = await bcrypt.hash(plainPin, 10);

  await db`
    UPDATE trip_stops
    SET    pin_hash = ${pinHash}, pin_attempts = 0, pin_locked_at = null, updated_at = now()
    WHERE  id = ${resolvedStopId}
  `;

  const smsResult = await sendPinSms({ mobile: dealerMobile, pin: plainPin, tripCode });
  void plainPin; // plain PIN goes out of scope after SMS — never logged or stored

  await writeAuditEvent({
    orgId, actorId: guardUid, actorRole: "guard",
    action: "pin_generated", resourceType: "trip_stop", resourceId: resolvedStopId,
    warehouseId, payload: {
      tripId,
      smsSent: smsResult.ok,
      maskedMobile: dealerMobile.slice(-4).padStart(10, "*"),
      guardName,
    },
  });

  return NextResponse.json({ ok: true, smsSent: smsResult.ok,
    smsError: smsResult.ok ? undefined : smsResult.error });
}
