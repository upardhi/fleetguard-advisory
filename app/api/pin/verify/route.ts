/**
 * POST /api/pin/verify
 *
 * Verifies the dealer-entered PIN against the bcrypt hash stored on the trip_stop.
 * Tracks failed attempts and locks after config.pin.maxAttempts failures.
 *
 * Body: { tripId, stopId?, pin, warehouseId, orgId }
 * Returns: { ok, verified, locked, attemptsRemaining? }
 *
 * CRITICAL: The PIN must NEVER appear in any response body, log, or error (S7).
 */

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { db } from "@/app/_server/db/client";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { config } from "@/app/_lib/config";
import { createBridgedAlert } from "@/app/_server/alerts/createBridged";

export async function POST(req: NextRequest) {
  let body: { tripId: string; stopId?: string; pin: string; warehouseId: string; orgId: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { tripId, stopId, pin, warehouseId, orgId } = body;
  if (!tripId || !pin || !warehouseId)
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  // Resolve stop
  const stop = stopId
    ? (await db`SELECT id, pin_hash, pin_attempts, pin_locked_at FROM trip_stops WHERE id = ${stopId} AND trip_id = ${tripId} LIMIT 1`)[0]
    : (await db`SELECT id, pin_hash, pin_attempts, pin_locked_at FROM trip_stops WHERE trip_id = ${tripId} ORDER BY stop_order ASC LIMIT 1`)[0];

  if (!stop) return NextResponse.json({ error: "Trip or stop not found" }, { status: 404 });

  const resolvedStopId = stop.id as string;
  const pinHash        = stop.pin_hash as string | null;
  const attempts       = (stop.pin_attempts as number) ?? 0;
  const lockedAt       = stop.pin_locked_at ? new Date(stop.pin_locked_at as string) : null;
  const maxAttempts    = config.pin.maxAttempts;
  const lockMs         = config.pin.lockoutMinutes * 60 * 1000;

  // Check lockout
  if (lockedAt && lockedAt.getTime() + lockMs > Date.now()) {
    return NextResponse.json({
      ok: false, verified: false, locked: true,
      lockedUntil: new Date(lockedAt.getTime() + lockMs).toISOString(),
    });
  }

  if (!pinHash)
    return NextResponse.json({ error: "No PIN set for this stop" }, { status: 400 });

  const verified = await bcrypt.compare(pin, pinHash);

  if (verified) {
    await db`UPDATE trip_stops SET pin_attempts = 0, pin_locked_at = null, updated_at = now() WHERE id = ${resolvedStopId}`;
    await writeAuditEvent({
      orgId, action: "pin_verified", resourceType: "trip_stop", resourceId: resolvedStopId,
      warehouseId, payload: { tripId, verified: true },
    });
    return NextResponse.json({ ok: true, verified: true, locked: false });
  }

  const newAttempts = attempts + 1;
  const shouldLock  = newAttempts >= maxAttempts;
  await db`
    UPDATE trip_stops
    SET    pin_attempts = ${newAttempts},
           pin_locked_at = ${shouldLock ? new Date() : null},
           updated_at = now()
    WHERE  id = ${resolvedStopId}
  `;

  if (shouldLock) {
    const [tripRow] = await db`SELECT trip_code, org_id FROM trips WHERE id = ${tripId} LIMIT 1`;
    if (tripRow) {
      await createBridgedAlert({
        orgId:       tripRow.org_id as string,
        warehouseId,
        type:        "pin_locked",
        severity:    "warning",
        message:     `Trip ${tripRow.trip_code as string} — dealer PIN locked after ${maxAttempts} failed attempts`,
        entityType:  "trip_stop",
        entityId:    resolvedStopId,
        raisedBy:    "system",
        actorRole:   "system",
      }).catch(console.error);
    }
  }

  await writeAuditEvent({
    orgId, action: "pin_verify_failed", resourceType: "trip_stop", resourceId: resolvedStopId,
    warehouseId, payload: { tripId, attempt: newAttempts, locked: shouldLock },
  });

  return NextResponse.json({
    ok: false, verified: false, locked: shouldLock,
    attemptsRemaining: Math.max(0, maxAttempts - newAttempts),
    ...(shouldLock ? { lockedUntil: new Date(Date.now() + lockMs).toISOString() } : {}),
  });
}
