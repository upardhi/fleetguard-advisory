import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { uuidv7 } from "@/app/_server/db/uuidv7";
import { requireUser } from "@/app/_server/auth/getUser";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";

const CreateInboundSchema = z.object({
  warehouseId:   z.string(),
  vehicleReg:    z.string().min(1).max(30),
  driverName:    z.string().min(1).max(200),
  driverId:      z.string().optional(),
  vehicleId:     z.string().optional(),
  purpose:       z.string().min(1).max(200),
  supplierName:  z.string().max(200).optional(),
  invoiceNumber: z.string().max(100).optional(),
  notes:         z.string().max(500).optional(),
});

// GET /api/v2/inbound-entries?warehouseId=&status=inside|exited&limit=
export async function GET(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { searchParams } = new URL(req.url);
  const warehouseId = searchParams.get("warehouseId");
  const status      = searchParams.get("status");
  const limit       = Math.min(Number(searchParams.get("limit") ?? 100), 2000);
  const offset      = Number(searchParams.get("offset") ?? 0);

  const entries = (warehouseId && status)
    ? await db`
        SELECT id, vehicle_reg, driver_name, driver_id, vehicle_id, purpose,
               supplier_name, invoice_number, entry_time, exit_time, status, notes, created_at
        FROM   inbound_entries
        WHERE  org_id = ${actor.org} AND warehouse_id = ${warehouseId} AND status = ${status}
        ORDER  BY entry_time DESC LIMIT ${limit} OFFSET ${offset}
      `
    : warehouseId
    ? await db`
        SELECT id, vehicle_reg, driver_name, driver_id, vehicle_id, purpose,
               supplier_name, invoice_number, entry_time, exit_time, status, notes, created_at
        FROM   inbound_entries
        WHERE  org_id = ${actor.org} AND warehouse_id = ${warehouseId}
        ORDER  BY entry_time DESC LIMIT ${limit} OFFSET ${offset}
      `
    : await db`
        SELECT id, vehicle_reg, driver_name, driver_id, vehicle_id, purpose,
               supplier_name, invoice_number, entry_time, exit_time, status, notes, created_at
        FROM   inbound_entries
        WHERE  org_id = ${actor.org}
        ORDER  BY entry_time DESC LIMIT ${limit} OFFSET ${offset}
      `;

  return applySecurityHeaders(NextResponse.json({ entries, limit, offset }));
}

// POST /api/v2/inbound-entries
export async function POST(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  const parsed = CreateInboundSchema.safeParse(body);
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
    INSERT INTO inbound_entries (
      id, org_id, warehouse_id, vehicle_reg, driver_name, driver_id,
      vehicle_id, purpose, supplier_name, invoice_number, guard_id, notes
    ) VALUES (
      ${id}, ${actor.org}, ${parsed.data.warehouseId}, ${parsed.data.vehicleReg},
      ${parsed.data.driverName}, ${parsed.data.driverId ?? null},
      ${parsed.data.vehicleId ?? null}, ${parsed.data.purpose},
      ${parsed.data.supplierName ?? null}, ${parsed.data.invoiceNumber ?? null},
      ${actor.sub}, ${parsed.data.notes ?? null}
    )
  `;

  await writeAuditEvent({
    orgId: actor.org, actorId: actor.sub, actorRole: actor.role,
    action: "inbound_entry.created", resourceType: "inbound_entry", resourceId: id,
    warehouseId: parsed.data.warehouseId,
    payload: { vehicleReg: parsed.data.vehicleReg },
  });

  return applySecurityHeaders(NextResponse.json({ id }, { status: 201 }));
}
