import { api } from "./api";

export interface AlertV2 {
  id:              string;
  type:            string;
  severity:        string;
  status:          string;
  message:         string | null;
  warehouseId:     string | null;
  entityType:      string | null;
  entityId:        string | null;
  tripId:          string | null;
  createdAt:       string;
  acknowledgedAt:  string | null;
  resolvedAt:      string | null;
}

export async function getAlerts(params?: {
  status?: string; warehouseId?: string; severity?: string;
  limit?: number; offset?: number;
}): Promise<{ alerts: AlertV2[]; limit: number; offset: number }> {
  const q = new URLSearchParams();
  if (params?.status)          q.set("status",      params.status);
  if (params?.warehouseId)     q.set("warehouseId", params.warehouseId);
  if (params?.severity)        q.set("severity",    params.severity);
  if (params?.limit  != null)  q.set("limit",       String(params.limit));
  if (params?.offset != null)  q.set("offset",      String(params.offset));
  const data = await api.get<{ alerts: Record<string, unknown>[]; limit: number; offset: number }>(
    `/api/v2/alerts?${q}`
  );
  return {
    alerts: data.alerts.map(mapAlert),
    limit:  data.limit,
    offset: data.offset,
  };
}

export async function acknowledgeAlert(id: string): Promise<void> {
  await api.patch(`/api/v2/alerts`, { id, action: "acknowledge" });
}

export async function resolveAlert(id: string): Promise<void> {
  await api.patch(`/api/v2/alerts`, { id, action: "resolve" });
}

function mapAlert(a: Record<string, unknown>): AlertV2 {
  return {
    id:             a.id as string,
    type:           a.type as string,
    severity:       a.severity as string,
    status:         a.status as string,
    message:        (a.message as string | null) ?? null,
    warehouseId:    (a.warehouse_id as string | null) ?? null,
    entityType:     (a.entity_type as string | null) ?? null,
    entityId:       (a.entity_id as string | null) ?? null,
    tripId:         (a.trip_id as string | null) ?? null,
    createdAt:      a.created_at as string,
    acknowledgedAt: (a.acknowledged_at as string | null) ?? null,
    resolvedAt:     (a.resolved_at as string | null) ?? null,
  };
}
