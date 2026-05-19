import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { requireUser } from "@/app/_server/auth/getUser";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";
import { hashPassword } from "@/app/_server/auth/password";
import { maskMobile } from "@/app/_server/security/pii";

const PIN_LENGTH = 6;

const GeneratePinSchema = z.object({
  tripId: z.string(),
  stopId: z.string(),
});

function generatePin(): string {
  const max = 10 ** PIN_LENGTH;
  const pin = Math.floor(Math.random() * max);
  return String(pin).padStart(PIN_LENGTH, "0");
}

// POST /api/v2/pin/generate
// Generates a delivery confirmation PIN, stores its bcrypt hash on the trip stop,
// and sends it via SMS. The plaintext PIN is never stored or returned.
export async function POST(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  const parsed = GeneratePinSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }

  const { tripId, stopId } = parsed.data;

  const [trip] = await db`
    SELECT t.id, t.org_id, t.trip_code, t.driver_id, d.mobile AS driver_mobile
    FROM   trips t
    JOIN   drivers d ON d.id = t.driver_id
    WHERE  t.id = ${tripId} AND t.org_id = ${actor.org}
    LIMIT  1
  `;

  if (!trip) {
    return applySecurityHeaders(NextResponse.json({ error: "Trip not found" }, { status: 404 }));
  }

  const [stop] = await db`
    SELECT id, pin_locked_at, pin_attempts FROM trip_stops WHERE id = ${stopId} AND trip_id = ${tripId} LIMIT 1
  `;

  if (!stop) {
    return applySecurityHeaders(NextResponse.json({ error: "Stop not found" }, { status: 404 }));
  }

  // Clear lock if > 30 min have passed
  if (stop.pin_locked_at) {
    const lockedMs = Date.now() - new Date(stop.pin_locked_at as string).getTime();
    if (lockedMs < 30 * 60 * 1000) {
      return applySecurityHeaders(
        NextResponse.json({ error: "PIN is locked. Try again later." }, { status: 423 }),
      );
    }
  }

  const pin = generatePin();
  const pinHash = await hashPassword(pin);

  await db`
    UPDATE trip_stops
    SET    pin_hash = ${pinHash}, pin_attempts = 0, pin_locked_at = null, updated_at = now()
    WHERE  id = ${stopId}
  `;

  // SMS delivery (best-effort — don't fail the request if SMS fails)
  let smsSent = false;
  try {
    const mobile = trip.driver_mobile as string;
    if (mobile && process.env.MSG91_AUTH_KEY) {
      const { sendPinSms } = await import("@/app/_lib/sms");
      await sendPinSms({ mobile, pin, tripCode: trip.trip_code as string });
      smsSent = true;
    }
  } catch {
    // SMS failure is non-fatal
  }

  await writeAuditEvent({
    orgId: actor.org,
    actorId: actor.sub,
    actorRole: actor.role,
    action: "pin.generated",
    resourceType: "trip_stop",
    resourceId: stopId,
    payload: { tripId, maskedMobile: maskMobile(trip.driver_mobile as string ?? ""), smsSent },
  });

  return applySecurityHeaders(NextResponse.json({ ok: true, smsSent }));
}
