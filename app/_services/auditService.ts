/**
 * Audit service — v2 API backed (Supabase). Read-only.
 * All writes go through /api/audit/write (server-only).
 *
 * NOTE: Pagination cursor changed from Firestore DocumentSnapshot to a numeric offset.
 * Callers that used DocumentSnapshot must switch to passing/receiving a number.
 */

import { api } from "./v2/api";

export interface FgAuditEvent {
  id: string;
  action: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  entityType: string;
  entityId: string;
  warehouseId: string;
  orgId: string;
  detail: Record<string, unknown>;
  createdAt: Date;
}

function mapAudit(e: Record<string, unknown>): FgAuditEvent {
  const payload = (e.payload ?? {}) as Record<string, unknown>;
  const role = (e.actor_role as string) ?? "";
  const name = (e.actor_name as string) ?? "";
  return {
    id:          e.id as string,
    action:      (e.action as string) ?? "",
    actorId:     (e.actor_id as string) ?? "",
    actorName:   name || (role === "system" ? "System" : "Unknown user"),
    actorRole:   role,
    entityType:  (e.resource_type as string) ?? "",
    entityId:    (e.resource_id as string) ?? "",
    warehouseId: (e.warehouse_id as string) ?? "",
    orgId:       (e.org_id as string) ?? "",
    detail:      payload,
    createdAt:   e.occurred_at ? new Date(e.occurred_at as string) : new Date(),
  };
}

export async function getAuditEvents(
  warehouseId: string,
  maxEvents = 50,
  afterOffset = 0,
): Promise<{ events: FgAuditEvent[]; nextOffset: number | null }> {
  const data = await api.get<{ events: Record<string, unknown>[] }>(
    `/api/v2/audit?warehouseId=${encodeURIComponent(warehouseId)}&limit=${maxEvents}&offset=${afterOffset}`,
  );
  const events = data.events.map(mapAudit);
  return {
    events,
    nextOffset: events.length === maxEvents ? afterOffset + maxEvents : null,
  };
}

export async function getGlobalAuditEvents(
  maxEvents = 100,
  afterOffset = 0,
): Promise<{ events: FgAuditEvent[]; nextOffset: number | null }> {
  const data = await api.get<{ events: Record<string, unknown>[] }>(
    `/api/v2/audit?limit=${maxEvents}&offset=${afterOffset}`,
  );
  const events = data.events.map(mapAudit);
  return {
    events,
    nextOffset: events.length === maxEvents ? afterOffset + maxEvents : null,
  };
}

export async function getAuditEventsByActor(actorId: string, maxEvents = 50): Promise<FgAuditEvent[]> {
  const data = await api.get<{ events: Record<string, unknown>[] }>(
    `/api/v2/audit?actorId=${encodeURIComponent(actorId)}&limit=${maxEvents}`,
  );
  return data.events.map(mapAudit);
}
