import { api } from "./api";

export interface IncidentV2 {
  id:                 string;
  type:               string;
  description:        string;
  status:             string;
  severity:           string;
  assignedTo:         string | null;
  slaDeadline:        string;
  raisedBy:           string;
  warehouseId:        string | null;
  linkedTripId:       string | null;
  linkedAlertId:      string | null;
  linkedGateEventId:  string | null;
  createdAt:          string;
  updatedAt:          string;
}

export async function getIncidents(params?: {
  status?: string; warehouseId?: string; limit?: number; offset?: number;
}): Promise<{ incidents: IncidentV2[]; limit: number; offset: number }> {
  const q = new URLSearchParams();
  if (params?.status)          q.set("status",      params.status);
  if (params?.warehouseId)     q.set("warehouseId", params.warehouseId);
  if (params?.limit  != null)  q.set("limit",       String(params.limit));
  if (params?.offset != null)  q.set("offset",      String(params.offset));
  const data = await api.get<{ incidents: Record<string, unknown>[]; limit: number; offset: number }>(
    `/api/v2/incidents?${q}`
  );
  return {
    incidents: data.incidents.map(mapIncident),
    limit:     data.limit,
    offset:    data.offset,
  };
}

export async function createIncident(body: {
  type: string; description: string; severity?: string;
  warehouseId?: string; assignedTo?: string;
  linkedTripId?: string; linkedAlertId?: string; linkedGateEventId?: string;
}): Promise<{ id: string; slaDeadline: string }> {
  return api.post("/api/v2/incidents", body);
}

function mapIncident(i: Record<string, unknown>): IncidentV2 {
  return {
    id:                i.id as string,
    type:              i.type as string,
    description:       i.description as string,
    status:            i.status as string,
    severity:          i.severity as string,
    assignedTo:        (i.assigned_to as string | null) ?? null,
    slaDeadline:       i.sla_deadline as string,
    raisedBy:          i.raised_by as string,
    warehouseId:       (i.warehouse_id as string | null) ?? null,
    linkedTripId:      (i.linked_trip_id as string | null) ?? null,
    linkedAlertId:     (i.linked_alert_id as string | null) ?? null,
    linkedGateEventId: (i.linked_gate_event_id as string | null) ?? null,
    createdAt:         i.created_at as string,
    updatedAt:         i.updated_at as string,
  };
}
