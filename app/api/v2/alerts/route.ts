import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { requireUser } from "@/app/_server/auth/getUser";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";
import { createBridgedAlert } from "@/app/_server/alerts/createBridged";

const AcknowledgeSchema = z.object({
  alertId: z.string().optional(),
  id: z.string().optional(),
  action: z.enum(["acknowledge", "resolve"]),
});

const CreateAlertSchema = z.object({
  type:        z.string().min(1).max(100),
  severity:    z.string().min(1).max(50),
  message:     z.string().min(1).max(2000),
  entityType:  z.string().max(50).nullable().optional(),
  entityId:    z.string().max(200).nullable().optional(),
  warehouseId: z.string().nullable().optional(),
  metadata:    z.record(z.string(), z.unknown()).optional(),
});

// Map incident.status → derived alert.status. open/investigating incidents
// surface as 'open' alerts; resolved/closed surface as 'resolved'.
function deriveStatus(incidentStatus: string | null): "open" | "resolved" {
  if (!incidentStatus) return "open";
  if (incidentStatus === "resolved" || incidentStatus === "closed") return "resolved";
  return "open";
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  // Guards don't see alerts in their portal — they only raise events.
  if (actor.role === "guard") {
    return applySecurityHeaders(NextResponse.json({ alerts: [], limit: 0, offset: 0 }));
  }

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status");                // "open" | "resolved" | null
  const warehouseId = searchParams.get("warehouseId");
  const severity = searchParams.get("severity");
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 2000);
  const offset = Number(searchParams.get("offset") ?? 0);

  // Alerts are now strictly 1:1 with incidents — every surviving alert has
  // entity_type='incident'. The LEFT JOIN gives us the live incident
  // status; filtering happens after derive.
  const rows = (warehouseId && severity)
    ? await db`
        SELECT a.id, a.type, a.severity, a.message, a.entity_type, a.entity_id, a.metadata,
               a.warehouse_id, a.created_at, i.status AS incident_status
        FROM   alerts a
        LEFT JOIN incidents i ON a.entity_type = 'incident' AND a.entity_id = i.id
        WHERE  a.org_id = ${actor.org} AND a.warehouse_id = ${warehouseId}
          AND  a.severity = ${severity} AND a.entity_type = 'incident'
        ORDER  BY a.created_at DESC LIMIT ${limit} OFFSET ${offset}
      `
    : warehouseId
    ? await db`
        SELECT a.id, a.type, a.severity, a.message, a.entity_type, a.entity_id, a.metadata,
               a.warehouse_id, a.created_at, i.status AS incident_status
        FROM   alerts a
        LEFT JOIN incidents i ON a.entity_type = 'incident' AND a.entity_id = i.id
        WHERE  a.org_id = ${actor.org} AND a.warehouse_id = ${warehouseId}
          AND  a.entity_type = 'incident'
        ORDER  BY a.created_at DESC LIMIT ${limit} OFFSET ${offset}
      `
    : await db`
        SELECT a.id, a.type, a.severity, a.message, a.entity_type, a.entity_id, a.metadata,
               a.warehouse_id, a.created_at, i.status AS incident_status
        FROM   alerts a
        LEFT JOIN incidents i ON a.entity_type = 'incident' AND a.entity_id = i.id
        WHERE  a.org_id = ${actor.org} AND a.entity_type = 'incident'
        ORDER  BY a.created_at DESC LIMIT ${limit} OFFSET ${offset}
      `;

  const alerts = rows
    .map((r) => ({
      ...r,
      status:          deriveStatus(r.incident_status as string | null),
      acknowledged_at: null,
      resolved_at:     null,
    }))
    .filter((r) => !statusFilter || r.status === statusFilter);

  return applySecurityHeaders(NextResponse.json({ alerts, limit, offset }));
}

// POST /api/v2/alerts — create a new alert (which always also creates an
// incident, see createBridgedAlert). Also handles the legacy ack/resolve
// POST shape ({ alertId, action }) by forwarding to the no-op PATCH path
// so old callers don't 405.
export async function POST(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  // Legacy ack/resolve POST: { alertId, action } — keep the API contract.
  if (body && typeof body === "object" && "action" in body) {
    return handleAckResolveNoop(actor, body);
  }

  const parsed = CreateAlertSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }

  const d = parsed.data;
  const result = await createBridgedAlert({
    orgId:       actor.org ?? "",
    warehouseId: d.warehouseId ?? null,
    type:        d.type,
    severity:    d.severity,
    message:     d.message,
    entityType:  d.entityType ?? null,
    entityId:    d.entityId ?? null,
    metadata:    d.metadata,
    raisedBy:    actor.sub,
    actorRole:   actor.role,
  });

  if (result.skipped) {
    // Caller still gets a 200 so existing fire-and-forget code paths aren't
    // broken; `skipped` plus `reason` lets new callers detect the no-op.
    return applySecurityHeaders(NextResponse.json({
      id: null, autoIncidentId: null, skipped: true, reason: result.reason,
    }));
  }

  await writeAuditEvent({
    orgId: actor.org, actorId: actor.sub, actorRole: actor.role,
    action: "alert.created", resourceType: "alert", resourceId: result.alertId || result.incidentId,
    warehouseId: d.warehouseId ?? undefined,
    payload: { type: d.type, severity: d.severity, reused: result.reused, incidentId: result.incidentId },
  });

  return applySecurityHeaders(NextResponse.json({
    id:             result.alertId || null,
    autoIncidentId: result.incidentId,
    reused:         result.reused,
  }, { status: 201 }));
}

// PATCH is now a no-op — alert status is derived from incident status, so
// manual ack/resolve doesn't make sense. Kept for API compatibility.
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  return handleAckResolveNoop(actor, body);
}

async function handleAckResolveNoop(
  actor: { sub: string; org: string | null; role: string },
  body: unknown,
): Promise<NextResponse> {
  const parsed = AcknowledgeSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }
  const alertId = parsed.data.alertId ?? parsed.data.id;
  const action  = parsed.data.action;
  if (!alertId) {
    return applySecurityHeaders(NextResponse.json({ error: "alertId is required" }, { status: 400 }));
  }

  // Audit only — no DB mutation. Tells operators an old client is still
  // calling ack/resolve on alerts so the UI can be updated.
  await writeAuditEvent({
    orgId: actor.org, actorId: actor.sub, actorRole: actor.role,
    action: `alert.${action}d_noop`, resourceType: "alert", resourceId: alertId,
  });

  return applySecurityHeaders(NextResponse.json({ ok: true, noop: true }));
}
