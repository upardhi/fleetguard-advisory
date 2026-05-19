import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { requireUser } from "@/app/_server/auth/getUser";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";

const PatchWarehouseSchema = z.object({
  name:     z.string().min(1).max(200).optional(),
  // Empty string normalised to null so the CSO can clear an existing code.
  code:     z.string().trim().max(12).optional().transform((v) => (v === undefined ? undefined : v === "" ? null : v)),
  city:     z.string().min(1).max(100).optional(),
  state:    z.string().min(1).max(100).optional(),
  region:   z.string().min(1).max(100).optional(),
  address:  z.string().max(500).optional(),
  lat:      z.number().min(-90).max(90).nullable().optional(),
  lng:      z.number().min(-180).max(180).nullable().optional(),
  isActive: z.boolean().optional(),
});

// GET /api/v2/warehouses/:id
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { id } = await params;

  const isSuperadmin = actor.role === "superadmin";
  const [wh] = isSuperadmin
    ? await db`
        SELECT w.id, w.org_id, w.name, w.code, w.city, w.state, w.region, w.address, w.lat, w.lng, w.is_active, w.created_at,
               COUNT(DISTINCT ge.id) FILTER (WHERE ge.occurred_at > now() - INTERVAL '24 hours') AS events_24h,
               COUNT(DISTINCT a.id)  FILTER (WHERE a.status = 'open')                           AS open_alerts
        FROM   warehouses w
        LEFT   JOIN gate_events ge ON ge.warehouse_id = w.id
        LEFT   JOIN alerts a       ON a.warehouse_id  = w.id
        WHERE  w.id = ${id}
        GROUP  BY w.id
        LIMIT  1
      `
    : await db`
        SELECT w.id, w.org_id, w.name, w.code, w.city, w.state, w.region, w.address, w.lat, w.lng, w.is_active, w.created_at,
               COUNT(DISTINCT ge.id) FILTER (WHERE ge.occurred_at > now() - INTERVAL '24 hours') AS events_24h,
               COUNT(DISTINCT a.id)  FILTER (WHERE a.status = 'open')                           AS open_alerts
        FROM   warehouses w
        LEFT   JOIN gate_events ge ON ge.warehouse_id = w.id
        LEFT   JOIN alerts a       ON a.warehouse_id  = w.id
        WHERE  w.id = ${id} AND w.org_id = ${actor.org}
        GROUP  BY w.id
        LIMIT  1
      `;

  if (!wh) {
    return applySecurityHeaders(NextResponse.json({ error: "Warehouse not found" }, { status: 404 }));
  }

  return applySecurityHeaders(NextResponse.json({ warehouse: wh }));
}

// PATCH /api/v2/warehouses/:id
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

  const [wh] = actor.role === "superadmin"
    ? await db`SELECT id, org_id FROM warehouses WHERE id = ${id} LIMIT 1`
    : await db`SELECT id, org_id FROM warehouses WHERE id = ${id} AND org_id = ${actor.org} LIMIT 1`;
  if (!wh) {
    return applySecurityHeaders(NextResponse.json({ error: "Warehouse not found" }, { status: 404 }));
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  const parsed = PatchWarehouseSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }

  const col: Record<string, unknown> = {};
  if (parsed.data.name     !== undefined) col.name      = parsed.data.name;
  if (parsed.data.code     !== undefined) col.code      = parsed.data.code;
  if (parsed.data.city     !== undefined) col.city      = parsed.data.city;
  if (parsed.data.state    !== undefined) col.state     = parsed.data.state;
  if (parsed.data.region   !== undefined) col.region    = parsed.data.region;
  if (parsed.data.address  !== undefined) col.address   = parsed.data.address;
  if (parsed.data.lat      !== undefined) col.lat       = parsed.data.lat;
  if (parsed.data.lng      !== undefined) col.lng       = parsed.data.lng;
  if (parsed.data.isActive !== undefined) col.is_active = parsed.data.isActive;

  if (Object.keys(col).length > 0) {
    await db`UPDATE warehouses SET ${db(col)}, updated_at = now() WHERE id = ${id}`;
  }

  await writeAuditEvent({
    orgId: (wh.org_id as string) ?? actor.org,
    actorId: actor.sub, actorRole: actor.role,
    action: "warehouse.updated", resourceType: "warehouse", resourceId: id, payload: col,
  });

  return applySecurityHeaders(NextResponse.json({ ok: true }));
}
