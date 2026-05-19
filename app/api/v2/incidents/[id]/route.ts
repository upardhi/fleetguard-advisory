import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { uuidv7 } from "@/app/_server/db/uuidv7";
import { requireUser } from "@/app/_server/auth/getUser";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";
import { sendMail } from "@/app/_lib/sendMail";
import { buildIncidentCtx, emailIncidentResolved } from "@/app/_lib/incidentEmails";

type IncidentStatus = "open" | "investigating" | "resolved" | "closed";

// Allowed status transitions. Anything not in this map is rejected with 409.
const LEGAL_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  open:          ["investigating", "resolved", "closed"],
  investigating: ["resolved", "closed"],
  resolved:      ["closed"],
  closed:        [],
};

const RESOLVING_STATUSES = new Set<IncidentStatus>(["resolved", "closed"]);

const PatchIncidentSchema = z.object({
  status:         z.enum(["open", "investigating", "resolved", "closed"]).optional(),
  assignedTo:     z.string().optional(),
  resolutionNote: z.string().max(2000).optional(),
  severity:       z.enum(["info", "warning", "critical"]).optional(),
});

// GET /api/v2/incidents/:id
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { id } = await params;

  const [incident] = actor.role === "superadmin"
    ? await db`
        SELECT id, org_id, type, description, status, severity, assigned_to,
               sla_start_at, sla_deadline,
               raised_by, warehouse_id, linked_trip_id, linked_alert_id, linked_gate_event_id,
               resolution_note, closed_at, escalation_level, created_at, updated_at
        FROM   incidents
        WHERE  id = ${id}
        LIMIT  1
      `
    : await db`
        SELECT id, org_id, type, description, status, severity, assigned_to,
               sla_start_at, sla_deadline,
               raised_by, warehouse_id, linked_trip_id, linked_alert_id, linked_gate_event_id,
               resolution_note, closed_at, escalation_level, created_at, updated_at
        FROM   incidents
        WHERE  id = ${id} AND org_id = ${actor.org}
        LIMIT  1
      `;

  if (!incident) {
    return applySecurityHeaders(NextResponse.json({ error: "Incident not found" }, { status: 404 }));
  }

  // incident_events uses `occurred_at` (not `created_at`) — schema convention
  // for append-only event tables. Alias it so the UI can keep reading
  // `created_at` without changing.
  const events = await db`
    SELECT id, event_type, actor_id, actor_name, payload, occurred_at AS created_at
    FROM   incident_events
    WHERE  incident_id = ${id}
    ORDER  BY occurred_at ASC
  `;

  // Fetch all linked entity data in parallel for the detail view
  let entryEvent: Record<string, unknown> | null = null;
  let exitEvent:  Record<string, unknown> | null = null;
  let driver:     Record<string, unknown> | null = null;
  let vehicle:    Record<string, unknown> | null = null;
  let contractor: Record<string, unknown> | null = null;

  if (incident.linked_gate_event_id) {
    const [ev] = await db`
      SELECT id, event_type, vehicle_reg, person_name, contractor_name, guard_name,
             guard_id, driver_id, vehicle_id, photo_url, status, metadata, occurred_at
      FROM   gate_events
      WHERE  id = ${incident.linked_gate_event_id}
      LIMIT  1
    `;

    if (ev) {
      entryEvent = ev;

      // Parallel: driver + vehicle lookups
      const subTasks: Promise<void>[] = [];

      if (ev.driver_id) {
        subTasks.push(
          db`
            SELECT id, full_name, dl_number, dl_expiry, dl_status, bg_status, face_photo_url, contractor_id
            FROM   drivers
            WHERE  id = ${ev.driver_id} AND org_id = ${actor.org}
            LIMIT  1
          `.then(([d]) => { if (d) driver = d as Record<string, unknown>; }),
        );
      }

      if (ev.vehicle_id) {
        subTasks.push(
          db`
            SELECT id, registration_number, vehicle_type, owner_type, contractor_id,
                   rc_expiry, insurance_expiry, fitness_expiry, puc_expiry, status,
                   rc_owner_name, rc_manufacturer, rc_vehicle_class, rc_fuel_type
            FROM   vehicles
            WHERE  id = ${ev.vehicle_id} AND org_id = ${actor.org}
            LIMIT  1
          `.then(([v]) => { if (v) vehicle = v as Record<string, unknown>; }),
        );
      }

      await Promise.all(subTasks);

      // Exit event: try driver_id first, then vehicle_id, then vehicle_reg
      const exitEventTypes = ['inbound_exit','outbound_exit','contractor_exit','visitor_exit'];
      if (ev.driver_id) {
        const [e] = await db`
          SELECT id, event_type, vehicle_reg, person_name, guard_name, guard_id,
                 driver_id, vehicle_id, photo_url, status, metadata, occurred_at
          FROM   gate_events
          WHERE  driver_id   = ${ev.driver_id}
            AND  event_type  = ANY(${exitEventTypes})
            AND  occurred_at > ${ev.occurred_at as Date}
            AND  org_id      = ${actor.org}
          ORDER  BY occurred_at ASC
          LIMIT  1
        `;
        if (e) exitEvent = e as Record<string, unknown>;
      }
      if (!exitEvent && ev.vehicle_id) {
        const [e] = await db`
          SELECT id, event_type, vehicle_reg, person_name, guard_name, guard_id,
                 driver_id, vehicle_id, photo_url, status, metadata, occurred_at
          FROM   gate_events
          WHERE  vehicle_id  = ${ev.vehicle_id}
            AND  event_type  = ANY(${exitEventTypes})
            AND  occurred_at > ${ev.occurred_at as Date}
            AND  org_id      = ${actor.org}
          ORDER  BY occurred_at ASC
          LIMIT  1
        `;
        if (e) exitEvent = e as Record<string, unknown>;
      }
      if (!exitEvent && ev.vehicle_reg) {
        const [e] = await db`
          SELECT id, event_type, vehicle_reg, person_name, guard_name, guard_id,
                 driver_id, vehicle_id, photo_url, status, metadata, occurred_at
          FROM   gate_events
          WHERE  vehicle_reg  = ${ev.vehicle_reg}
            AND  event_type   = ANY(${exitEventTypes})
            AND  occurred_at  > ${ev.occurred_at as Date}
            AND  org_id       = ${actor.org}
          ORDER  BY occurred_at ASC
          LIMIT  1
        `;
        if (e) exitEvent = e as Record<string, unknown>;
      }

      // Contractor: prefer driver's contractor_id, fall back to vehicle's
      const contractorId = (
        (driver  as Record<string, unknown> | null)?.contractor_id ??
        (vehicle as Record<string, unknown> | null)?.contractor_id
      ) as string | null;
      if (contractorId) {
        const [c] = await db`
          SELECT id, name, code, type, contact_name, contact_mobile, contact_email, address, city, state
          FROM   contractors
          WHERE  id = ${contractorId} AND org_id = ${actor.org}
          LIMIT  1
        `;
        if (c) contractor = c as Record<string, unknown>;
      } else if (ev.contractor_name) {
        contractor = { name: ev.contractor_name };
      }
    }
  }

  return applySecurityHeaders(NextResponse.json({ incident, events, entryEvent, exitEvent, driver, vehicle, contractor }));
}

