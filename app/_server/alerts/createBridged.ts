/**
 * Single chokepoint for raising an alert. Every alert in the system flows
 * through here so that:
 *
 *   1. Dropped types (`dl_expired`, `dl_expiring`, `vehicle_expired`,
 *      `bg_pending`, `contract_expiring`, and `incident_*` artifacts) never
 *      hit the database.
 *   2. Every surviving alert is paired 1:1 with an incident (auto-create
 *      via the bridge in `app/_lib/alertToIncident.ts`).
 *   3. Duplicates — multiple alerts for the same underlying issue — are
 *      collapsed onto the first open incident for that
 *      (warehouse, incidentType, entity) tuple.
 *
 * Every server-side caller that previously did a raw `INSERT INTO alerts`
 * should call this helper instead.
 */

import { db } from "../db/client";
import { uuidv7 } from "../db/uuidv7";
import {
  isDroppedAlertType,
  incidentTypeForAlert,
} from "@/app/_lib/alertToIncident";
import { autoCreateIncidentFromAlert } from "../incidents/autoCreate";

export interface CreateBridgedInput {
  orgId:        string;
  warehouseId:  string | null;
  type:         string;
  severity:     string;          // 'info' | 'warning' | 'critical'
  message:      string;
  entityType?:  string | null;
  entityId?:    string | null;
  metadata?:    Record<string, unknown>;
  raisedBy:     string;          // actor.sub
  actorRole:    string;
  gateEventId?: string | null;   // links incident → gate_events row for full-context view
}

export type CreateBridgedResult =
  | { skipped: true; reason: "dropped" | "no_bridge" | "no_warehouse"; alertId: null; incidentId: null }
  | { skipped: false; alertId: string; incidentId: string; reused: boolean };

/**
 * Look up an open/investigating incident that already covers this
 * (warehouseId, incidentType, entity). Reused alerts share that incident's
 * id rather than creating a fresh row.
 *
 * Joins through `linked_alert_id` because that's the only column on
 * `incidents` that points back to the originating alert's
 * (entity_type, entity_id). Adding a denormalised entity link on
 * `incidents` would be cleaner but isn't required and was rejected for
 * scope reasons.
 */
async function findOpenDuplicateIncident(
  orgId:        string,
  warehouseId:  string,
  incidentType: string,
  entityType:   string | null,
  entityId:     string | null,
): Promise<string | null> {
  if (!entityType || !entityId) return null;
  // Match alerts whose own (entity_type, entity_id) reflect the underlying
  // entity OR alerts that were re-pointed at the incident itself (in which
  // case a metadata.sourceEntityId field carries the original entity id).
  const [hit] = await db`
    SELECT i.id
    FROM   incidents i
    JOIN   alerts a ON a.id = i.linked_alert_id
    WHERE  i.org_id        = ${orgId}
      AND  i.warehouse_id  = ${warehouseId}
      AND  i.type          = ${incidentType}
      AND  i.status IN ('open', 'investigating')
      AND  (
              (a.entity_type = ${entityType} AND a.entity_id = ${entityId})
           OR (a.metadata ->> 'sourceEntityType' = ${entityType}
               AND a.metadata ->> 'sourceEntityId' = ${entityId})
           )
    ORDER  BY i.created_at DESC
    LIMIT  1
  `;
  return (hit?.id as string | undefined) ?? null;
}

export async function createBridgedAlert(input: CreateBridgedInput): Promise<CreateBridgedResult> {
  // 1. Hard-drop the noisy types up front.
  if (isDroppedAlertType(input.type)) {
    return { skipped: true, reason: "dropped", alertId: null, incidentId: null };
  }

  // 2. Map to an incident type. Anything that doesn't map is also dropped —
  //    every surviving alert must back an incident.
  const incidentType = incidentTypeForAlert({ alertType: input.type, severity: input.severity });
  if (!incidentType) {
    return { skipped: true, reason: "no_bridge", alertId: null, incidentId: null };
  }

  // 3. Incidents (and therefore alerts) are scoped to a warehouse. Without
  //    one we can't auto-assign or de-dupe.
  if (!input.warehouseId) {
    return { skipped: true, reason: "no_warehouse", alertId: null, incidentId: null };
  }

  const entityType = input.entityType ?? "unknown";
  const entityId   = input.entityId   ?? "unknown";

  // 4. Dedup — if we already have an open incident for the same entity
  //    + incident type at the same warehouse, reuse it instead of
  //    creating a parallel alert/incident pair.
  const existingIncidentId = await findOpenDuplicateIncident(
    input.orgId, input.warehouseId, incidentType, entityType, entityId,
  );
  if (existingIncidentId) {
    return { skipped: false, alertId: "", incidentId: existingIncidentId, reused: true };
  }

  // 5. Insert the alert — sourceEntityType/Id are stamped into metadata so
  //    the dedup query above still finds it after auto-create re-points
  //    entity_type/id at the incident.
  const alertId = uuidv7();
  const baseMetadata = {
    ...(input.metadata ?? {}),
    sourceEntityType: entityType,
    sourceEntityId:   entityId,
  };
  await db`
    INSERT INTO alerts (
      id, org_id, warehouse_id, type, severity, message,
      entity_type, entity_id, metadata
    ) VALUES (
      ${alertId}, ${input.orgId}, ${input.warehouseId},
      ${input.type}, ${input.severity}, ${input.message},
      ${entityType}, ${entityId},
      ${db.json(baseMetadata as Parameters<typeof db.json>[0])}
    )
  `;

  // 6. Auto-create the linked incident (re-points the alert at it).
  const result = await autoCreateIncidentFromAlert({
    orgId:             input.orgId,
    warehouseId:       input.warehouseId,
    type:              incidentType,
    severity:          input.severity,
    description:       input.message,
    triggeringAlertId: alertId,
    raisedBy:          input.raisedBy,
    actorRole:         input.actorRole,
    gateEventId:       input.gateEventId ?? null,
  });

  return { skipped: false, alertId, incidentId: result.incidentId, reused: false };
}
