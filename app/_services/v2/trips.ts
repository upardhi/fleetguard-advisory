import { api } from "./api";

export interface TripStopV2 {
  id:             string;
  stopOrder:      number;
  dealerName:     string;
  city:           string;
  invoiceCount:   number;
  invoiceNumbers: string[];
  deliveryMode:   string;
  status:         string;
  confirmedAt:    string | null;
}

export interface TripV2 {
  id:             string;
  tripCode:       string;
  warehouseId:    string;
  vehicleId:      string;
  vehicleReg:     string;       // ← add
  driverId:       string;
  driverName:     string;       // ← add
  contractorId:   string | null;
  contractorName: string;       // ← add
  status:         string;
  totalStops:     number;
  confirmedStops: number;
  departedAt:     string | null;
  plannedReturn:  string | null;
  createdAt:      string;
  stops?:         TripStopV2[];
}

export async function getTrips(params?: {
  warehouseId?: string; status?: string; limit?: number; offset?: number;
}): Promise<{ trips: TripV2[]; limit: number; offset: number }> {
  const q = new URLSearchParams();
  if (params?.warehouseId)     q.set("warehouseId", params.warehouseId);
  if (params?.status)          q.set("status",      params.status);
  if (params?.limit  != null)  q.set("limit",       String(params.limit));
  if (params?.offset != null)  q.set("offset",      String(params.offset));
  const data = await api.get<{ trips: Record<string, unknown>[]; limit: number; offset: number }>(
    `/api/v2/trips?${q}`
  );
  return { trips: data.trips.map(mapTrip), limit: data.limit, offset: data.offset };
}

export async function getTripById(id: string): Promise<TripV2 | null> {
  const data = await api.get<{ trip: Record<string, unknown> | null }>(`/api/v2/trips/${id}`);
  return data.trip ? mapTrip(data.trip) : null;
}

export async function createTrip(body: {
  warehouseId: string; vehicleId: string; driverId: string;
  contractorId?: string; plannedReturn?: string;
  stops: Array<{
    stopOrder: number; dealerName: string; city: string;
    invoiceCount: number; invoiceNumbers?: string[]; deliveryMode?: string;
  }>;
}): Promise<{ id: string; tripCode: string }> {
  return api.post("/api/v2/trips", body);
}

export async function updateTripStatus(id: string, status: string): Promise<void> {
  await api.patch(`/api/v2/trips/${id}`, { status });
}

function mapTrip(t: Record<string, unknown>): TripV2 {
  return {
    id:             t.id as string,
    tripCode:       (t.trip_code as string) ?? "",
    warehouseId:    (t.warehouse_id as string) ?? "",
    vehicleId:      (t.vehicle_id as string) ?? "",
    vehicleReg:     (t.vehicle_reg as string) ?? "",       // ← add
    driverId:       (t.driver_id as string) ?? "",
    driverName:     (t.driver_name as string) ?? "",       // ← add
    contractorId:   (t.contractor_id as string | null) ?? null,
    contractorName: (t.contractor_name as string) ?? "",   // ← add
    status:         (t.status as string) ?? "planned",
    totalStops:     Number(t.total_stops ?? 0),
    confirmedStops: Number(t.confirmed_stops ?? 0),
    departedAt:     (t.departed_at as string | null) ?? null,
    plannedReturn:  (t.planned_return as string | null) ?? null,
    createdAt:      (t.created_at as string) ?? "",
    stops:          Array.isArray(t.stops)
      ? (t.stops as Record<string, unknown>[]).map(mapStop)
      : undefined,
  };
}

function mapStop(s: Record<string, unknown>): TripStopV2 {
  return {
    id:             s.id as string,
    stopOrder:      Number(s.stop_order),
    dealerName:     s.dealer_name as string,
    city:           s.city as string,
    invoiceCount:   Number(s.invoice_count ?? 0),
    invoiceNumbers: (s.invoice_numbers as string[] | null) ?? [],
    deliveryMode:   s.delivery_mode as string,
    status:         s.status as string,
    confirmedAt:    (s.confirmed_at as string | null) ?? null,
  };
}
