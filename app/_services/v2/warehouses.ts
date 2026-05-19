import { api } from "./api";

export interface WarehouseV2 {
  id:         string;
  name:       string;
  city:       string;
  state:      string;
  region:     string;
  address:    string | null;
  lat:        number | null;
  lng:        number | null;
  isActive:   boolean;
  createdAt:  string;
  events24h:  number;
  openAlerts: number;
}

export async function getWarehouses(): Promise<WarehouseV2[]> {
  const data = await api.get<{ warehouses: Record<string, unknown>[] }>("/api/v2/warehouses");
  return data.warehouses.map((w) => ({
    id:         w.id as string,
    name:       w.name as string,
    city:       w.city as string,
    state:      w.state as string,
    region:     w.region as string,
    address:    (w.address as string | null) ?? null,
    lat:        (w.lat as number | null) ?? null,
    lng:        (w.lng as number | null) ?? null,
    isActive:   (w.is_active ?? true) as boolean,
    createdAt:  w.created_at as string,
    events24h:  Number(w.events_24h ?? 0),
    openAlerts: Number(w.open_alerts ?? 0),
  }));
}

export async function getWarehouseById(id: string): Promise<WarehouseV2 | null> {
  const data = await api.get<{ warehouse: Record<string, unknown> | null }>(`/api/v2/warehouses/${id}`);
  const w = data.warehouse;
  if (!w) return null;
  return {
    id:         w.id as string,
    name:       w.name as string,
    city:       w.city as string,
    state:      w.state as string,
    region:     w.region as string,
    address:    (w.address as string | null) ?? null,
    lat:        (w.lat as number | null) ?? null,
    lng:        (w.lng as number | null) ?? null,
    isActive:   (w.is_active ?? true) as boolean,
    createdAt:  w.created_at as string,
    events24h:  Number(w.events_24h ?? 0),
    openAlerts: Number(w.open_alerts ?? 0),
  };
}

export async function createWarehouse(body: {
  name: string; city: string; state: string; region: string;
  address?: string; lat?: number; lng?: number;
}): Promise<{ id: string }> {
  return api.post("/api/v2/warehouses", body);
}
