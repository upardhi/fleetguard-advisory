/**
 * POST /api/photo-upload/from-url
 *
 * Rehost a remote image (e.g. IDfy profile_image URL) on our Firebase Storage
 * bucket so the app never depends on the vendor's CDN. Called at DL-verify
 * time from the guard truck-entry flow.
 *
 * Body: { imageUrl: string; folder?: string }
 * Response: { ok: true, imageUrl: string }   // our persisted URL
 *           { error: string }                // on failure
 *
 * The upstream flow should tolerate failures here and fall back to the
 * original vendor URL — the feature is an optimization, not a gate.
 */

import { NextRequest, NextResponse } from "next/server";
import { uploadImageFromUrl } from "../../dl-ocr/imageUploadService";

const ALLOWED_FOLDERS = new Set(["fg_photos", "fg_dl_photos", "fg_dl_images"]);

export async function POST(req: NextRequest) {
  let body: { imageUrl?: string; folder?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const imageUrl = (body.imageUrl ?? "").trim();
  const folder = body.folder && ALLOWED_FOLDERS.has(body.folder) ? body.folder : "fg_dl_photos";

  if (!imageUrl) {
    return NextResponse.json({ error: "imageUrl is required" }, { status: 400 });
  }

  try {
    const persisted = await uploadImageFromUrl(imageUrl, folder);
    return NextResponse.json({ ok: true, imageUrl: persisted });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "rehost failed";
    console.error("[photo-upload/from-url] failed:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
