import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { uuidv7 } from "@/app/_server/db/uuidv7";
import { requireUser } from "@/app/_server/auth/getUser";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";

const CreateGateSchema = z.object({
  warehouseId: z.string(),
  name:        z.string().min(1).max(100),
  gateType:    z.enum(["vehicle", "pedestrian", "mixed"]).default("vehicle"),
});

// GET /api/v2/gates?warehouseId=&orgId=
export async function GET(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { searchParams } = new URL(req.url);
  const warehouseId = searchParams.get("warehouseId");

  const gates = warehouseId
    ? await db`
        SELECT id, warehouse_id, name, gate_type, is_active, created_at
        FROM   gates
        WHERE  org_id = ${actor.org} AND warehouse_id = ${warehouseId}
        ORDER  BY name
      `
    : await db`
        SELECT id, warehouse_id, name, gate_type, is_active, created_at
        FROM   gates
        WHERE  org_id = ${actor.org}
        ORDER  BY name
      `;

  return applySecurityHeaders(NextResponse.json({ gates }));
}

// POST /api/v2/gates
export async function POST(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  if (!["superadmin", "company_admin", "wh_manager"].includes(actor.role)) {
    return applySecurityHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  const parsed = CreateGateSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }

  const [wh] = await db`SELECT id FROM warehouses WHERE id = ${parsed.data.warehouseId} AND org_id = ${actor.org} LIMIT 1`;
  if (!wh) {
    return applySecurityHeaders(NextResponse.json({ error: "Warehouse not found" }, { status: 404 }));
  }

  const id = uuidv7();
  await db`
    INSERT INTO gates (id, org_id, warehouse_id, name, gate_type)
    VALUES (${id}, ${actor.org}, ${parsed.data.warehouseId}, ${parsed.data.name}, ${parsed.data.gateType})
  `;

  await writeAuditEvent({
    orgId: actor.org, actorId: actor.sub, actorRole: actor.role,
    action: "gate.created", resourceType: "gate", resourceId: id,
    warehouseId: parsed.data.warehouseId,
    payload: { name: parsed.data.name },
  });

  return applySecurityHeaders(NextResponse.json({ id }, { status: 201 }));
}
