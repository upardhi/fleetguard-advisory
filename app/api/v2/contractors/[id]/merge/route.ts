import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { requireUser } from "@/app/_server/auth/getUser";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";

const MergeSchema = z.object({
  targetId: z.string().min(1),
});

// POST /api/v2/contractors/:id/merge
// Moves all drivers and vehicles from contractor :id → targetId, then soft-deletes :id.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  if (!["superadmin", "company_admin", "wh_manager", "regional_manager", "cso"].includes(actor.role)) {
    return applySecurityHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }

  const { id: sourceId } = await params;

  const [source] = actor.role === "superadmin"
    ? await db<{ id: string; org_id: string; name: string }[]>`
        SELECT id, org_id, name FROM contractors WHERE id = ${sourceId} LIMIT 1`
    : await db<{ id: string; org_id: string; name: string }[]>`
        SELECT id, org_id, name FROM contractors WHERE id = ${sourceId} AND org_id = ${actor.org} LIMIT 1`;
  if (!source) {
    return applySecurityHeaders(NextResponse.json({ error: "Source contractor not found" }, { status: 404 }));
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  const parsed = MergeSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }

  const { targetId } = parsed.data;

  if (targetId === sourceId) {
    return applySecurityHeaders(NextResponse.json({ error: "Source and target must be different" }, { status: 400 }));
  }

  const [target] = actor.role === "superadmin"
    ? await db<{ id: string; org_id: string; name: string }[]>`
        SELECT id, org_id, name FROM contractors WHERE id = ${targetId} LIMIT 1`
    : await db<{ id: string; org_id: string; name: string }[]>`
        SELECT id, org_id, name FROM contractors WHERE id = ${targetId} AND org_id = ${actor.org} LIMIT 1`;
  if (!target) {
    return applySecurityHeaders(NextResponse.json({ error: "Target contractor not found" }, { status: 404 }));
  }

  const [{ count: driverCount }] = await db<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM drivers WHERE contractor_id = ${sourceId}
  `;
  const [{ count: vehicleCount }] = await db<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM vehicles WHERE contractor_id = ${sourceId}
  `;

  await db`UPDATE drivers  SET contractor_id = ${targetId}, updated_at = now() WHERE contractor_id = ${sourceId}`;
  await db`UPDATE vehicles SET contractor_id = ${targetId}, updated_at = now() WHERE contractor_id = ${sourceId}`;
  // gate_events has no contractor_id column — the contractor link lives in
  // metadata.contractorIds. Older mobile builds stored it as a JSONB string
  // ("[\"id\"]"); newer builds store a proper JSONB array (["id"]).
  // First normalise any string-encoded values to real arrays, then repoint.
  await db`
    UPDATE gate_events
    SET    metadata = metadata || jsonb_build_object(
             'contractorIds', (metadata->>'contractorIds')::jsonb
           )
    WHERE  jsonb_typeof(metadata->'contractorIds') = 'string'
      AND  (metadata->>'contractorIds') LIKE ${'%' + sourceId + '%'}
  `;
  // Now repoint: swap sourceId → targetId inside the array.
  // Use @> containment instead of the ? operator (postgres.js mangles ? in templates).
  const affected = await db<{ id: string; metadata: Record<string, unknown> }[]>`
    SELECT id, metadata FROM gate_events
    WHERE  metadata @> jsonb_build_object('contractorIds', jsonb_build_array(${sourceId}::text))
  `;
  for (const row of affected) {
    const ids: string[] = Array.isArray(row.metadata?.contractorIds)
      ? (row.metadata.contractorIds as string[])
      : [];
    const newIds = [targetId, ...ids.filter((v) => v !== sourceId)];
    await db`
      UPDATE gate_events
      SET    metadata = metadata || jsonb_build_object('contractorIds', ${JSON.stringify(newIds)}::jsonb)
      WHERE  id = ${row.id}
    `;
  }
  await db`UPDATE contractors SET is_active = false, updated_at = now() WHERE id = ${sourceId}`;

  await writeAuditEvent({
    orgId: source.org_id,
    actorId: actor.sub, actorRole: actor.role,
    action: "contractor.merged",
    resourceType: "contractor",
    resourceId: sourceId,
    payload: {
      sourceName: source.name,
      targetId,
      targetName: target.name,
      driversMoved: driverCount,
      vehiclesMoved: vehicleCount,
    },
  });

  return applySecurityHeaders(NextResponse.json({
    ok: true,
    driversMoved: driverCount,
    vehiclesMoved: vehicleCount,
  }));
}
