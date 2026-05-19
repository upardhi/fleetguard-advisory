// app/api/dl-ocr/route.ts
import { NextRequest, NextResponse } from "next/server";
import { uploadImage } from "./imageUploadService";
import { processFileWithOCR } from "@/app/_services/ocrService";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/jpg"];

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit` },
      { status: 400 },
    );
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `File type ${file.type} not allowed. Use JPEG, PNG, or WebP` },
      { status: 400 },
    );
  }

  // Upload to Vercel Blob
  let imageUrl: string;
  try {
    imageUrl = await uploadImage(file, "fg_images");
  } catch (uploadError) {
    const msg = uploadError instanceof Error ? uploadError.message : "Unknown error";
    console.error("[Upload Failed]:", uploadError);
    return NextResponse.json({ error: `Image upload failed: ${msg}` }, { status: 500 });
  }

  // Run OCR — failures here are non-fatal; the caller can retry or proceed manually.
  let ocrData = null;
  let ocrError: string | null = null;
  try {
    ocrData = await processFileWithOCR(file);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("OCR failed:", msg);
    ocrError = msg;
  }

  return NextResponse.json({
    success: true,
    imageUrl,
    ocrData,
    ocrError,
  });
}
