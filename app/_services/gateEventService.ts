/** Gate event service — v2 API backed (Supabase). Same public signatures as former Firestore version. */

import { api } from "./v2/api";
import type { GateEventType, CheckStatus } from "../_lib/types";

// ── Driver profile (unified: driver + latest event + vehicle in one call) ─────

export interface DriverProfile {
  driver: {
    id: string; fullName: string; dlNumber: string;
    dlExpiry: string | null; dlStatus: string | null; bgStatus: string | null;
    facePhotoUrl: string | null; contractorId: string | null; registeredAt: string | null;
  };
  latestEvent: {
    id: string; occurredAt: string; vehicleReg: string | null;
    guardName: string | null; warehouseId: string | null;
    contractorId: string | null; contractorIds: string[];
    dlVerifyData: FgGateEvent["dlVerifyData"];
    crimeCheckData: FgGateEvent["crimeCheckData"];
    dlNumber: string | null; driverDob: string | null;
  } | null;
  vehicle: {
    id: string; registrationNumber: string; vehicleType: string;
    ownerType: "owned" | "contractor"; contractorId: string | null;
    rcExpiry: string | null; insuranceExpiry: string | null;
    fitnessExpiry: string | null; pucExpiry: string | null;
    status: CheckStatus; isActive: boolean;
    rcOwnerName: string | null; rcManufacturer: string | null;
    rcVehicleClass: string | null; rcFuelType: string | null;
    rcChassisNumber: string | null; rcEngineNumber: string | null;
    rcColor: string | null; rcVerifyProvider: string | null;
  } | null;
}

export async function getDriverProfile(driverId: string): Promise<DriverProfile> {
  return api.get<DriverProfile>(`/api/v2/driver-profile?driverId=${encodeURIComponent(driverId)}`);
}

export function vehicleRegVariants(reg: string | null): string[] {
  if (!reg?.trim()) return [];
  const keys = new Set<string>();
  const up = reg.toUpperCase().trim();
  keys.add(up);
  keys.add(up.replace(/[\s\-]/g, ""));
  return [...keys];
}

export interface FgGateEvent {
  id: string;
  eventType: GateEventType;
  vehicleReg: string | null;
  vehicleRegKeys?: string[];
  personName: string | null;
  contractorId: string | null;
  contractorName: string | null;
  driverId: string | null;
  tripId: string | null;
  guardUid: string;
  guardName: string;
  time: Date;
  createdAt?: Date;
  status: "inside" | "exited" | "denied";
  warehouseId: string;
  orgId: string;
  photoUrl: string | null;
  photoStoragePath: string | null;
  overrideReason: string | null;
  overriddenByUid: string | null;
  entryEventId: string | null;
  contractorIds?: string[];
  dlNumber?: string | null;
  driverDob?: string | null;
  dlImageUrl?: string | null;
  dlVerifyData?: { provider: string; capturedAt: string; data: Record<string, unknown> } | null;
  crimeCheckData?: {
    provider: string; caseId: string; capturedAt: string;
    initiateData: Record<string, unknown>; pollData: Record<string, unknown> | null;
  } | null;
}

function mapGateEvent(e: Record<string, unknown>): FgGateEvent {
  const meta = (e.metadata ?? {}) as Record<string, unknown>;
  // contractor_id isn't a column on gate_events — the picker writes the
  // selected SP id(s) into metadata.contractorIds. Take the first one.
  const contractorIds = (meta.contractorIds as string[] | undefined) ?? [];
  const contractorIdFromMeta = contractorIds[0] ?? null;
  return {
    id:              e.id as string,
    eventType:       (e.event_type as GateEventType),
    vehicleReg:      (e.vehicle_reg as string | null) ?? null,
    vehicleRegKeys:  vehicleRegVariants(e.vehicle_reg as string | null),
    personName:      (e.person_name as string | null) ?? null,
    contractorId:    (e.contractor_id as string | null) ?? contractorIdFromMeta,
    contractorName:  (e.contractor_name as string | null) ?? null,
    driverId:        (e.driver_id as string | null) ?? null,
    tripId:          (e.trip_id as string | null) ?? null,
    guardUid:        (e.guard_id as string) ?? "",
    guardName:       (e.guard_name as string) ?? "",
    time:            e.occurred_at ? new Date(e.occurred_at as string) : new Date(),
    createdAt:       e.occurred_at ? new Date(e.occurred_at as string) : undefined,
    status:          (e.status as "inside" | "exited" | "denied") ?? "inside",
    warehouseId:     (e.warehouse_id as string) ?? "",
    orgId:           (e.org_id as string) ?? "",
    photoUrl:        (e.photo_url as string | null) ?? null,
    photoStoragePath: null,
    overrideReason:  (meta.overrideReason as string | null) ?? null,
    overriddenByUid: (meta.overriddenByUid as string | null) ?? null,
    entryEventId:    (meta.entryEventId as string | null) ?? null,
    dlNumber:        (meta.dlNumber as string | null) ?? null,
    driverDob:       (meta.driverDob as string | null) ?? null,
    dlImageUrl:      (meta.dlImageUrl as string | null) ?? null,
    dlVerifyData:    (meta.dlVerifyData as FgGateEvent["dlVerifyData"]) ?? null,
    crimeCheckData:  (meta.crimeCheckData as FgGateEvent["crimeCheckData"]) ?? null,
  };
}

