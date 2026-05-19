import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/_server/db/client";
import { requireUser } from "@/app/_server/auth/getUser";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";

// PATCH /api/v2/visitors/:id — check out a visitor
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { id } = await params;

  const [v] = await db`SELECT id, warehouse_id FROM visitor_entries WHERE id = ${id} AND org_id = ${actor.org} LIMIT 1`;
  if (!v) {
    return applySecurityHeaders(NextResponse.json({ error: "Visitor entry not found" }, { status: 404 }));
  }

  await db`
    UPDATE visitor_entries SET status = 'exited', exit_time = now() WHERE id = ${id}
  `;

  await writeAuditEvent({
    orgId: actor.org, actorId: actor.sub, actorRole: actor.role,
    action: "visitor.checked_out", resourceType: "visitor_entry", resourceId: id,
    warehouseId: v.warehouse_id as string,
    payload: {},
  });

  return applySecurityHeaders(NextResponse.json({ ok: true }));
}
