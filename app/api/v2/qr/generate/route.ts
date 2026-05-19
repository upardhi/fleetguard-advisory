import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SignJWT } from "jose";
import { db } from "@/app/_server/db/client";
import { uuidv7 } from "@/app/_server/db/uuidv7";
import { requireUser } from "@/app/_server/auth/getUser";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";

const QR_TTL_DAYS = 7;

const GenerateQrSchema = z.object({
  tripId: z.string(),
  stopId: z.string(),
});

// POST /api/v2/qr/generate
// Signs a JWT containing tripId + stopId, stores the tokenId on the trip stop,
// generates a QR data URL. The JWT secret never leaves the server.
export async function POST(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  if (!["superadmin", "company_admin", "wh_manager", "regional_manager", "guard"].includes(actor.role)) {
    return applySecurityHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }

  const qrSecret = process.env.QR_SECRET;
  if (!qrSecret) {
    return applySecurityHeaders(
      NextResponse.json({ error: "QR signing not configured" }, { status: 503 }),
    );
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  const parsed = GenerateQrSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }

  const { tripId, stopId } = parsed.data;

  const [trip] = await db`
    SELECT id, warehouse_id FROM trips WHERE id = ${tripId} AND org_id = ${actor.org} LIMIT 1
  `;
  if (!trip) {
    return applySecurityHeaders(NextResponse.json({ error: "Trip not found" }, { status: 404 }));
  }

  const [stop] = await db`
    SELECT id FROM trip_stops WHERE id = ${stopId} AND trip_id = ${tripId} LIMIT 1
  `;
  if (!stop) {
    return applySecurityHeaders(NextResponse.json({ error: "Stop not found" }, { status: 404 }));
  }

  const tokenId = uuidv7();
  const expiresAt = new Date(Date.now() + QR_TTL_DAYS * 24 * 60 * 60 * 1000);
  const secret = new TextEncoder().encode(qrSecret);

  const token = await new SignJWT({
    jti: tokenId,
    tripId,
    stopId,
    warehouseId: trip.warehouse_id,
    orgId: actor.org,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${QR_TTL_DAYS}d`)
    .sign(secret);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://fleetguard.in";
  const deliveryUrl = `${baseUrl}/deliver/${token}`;

  // Store tokenId on trip stop (never the token itself)
  await db`
    UPDATE trip_stops
    SET    qr_token = ${tokenId}, updated_at = now()
    WHERE  id = ${stopId}
  `;

  // Generate QR image (best-effort)
  let qrDataUrl: string | null = null;
  try {
    const QRCode = await import("qrcode");
    qrDataUrl = await QRCode.toDataURL(deliveryUrl, { width: 300, margin: 2 });
  } catch {
    // qrcode package unavailable or failed — caller can render their own
  }

  await writeAuditEvent({
    orgId: actor.org,
    actorId: actor.sub,
    actorRole: actor.role,
    action: "qr.generated",
    resourceType: "trip_stop",
    resourceId: stopId,
    payload: { tripId, tokenId, expiresAt: expiresAt.toISOString() },
  });

  return applySecurityHeaders(
    NextResponse.json({ ok: true, tokenId, deliveryUrl, qrDataUrl, expiresAt }),
  );
}
