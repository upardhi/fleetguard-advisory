import { api } from "./api";

export interface ContractorV2 {
  id:             string;
  name:           string;
  contactName:    string;
  contactMobile:  string;
  contractStart:  string | null;
  contractEnd:    string | null;
  isActive:       boolean;
  activeDrivers:  number;
  activeVehicles: number;
  createdAt:      string;
}

export async function getContractors(params?: {
  limit?: number; offset?: number;
}): Promise<{ contractors: ContractorV2[]; limit: number; offset: number }> {
  const q = new URLSearchParams();
  if (params?.limit  != null)  q.set("limit",  String(params.limit));
  if (params?.offset != null)  q.set("offset", String(params.offset));
  const data = await api.get<{ contractors: Record<string, unknown>[]; limit: number; offset: number }>(
    `/api/v2/contractors?${q}`
  );
  return {
    contractors: data.contractors.map(mapContractor),
    limit:       data.limit,
    offset:      data.offset,
  };
}

export async function createContractor(body: {
  name: string; contactName: string; contactMobile: string;
  contractStart?: string; contractEnd?: string;
}): Promise<{ id: string }> {
  return api.post("/api/v2/contractors", body);
}

function mapContractor(c: Record<string, unknown>): ContractorV2 {
  return {
    id:             c.id as string,
    name:           c.name as string,
    contactName:    c.contact_name as string,
    contactMobile:  c.contact_mobile as string,
    contractStart:  (c.contract_start as string | null) ?? null,
    contractEnd:    (c.contract_end as string | null) ?? null,
    isActive:       (c.is_active ?? true) as boolean,
    activeDrivers:  Number(c.active_drivers ?? 0),
    activeVehicles: Number(c.active_vehicles ?? 0),
    createdAt:      c.created_at as string,
  };
}
