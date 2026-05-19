/** Vehicle service — v2 API backed (Supabase). Same public signatures as former Firestore version. */

import { api } from "./v2/api";
import { getVehicleEntryEvents } from "./gateEventService";
import type { CheckStatus } from "../_lib/types";

export interface FgVehicle {
  id: string;
  registrationNumber: string;
  vehicleType: string;
  ownerType: "owned" | "contractor";
  contractorId: string | null;
  rcExpiry: Date | null;
  insuranceExpiry: Date | null;
  fitnessExpiry: Date | null;
  pucExpiry: Date | null;
  status: CheckStatus;
  warehouseId: string;
  orgId: string;
  isActive: boolean;
  // RC background verification (populated by /api/verify/rc at gate entry)
  rcOwnerName:      string | null;
  rcManufacturer:   string | null;
  rcVehicleClass:   string | null;
  rcFuelType:       string | null;
  rcChassisNumber:  string | null;
  rcEngineNumber:   string | null;
  rcColor:          string | null;
  rcVerifyProvider: string | null;
  rcVerifiedAt:     Date | null;
  /** Outcome of the most recent /api/verify/rc call. One of:
   *   "id_found"     — clean data was returned and stored
   *   "id_not_found" — RTO replied but the RC isn't in the registry
   *   "source_down"  — upstream RTO source was down / unavailable
   *   null           — RC verify was never attempted on this vehicle
   *  Derived from rc_verify_data.result.extraction_output.status. */
  rcVerifyStatus:   string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function normalizeReg(reg: string): string {
  return reg.replace(/[\s\-]/g, "").toUpperCase();
}

function extractRcVerifyStatus(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  // IDfy shape: { result: { extraction_output: { status: "id_found" | "id_not_found" | "source_down" } } }
  const result = r.result as Record<string, unknown> | undefined;
  const ext    = result?.extraction_output as Record<string, unknown> | undefined;
  const s      = ext?.status;
  if (typeof s === "string" && s !== "") return s;
  // Fallback: top-level "status" key (some providers / shapes)
  if (typeof r.status === "string" && r.status !== "") return r.status as string;
  return null;
}

function mapVehicle(v: Record<string, unknown>): FgVehicle {
  return {
    id:                 v.id as string,
    registrationNumber: (v.registration_number as string) ?? "",
    vehicleType:        (v.vehicle_type as string) ?? "",
    ownerType:          ((v.owner_type as string) ?? "owned") as "owned" | "contractor",
    contractorId:       (v.contractor_id as string | null) ?? null,
    rcExpiry:           v.rc_expiry        ? new Date(v.rc_expiry        as string) : null,
    insuranceExpiry:    v.insurance_expiry ? new Date(v.insurance_expiry as string) : null,
    fitnessExpiry:      v.fitness_expiry   ? new Date(v.fitness_expiry   as string) : null,
    pucExpiry:          v.puc_expiry       ? new Date(v.puc_expiry       as string) : null,
    status:             (v.status as CheckStatus) ?? "clear",
    warehouseId:        (v.warehouse_id as string) ?? "",
    orgId:              (v.org_id as string) ?? "",
    isActive:           (v.is_active ?? true) as boolean,
    rcOwnerName:      (v.rc_owner_name      as string | null) ?? null,
    rcManufacturer:   (v.rc_manufacturer    as string | null) ?? null,
    rcVehicleClass:   (v.rc_vehicle_class   as string | null) ?? null,
    rcFuelType:       (v.rc_fuel_type       as string | null) ?? null,
    rcChassisNumber:  (v.rc_chassis_number  as string | null) ?? null,
    rcEngineNumber:   (v.rc_engine_number   as string | null) ?? null,
    rcColor:          (v.rc_color           as string | null) ?? null,
    rcVerifyProvider: (v.rc_verify_provider as string | null) ?? null,
    rcVerifiedAt:     v.rc_verified_at ? new Date(v.rc_verified_at as string) : null,
    rcVerifyStatus:   extractRcVerifyStatus(v.rc_verify_data),
    createdAt:          v.created_at ? new Date(v.created_at as string) : new Date(),
    updatedAt:          v.updated_at ? new Date(v.updated_at as string) : new Date(),
  };
}

export async function getVehicleById(id: string): Promise<FgVehicle | null> {
  try {
    const data = await api.get<{ vehicle: Record<string, unknown> }>(`/api/v2/vehicles/${id}`);
    return data.vehicle ? mapVehicle(data.vehicle) : null;
  } catch { return null; }
}

export async function getVehicleByReg(registrationNumber: string): Promise<FgVehicle | null> {
  const normalized = normalizeReg(registrationNumber);
  const data = await api.get<{ vehicles: Record<string, unknown>[] }>(`/api/v2/vehicles?q=${encodeURIComponent(normalized)}&limit=10`);
  const match = data.vehicles.find((v) => normalizeReg((v.registration_number as string) ?? "") === normalized);
  return match ? mapVehicle(match) : null;
}

export async function getVehiclesByWarehouse(warehouseId: string): Promise<FgVehicle[]> {
  // Vehicles aren't pinned to a warehouse in the schema. Visibility for a
  // warehouse = vehicles that have entered it at least once. Matches the
  // wh_manager / regional_manager scoping expectation.
  if (!warehouseId) return [];
  const [vehiclesData, entryEvents] = await Promise.all([
    api.get<{ vehicles: Record<string, unknown>[] }>(`/api/v2/vehicles?limit=2000`),
    getVehicleEntryEvents(warehouseId),
  ]);
  const regs = new Set<string>();
  for (const ev of entryEvents) {
    if (ev.vehicleReg) regs.add(normalizeReg(ev.vehicleReg));
  }
  return vehiclesData.vehicles
    .filter((v) => regs.has(normalizeReg((v.registration_number as string) ?? "")))
    .map(mapVehicle);
}

export async function getVehiclesByOrg(_orgId: string): Promise<FgVehicle[]> {
  const data = await api.get<{ vehicles: Record<string, unknown>[] }>(`/api/v2/vehicles?limit=2000`);
  return data.vehicles.map(mapVehicle);
}

export async function getVehiclesByContractor(contractorId: string): Promise<FgVehicle[]> {
  const data = await api.get<{ vehicles: Record<string, unknown>[] }>(`/api/v2/vehicles?limit=2000`);
  return data.vehicles
    .filter((v) => (v.contractor_id as string) === contractorId)
    .map(mapVehicle);
}

export async function createVehicle(data: Omit<FgVehicle, "id" | "createdAt" | "updatedAt">): Promise<string> {
  // Local-date YYYY-MM-DD. `toISOString()` would shift IST midnight back to the previous UTC day.
  const isoDate = (d: Date | null): string | null => {
    if (!d) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const res = await api.post<{ id: string }>("/api/v2/vehicles", {
    registrationNumber: data.registrationNumber,
    vehicleType:        data.vehicleType,
    ownerType:          data.ownerType,
    contractorId:       data.contractorId,
    rcExpiry:           isoDate(data.rcExpiry),
    insuranceExpiry:    isoDate(data.insuranceExpiry),
    fitnessExpiry:      isoDate(data.fitnessExpiry),
    pucExpiry:          isoDate(data.pucExpiry),
  });
  return res.id;
}

export async function updateVehicleStatus(id: string, status: CheckStatus): Promise<void> {
  await api.patch(`/api/v2/vehicles/${id}`, { status });
}

export async function deactivateVehicle(id: string): Promise<void> {
  await api.patch(`/api/v2/vehicles/${id}`, { isActive: false });
}

export async function updateVehicleContractor(
  id: string,
  contractorId: string | null,
  ownerType: "owned" | "contractor",
): Promise<void> {
  await api.patch(`/api/v2/vehicles/${id}`, { contractorId, ownerType });
}

export async function updateVehicleRcBackground(
  id: string,
  data: import("./rcVerifyService").RcBackgroundData,
): Promise<void> {
  await api.patch(`/api/v2/vehicles/${id}`, data);
}
