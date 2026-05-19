/** Alert service — v2 API backed (Supabase). */

import { api } from "./v2/api";
import type { AlertType, AlertSeverity } from "../_lib/types";

// Alerts are now strictly 1:1 with incidents — status is derived from the
// linked incident, so only `open` and `resolved` are surfaced.
export type FgAlertStatus = "open" | "resolved";

export interface FgAlert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  status: FgAlertStatus;
  message: string;
  warehouseId: string;
  warehouseName: string;
  entityType: string;       // always "incident" now (kept on the type for callers
  entityId: string;         // that already destructure it)
  metadata: Record<string, unknown>;
  createdAt: Date;
  // Legacy fields retained as nulls so existing UI consumers don't crash.
  // The DB columns behind them are dropped in migration 0012.
  acknowledgedAt: null;
  acknowledgedByUid: null;
  resolvedAt: null;
  resolvedByUid: null;
  escalatedTo: null;
  escalatedAt: null;
}

function mapAlert(a: Record<string, unknown>): FgAlert {
  const status = (a.status as FgAlertStatus) ?? "open";
  return {
    id:                (a.id as string),
    type:              (a.type as AlertType),
    severity:          (a.severity as AlertSeverity) ?? "warning",
    status,
    message:           (a.message as string) ?? "",
    warehouseId:       (a.warehouse_id as string) ?? "",
    warehouseName:     (a.warehouse_name as string) ?? "",
    entityType:        (a.entity_type as string) ?? "",
    entityId:          (a.entity_id as string) ?? "",
    metadata:          (a.metadata as Record<string, unknown>) ?? {},
    createdAt:         a.created_at ? new Date(a.created_at as string) : new Date(),
    acknowledgedAt:    null,
    acknowledgedByUid: null,
    resolvedAt:        null,
    resolvedByUid:     null,
    escalatedTo:       null,
    escalatedAt:       null,
  };
}

export async function getAlertById(id: string): Promise<FgAlert | null> {
  const data = await api.get<{ alerts: Record<string, unknown>[] }>(`/api/v2/alerts?limit=2000`);
  const a = data.alerts.find((x) => x.id === id);
  return a ? mapAlert(a) : null;
}

export async function getOpenAlerts(warehouseId: string, maxAlerts = 50): Promise<FgAlert[]> {
  const data = await api.get<{ alerts: Record<string, unknown>[] }>(
    `/api/v2/alerts?warehouseId=${encodeURIComponent(warehouseId)}&status=open&limit=${maxAlerts}`,
  );
  return data.alerts.map(mapAlert);
}

export async function getAllAlerts(
  warehouseId: string,
  maxAlerts = 100,
  status?: FgAlertStatus,
): Promise<FgAlert[]> {
  const data = await api.get<{ alerts: Record<string, unknown>[] }>(
    `/api/v2/alerts?warehouseId=${encodeURIComponent(warehouseId)}&limit=${maxAlerts}&${status ? `status=${status}` : ""}`,
  );
  return data.alerts.map(mapAlert);
}

export async function getGlobalAlerts(maxAlerts = 200): Promise<FgAlert[]> {
  const data = await api.get<{ alerts: Record<string, unknown>[] }>(`/api/v2/alerts?limit=${maxAlerts}`);
  return data.alerts.map(mapAlert);
}

export function subscribeToOpenAlerts(
  warehouseId: string,
  onUpdate: (alerts: FgAlert[]) => void,
): () => void {
  let active = true;

  async function poll() {
    try {
      const data = await api.get<{ alerts: Record<string, unknown>[] }>(
        `/api/v2/alerts?warehouseId=${encodeURIComponent(warehouseId)}&status=open&limit=2000`,
      );
      if (active) onUpdate(data.alerts.map(mapAlert));
    } catch { /* ignore */ }
  }

  void poll();
  const timer = setInterval(() => { void poll(); }, 15_000);
  return () => { active = false; clearInterval(timer); };
}

export async function createAlert(
  data: {
    type: AlertType; severity: AlertSeverity; message: string;
    warehouseId: string; entityType: string; entityId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<string | null> {
  const res = await api.post<{ id: string | null }>("/api/v2/alerts", {
    type:        data.type,
    severity:    data.severity,
    message:     data.message,
    warehouseId: data.warehouseId,
    entityType:  data.entityType,
    entityId:    data.entityId,
    metadata:    data.metadata,
  });
  return res.id ?? null;
}

// Legacy ack/resolve helpers kept as no-ops so existing call sites compile.
// The PATCH endpoint now no-ops too — see app/api/v2/alerts/route.ts.
export async function acknowledgeAlert(_id: string, _byUid: string, _byName?: string, _byRole?: string): Promise<void> {
  /* no-op — alert status is derived from the linked incident */
}

export async function resolveAlert(_id: string, _byUid: string, _byName?: string, _byRole?: string): Promise<void> {
  /* no-op — alert status is derived from the linked incident */
}