export async function createGateEvent(
  data: Omit<FgGateEvent, "id">,
  idempotencyKey?: string,
): Promise<string> {
  const headers = idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined;
  const res = await api.post<{ id: string }>("/api/v2/gate-events", {
    warehouseId:    data.warehouseId,
    eventType:      data.eventType,
    vehicleReg:     data.vehicleReg,
    personName:     data.personName,
    contractorName: data.contractorName,
    tripId:         data.tripId,
    driverId:       data.driverId,
    photoUrl:       data.photoUrl,
    status:         data.status,
    metadata: {
      overrideReason:  data.overrideReason,
      overriddenByUid: data.overriddenByUid,
      entryEventId:    data.entryEventId,
      dlNumber:        data.dlNumber,
      driverDob:       data.driverDob,
      dlImageUrl:      data.dlImageUrl,
      dlVerifyData:    data.dlVerifyData,
      crimeCheckData:  data.crimeCheckData,
      contractorIds:   data.contractorIds,
    },
  }, headers);
  return res.id;
}

export async function getRecentGateEvents(warehouseId: string, maxEvents = 50): Promise<FgGateEvent[]> {
  const data = await api.get<{ events: Record<string, unknown>[] }>(
    `/api/v2/gate-events?warehouseId=${encodeURIComponent(warehouseId)}&limit=${maxEvents}`,
  );
  return data.events.map(mapGateEvent);
}

export async function getGateEventsForStats(warehouseId: string, days = 30): Promise<FgGateEvent[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const data = await api.get<{ events: Record<string, unknown>[] }>(
    `/api/v2/gate-events?warehouseId=${encodeURIComponent(warehouseId)}&since=${since.toISOString()}&limit=2000`,
  );
  return data.events.map(mapGateEvent);
}

export interface TruckFlowDay {
  dateStr: string; // YYYY-MM-DD (IST)
  label:   string; // "08 May"
  entries: number;
  exits:   number;
}

/**
 * Server-aggregated entry/exit counts per day. Replaces fetching N raw events
 * and bucketing on the client — the server returns pre-counted buckets so the
 * chart isn't capped by the gate-events row limit on busy warehouses.
 */
export async function getTruckFlow(warehouseId: string, days = 14): Promise<TruckFlowDay[]> {
  const data = await api.get<{ days: TruckFlowDay[] }>(
    `/api/v2/gate-events/flow?warehouseId=${encodeURIComponent(warehouseId)}&days=${days}`,
  );
  return data.days;
}

export async function getEntryHeatmap(
  warehouseId: string,
  days = 30,
): Promise<{ matrix: number[][] }> {
  return api.get<{ matrix: number[][] }>(
    `/api/v2/gate-events/heatmap?warehouseId=${encodeURIComponent(warehouseId)}&days=${days}`,
  );
}

export async function getActiveInside(warehouseId: string): Promise<FgGateEvent[]> {
  const data = await api.get<{ events: Record<string, unknown>[] }>(
    `/api/v2/gate-events?warehouseId=${encodeURIComponent(warehouseId)}&status=inside&limit=2000`,
  );
  return data.events.map(mapGateEvent);
}

