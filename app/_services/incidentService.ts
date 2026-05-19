/** Incident service — v2 API backed (Supabase). Same public signatures as former Firestore version. */

import { api } from "./v2/api";
import type { Incident } from "../_lib/types";

export type IncidentStatus = "open" | "investigating" | "resolved" | "closed";
export type IncidentType = Incident["type"];

export interface FgIncident {
  id: string;
  type: IncidentType;
  description: string;
  warehouseId: string;
  warehouseName: string;
  orgId: string;
  status: IncidentStatus;
  assignedTo: string | null;
  assignedToUid: string | null;
  slaStartAt: Date;
  slaDeadline: Date;
  raisedBy: string;
  raised_by_name?: string;
  raisedByUid: string;
  createdAt: Date;
  updatedAt: Date;
  linkedTripCode: string | null;
  linkedAlertId: string | null;
  linkedGateEventId: string | null;
  evidenceCount: number;
  resolutionNote: string | null;
  closedAt: Date | null;
  escalationLevel: number;
}

function mapIncident(i: Record<string, unknown>): FgIncident {
  // Prefer the JOINed full_name from the API; fall back to the raw uid so
  // older list endpoints don't break the column rendering.
  const assignedToName = (i.assigned_to_name as string | null) ?? null;
  const assignedToUid  = (i.assigned_to as string | null) ?? null;
  return {
    id:               i.id as string,
    type:             (i.type as IncidentType),
    description:      (i.description as string) ?? "",
    warehouseId:      (i.warehouse_id as string) ?? "",
    warehouseName:    (i.warehouse_name as string) ?? "",
    orgId:            (i.org_id as string) ?? "",
    status:           (i.status as IncidentStatus) ?? "open",
    assignedTo:       assignedToName ?? assignedToUid,        // display value: name if we have it, else uid
    assignedToUid,
    slaStartAt:       i.sla_start_at ? new Date(i.sla_start_at as string) : (i.created_at ? new Date(i.created_at as string) : new Date()),
    slaDeadline:      i.sla_deadline ? new Date(i.sla_deadline as string) : new Date(),
    raisedBy:         (i.raised_by as string) ?? "",
    raised_by_name:         (i.raised_by_name as string) ?? "",
    raisedByUid:      (i.raised_by_uid as string) ?? "",
    createdAt:        i.created_at ? new Date(i.created_at as string) : new Date(),
    updatedAt:        i.updated_at ? new Date(i.updated_at as string) : new Date(),
    linkedTripCode:   (i.linked_trip_id as string | null) ?? null,
    linkedAlertId:    (i.linked_alert_id as string | null) ?? null,
    linkedGateEventId:(i.linked_gate_event_id as string | null) ?? null,
    evidenceCount:    Number(i.evidence_count ?? 0),
    resolutionNote:   (i.resolution_note as string | null) ?? null,
    closedAt:         i.closed_at ? new Date(i.closed_at as string) : null,
    escalationLevel:  Number(i.escalation_level ?? 0),
  };
}

export async function getIncidentById(id: string): Promise<FgIncident | null> {
  try {
    const data = await api.get<{ incident: Record<string, unknown> }>(`/api/v2/incidents/${id}`);
    return data.incident ? mapIncident(data.incident) : null;
  } catch { return null; }
}

export async function getIncidentsByWarehouse(warehouseId: string, maxIncidents = 100): Promise<FgIncident[]> {
  const data = await api.get<{ incidents: Record<string, unknown>[] }>(
    `/api/v2/incidents?warehouseId=${encodeURIComponent(warehouseId)}&limit=${maxIncidents}`,
  );
  return data.incidents.map(mapIncident).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getGlobalIncidents(maxIncidents = 200): Promise<FgIncident[]> {
  const data = await api.get<{ incidents: Record<string, unknown>[] }>(`/api/v2/incidents?limit=${maxIncidents}`);
  return data.incidents.map(mapIncident);
}

export async function createIncident(data: Omit<FgIncident, "id" | "createdAt" | "updatedAt" | "escalationLevel" | "slaStartAt"> & { escalationLevel?: number; slaStartAt?: Date }): Promise<string> {
  const res = await api.post<{ id: string }>("/api/v2/incidents", {
    type:              data.type,
    description:       data.description,
    warehouseId:       data.warehouseId,
    linkedTripId:      data.linkedTripCode,
    linkedAlertId:     data.linkedAlertId,
    linkedGateEventId: data.linkedGateEventId,
    assignedTo:        data.assignedTo,
  });
  return res.id;
}

export async function assignIncident(id: string, assignedTo: string, _assignedToUid: string): Promise<void> {
  await api.patch(`/api/v2/incidents/${id}`, { status: "investigating", assignedTo });
}

export async function resolveIncident(id: string, resolutionNote: string): Promise<void> {
  await api.patch(`/api/v2/incidents/${id}`, { status: "resolved", resolutionNote });
}

export async function closeIncident(id: string, resolutionNote: string): Promise<void> {
  await api.patch(`/api/v2/incidents/${id}`, { status: "closed", resolutionNote });
}

export async function incrementEvidenceCount(id: string): Promise<void> {
  // No direct endpoint; fetch and patch
  const incident = await getIncidentById(id);
  if (!incident) return;
  await api.patch(`/api/v2/incidents/${id}`, { evidenceCount: (incident.evidenceCount ?? 0) + 1 });
}
