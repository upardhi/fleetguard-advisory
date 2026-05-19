import { api } from "./api";

export interface VehicleV2 {
  id:                 string;
  registrationNumber: string;
  vehicleType:        string;
  ownerType:          "owned" | "contractor";
  contractorId:       string | null;
  rcExpiry:           string;
  insuranceExpiry:    string;
  fitnessExpiry:      string;
  pucExpiry:          string;
  status:             string;
  isActive:           boolean;
  createdAt:          string;
}

export async function getVehicles(params?: {
  search?: string; status?: string; limit?: number; offset?: number;
}): Promise<{ vehicles: VehicleV2[]; limit: number; offset: number }> {
  const q = new URLSearchParams();
  if (params?.search)          q.set("search",  params.search);
  if (params?.status)          q.set("status",  params.status);
  if (params?.limit  != null)  q.set("limit",   String(params.limit));
  if (params?.offset != null)  q.set("offset",  String(params.offset));
  const data = await api.get<{ vehicles: Record<string, unknown>[]; limit: number; offset: number }>(
    `/api/v2/vehicles?${q}`
  );
  return {
    vehicles: data.vehicles.map(mapVehicle),
    limit:    data.limit,
    offset:   data.offset,
  };
}

export async function createVehicle(body: {
  registrationNumber: string; vehicleType: string; ownerType: string;
  contractorId?: string; rcExpiry: string; insuranceExpiry: string;
  fitnessExpiry: string; pucExpiry: string;
}): Promise<{ id: string }> {
  return api.post("/api/v2/vehicles", body);
}

function mapVehicle(v: Record<string, unknown>): VehicleV2 {
  return {
    id:                 v.id as string,
    registrationNumber: v.registration_number as string,
    vehicleType:        v.vehicle_type as string,
    ownerType:          v.owner_type as "owned" | "contractor",
    contractorId:       (v.contractor_id as string | null) ?? null,
    rcExpiry:           v.rc_expiry as string,
    insuranceExpiry:    v.insurance_expiry as string,
    fitnessExpiry:      v.fitness_expiry as string,
    pucExpiry:          v.puc_expiry as string,
    status:             v.status as string,
    isActive:           (v.is_active ?? true) as boolean,
    createdAt:          v.created_at as string,
  };
}
