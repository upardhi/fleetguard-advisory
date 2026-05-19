import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { requireUser } from "@/app/_server/auth/getUser";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";

const PatchOrgSchema = z.object({
  name:         z.string().min(1).max(200).optional(),
  plan:         z.string().max(50).optional(),
  isActive:     z.boolean().optional(),
  shortCode:    z.string().max(16).nullable().optional(),
  contactName:  z.string().max(200).nullable().optional(),
  contactEmail: z.string().max(200).nullable().optional(),
  contactPhone: z.string().max(50).nullable().optional(),
  address:      z.string().max(500).nullable().optional(),
  city:         z.string().max(100).nullable().optional(),
  state:        z.string().max(100).nullable().optional(),
});

// GET /api/v2/orgs/:id
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { id } = await params;

  // Non-superadmin can only see their own org
  if (actor.role !== "superadmin" && actor.org !== id) {
    return applySecurityHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }

  const [org] = await db`
    SELECT o.id, o.name, o.plan, o.is_active, o.created_at, o.updated_at,
           o.short_code, o.contact_name, o.contact_email, o.contact_phone,
           o.address, o.city, o.state,
           COUNT(DISTINCT u.id) FILTER (WHERE u.is_active) AS user_count,
           COUNT(DISTINCT w.id) FILTER (WHERE w.is_active) AS warehouse_count
    FROM   orgs o
    LEFT   JOIN users u     ON u.org_id = o.id
    LEFT   JOIN warehouses w ON w.org_id = o.id
    WHERE  o.id = ${id}
    GROUP  BY o.id
    LIMIT  1
  `;

  if (!org) {
    return applySecurityHeaders(NextResponse.json({ error: "Org not found" }, { status: 404 }));
  }

  return applySecurityHeaders(NextResponse.json({ org }));
}

// PATCH /api/v2/orgs/:id
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
  if (actor.role !== "superadmin" && actor.org !== id) {
    return applySecurityHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  const parsed = PatchOrgSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }

  const updates: Record<string, unknown> = {};
  const d = parsed.data;
  if (d.name         !== undefined) updates.name          = d.name;
  if (d.plan         !== undefined) updates.plan          = d.plan;
  if (d.isActive     !== undefined) updates.is_active     = d.isActive;
  if (d.shortCode    !== undefined) updates.short_code    = d.shortCode;
  if (d.contactName  !== undefined) updates.contact_name  = d.contactName;
  if (d.contactEmail !== undefined) updates.contact_email = d.contactEmail;
  if (d.contactPhone !== undefined) updates.contact_phone = d.contactPhone;
  if (d.address      !== undefined) updates.address       = d.address;
  if (d.city         !== undefined) updates.city          = d.city;
  if (d.state        !== undefined) updates.state         = d.state;

  if (Object.keys(updates).length > 0) {
    await db`UPDATE orgs SET ${db(updates)}, updated_at = now() WHERE id = ${id}`;
  }

  await writeAuditEvent({
    orgId: actor.org, actorId: actor.sub, actorRole: actor.role,
    action: "org.updated", resourceType: "org", resourceId: id,
    payload: updates,
  });

  return applySecurityHeaders(NextResponse.json({ ok: true }));
}
