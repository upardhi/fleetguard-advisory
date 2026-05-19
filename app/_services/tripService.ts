/** Trip service — v2 API backed (Supabase). Same public signatures as former Firestore version. */

import { api } from "./v2/api";
import type { TripStatus, StopStatus, DeliveryMode } from "../_lib/types";

export interface FgTrip {
  id: string;
  tripCode: string;
  vehicleId: string;
  vehicleReg: string;
  driverId: string;
  driverName: string;
  contractorId: string;
  contractorName: string;
  status: TripStatus;
  warehouseId: string;
  orgId: string;
  totalStops: number;
  confirmedStops: number;
  departedAt: Date | null;
  plannedReturn: Date | null;
  qrTokenId: string | null;
  pinHash: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FgTripStop {
  id: string;
  tripId: string;
  stopOrder: number;
  dealerName: string;
  dealerMobile: string;
  city: string;
  invoiceCount: number;
  invoiceNumbers: string[];
  deliveryMode: DeliveryMode;
  status: StopStatus;
  confirmedAt: Date | null;
  dwellMinutes: number | null;
}

function mapTrip(t: Record<string, unknown>): FgTrip {
  return {
    id:             t.id as string,
    tripCode:       (t.trip_code as string) ?? "",
    vehicleId:      (t.vehicle_id as string) ?? "",
    vehicleReg:     (t.vehicle_reg as string) ?? "",
    driverId:       (t.driver_id as string) ?? "",
    driverName:     (t.driver_name as string) ?? "",
    contractorId:   (t.contractor_id as string) ?? "",
    contractorName: (t.contractor_name as string) ?? "",
    status:         (t.status as TripStatus) ?? "pending",
    warehouseId:    (t.warehouse_id as string) ?? "",
    orgId:          (t.org_id as string) ?? "",
    totalStops:     Number(t.total_stops ?? 0),
    confirmedStops: Number(t.confirmed_stops ?? 0),
    departedAt:     t.departed_at ? new Date(t.departed_at as string) : null,
    plannedReturn:  t.planned_return ? new Date(t.planned_return as string) : null,
    qrTokenId:      (t.qr_token_id as string | null) ?? null,
    pinHash:        null,
    createdAt:      t.created_at ? new Date(t.created_at as string) : new Date(),
    updatedAt:      t.updated_at ? new Date(t.updated_at as string) : new Date(),
  };
}

function mapStop(s: Record<string, unknown>): FgTripStop {
  return {
    id:             s.id as string,
    tripId:         (s.trip_id as string) ?? "",
    stopOrder:      Number(s.stop_order ?? 0),
    dealerName:     (s.dealer_name as string) ?? "",
    dealerMobile:   "",
    city:           (s.city as string) ?? "",
    invoiceCount:   Number(s.invoice_count ?? 0),
    invoiceNumbers: (s.invoice_numbers as string[]) ?? [],
    deliveryMode:   ((s.delivery_mode as DeliveryMode) ?? "simple"),
    status:         ((s.status as StopStatus) ?? "pending"),
    confirmedAt:    s.confirmed_at ? new Date(s.confirmed_at as string) : null,
    dwellMinutes:   s.dwell_minutes ? Number(s.dwell_minutes) : null,
  };
}

export async function getTripById(id: string): Promise<FgTrip | null> {
  try {
    const data = await api.get<{ trip: Record<string, unknown> }>(`/api/v2/trips/${id}`);
    return data.trip ? mapTrip(data.trip) : null;
  } catch { return null; }
}

export async function getTripsByWarehouse(warehouseId: string, statuses?: TripStatus[]): Promise<FgTrip[]> {
  const statusParam = statuses?.length ? `&status=${statuses[0]}` : "";
  const data = await api.get<{ trips: Record<string, unknown>[] }>(
    `/api/v2/trips?warehouseId=${encodeURIComponent(warehouseId)}${statusParam}&limit=2000`,
  );
  const trips = data.trips.map(mapTrip);
  return statuses?.length ? trips.filter((t) => statuses.includes(t.status)) : trips;
}

export async function getActiveTrips(warehouseId: string): Promise<FgTrip[]> {
  return getTripsByWarehouse(warehouseId, ["in_transit", "loading", "returning"]);
}

export async function getTripByCode(tripCode: string): Promise<FgTrip | null> {
  const data = await api.get<{ trips: Record<string, unknown>[] }>(`/api/v2/trips?limit=2000`);
  const match = data.trips.find((t) => (t.trip_code as string) === tripCode);
  return match ? mapTrip(match) : null;
}

export async function getTripStops(tripId: string): Promise<FgTripStop[]> {
  try {
    const data = await api.get<{ trip: Record<string, unknown> & { stops?: Record<string, unknown>[] } }>(`/api/v2/trips/${tripId}`);
    return (data.trip?.stops ?? []).map(mapStop);
  } catch { return []; }
}

export async function createTrip(
  data: Omit<FgTrip, "id" | "createdAt" | "updatedAt">,
  stops: Omit<FgTripStop, "id" | "tripId">[],
): Promise<string> {
  const res = await api.post<{ id: string }>("/api/v2/trips", {
    warehouseId:   data.warehouseId,
    vehicleId:     data.vehicleId,
    driverId:      data.driverId,
    contractorId:  data.contractorId || undefined,
    plannedReturn: data.plannedReturn?.toISOString() ?? undefined,
    stops: stops.map((s) => ({
      dealerName:     s.dealerName,
      city:           s.city,
      invoiceNumbers: s.invoiceNumbers,
      deliveryMode:   s.deliveryMode,
    })),
  });
  return res.id;
}

export async function updateTripStatus(
  id: string,
  status: TripStatus,
  extra?: Partial<Pick<FgTrip, "departedAt" | "plannedReturn" | "qrTokenId" | "pinHash" | "confirmedStops">>,
): Promise<void> {
  await api.patch(`/api/v2/trips/${id}`, {
    status,
    ...(extra?.departedAt ? { departedAt: extra.departedAt.toISOString() } : {}),
    ...(extra?.plannedReturn ? { plannedReturn: extra.plannedReturn.toISOString() } : {}),
    ...(extra?.qrTokenId !== undefined ? { qrTokenId: extra.qrTokenId } : {}),
    ...(extra?.confirmedStops !== undefined ? { confirmedStops: extra.confirmedStops } : {}),
  });
}

export async function confirmTripStop(tripId: string, stopId: string, status: StopStatus = "confirmed"): Promise<void> {
  await api.patch(`/api/v2/trips/${tripId}`, { stopId, stopStatus: status });
}
