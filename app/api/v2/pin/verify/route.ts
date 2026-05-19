import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { verifyPassword } from "@/app/_server/auth/password";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";

const MAX_ATTEMPTS = 3;
const LOCK_MINUTES = 30;

const VerifyPinSchema = z.object({
  tripId: z.string(),
  stopId: z.string(),
  pin: z.string().length(6).regex(/^\d{6}$/),
});

// POST /api/v2/pin/verify — verify delivery confirmation PIN
// Public endpoint (dealers use it at delivery); no auth cookie required.
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  const parsed = VerifyPinSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Invalid PIN format" }, { status: 422 }),
    );
  }

  const { tripId, stopId, pin } = parsed.data;

  const [stop] = await db`
    SELECT ts.id, ts.org_id, ts.pin_hash, ts.pin_attempts, ts.pin_locked_at,
           ts.status, ts.trip_id, t.org_id AS trip_org_id
    FROM   trip_stops ts
    JOIN   trips t ON t.id = ts.trip_id
    WHERE  ts.id = ${stopId} AND ts.trip_id = ${tripId}
    LIMIT  1
  `;

  if (!stop) {
    return applySecurityHeaders(NextResponse.json({ error: "Invalid request" }, { status: 404 }));
  }

  if (!stop.pin_hash) {
    return applySecurityHeaders(
      NextResponse.json({ error: "No PIN set for this stop" }, { status: 400 }),
    );
  }

  if (stop.status === "confirmed") {
    return applySecurityHeaders(NextResponse.json({ ok: true, alreadyConfirmed: true }));
  }

  // Check lockout
  if (stop.pin_locked_at) {
    const elapsed = Date.now() - new Date(stop.pin_locked_at as string).getTime();
    if (elapsed < LOCK_MINUTES * 60 * 1000) {
      const remainingMin = Math.ceil((LOCK_MINUTES * 60 * 1000 - elapsed) / 60000);
      return applySecurityHeaders(
        NextResponse.json({ error: `PIN locked. Try again in ${remainingMin} minute(s).` }, { status: 423 }),
      );
    }
    // Lock expired — reset
    await db`UPDATE trip_stops SET pin_attempts = 0, pin_locked_at = null WHERE id = ${stopId}`;
  }

  const valid = await verifyPassword(pin, stop.pin_hash as string);

  if (!valid) {
    const newAttempts = (stop.pin_attempts as number) + 1;
    if (newAttempts >= MAX_ATTEMPTS) {
      await db`
        UPDATE trip_stops SET pin_attempts = ${newAttempts}, pin_locked_at = now(), updated_at = now()
        WHERE  id = ${stopId}
      `;
      return applySecurityHeaders(
        NextResponse.json({ error: "Too many failed attempts. PIN locked for 30 minutes." }, { status: 423 }),
      );
    }
    await db`UPDATE trip_stops SET pin_attempts = ${newAttempts}, updated_at = now() WHERE id = ${stopId}`;
    return applySecurityHeaders(
      NextResponse.json({
        error: "Invalid PIN",
        attemptsRemaining: MAX_ATTEMPTS - newAttempts,
      }, { status: 401 }),
    );
  }

  // Mark stop confirmed
  await db`
    UPDATE trip_stops
    SET    status = 'confirmed', confirmed_at = now(), pin_attempts = 0,
           pin_locked_at = null, updated_at = now()
    WHERE  id = ${stopId}
  `;

  // Increment trip confirmed_stops counter
  await db`
    UPDATE trips
    SET    confirmed_stops = confirmed_stops + 1, updated_at = now()
    WHERE  id = ${tripId}
  `;

  await writeAuditEvent({
    orgId: stop.trip_org_id as string,
    action: "pin.verified",
    resourceType: "trip_stop",
    resourceId: stopId,
    payload: { tripId },
  });

  return applySecurityHeaders(NextResponse.json({ ok: true, confirmed: true }));
}
