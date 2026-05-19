import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { requireUser } from "@/app/_server/auth/getUser";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";

const PatchGateSchema = z.object({
  name:     z.string().min(1).max(100).optional(),
  gateType: z.enum(["vehicle", "pedestrian", "mixed"]).optional(),
  isActive: z.boolean().optional(),
});

// PATCH /api/v2/gates/:id
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  if (!["superadmin", "company_admin", "wh_manager"].includes(actor.role)) {
    return applySecurityHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }

  const { id } = await params;

  const [gate] = await db`SELECT id FROM gates WHERE id = ${id} AND org_id = ${actor.org} LIMIT 1`;
  if (!gate) {
    return applySecurityHeaders(NextResponse.json({ error: "Gate not found" }, { status: 404 }));
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  const parsed = PatchGateSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.name     !== undefined) updates.name      = parsed.data.name;
  if (parsed.data.gateType !== undefined) updates.gate_type = parsed.data.gateType;
  if (parsed.data.isActive !== undefined) updates.is_active = parsed.data.isActive;

  if (Object.keys(updates).length > 0) {
    await db`UPDATE gates SET ${db(updates)} WHERE id = ${id}`;
  }

  await writeAuditEvent({
    orgId: actor.org, actorId: actor.sub, actorRole: actor.role,
    action: "gate.updated", resourceType: "gate", resourceId: id, payload: updates,
  });

  return applySecurityHeaders(NextResponse.json({ ok: true }));
}
