/**
 * POST /api/qr/generate
 *
 * Signs a JWT for a trip's dealer delivery confirmation.
 * Stores the tokenId on the trip_stop (never the full token — S7).
 *
 * Body: { tripId, stopId?, warehouseId, orgId, managerUid, managerName }
 * Returns: { ok, tokenId, deliveryUrl, qrDataUrl, expiresAt }
 */

import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import { db } from "@/app/_server/db/client";
import { uuidv7 } from "@/app/_server/db/uuidv7";
import { writeAuditEvent } from "@/app/_server/db/audit";

const QR_EXPIRY_SECONDS = 60 * 60 * 24 * 7; // 7 days

export async function POST(req: NextRequest) {
  const qrSecret = process.env.QR_SECRET;
  if (!qrSecret)
    return NextResponse.json({ error: "QR_SECRET not configured" }, { status: 500 });

  let body: {
    tripId: string; stopId?: string; warehouseId: string;
    orgId: string; managerUid: string; managerName: string;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { tripId, stopId, warehouseId, orgId, managerUid, managerName } = body;
  if (!tripId || !warehouseId || !managerUid)
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  const [trip] = await db`SELECT id FROM trips WHERE id = ${tripId} LIMIT 1`;
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  // Resolve stop — prefer provided stopId, else first stop
  let resolvedStopId = stopId;
  if (!resolvedStopId) {
    const [firstStop] = await db`
      SELECT id FROM trip_stops WHERE trip_id = ${tripId} ORDER BY stop_order ASC LIMIT 1
    `;
    resolvedStopId = firstStop?.id as string | undefined;
  }

  const expiresAt = new Date(Date.now() + QR_EXPIRY_SECONDS * 1000);
  const tokenId   = uuidv7();

  const secret = new TextEncoder().encode(qrSecret);
  const token  = await new SignJWT({
    jti: tokenId,
    tripId,
    stopId:      resolvedStopId ?? null,
    warehouseId,
    orgId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secret);

  const baseUrl     = process.env.NEXT_PUBLIC_APP_URL ?? process.env.BASE_URL ?? "http://localhost:3000";
  const deliveryUrl = `${baseUrl}/deliver/${token}`;

  // Store tokenId on stop (never the full JWT — S7)
  if (resolvedStopId) {
    await db`UPDATE trip_stops SET qr_token = ${tokenId}, updated_at = now() WHERE id = ${resolvedStopId}`;
  }

  let qrDataUrl: string | null = null;
  try {
    const QRCode = await import("qrcode");
    qrDataUrl = await (QRCode.default ?? QRCode).toDataURL(deliveryUrl, { width: 400, margin: 2 });
  } catch { /* qrcode unavailable */ }

  await writeAuditEvent({
    orgId, actorId: managerUid, actorRole: "wh_manager",
    action: "qr_generated", resourceType: "trip", resourceId: tripId,
    warehouseId, payload: { tokenId, stopId: resolvedStopId ?? null, expiresAt: expiresAt.toISOString(), managerName },
  });

  return NextResponse.json({ ok: true, tokenId, deliveryUrl, qrDataUrl, expiresAt: expiresAt.toISOString() });
}
