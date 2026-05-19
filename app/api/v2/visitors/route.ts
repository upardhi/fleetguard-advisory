import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { uuidv7 } from "@/app/_server/db/uuidv7";
import { requireUser } from "@/app/_server/auth/getUser";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";

const CreateVisitorSchema = z.object({
  warehouseId:   z.string(),
  visitorType:   z.preprocess(
    (v) => (typeof v === "string" ? v.toLowerCase().trim() : v),
    z.enum(["visitor", "contractor", "auditor", "maintenance", "other"]).default("visitor"),
  ),
  fullName:      z.string().min(1).max(200),
  hostName:      z.string().min(1).max(200),
  purpose:       z.string().min(1).max(500),
  passNumber:    z.string().min(1).max(50),
  vehicleNumber: z.string().max(30).optional(),
  expectedExit:  z.string().optional(),
  photoUrl:      z.string().url().optional(),
  idType:        z.string().max(50).optional(),
  idNumber:      z.string().max(50).optional(),
  department:    z.string().max(100).optional(),
});

// GET /api/v2/visitors?warehouseId=&status=inside|exited&limit=&offset=
export async function GET(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { searchParams } = new URL(req.url);
  const warehouseId = searchParams.get("warehouseId");
  const status      = searchParams.get("status");
  const limit       = Math.min(Number(searchParams.get("limit")  ?? 100), 2000);
  const offset      = Number(searchParams.get("offset") ?? 0);

  const visitors = (warehouseId && status)
    ? await db`
        SELECT id, visitor_type, full_name, host_name, purpose, pass_number,
               vehicle_number, entry_time, expected_exit, exit_time, status, photo_url, created_at,
               id_type, id_number, department
        FROM   visitor_entries
        WHERE  org_id = ${actor.org} AND warehouse_id = ${warehouseId} AND status = ${status}
        ORDER  BY entry_time DESC LIMIT ${limit} OFFSET ${offset}
      `
    : warehouseId
    ? await db`
        SELECT id, visitor_type, full_name, host_name, purpose, pass_number,
               vehicle_number, entry_time, expected_exit, exit_time, status, photo_url, created_at,
               id_type, id_number, department
        FROM   visitor_entries
        WHERE  org_id = ${actor.org} AND warehouse_id = ${warehouseId}
        ORDER  BY entry_time DESC LIMIT ${limit} OFFSET ${offset}
      `
    : await db`
        SELECT id, visitor_type, full_name, host_name, purpose, pass_number,
               vehicle_number, entry_time, expected_exit, exit_time, status, photo_url, created_at,
               id_type, id_number, department
        FROM   visitor_entries
        WHERE  org_id = ${actor.org}
        ORDER  BY entry_time DESC LIMIT ${limit} OFFSET ${offset}
      `;

  return applySecurityHeaders(NextResponse.json({ visitors, limit, offset }));
}

// POST /api/v2/visitors
export async function POST(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  const parsed = CreateVisitorSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }

  const [wh] = await db`SELECT id FROM warehouses WHERE id = ${parsed.data.warehouseId} AND org_id = ${actor.org} LIMIT 1`;
  if (!wh) {
    return applySecurityHeaders(NextResponse.json({ error: "Warehouse not found" }, { status: 404 }));
  }

  const d = parsed.data;

  const id = uuidv7();
  await db`
    INSERT INTO visitor_entries (
      id, org_id, warehouse_id, visitor_type, full_name, host_name,
      purpose, pass_number, vehicle_number, expected_exit, guard_id, photo_url,
      id_type, id_number, department
    ) VALUES (
      ${id}, ${actor.org}, ${d.warehouseId}, ${d.visitorType},
      ${d.fullName}, ${d.hostName}, ${d.purpose},
      ${d.passNumber}, ${d.vehicleNumber ?? null},
      ${d.expectedExit ?? null}, ${actor.sub}, ${d.photoUrl ?? null},
      ${d.idType ?? null}, ${d.idNumber ?? null}, ${d.department ?? null}
    )
  `;

  await writeAuditEvent({
    orgId: actor.org, actorId: actor.sub, actorRole: actor.role,
    action: "visitor.created", resourceType: "visitor_entry", resourceId: id,
    warehouseId: d.warehouseId,
    payload: { fullName: d.fullName, visitorType: d.visitorType },
  });

  return applySecurityHeaders(NextResponse.json({ id }, { status: 201 }));
}
