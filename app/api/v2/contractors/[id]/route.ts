import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { requireUser } from "@/app/_server/auth/getUser";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";

const PatchContractorSchema = z.object({
  name:          z.string().min(1).max(200).optional(),
  code:          z.string().max(50).nullable().optional(),
  type:          z.string().max(50).nullable().optional(),
  contactName:   z.string().min(1).max(200).optional(),
  contactMobile: z.string().min(10).max(20).nullable().optional(),
  contactPhone:  z.string().min(10).max(20).nullable().optional(),
  contactEmail:  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().email().max(200).nullable().optional(),
  ),
  address:       z.string().max(500).nullable().optional(),
  city:          z.string().max(100).nullable().optional(),
  state:         z.string().max(100).nullable().optional(),
  warehouseId:   z.string().nullable().optional(),
  isActive:      z.boolean().optional(),
  status:        z.enum(["pending", "approved", "rejected"]).optional(),
  rejectReason:  z.string().max(500).nullable().optional(),
});

// GET /api/v2/contractors/:id
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { id } = await params;

  const [contractor] = actor.role === "superadmin"
    ? await db`
        SELECT id, org_id, name, code, type,
               contact_name, contact_mobile, contact_email,
               address, city, state, warehouse_id,
               is_active, status, created_by_uid,
               reviewed_at, reviewed_by, reject_reason,
               created_at, updated_at
        FROM   contractors
        WHERE  id = ${id}
        LIMIT  1
      `
    : await db`
        SELECT id, org_id, name, code, type,
               contact_name, contact_mobile, contact_email,
               address, city, state, warehouse_id,
               is_active, status, created_by_uid,
               reviewed_at, reviewed_by, reject_reason,
               created_at, updated_at
        FROM   contractors
        WHERE  id = ${id} AND org_id = ${actor.org}
        LIMIT  1
      `;

  if (!contractor) {
    return applySecurityHeaders(NextResponse.json({ error: "Contractor not found" }, { status: 404 }));
  }

  return applySecurityHeaders(NextResponse.json({ contractor }));
}

// PATCH /api/v2/contractors/:id
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  if (!["superadmin", "company_admin", "wh_manager", "regional_manager", "cso"].includes(actor.role)) {
    return applySecurityHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }

  const { id } = await params;

  const [existing] = actor.role === "superadmin"
    ? await db`SELECT id, org_id FROM contractors WHERE id = ${id} LIMIT 1`
    : await db`SELECT id, org_id FROM contractors WHERE id = ${id} AND org_id = ${actor.org} LIMIT 1`;
  if (!existing) {
    return applySecurityHeaders(NextResponse.json({ error: "Contractor not found" }, { status: 404 }));
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  const parsed = PatchContractorSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }

  const d = parsed.data;
  const col: Record<string, unknown> = {};
  if (d.name         !== undefined) col.name           = d.name;
  if (d.code         !== undefined) col.code           = d.code;
  if (d.type         !== undefined) col.type           = d.type;
  if (d.contactName  !== undefined) col.contact_name   = d.contactName;
  if (d.contactMobile!== undefined) col.contact_mobile = d.contactMobile;
  if (d.contactPhone !== undefined) col.contact_mobile = d.contactPhone;
  if (d.contactEmail !== undefined) col.contact_email  = d.contactEmail;
  if (d.address      !== undefined) col.address        = d.address;
  if (d.city         !== undefined) col.city           = d.city;
  if (d.state        !== undefined) col.state          = d.state;
  if (d.warehouseId  !== undefined) col.warehouse_id   = d.warehouseId;
  if (d.isActive     !== undefined) col.is_active      = d.isActive;
  if (d.status       !== undefined) {
    col.status      = d.status;
    col.reviewed_at = new Date();
    col.reviewed_by = actor.sub;
  }
  if (d.rejectReason !== undefined) col.reject_reason  = d.rejectReason;

  if (Object.keys(col).length > 0) {
    await db`UPDATE contractors SET ${db(col)}, updated_at = now() WHERE id = ${id}`;
  }

  await writeAuditEvent({
    orgId: (existing.org_id as string) ?? actor.org,
    actorId: actor.sub, actorRole: actor.role,
    action: "contractor.updated", resourceType: "contractor", resourceId: id, payload: col,
  });

  return applySecurityHeaders(NextResponse.json({ ok: true }));
}

// DELETE /api/v2/contractors/:id
// Blocked if any driver or vehicle is still allocated to this contractor.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  if (!["superadmin", "company_admin", "wh_manager", "regional_manager", "cso"].includes(actor.role)) {
    return applySecurityHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }

  const { id } = await params;

  const [existing] = await db<{ id: string; org_id: string; name: string }[]>`
    SELECT id, org_id, name FROM contractors WHERE id = ${id} LIMIT 1
  `;
  if (!existing) {
    return applySecurityHeaders(NextResponse.json({ error: "Contractor not found" }, { status: 404 }));
  }

  if (actor.role !== "superadmin" && existing.org_id !== actor.org) {
    return applySecurityHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }

  const driverRows  = await db<{ id: string; full_name: string; dl_number: string }[]>`
    SELECT id, full_name, dl_number FROM drivers WHERE contractor_id = ${id} ORDER BY full_name LIMIT 20
  `;
  const vehicleRows = await db<{ id: string; registration_number: string; vehicle_type: string }[]>`
    SELECT id, registration_number, vehicle_type FROM vehicles WHERE contractor_id = ${id} ORDER BY registration_number LIMIT 20
  `;

  if (driverRows.length > 0 || vehicleRows.length > 0) {
    return applySecurityHeaders(
      NextResponse.json(
        {
          error: "Cannot delete: contractor has allocated resources.",
          drivers:  driverRows.map(d => ({ id: d.id, name: d.full_name, dl: d.dl_number })),
          vehicles: vehicleRows.map(v => ({ id: v.id, reg: v.registration_number, type: v.vehicle_type })),
        },
        { status: 409 },
      ),
    );
  }

  await db`UPDATE contractors SET is_active = false, updated_at = now() WHERE id = ${id}`;

  await writeAuditEvent({
    orgId: existing.org_id,
    actorId: actor.sub, actorRole: actor.role,
    action: "contractor.deleted", resourceType: "contractor", resourceId: id,
    payload: { name: existing.name },
  });

  return applySecurityHeaders(NextResponse.json({ ok: true }));
}