// PATCH /api/v2/incidents/:id
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { id } = await params;

  const [incident] = actor.role === "superadmin"
    ? await db`
        SELECT id, org_id, warehouse_id, type, severity, description, status, assigned_to,
               sla_deadline, raised_by, created_at
        FROM   incidents
        WHERE  id = ${id}
        LIMIT  1
      `
    : await db`
        SELECT id, org_id, warehouse_id, type, severity, description, status, assigned_to,
               sla_deadline, raised_by, created_at
        FROM   incidents
        WHERE  id = ${id} AND org_id = ${actor.org}
        LIMIT  1
      `;
  if (!incident) {
    return applySecurityHeaders(NextResponse.json({ error: "Incident not found" }, { status: 404 }));
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  const parsed = PatchIncidentSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }

  // ── Validate status transition ────────────────────────────────────────────
  if (parsed.data.status && parsed.data.status !== incident.status) {
    const currentStatus = incident.status as IncidentStatus;
    const nextStatus = parsed.data.status;
    const allowed = LEGAL_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(nextStatus)) {
      return applySecurityHeaders(NextResponse.json({
        error: `Cannot transition from "${currentStatus}" to "${nextStatus}".`,
        legalNext: allowed,
      }, { status: 409 }));
    }
    // Resolution requires a note (≥10 chars) the first time we close out.
    if (RESOLVING_STATUSES.has(nextStatus)) {
      const note = parsed.data.resolutionNote?.trim() ?? "";
      if (note.length < 10) {
        return applySecurityHeaders(NextResponse.json({
          error: "Resolution note required (minimum 10 characters) when resolving or closing an incident.",
        }, { status: 422 }));
      }
    }
  }

  const col: Record<string, unknown> = {};
  if (parsed.data.status         !== undefined) col.status          = parsed.data.status;
  if (parsed.data.assignedTo     !== undefined) col.assigned_to     = parsed.data.assignedTo;
  if (parsed.data.resolutionNote !== undefined) col.resolution_note = parsed.data.resolutionNote;
  if (parsed.data.severity       !== undefined) col.severity        = parsed.data.severity;
  if (parsed.data.status === "resolved")        col.closed_at       = new Date();
  else if (parsed.data.status === "closed")     col.closed_at       = new Date();

  if (Object.keys(col).length > 0) {
    await db`UPDATE incidents SET ${db(col)}, updated_at = now() WHERE id = ${id}`;
  }

  // ── Append incident_event for the timeline ────────────────────────────────
  const [actorUser] = await db`SELECT full_name FROM users WHERE id = ${actor.sub} LIMIT 1`;
  const actorName = (actorUser?.full_name as string) ?? "System";
  await db`
    INSERT INTO incident_events (id, incident_id, org_id, event_type, actor_id, actor_name, payload)
    VALUES (
      ${uuidv7()}, ${id}, ${actor.org},
      ${parsed.data.status ?? "updated"}, ${actor.sub}, ${actorName},
      ${db.json(col as Parameters<typeof db.json>[0])}
    )
  `;

  // ── On resolution: auto-resolve all child alerts + send resolution email ──
  if (parsed.data.status && RESOLVING_STATUSES.has(parsed.data.status as IncidentStatus)) {
    await db`
      UPDATE alerts
      SET    status = 'resolved', resolved_at = now(), resolved_by = ${actor.sub}
      WHERE  entity_type = 'incident' AND entity_id = ${id} AND status != 'resolved'
    `;

    // Fire the resolution email to assignee + raiser (best-effort, not awaited).
    try {
      const recipientIds = new Set<string>();
      if (incident.assigned_to) recipientIds.add(incident.assigned_to as string);
      if (incident.raised_by)   recipientIds.add(incident.raised_by as string);
      if (recipientIds.size > 0) {
        const recipients = await db`
          SELECT id, full_name, email FROM users WHERE id = ANY(${[...recipientIds]})
        `;
        const [wh] = incident.warehouse_id
          ? await db`SELECT name FROM warehouses WHERE id = ${incident.warehouse_id} LIMIT 1`
          : [{ name: null }];
        const slaMinutes = Math.max(
          1,
          Math.round((new Date(incident.sla_deadline as string).getTime() - new Date(incident.created_at as string).getTime()) / 60000),
        );
        const durationMinutes = Math.max(
          0,
          Math.round((Date.now() - new Date(incident.created_at as string).getTime()) / 60000),
        );
        const ctx = buildIncidentCtx({
          id,
          type:          incident.type as string,
          severity:      incident.severity as string,
          description:   (incident.description as string) ?? "",
          warehouseName: (wh?.name as string) ?? "—",
          raisedByName:  actorName,
          raisedAt:      new Date(incident.created_at as string),
          slaDeadline:   new Date(incident.sla_deadline as string),
          slaMinutes,
        });
        const resCtx = {
          ...ctx,
          resolverName:    actorName,
          resolutionNote:  parsed.data.resolutionNote ?? "",
          durationMinutes,
          withinSla:       Date.now() <= new Date(incident.sla_deadline as string).getTime(),
        };
        for (const r of recipients) {
          if (!r.email) continue;
          const { subject, html } = emailIncidentResolved(resCtx, { name: (r.full_name as string) ?? "Manager" });
          void sendMail({ to: r.email as string, subject, html });
        }
      }
    } catch (err) {
      console.error("[incidents/PATCH] resolution email failed", err);
    }
  }

  await writeAuditEvent({
    orgId: actor.org, actorId: actor.sub, actorRole: actor.role,
    action: "incident.updated", resourceType: "incident", resourceId: id, payload: col,
  });

  return applySecurityHeaders(NextResponse.json({ ok: true }));
}
