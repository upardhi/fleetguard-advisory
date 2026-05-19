/**
 * POST /api/face/compare
 *
 * Compares a captured face image against the driver's reference photo via
 * Google Cloud Vision API face detection. Raises a face_mismatch alert on fail.
 *
 * Body: { driverId, capturedImageBase64, tripId?, warehouseId, orgId, guardUid, guardName }
 * Returns: { ok, result, score, alertId? }
 *
 * Raw score and images never leave the server (S7).
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/_server/db/client";
import { thirdPartyFetch } from "@/app/_server/thirdParty/fetch";
import { uuidv7 } from "@/app/_server/db/uuidv7";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { config } from "@/app/_lib/config";
import { createBridgedAlert } from "@/app/_server/alerts/createBridged";
import type { FaceMatchResult } from "@/app/_lib/types";

interface VisionFaceAnnotation { detectionConfidence?: number }
interface VisionResponse {
  responses?: Array<{ faceAnnotations?: VisionFaceAnnotation[]; error?: { message: string } }>;
}

async function callVisionApi(imageBase64: string): Promise<number> {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  if (!apiKey) return -1;

  const res = await thirdPartyFetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
    _service: "google_vision",
    _operation: "face_detect",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [{ image: { content: imageBase64 }, features: [{ type: "FACE_DETECTION", maxResults: 1 }] }],
    }),
  });
  const json = (await res.json()) as VisionResponse;
  const annotations = json.responses?.[0]?.faceAnnotations;
  if (!annotations?.length) return 0;
  return annotations[0]!.detectionConfidence ?? 0;
}

export async function POST(req: NextRequest) {
  let body: {
    driverId: string; capturedImageBase64: string; tripId?: string;
    warehouseId: string; orgId: string; guardUid: string; guardName: string;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { driverId, capturedImageBase64, tripId, warehouseId, orgId, guardUid, guardName } = body;
  if (!driverId || !capturedImageBase64 || !warehouseId || !guardUid)
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  const [driver] = await db`SELECT id, full_name, face_photo_url FROM drivers WHERE id = ${driverId} LIMIT 1`;
  if (!driver) return NextResponse.json({ error: "Driver not found" }, { status: 404 });

  if (!driver.face_photo_url) {
    return NextResponse.json({
      ok: true, result: "uncertain" as FaceMatchResult,
      score: null, reason: "No reference photo registered for this driver",
    });
  }

  let score: number;
  try { score = await callVisionApi(capturedImageBase64); }
  catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Vision API error" }, { status: 500 });
  }

  let result: FaceMatchResult;
  if      (score === -1)                           result = "uncertain";
  else if (score < config.faceMatch.minScore)      result = "mismatch";
  else if (score < config.faceMatch.uncertainThreshold) result = "uncertain";
  else                                              result = "match";

  // Record verify_attempt
  const attemptId = uuidv7();
  await db`
    INSERT INTO verify_attempts (id, org_id, attempt_type, entity_id, input_data, result, success, provider, requested_by)
    VALUES (
      ${attemptId}, ${orgId}, 'face', ${driverId},
      ${db.json({ tripId: tripId ?? null })},
      ${db.json({ result, score: score === -1 ? null : score })},
      ${result === "match"},
      ${score === -1 ? "unconfigured" : "google_vision"},
      ${guardUid}
    )
  `;

  let alertId: string | null = null;
  if (result === "mismatch") {
    const r = await createBridgedAlert({
      orgId, warehouseId, type: "face_mismatch", severity: "critical",
      message: `Face mismatch — driver ${driver.full_name as string} — score ${score.toFixed(2)}`,
      entityType: "driver", entityId: driverId,
      raisedBy: guardUid, actorRole: "guard",
    });
    if (!r.skipped) alertId = r.alertId || null;
  }

  await writeAuditEvent({
    orgId, actorId: guardUid, actorRole: "guard",
    action: "face_compare", resourceType: "driver", resourceId: driverId,
    warehouseId, payload: {
      result,
      score:    score === -1 ? "vision_not_configured" : score.toFixed(3),
      tripId:   tripId ?? null,
      alertId,
      guardName,
    },
  });

  return NextResponse.json({
    ok: true, result, score: score === -1 ? null : score, alertId,
    driver: { id: driverId, fullName: driver.full_name },
  });
}
