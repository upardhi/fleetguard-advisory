import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { requireUser } from "@/app/_server/auth/getUser";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";

const PatchDealerSchema = z.object({
  name:        z.string().min(1).max(200).optional(),
  code:        z.string().max(50).nullable().optional(),
  contactName: z.string().max(200).nullable().optional(),
  mobile:      z.string().max(20).nullable().optional(),
  contactPhone:z.string().max(20).nullable().optional(),
  city:        z.string().max(100).nullable().optional(),
  state:       z.string().max(100).nullable().optional(),
  address:     z.string().max(500).nullable().optional(),
  pinCode:     z.string().max(10).nullable().optional(),
  isActive:    z.boolean().optional(),
});

// GET /api/v2/dealers/:id
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { id } = await params;

  const [dealer] = actor.role === "superadmin"
    ? await db`
        SELECT id, org_id, name, code, contact_name, mobile, city, state, address, pin_code,
               is_active, created_at, updated_at
        FROM   dealers
        WHERE  id = ${id}
        LIMIT  1
      `
    : await db`
        SELECT id, org_id, name, code, contact_name, mobile, city, state, address, pin_code,
               is_active, created_at, updated_at
        FROM   dealers
        WHERE  id = ${id} AND org_id = ${actor.org}
        LIMIT  1
      `;

  if (!dealer) {
    return applySecurityHeaders(NextResponse.json({ error: "Dealer not found" }, { status: 404 }));
  }

  return applySecurityHeaders(NextResponse.json({ dealer }));
}

// PATCH /api/v2/dealers/:id
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { id } = await params;

  const [dealer] = actor.role === "superadmin"
    ? await db`SELECT id, org_id FROM dealers WHERE id = ${id} LIMIT 1`
    : await db`SELECT id, org_id FROM dealers WHERE id = ${id} AND org_id = ${actor.org} LIMIT 1`;
  if (!dealer) {
    return applySecurityHeaders(NextResponse.json({ error: "Dealer not found" }, { status: 404 }));
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  const parsed = PatchDealerSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }

  const d = parsed.data;
  const col: Record<string, unknown> = {};
  if (d.name         !== undefined) col.name         = d.name;
  if (d.code         !== undefined) col.code         = d.code;
  if (d.contactName  !== undefined) col.contact_name = d.contactName;
  if (d.mobile       !== undefined) col.mobile       = d.mobile;
  if (d.contactPhone !== undefined) col.mobile       = d.contactPhone;
  if (d.city         !== undefined) col.city         = d.city;
  if (d.state        !== undefined) col.state        = d.state;
  if (d.address      !== undefined) col.address      = d.address;
  if (d.pinCode      !== undefined) col.pin_code     = d.pinCode;
  if (d.isActive     !== undefined) col.is_active    = d.isActive;

  if (Object.keys(col).length > 0) {
    await db`UPDATE dealers SET ${db(col)}, updated_at = now() WHERE id = ${id}`;
  }

  await writeAuditEvent({
    orgId: (dealer.org_id as string) ?? actor.org,
    actorId: actor.sub, actorRole: actor.role,
    action: "dealer.updated", resourceType: "dealer", resourceId: id, payload: col,
  });

  return applySecurityHeaders(NextResponse.json({ ok: true }));
}
