import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { uuidv7 } from "@/app/_server/db/uuidv7";
import { requireUser } from "@/app/_server/auth/getUser";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";

const CreateDriverSchema = z.object({
  fullName: z.string().min(1).max(200),
  dlNumber: z.string().min(5).max(30),
  dlExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  contractorId: z.string().optional(),
  facePhotoUrl: z.string().url().optional(),
  bgStatus: z.enum(["pending", "clear", "flagged", "failed"]).optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 2000);
  const offset = Number(searchParams.get("offset") ?? 0);
  const search = searchParams.get("q");
  const status = searchParams.get("status"); // clear | expiring | expired | blocked

  const drivers = search
    ? await db`
        SELECT id, full_name, dl_number, dl_expiry, dl_status, bg_status,
               face_photo_url, contractor_id, is_active, registered_at
        FROM   drivers
        WHERE  org_id = ${actor.org}
          AND  is_active = true
          AND  (full_name ILIKE ${"%" + search + "%"} OR dl_number ILIKE ${"%" + search + "%"})
        ORDER  BY registered_at DESC
        LIMIT  ${limit} OFFSET ${offset}
      `
    : status
    ? await db`
        SELECT id, full_name, dl_number, dl_expiry, dl_status, bg_status,
               face_photo_url, contractor_id, is_active, registered_at
        FROM   drivers
        WHERE  org_id = ${actor.org} AND is_active = true AND dl_status = ${status}
        ORDER  BY registered_at DESC
        LIMIT  ${limit} OFFSET ${offset}
      `
    : await db`
        SELECT id, full_name, dl_number, dl_expiry, dl_status, bg_status,
               face_photo_url, contractor_id, is_active, registered_at
        FROM   drivers
        WHERE  org_id = ${actor.org} AND is_active = true
        ORDER  BY registered_at DESC
        LIMIT  ${limit} OFFSET ${offset}
      `;

  return applySecurityHeaders(NextResponse.json({ drivers, limit, offset }));
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  if (!["superadmin", "company_admin", "wh_manager", "regional_manager", "guard"].includes(actor.role)) {
    return applySecurityHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  const parsed = CreateDriverSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }

  const data = parsed.data;

  // Duplicate DL check within org
  const [dup] = await db`
    SELECT id FROM drivers WHERE org_id = ${actor.org} AND dl_number = ${data.dlNumber} AND is_active = true LIMIT 1
  `;
  if (dup) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Driver with this DL number already exists" }, { status: 409 }),
    );
  }

  const now = new Date();
  const expiry = new Date(data.dlExpiry);
  const daysUntilExpiry = Math.floor((expiry.getTime() - now.getTime()) / 86400000);
  const dlStatus =
    daysUntilExpiry < 0 ? "expired" :
    daysUntilExpiry <= 30 ? "expiring" :
    "clear";

  const id = uuidv7();
  await db`
    INSERT INTO drivers (
      id, org_id, contractor_id, full_name, dl_number, dl_expiry, dl_status, face_photo_url, bg_status
    ) VALUES (
      ${id}, ${actor.org}, ${data.contractorId ?? null},
      ${data.fullName}, ${data.dlNumber},
      ${data.dlExpiry}, ${dlStatus}, ${data.facePhotoUrl ?? null},
      ${data.bgStatus ?? "pending"}
    )
  `;

  await writeAuditEvent({
    orgId: actor.org,
    actorId: actor.sub,
    actorRole: actor.role,
    action: "driver.created",
    resourceType: "driver",
    resourceId: id,
    payload: { fullName: data.fullName, dlNumber: data.dlNumber, dlStatus },
  });

  return applySecurityHeaders(
    NextResponse.json({ id, dlStatus }, { status: 201 }),
  );
}
