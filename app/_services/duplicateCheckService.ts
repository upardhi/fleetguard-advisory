/** Duplicate entry detection — uses /api/v2/inside-check (targeted DB query). */

import { api } from "./v2/api";
import type { FgGateEvent } from "./gateEventService";
import type { FgVisitorEntry } from "./visitorService";

interface InsideCheckResponse {
  vehicleConflict: {
    conflictEventId: string;
    vehicleReg:      string;
    personName:      string | null;
    occurredAt:      string;
  } | null;
  driverConflict: {
    conflictEventId: string;
    personName:      string | null;
    driverId:        string | null;
    occurredAt:      string;
  } | null;
}

// Single call — checks both vehicle and driver in one round trip.
export async function checkInsideStatus(
  warehouseId: string,
  vehicleReg: string | null,
  dlNumber: string | null,
): Promise<InsideCheckResponse> {
  try {
    const params = new URLSearchParams({ warehouseId });
    if (vehicleReg) params.set("vehicleReg", vehicleReg.toUpperCase().replace(/[\s\-]/g, ""));
    if (dlNumber)   params.set("dlNumber",   dlNumber.toUpperCase().replace(/[\s\-]/g, ""));
    return await api.get<InsideCheckResponse>(`/api/v2/inside-check?${params}`);
  } catch {
    return { vehicleConflict: null, driverConflict: null };
  }
}

// Kept for backward compat with handleVerify in truck-entry (calls these individually).
export async function checkVehicleAlreadyInside(
  vehicleReg: string,
  warehouseId: string,
): Promise<FgGateEvent | null> {
  const { vehicleConflict } = await checkInsideStatus(warehouseId, vehicleReg, null);
  if (!vehicleConflict) return null;
  return stubGateEvent(vehicleConflict.conflictEventId, vehicleConflict.vehicleReg, vehicleConflict.personName, warehouseId);
}

export async function checkDriverAlreadyInside(
  dlNumber: string,
  warehouseId: string,
): Promise<FgGateEvent | null> {
  const { driverConflict } = await checkInsideStatus(warehouseId, null, dlNumber);
  if (!driverConflict) return null;
  return stubGateEvent(driverConflict.conflictEventId, null, driverConflict.personName, warehouseId);
}

function stubGateEvent(
  id: string,
  vehicleReg: string | null,
  personName: string | null,
  warehouseId: string,
): FgGateEvent {
  return {
    id,
    eventType:       "contractor_entry",
    vehicleReg,
    personName,
    contractorId:    null,
    contractorName:  null,
    driverId:        null,
    tripId:          null,
    guardUid:        "",
    guardName:       "",
    time:            new Date(),
    status:          "inside",
    warehouseId,
    orgId:           "",
    photoUrl:        null,
    photoStoragePath: null,
    overrideReason:  null,
    overriddenByUid: null,
    entryEventId:    null,
  };
}

export async function checkVisitorAlreadyCheckedIn(
  idNumber: string,
  warehouseId: string,
): Promise<FgVisitorEntry | null> {
  const raw = idNumber.trim();
  if (!raw) return null;
  try {
    const data = await api.get<{ visitors: Record<string, unknown>[] }>(
      `/api/v2/visitors?warehouseId=${encodeURIComponent(warehouseId)}&status=inside&limit=2000`,
    );
    const upper = raw.toUpperCase();
    const match = data.visitors.find((v) => {
      const id = ((v.id_number as string) ?? "").trim();
      return id === raw || id.toUpperCase() === upper;
    });
    if (!match) return null;
    return {
      id:               match.id as string,
      visitorType:      (match.visitor_type as string) ?? "visitor",
      fullName:         (match.full_name as string) ?? "",
      idType:           null,
      idNumber:         raw,
      meetingPerson:    (match.host_name as string | null) ?? null,
      department:       null,
      description:      (match.purpose as string | null) ?? null,
      passNumber:       (match.pass_number as string) ?? "",
      vehicleNumber:    (match.vehicle_number as string | null) ?? null,
      entryTime:        match.entry_time ? new Date(match.entry_time as string) : new Date(),
      expectedExit:     match.expected_exit ? new Date(match.expected_exit as string) : null,
      exitTime:         null,
      status:           "inside",
      warehouseId:      (match.warehouse_id as string) ?? "",
      orgId:            (match.org_id as string) ?? "",
      guardUid:         (match.guard_id as string) ?? "",
      photoUrl:         (match.photo_url as string | null) ?? null,
      photoStoragePath: null,
      exitPhotoUrl:     null,
      identityMismatch: false,
    } as FgVisitorEntry;
  } catch { return null; }
}

export async function countRecentDuplicateAlerts(
  _entityId: string,
  _windowMinutes: number,
): Promise<number> {
  return 0;
}

export interface RecordDuplicateAttemptParams {
  alertType:       "duplicate_vehicle_entry" | "duplicate_driver_entry" | "duplicate_visitor_entry";
  entityType:      "vehicle" | "driver" | "visitor";
  entityId:        string;
  conflictEventId: string;
  warehouseId:     string;
  warehouseName:   string;
  guardUid:        string;
  guardName:       string;
  prevCount:       number;
}

export async function recordDuplicateAttempt(
  params: RecordDuplicateAttemptParams,
): Promise<number> {
  const newCount = params.prevCount + 1;
  try {
    await api.post("/api/v2/alerts", {
      type:        params.alertType,
      severity:    newCount >= 3 ? "critical" : "warning",
      message:     `Duplicate entry attempt #${newCount} for ${params.entityType} ${params.entityId}. Already inside (event: ${params.conflictEventId}).`,
      warehouseId: params.warehouseId,
      entityType:  params.entityType,
      entityId:    params.entityId,
    });
  } catch { /* non-critical */ }
  return newCount;
}
