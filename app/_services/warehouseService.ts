/** Warehouse service — v2 API backed (Supabase). Same signatures as former Firestore version. */

import { api } from "./v2/api";

export interface FgWarehouse {
  id:         string;
  name:       string;
  code:       string;
  address:    string;
  city:       string;
  state:      string;
  region:     string;
  orgId:      string;
  managerId?: string | null;
  isActive:   boolean;
  lat:        number | null;
  lng:        number | null;
  events24h:  number;
  openAlerts: number;
  createdAt:  string;
  updatedAt:  string;
}

function mapWh(w: Record<string, unknown>): FgWarehouse {
  return {
    id:         w.id as string,
    name:       w.name as string,
    code:       (w.code as string) ?? "",
    address:    (w.address as string) ?? "",
    city:       w.city as string,
    state:      w.state as string,
    region:     w.region as string,
    orgId:      (w.org_id as string) ?? "",
    isActive:   (w.is_active ?? true) as boolean,
    lat:        (w.lat as number | null) ?? null,
    lng:        (w.lng as number | null) ?? null,
    events24h:  Number(w.events_24h ?? 0),
    openAlerts: Number(w.open_alerts ?? 0),
    createdAt:  w.created_at as string,
    updatedAt:  (w.updated_at as string) ?? (w.created_at as string),
  };
}

export async function getWarehousesByOrg(orgId: string): Promise<FgWarehouse[]> {
  const data = await api.get<{ warehouses: Record<string, unknown>[] }>(
    `/api/v2/warehouses?orgId=${encodeURIComponent(orgId)}`,
  );
  return data.warehouses.map(mapWh);
}

export async function getWarehouseById(id: string): Promise<FgWarehouse | null> {
  try {
    const data = await api.get<{ warehouse: Record<string, unknown> }>(`/api/v2/warehouses/${id}`);
    return data.warehouse ? mapWh(data.warehouse) : null;
  } catch {
    return null;
  }
}

export async function createWarehouse(data: {
  name: string; city: string; state: string; region: string;
  address?: string; code?: string; orgId?: string; isActive?: boolean;
  lat?: number | null; lng?: number | null;
}): Promise<string> {
  const res = await api.post<{ id: string }>("/api/v2/warehouses", data);
  return res.id;
}

export async function updateWarehouse(
  id: string,
  data: Partial<{ name: string; city: string; state: string; region: string; address: string; code: string; lat: number | null; lng: number | null; isActive: boolean }>,
): Promise<void> {
  await api.patch(`/api/v2/warehouses/${id}`, data);
}

export async function deactivateWarehouse(id: string): Promise<void> {
  await api.patch(`/api/v2/warehouses/${id}`, { isActive: false });
}
