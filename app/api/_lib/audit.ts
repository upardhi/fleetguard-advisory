/**
 * Audit log helper shim — delegates to the Supabase-backed writeAuditEvent.
 * Keeps the same writeAuditLog() signature used by legacy API routes.
 */

import { writeAuditEvent } from "@/app/_server/db/audit";

export interface AuditPayload {
  action: string;
  actorId: string;
  actorName?: string;
  actorRole: string;
  entityType: string;
  entityId: string;
  warehouseId: string;
  orgId: string;
  detail?: Record<string, unknown>;
}

export async function writeAuditLog(payload: AuditPayload): Promise<string> {
  await writeAuditEvent({
    orgId:        payload.orgId || null,
    actorId:      payload.actorId,
    actorRole:    payload.actorRole,
    action:       payload.action,
    resourceType: payload.entityType,
    resourceId:   payload.entityId,
    warehouseId:  payload.warehouseId || null,
    payload:      payload.detail,
  });
  return `${payload.action}_${Date.now()}`;
}
