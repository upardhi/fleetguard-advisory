import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/_server/db/client";
import { requireUser } from "@/app/_server/auth/getUser";
import { applySecurityHeaders } from "@/app/_server/security/headers";

// GET /api/v2/gate-sessions?warehouseId=&status=inside|exited&limit=
export async function GET(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { searchParams } = new URL(req.url);
  const warehouseId = searchParams.get("warehouseId");
  const status      = searchParams.get("status") ?? "inside";
  const limit       = Math.min(Number(searchParams.get("limit") ?? 200), 2000);
  const offset      = Number(searchParams.get("offset") ?? 0);

  const sessions = warehouseId
    ? await db`
        SELECT gs.id, gs.session_type, gs.entity_id, gs.status, gs.entered_at, gs.exited_at,
               ge.vehicle_reg, ge.person_name, ge.contractor_name, ge.guard_name,
               ge.photo_url, ge.event_type
        FROM   gate_sessions gs
        JOIN   gate_events ge ON ge.id = gs.entry_event_id
        WHERE  gs.org_id = ${actor.org} AND gs.warehouse_id = ${warehouseId} AND gs.status = ${status}
        ORDER  BY gs.entered_at DESC
        LIMIT  ${limit} OFFSET ${offset}
      `
    : await db`
        SELECT gs.id, gs.session_type, gs.entity_id, gs.status, gs.entered_at, gs.exited_at,
               ge.vehicle_reg, ge.person_name, ge.contractor_name, ge.guard_name,
               ge.photo_url, ge.event_type
        FROM   gate_sessions gs
        JOIN   gate_events ge ON ge.id = gs.entry_event_id
        WHERE  gs.org_id = ${actor.org} AND gs.status = ${status}
        ORDER  BY gs.entered_at DESC
        LIMIT  ${limit} OFFSET ${offset}
      `;

  return applySecurityHeaders(NextResponse.json({ sessions, limit, offset }));
}
