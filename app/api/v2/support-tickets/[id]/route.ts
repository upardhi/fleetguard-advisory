import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { requireUser } from "@/app/_server/auth/getUser";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";

const PatchTicketSchema = z.object({
  status:     z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
  assignedTo: z.string().optional(),
  resolution: z.string().max(5000).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { id } = await params;

  const [ticket] = await db`
    SELECT id FROM support_tickets
    WHERE  id = ${id} AND (org_id = ${actor.org} OR ${actor.role} = 'superadmin')
    LIMIT  1
  `;
  if (!ticket) {
    return applySecurityHeaders(NextResponse.json({ error: "Ticket not found" }, { status: 404 }));
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  const parsed = PatchTicketSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }

  const col: Record<string, unknown> = {};
  if (parsed.data.status     !== undefined) col.status      = parsed.data.status;
  if (parsed.data.assignedTo !== undefined) col.assigned_to = parsed.data.assignedTo;
  if (parsed.data.resolution !== undefined) col.resolution  = parsed.data.resolution;
  if (parsed.data.status === "resolved")   col.resolved_at  = new Date();
  if (parsed.data.status === "closed")     col.closed_at    = new Date();

  if (Object.keys(col).length > 0) {
    await db`UPDATE support_tickets SET ${db(col)}, updated_at = now() WHERE id = ${id}`;
  }

  await writeAuditEvent({
    orgId: actor.org, actorId: actor.sub, actorRole: actor.role,
    action: "support_ticket.updated", resourceType: "support_ticket", resourceId: id, payload: col,
  });

  return applySecurityHeaders(NextResponse.json({ ok: true }));
}
