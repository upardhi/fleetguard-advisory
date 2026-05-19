/**
 * Image upload service — stores images in Vercel Blob.
 *
 * Two entry points:
 *  - uploadImage(file, folder)         — multipart File upload (guard camera, DL scan)
 *  - uploadImageFromUrl(url, folder)   — rehost a remote/base64 URL (IDfy profile photo)
 *
 * All uploads are publicly readable (no token required to display).
 * Folder is used as a path prefix inside the blob store:
 *   fg_photos      — gate event / face capture photos
 *   fg_dl_photos   — DL scan images
 *   fg_dl_images   — OCR source images
 */

import { put } from "@vercel/blob";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

// Vercel Blob rejects "//" in pathnames. Trim slashes so callers can pass
// "fg_photos", "fg_photos/", or "/fg_photos" interchangeably.
function normalizeFolder(folder: string): string {
  return folder.replace(/^\/+|\/+$/g, "");
}

export async function uploadImage(file: File, folder = "fg_photos"): Promise<string> {
  if (!file) throw new Error("No file provided");
  if (!file.type.startsWith("image/")) throw new Error("File must be an image");
  if (file.size > MAX_FILE_SIZE) throw new Error("File size must be less than 5 MB");

  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
  const pathname = `${normalizeFolder(folder)}/${timestamp}-${random}-${safeName}`;

  const blob = await put(pathname, file, {
    access: "public",
    contentType: file.type,
  });

  return blob.url;
}

/**
 * Persist an image from a remote URL or inline base64 data URI.
 * Used to rehost IDfy signed GCS URLs onto our own blob store so
 * the app never depends on the vendor's CDN.
 */
export async function uploadImageFromUrl(
  imageUrl: string,
  folder = "fg_dl_photos",
): Promise<string> {
  if (!imageUrl || typeof imageUrl !== "string") throw new Error("imageUrl is required");

  let buffer: Buffer;
  let contentType = "image/jpeg";

  if (/^data:/i.test(imageUrl)) {
    const match = /^data:([^;,]+)?(;base64)?,(.*)$/i.exec(imageUrl);
    if (!match) throw new Error("Invalid data URI");
    contentType = (match[1] ?? "").toLowerCase().trim() || "image/jpeg";
    const payload = match[3] ?? "";
    buffer = match[2]
      ? Buffer.from(payload, "base64")
      : Buffer.from(decodeURIComponent(payload), "utf8");
  } else if (/^https?:\/\//i.test(imageUrl)) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 15_000);
    let res: Response;
    try {
      res = await fetch(imageUrl, { signal: ac.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`Remote fetch failed: ${res.status} ${res.statusText}`);
    contentType = res.headers.get("content-type") ?? "image/jpeg";
    buffer = Buffer.from(await res.arrayBuffer());
  } else {
    throw new Error("imageUrl must be http(s) or a data: URI");
  }

  if (buffer.length === 0) throw new Error("Empty image payload");

  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const pathname = `${normalizeFolder(folder)}/${timestamp}-${random}.jpg`;

  const blob = await put(pathname, buffer, {
    access: "public",
    contentType,
  });

  console.info(`[uploadImageFromUrl] ${buffer.length}B → ${blob.url}`);
  return blob.url;
}
