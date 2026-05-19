import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { uuidv7 } from "@/app/_server/db/uuidv7";
import { requireUser } from "@/app/_server/auth/getUser";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";

const CreateWarehouseSchema = z.object({
  name: z.string().min(1).max(200),
  // Short, human code typed by the company admin (e.g. "BHW-01"). Length
  // matches the form's maxLength=12 and the unique-per-org index added in
  // migration 0014. Empty string normalised to undefined so we don't store
  // blank-but-non-null codes that would conflict with the partial index.
  code: z.string().trim().max(12).optional().transform((v) => (v ? v : undefined)),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  region: z.string().min(1).max(100).optional(),
  address: z.string().max(500).optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  orgId: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  // Superadmin may view any org's warehouses via ?orgId=…; everyone else is pinned to their own.
  const url = new URL(req.url);
  const requestedOrgId = url.searchParams.get("orgId");
  const targetOrgId = actor.role === "superadmin" && requestedOrgId ? requestedOrgId : actor.org;

  const warehouses = await db`
    SELECT w.id, w.org_id, w.name, w.code, w.city, w.state, w.region, w.address, w.lat, w.lng, w.is_active, w.created_at,
           COUNT(DISTINCT ge.id) FILTER (WHERE ge.occurred_at > now() - INTERVAL '24 hours') AS events_24h,
           COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'open') AS open_alerts
    FROM   warehouses w
    LEFT   JOIN gate_events ge ON ge.warehouse_id = w.id
    LEFT   JOIN alerts a ON a.warehouse_id = w.id
    WHERE  w.org_id = ${targetOrgId} AND w.is_active = true
    GROUP  BY w.id
    ORDER  BY w.name
  `;

  return applySecurityHeaders(NextResponse.json({ warehouses }));
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  if (!["superadmin", "company_admin"].includes(actor.role)) {
    return applySecurityHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  const parsed = CreateWarehouseSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }

  const data = parsed.data;
  const id = uuidv7();

  // Superadmin may target any org via body.orgId; everyone else is pinned to their own.
  const targetOrgId = actor.role === "superadmin" && data.orgId ? data.orgId : actor.org;

  await db`
    INSERT INTO warehouses (id, org_id, name, code, city, state, region, address, lat, lng, is_active)
    VALUES (${id}, ${targetOrgId}, ${data.name}, ${data.code ?? null}, ${data.city}, ${data.state},
            ${data.region ?? ""}, ${data.address ?? null}, ${data.lat ?? null}, ${data.lng ?? null},
            ${data.isActive ?? true})
  `;

  await writeAuditEvent({
    orgId: targetOrgId,
    actorId: actor.sub,
    actorRole: actor.role,
    action: "warehouse.created",
    resourceType: "warehouse",
    resourceId: id,
    payload: { name: data.name, code: data.code ?? null, city: data.city, state: data.state },
  });

  return applySecurityHeaders(NextResponse.json({ id }, { status: 201 }));
}
