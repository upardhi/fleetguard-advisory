/** Warehouse gate service — v2 API backed (Supabase). Same public signatures as former Firestore version. */

import { api } from "./v2/api";

export type GateType = "vehicle" | "pedestrian" | "mixed";

export interface FgWarehouseGate {
  id:          string;
  orgId:       string;
  warehouseId: string;
  name:        string;
  gateType:    GateType;
  gateCode:    string;
  notes:       string | null;
  isActive:    boolean;
  createdAt:   string;
}

function mapGate(g: Record<string, unknown>): FgWarehouseGate {
  return {
    id:          g.id as string,
    orgId:       (g.org_id as string) ?? "",
    warehouseId: g.warehouse_id as string,
    name:        g.name as string,
    gateType:    (g.gate_type as GateType) ?? "vehicle",
    gateCode:    (g.gate_code as string) ?? "",
    notes:       (g.notes as string | null) ?? null,
    isActive:    (g.is_active ?? true) as boolean,
    createdAt:   g.created_at as string,
  };
}

export async function getGatesByWarehouse(warehouseId: string): Promise<FgWarehouseGate[]> {
  const data = await api.get<{ gates: Record<string, unknown>[] }>(`/api/v2/gates?warehouseId=${encodeURIComponent(warehouseId)}`);
  return data.gates.map(mapGate);
}

export async function getGatesByOrg(_orgId: string): Promise<FgWarehouseGate[]> {
  const data = await api.get<{ gates: Record<string, unknown>[] }>("/api/v2/gates");
  return data.gates.map(mapGate);
}

export async function getGateById(id: string): Promise<FgWarehouseGate | null> {
  const data = await api.get<{ gates: Record<string, unknown>[] }>("/api/v2/gates");
  const g = data.gates.find((x) => x.id === id);
  return g ? mapGate(g) : null;
}

export async function createGate(data: { warehouseId: string; name: string; gateType?: GateType; gateCode?: string; notes?: string | null; orgId?: string; isActive?: boolean }): Promise<string> {
  const res = await api.post<{ id: string }>("/api/v2/gates", data);
  return res.id;
}

export async function updateGate(id: string, data: Partial<{ name: string; gateType: GateType; gateCode: string; notes: string | null; isActive: boolean }>): Promise<void> {
  await api.patch(`/api/v2/gates/${id}`, data);
}

export async function deactivateGate(id: string): Promise<void> {
  await api.patch(`/api/v2/gates/${id}`, { isActive: false });
}
