import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { requireUser } from "@/app/_server/auth/getUser";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";

const UpdateDriverSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  dlExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  facePhotoUrl: z.string().url().optional().nullable(),
  contractorId: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  bgStatus: z.enum(["pending", "clear", "flagged", "failed"]).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { id } = await params;
  const [driver] = await db`
    SELECT id, full_name, dl_number, dl_expiry, dl_status, bg_status,
           face_photo_url, contractor_id, is_active, registered_at, updated_at
    FROM   drivers
    WHERE  id = ${id} AND org_id = ${actor.org}
    LIMIT  1
  `;

  if (!driver) return applySecurityHeaders(NextResponse.json({ error: "Not found" }, { status: 404 }));
  return applySecurityHeaders(NextResponse.json({ driver }));
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  if (!["superadmin", "company_admin", "wh_manager", "regional_manager", "guard"].includes(actor.role)) {
    return applySecurityHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }

  const { id } = await params;
  const [existing] = await db`SELECT id FROM drivers WHERE id = ${id} AND org_id = ${actor.org} LIMIT 1`;
  if (!existing) return applySecurityHeaders(NextResponse.json({ error: "Not found" }, { status: 404 }));

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  const parsed = UpdateDriverSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }

  const data = parsed.data;
  const updates: Record<string, unknown> = { updated_at: new Date() };

  if (data.fullName !== undefined) updates.full_name = data.fullName;
  if (data.facePhotoUrl !== undefined) updates.face_photo_url = data.facePhotoUrl;
  if (data.contractorId !== undefined) updates.contractor_id = data.contractorId;
  if (data.isActive !== undefined) updates.is_active = data.isActive;
  if (data.bgStatus !== undefined) updates.bg_status = data.bgStatus;

  if (data.dlExpiry !== undefined) {
    const now = new Date();
    const expiry = new Date(data.dlExpiry);
    const days = Math.floor((expiry.getTime() - now.getTime()) / 86400000);
    updates.dl_expiry = data.dlExpiry;
    updates.dl_status = days < 0 ? "expired" : days <= 30 ? "expiring" : "clear";
  }

  await db`UPDATE drivers SET ${db(updates)} WHERE id = ${id}`;

  await writeAuditEvent({
    orgId: actor.org,
    actorId: actor.sub,
    actorRole: actor.role,
    action: "driver.updated",
    resourceType: "driver",
    resourceId: id,
    payload: Object.keys(data) as unknown as Record<string, unknown>,
  });

  return applySecurityHeaders(NextResponse.json({ ok: true }));
}