export async function getGateEventsByTrip(tripId: string): Promise<FgGateEvent[]> {
  const data = await api.get<{ events: Record<string, unknown>[] }>(
    `/api/v2/gate-events?tripId=${encodeURIComponent(tripId)}&limit=2000`,
  );
  return data.events.map(mapGateEvent);
}

export async function getActiveEntryByVehicleReg(vehicleReg: string, warehouseId: string): Promise<FgGateEvent | null> {
  const key = vehicleReg.toUpperCase().replace(/[\s\-]/g, "");
  const data = await api.get<{ events: Record<string, unknown>[] }>(
    `/api/v2/gate-events?warehouseId=${encodeURIComponent(warehouseId)}&status=inside&limit=2000`,
  );
  const match = data.events
    .map(mapGateEvent)
    .find((e) => e.vehicleReg && vehicleRegVariants(e.vehicleReg).includes(key));
  return match ?? null;
}

export async function getVehicleEntryEvents(warehouseId: string): Promise<FgGateEvent[]> {
  const data = await api.get<{ events: Record<string, unknown>[] }>(
    `/api/v2/gate-events?warehouseId=${encodeURIComponent(warehouseId)}&eventType=contractor_entry&limit=2000`,
  );
  const seen = new Set<string>();
  const results: FgGateEvent[] = [];
  for (const e of data.events.map(mapGateEvent)) {
    if (!e.vehicleReg) continue;
    const k = e.vehicleReg.toUpperCase().replace(/[\s\-]/g, "");
    if (seen.has(k)) continue;
    seen.add(k);
    results.push(e);
  }
  return results;
}

export async function getVehicleEntryEventsByOrg(_orgId: string): Promise<FgGateEvent[]> {
  const data = await api.get<{ events: Record<string, unknown>[] }>(
    `/api/v2/gate-events?eventType=contractor_entry&limit=2000`,
  );
  const seen = new Set<string>();
  const results: FgGateEvent[] = [];
  for (const e of data.events.map(mapGateEvent)) {
    if (!e.vehicleReg) continue;
    const k = e.vehicleReg.toUpperCase().replace(/[\s\-]/g, "");
    if (seen.has(k)) continue;
    seen.add(k);
    results.push(e);
  }
  return results;
}

export async function getDriverEntryEvents(warehouseId: string): Promise<FgGateEvent[]> {
  const data = await api.get<{ events: Record<string, unknown>[] }>(
    `/api/v2/gate-events?warehouseId=${encodeURIComponent(warehouseId)}&eventType=contractor_entry&limit=2000`,
  );
  const seen = new Set<string>();
  const results: FgGateEvent[] = [];
  for (const e of data.events.map(mapGateEvent)) {
    const key = e.driverId ?? e.dlNumber ?? e.personName ?? "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    results.push(e);
  }
  return results;
}

export async function getDriverEntryEventsByOrg(_orgId: string): Promise<FgGateEvent[]> {
  const data = await api.get<{ events: Record<string, unknown>[] }>(
    `/api/v2/gate-events?eventType=contractor_entry&limit=2000`,
  );
  const seen = new Set<string>();
  const results: FgGateEvent[] = [];
  for (const e of data.events.map(mapGateEvent)) {
    const key = e.driverId ?? e.dlNumber ?? e.personName ?? "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    results.push(e);
  }
  return results;
}

export async function closeGateEvent(id: string): Promise<void> {
  await api.patch(`/api/v2/gate-events/${id}`, { status: "exited" });
}

export async function getLatestGateEventForDriver(driverId: string): Promise<FgGateEvent | null> {
  const data = await api.get<{ events: Record<string, unknown>[] }>(
    `/api/v2/gate-events?driverId=${encodeURIComponent(driverId)}&limit=20`,
  );
  const events = data.events.map(mapGateEvent).sort((a, b) => b.time.getTime() - a.time.getTime());
  return events.find((e) => e.dlVerifyData?.data) ?? null;
}

export async function getGateEventsByDriver(driverId: string, maxEvents = 100): Promise<FgGateEvent[]> {
  const data = await api.get<{ events: Record<string, unknown>[] }>(
    `/api/v2/gate-events?driverId=${encodeURIComponent(driverId)}&limit=${maxEvents}`,
  );
  return data.events.map(mapGateEvent).sort((a, b) => b.time.getTime() - a.time.getTime());
}
