/**
 * Auto-create an incident from a triggering alert.
 *
 * Mirrors the same flow as POST /api/v2/incidents:
 *   1. Compute SLA deadline from the type
 *   2. Auto-assign to the warehouse's wh_manager (fall back to RM, company_admin)
 *   3. INSERT incident
 *   4. Append `incident_events` 'created' row
 *   5. Insert L0 child alert (incident_raised) linked to the incident
 *   6. Email assignee
 *
 * Designed to be called from inside POST /api/v2/alerts after a triggering
 * alert is created. Idempotent at the per-alert level: if the alertId is
 * already linked to an incident, returns the existing one instead of duplicating.
 */

import { db } from "../db/client";
import { uuidv7 } from "../db/uuidv7";
import { sendMail } from "@/app/_lib/sendMail";
import { buildIncidentCtx, emailIncidentAssigned } from "@/app/_lib/incidentEmails";
import { writeAuditEvent } from "../db/audit";
import type { IncidentTypeForAlert } from "@/app/_lib/alertToIncident";
import { computeSlaWindowForOrg } from "@/app/_lib/incidentSla";

interface AutoCreateInput {
  orgId:           string;
  warehouseId:     string | null;
  type:            IncidentTypeForAlert;
  severity:        string;
  description:     string;
  triggeringAlertId: string;
  raisedBy:        string;          // actor.sub
  actorRole:       string;
  gateEventId?:    string | null;
}

interface AutoCreateResult {
  incidentId:  string;
  assignedTo:  string | null;
  slaDeadline: Date;
  reused?:     boolean;             // true if linked-alert was already attached
}

/**
 * Resolve the warehouse manager → regional manager → company admin chain.
 * Returns null if nobody is assignable.
 */
async function resolveAssignee(orgId: string, warehouseId: string | null): Promise<string | null> {
  if (warehouseId) {
    const [whMgr] = await db`
      SELECT id FROM users
      WHERE  warehouse_id = ${warehouseId} AND role = 'wh_manager' AND is_active = true
      LIMIT  1
    `;
    if (whMgr) return whMgr.id as string;

    const [rm] = await db`
      SELECT id FROM users
      WHERE  org_id = ${orgId} AND role = 'regional_manager' AND is_active = true
        AND  ${warehouseId} = ANY(warehouse_ids)
      LIMIT  1
    `;
    if (rm) return rm.id as string;
  }

  const [admin] = await db`
    SELECT id FROM users
    WHERE  org_id = ${orgId} AND role = 'company_admin' AND is_active = true
    LIMIT  1
  `;
  return (admin?.id as string) ?? null;
}

export async function autoCreateIncidentFromAlert(input: AutoCreateInput): Promise<AutoCreateResult> {
  // ── Idempotency: if this alert already triggered an incident, return it ──
  const [existing] = await db`
    SELECT id, assigned_to, sla_deadline FROM incidents
    WHERE  linked_alert_id = ${input.triggeringAlertId}
    LIMIT  1
  `;
  if (existing) {
    return {
      incidentId:  existing.id as string,
      assignedTo:  (existing.assigned_to as string | null) ?? null,
      slaDeadline: new Date(existing.sla_deadline as string),
      reused:      true,
    };
  }

  // ── Compute SLA + assignee ───────────────────────────────────────────────
  // Org-aware: applies any per-org overrides + paused-day list from
  // sla_config. Falls back to in-code defaults when no row exists.
  const sla = await computeSlaWindowForOrg(input.orgId, input.type);
  const { slaStartAt, slaDeadline, slaMinutes } = sla;
  const assignedTo = await resolveAssignee(input.orgId, input.warehouseId);

  // ── INSERT incident ───────────────────────────────────────────────────────
  const id = uuidv7();
  await db`
    INSERT INTO incidents (
      id, org_id, warehouse_id, type, description, severity, assigned_to,
      sla_start_at, sla_deadline, raised_by, linked_alert_id, linked_gate_event_id
    ) VALUES (
      ${id}, ${input.orgId}, ${input.warehouseId}, ${input.type}, ${input.description},
      ${input.severity}, ${assignedTo}, ${slaStartAt}, ${slaDeadline}, ${input.raisedBy},
      ${input.triggeringAlertId}, ${input.gateEventId ?? null}
    )
  `;

  // ── Timeline event ────────────────────────────────────────────────────────
  await db`
    INSERT INTO incident_events (id, incident_id, org_id, event_type, actor_id, actor_name, payload)
    VALUES (
      ${uuidv7()}, ${id}, ${input.orgId}, 'created', ${input.raisedBy}, 'FleetGuard (automated)',
      ${db.json({
        type: input.type,
        severity: input.severity,
        assignedTo,
        triggeringAlertId: input.triggeringAlertId,
      } as Parameters<typeof db.json>[0])}
    )
  `;

  // ── No L0 child alert when promoted from another alert ──────────────────
  // The triggering alert is already in the user's queue. Re-point it at the
  // incident so clicking it opens the detail page instead of showing two
  // redundant rows for the same event.
  let warehouseName = "—";
  if (input.warehouseId) {
    const [wh] = await db`SELECT name FROM warehouses WHERE id = ${input.warehouseId} LIMIT 1`;
    if (wh?.name) warehouseName = wh.name as string;
  }

  if (input.warehouseId && assignedTo) {
    const [assignee] = await db`SELECT id, full_name, email FROM users WHERE id = ${assignedTo} LIMIT 1`;
    const assigneeName = (assignee?.full_name as string) ?? "Manager";

    // Re-point the triggering alert at the incident so the alerts list shows
    // a "View incident →" link on it. Also stamp metadata.level = 0.
    await db`
      UPDATE alerts
      SET    entity_type = 'incident',
             entity_id   = ${id},
             metadata    = COALESCE(metadata, '{}'::jsonb) || ${db.json({
               assignedTo,
               slaDeadline: slaDeadline.toISOString(),
               level:       0,
               incidentId:  id,
             } as Parameters<typeof db.json>[0])}
      WHERE  id = ${input.triggeringAlertId}
    `;

    // ── L0 email (best-effort; not awaited) ─────────────────────────────────
    if (assignee?.email) {
      const ctx = buildIncidentCtx({
        id,
        type:           input.type,
        severity:       input.severity,
        description:    input.description,
        warehouseName,
        raisedByName:   "FleetGuard (automated)",
        raisedAt:       new Date(),
        slaDeadline,
        slaMinutes,
      });
      const { subject, html } = emailIncidentAssigned(ctx, { name: assigneeName });
      void sendMail({ to: assignee.email as string, subject, html });
    }
  }

  // ── Audit ────────────────────────────────────────────────────────────────
  await writeAuditEvent({
    orgId:        input.orgId,
    actorId:      input.raisedBy,
    actorRole:    input.actorRole,
    action:       "incident.auto_created",
    resourceType: "incident",
    resourceId:   id,
    warehouseId:  input.warehouseId,
    payload: {
      type:              input.type,
      severity:          input.severity,
      assignedTo,
      triggeringAlertId: input.triggeringAlertId,
    },
  });

  return { incidentId: id, assignedTo, slaDeadline };
}
