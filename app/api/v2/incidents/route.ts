import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { uuidv7 } from "@/app/_server/db/uuidv7";
import { requireUser } from "@/app/_server/auth/getUser";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";
import { sendMail } from "@/app/_lib/sendMail";
import { buildIncidentCtx, emailIncidentAssigned } from "@/app/_lib/incidentEmails";
import { computeSlaWindowForOrg } from "@/app/_lib/incidentSla";

const CreateIncidentSchema = z.object({
  warehouseId: z.string().nullable().optional(),
  type: z.preprocess(
    (v) => (typeof v === "string" ? v.toLowerCase().trim() : v),
    z.enum([
      "fraud_attempt", "fake_pod", "face_mismatch", "unauthorized_entry",
      "vehicle_noncompliance", "driver_noncompliance", "invoice_mismatch", "theft", "other",
    ]),
  ),
  description: z.string().min(1).max(2000),
  severity: z.preprocess(
    (v) => (typeof v === "string" ? v.toLowerCase().trim() : v),
    z.enum(["info", "warning", "critical"]).default("warning"),
  ),
  linkedTripId: z.string().nullable().optional(),
  linkedAlertId: z.string().nullable().optional(),
  linkedGateEventId: z.string().nullable().optional(),
  assignedTo: z.string().nullable().optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const warehouseId = searchParams.get("warehouseId");
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 2000);
  const offset = Number(searchParams.get("offset") ?? 0);

  // Cover all four combinations of (status, warehouseId). The earlier code
  // only had three branches, so a request that passed warehouseId without a
  // status fell through to the no-filter branch and returned every org-wide
  // incident — making it look like the warehouse dropdown was a no-op.
  const incidents = (status && warehouseId)
    ? await db`
      SELECT i.id, i.type, i.description, i.status, i.severity,
             i.assigned_to, a.full_name AS assigned_to_name,
             i.sla_start_at, i.sla_deadline,
             i.raised_by, u.full_name AS raised_by_name,
             i.warehouse_id, w.name AS warehouse_name,
             i.escalation_level, i.linked_alert_id, i.created_at, i.updated_at
      FROM   incidents i
      LEFT JOIN users u      ON u.id = i.raised_by
      LEFT JOIN users a      ON a.id = i.assigned_to
      LEFT JOIN warehouses w ON w.id = i.warehouse_id
      WHERE  i.org_id = ${actor.org} AND i.status = ${status} AND i.warehouse_id = ${warehouseId}
      ORDER  BY i.created_at DESC LIMIT ${limit} OFFSET ${offset}
    `
    : warehouseId
      ? await db`
      SELECT i.id, i.type, i.description, i.status, i.severity,
             i.assigned_to, a.full_name AS assigned_to_name,
             i.sla_start_at, i.sla_deadline,
             i.raised_by, u.full_name AS raised_by_name,
             i.warehouse_id, w.name AS warehouse_name,
             i.escalation_level, i.linked_alert_id, i.created_at, i.updated_at
      FROM   incidents i
      LEFT JOIN users u      ON u.id = i.raised_by
      LEFT JOIN users a      ON a.id = i.assigned_to
      LEFT JOIN warehouses w ON w.id = i.warehouse_id
      WHERE  i.org_id = ${actor.org} AND i.warehouse_id = ${warehouseId}
      ORDER  BY i.created_at DESC LIMIT ${limit} OFFSET ${offset}
    `
    : status
      ? await db`
      SELECT i.id, i.type, i.description, i.status, i.severity,
             i.assigned_to, a.full_name AS assigned_to_name,
             i.sla_start_at, i.sla_deadline,
             i.raised_by, u.full_name AS raised_by_name,
             i.warehouse_id, w.name AS warehouse_name,
             i.escalation_level, i.linked_alert_id, i.created_at, i.updated_at
      FROM   incidents i
      LEFT JOIN users u      ON u.id = i.raised_by
      LEFT JOIN users a      ON a.id = i.assigned_to
      LEFT JOIN warehouses w ON w.id = i.warehouse_id
      WHERE  i.org_id = ${actor.org} AND i.status = ${status}
      ORDER  BY i.created_at DESC LIMIT ${limit} OFFSET ${offset}
    `
      : await db`
      SELECT i.id, i.type, i.description, i.status, i.severity,
             i.assigned_to, a.full_name AS assigned_to_name,
             i.sla_start_at, i.sla_deadline,
             i.raised_by, u.full_name AS raised_by_name,
             i.warehouse_id, w.name AS warehouse_name,
             i.escalation_level, i.linked_alert_id, i.created_at, i.updated_at
      FROM   incidents i
      LEFT JOIN users u      ON u.id = i.raised_by
      LEFT JOIN users a      ON a.id = i.assigned_to
      LEFT JOIN warehouses w ON w.id = i.warehouse_id
      WHERE  i.org_id = ${actor.org}
      ORDER  BY i.created_at DESC LIMIT ${limit} OFFSET ${offset}
    `;

  return applySecurityHeaders(NextResponse.json({ incidents, limit, offset }));
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  const parsed = CreateIncidentSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }

  const data = parsed.data;
  // Org-aware SLA: respects per-org overrides + paused weekdays.
  const sla = await computeSlaWindowForOrg(actor.org ?? "", data.type);
  const { slaStartAt, slaDeadline, slaMinutes } = sla;

  // ── Duplicate-window check ────────────────────────────────────────────────
  // Block if the same warehouse has an open/investigating incident of the same
  // type raised in the last 10 minutes. Prevents two guards filing the same
  // event from different gates. Caller can override with ?force=1.
  const force = new URL(req.url).searchParams.get("force") === "1";
  if (!force && data.warehouseId) {
    const [dup] = await db`
      SELECT id, created_at FROM incidents
      WHERE  warehouse_id = ${data.warehouseId}
        AND  type = ${data.type}
        AND  status IN ('open', 'investigating')
        AND  created_at > now() - INTERVAL '10 minutes'
      ORDER  BY created_at DESC
      LIMIT  1
    `;
    if (dup) {
      return applySecurityHeaders(NextResponse.json({
        error:      "A similar incident was raised at this warehouse in the last 10 minutes",
        existingId: dup.id,
        existingAt: dup.created_at,
        hint:       "Append `?force=1` to the request to create anyway.",
      }, { status: 409 }));
    }
  }

  // ── Auto-assign to the warehouse's wh_manager ─────────────────────────────
  // Falls back: explicit assignedTo from caller → wh_manager of the warehouse →
  // first regional_manager whose warehouse_ids includes it → company_admin →
  // null. The cron also only escalates when the manager hasn't acted, so a
  // null assignee just means the cron emails everyone in the chain.
  let assignedTo: string | null = data.assignedTo ?? null;
  if (!assignedTo && data.warehouseId) {
    const [whMgr] = await db`
      SELECT id FROM users
      WHERE  warehouse_id = ${data.warehouseId} AND role = 'wh_manager' AND is_active = true
      LIMIT  1
    `;
    if (whMgr) assignedTo = whMgr.id as string;
    if (!assignedTo) {
      const [rm] = await db`
        SELECT id FROM users
        WHERE  org_id = ${actor.org} AND role = 'regional_manager' AND is_active = true
          AND  ${data.warehouseId} = ANY(warehouse_ids)
        LIMIT  1
      `;
      if (rm) assignedTo = rm.id as string;
    }
    if (!assignedTo) {
      const [admin] = await db`
        SELECT id FROM users
        WHERE  org_id = ${actor.org} AND role = 'company_admin' AND is_active = true
        LIMIT  1
      `;
      if (admin) assignedTo = admin.id as string;
    }
  }

  const id = uuidv7();
  const [raisedByRow] = await db`SELECT full_name FROM users WHERE id = ${actor.sub} LIMIT 1`;
  const raisedByName = (raisedByRow?.full_name as string) ?? "System";

  await db`
    INSERT INTO incidents (
      id, org_id, warehouse_id, type, description, severity, assigned_to,
      sla_start_at, sla_deadline, raised_by,
      linked_trip_id, linked_alert_id, linked_gate_event_id
    ) VALUES (
      ${id}, ${actor.org}, ${data.warehouseId ?? null}, ${data.type}, ${data.description},
      ${data.severity}, ${assignedTo}, ${slaStartAt}, ${slaDeadline}, ${actor.sub},
      ${data.linkedTripId ?? null}, ${data.linkedAlertId ?? null}, ${data.linkedGateEventId ?? null}
    )
  `;

  // ── Append to incident_events (append-only timeline) ──────────────────────
  await db`
    INSERT INTO incident_events (id, incident_id, org_id, event_type, actor_id, actor_name, payload)
    VALUES (
      ${uuidv7()}, ${id}, ${actor.org}, 'created', ${actor.sub}, ${raisedByName},
      ${db.json({ type: data.type, severity: data.severity, assignedTo } as Parameters<typeof db.json>[0])}
    )
  `;

  // ── L0 alert + email to the assignee (if any) ─────────────────────────────
  let warehouseName = "—";
  if (data.warehouseId) {
    const [wh] = await db`SELECT name FROM warehouses WHERE id = ${data.warehouseId} LIMIT 1`;
    if (wh?.name) warehouseName = wh.name as string;
  }

  if (assignedTo && data.warehouseId) {
    const [assignee] = await db`SELECT id, full_name, email FROM users WHERE id = ${assignedTo} LIMIT 1`;
    const assigneeName = (assignee?.full_name as string) ?? "Manager";

    // In-app alert
    await db`
      INSERT INTO alerts (
        id, org_id, warehouse_id, type, severity, status,
        message, entity_type, entity_id, metadata
      ) VALUES (
        ${uuidv7()}, ${actor.org}, ${data.warehouseId},
        'incident_raised', ${data.severity}, 'open',
        ${`New ${data.type.replace(/_/g, " ")} incident at ${warehouseName} — assigned to ${assigneeName}.`},
        'incident', ${id},
        ${db.json({ assignedTo, slaDeadline: slaDeadline.toISOString(), level: 0 } as Parameters<typeof db.json>[0])}
      )
    `;

    // Email — best-effort, not awaited so a slow SMTP doesn't block the response
    if (assignee?.email) {
      const ctx = buildIncidentCtx({
        id, type: data.type, severity: data.severity, description: data.description,
        warehouseName, raisedByName, raisedAt: new Date(), slaDeadline, slaMinutes,
      });
      const { subject, html } = emailIncidentAssigned(ctx, { name: assigneeName });
      void sendMail({ to: assignee.email as string, subject, html });
    }
  }

  await writeAuditEvent({
    orgId: actor.org,
    actorId: actor.sub,
    actorRole: actor.role,
    action: "incident.created",
    resourceType: "incident",
    resourceId: id,
    warehouseId: data.warehouseId,
    payload: { type: data.type, severity: data.severity, assignedTo, slaDeadline: slaDeadline.toISOString() },
  });

  return applySecurityHeaders(
    NextResponse.json({ id, slaDeadline, assignedTo }, { status: 201 }),
  );
}
