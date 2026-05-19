import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { requireUser } from "@/app/_server/auth/getUser";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";

const PatchUserSchema = z.object({
  fullName:     z.string().min(1).max(200).optional(),
  mobile:       z.string().max(20).optional(),
  warehouseId:  z.string().optional(),
  warehouseIds: z.array(z.string().min(1)).optional(),
  role:         z.enum(["guard", "wh_manager", "regional_manager", "cso", "company_admin", "superadmin"]).optional(),
  isActive:     z.boolean().optional(),
});

// GET /api/v2/users/:id
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { id } = await params;

  const [user] = actor.role === "superadmin"
    ? await db`
        SELECT id, org_id, email, full_name, role, mobile, warehouse_id, warehouse_ids, is_active, created_at, updated_at
        FROM   users
        WHERE  id = ${id}
        LIMIT  1
      `
    : await db`
        SELECT id, org_id, email, full_name, role, mobile, warehouse_id, warehouse_ids, is_active, created_at, updated_at
        FROM   users
        WHERE  id = ${id} AND org_id = ${actor.org}
        LIMIT  1
      `;

  if (!user) {
    return applySecurityHeaders(NextResponse.json({ error: "User not found" }, { status: 404 }));
  }

  return applySecurityHeaders(NextResponse.json({ user }));
}

// PATCH /api/v2/users/:id
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  if (!["superadmin", "company_admin"].includes(actor.role)) {
    return applySecurityHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }

  const { id } = await params;

  const [user] = actor.role === "superadmin"
    ? await db`SELECT id, org_id FROM users WHERE id = ${id} LIMIT 1`
    : await db`SELECT id, org_id FROM users WHERE id = ${id} AND org_id = ${actor.org} LIMIT 1`;
  if (!user) {
    return applySecurityHeaders(NextResponse.json({ error: "User not found" }, { status: 404 }));
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  const parsed = PatchUserSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }

  const col: Record<string, unknown> = {};
  if (parsed.data.fullName     !== undefined) col.full_name     = parsed.data.fullName;
  if (parsed.data.mobile       !== undefined) col.mobile        = parsed.data.mobile;
  if (parsed.data.warehouseId  !== undefined) col.warehouse_id  = parsed.data.warehouseId || null;
  if (parsed.data.warehouseIds !== undefined) col.warehouse_ids = parsed.data.warehouseIds;
  if (parsed.data.role         !== undefined) col.role          = parsed.data.role;
  if (parsed.data.isActive     !== undefined) col.is_active     = parsed.data.isActive;

  if (Object.keys(col).length > 0) {
    await db`UPDATE users SET ${db(col)}, updated_at = now() WHERE id = ${id}`;
  }

  await writeAuditEvent({
    orgId: (user.org_id as string) ?? actor.org,
    actorId: actor.sub, actorRole: actor.role,
    action: "user.updated", resourceType: "user", resourceId: id, payload: col,
  });

  return applySecurityHeaders(NextResponse.json({ ok: true }));
}
