/** Contractor service — v2 API backed (Supabase). */

import { api } from "./v2/api";

export interface FgContractor {
  id:             string;
  orgId:          string;
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

function mapC(c: Record<string, unknown>): FgContractor {
  return {
    id:             c.id as string,
    orgId:          (c.org_id as string) ?? "",
    name:           c.name as string,
    contactName:    (c.contact_name ?? "") as string,
    contactMobile:  (c.contact_mobile ?? "") as string,
    contractStart:  (c.contract_start as string | null) ?? null,
    contractEnd:    (c.contract_end as string | null) ?? null,
    isActive:       (c.is_active ?? true) as boolean,
    activeDrivers:  Number(c.active_drivers ?? 0),
    activeVehicles: Number(c.active_vehicles ?? 0),
    createdAt:      c.created_at as string,
  };
}

export async function getContractorsByOrg(_orgId: string): Promise<FgContractor[]> {
  const data = await api.get<{ contractors: Record<string, unknown>[] }>("/api/v2/contractors?limit=2000");
  return data.contractors.map(mapC);
}

export async function getContractorById(id: string): Promise<FgContractor | null> {
  const data = await api.get<{ contractors: Record<string, unknown>[] }>("/api/v2/contractors?limit=2000");
  const c = data.contractors.find((x) => x.id === id);
  return c ? mapC(c) : null;
}

export async function createContractor(data: {
  orgId: string; name: string; contactName: string; contactMobile: string;
  contractStart?: string; contractEnd?: string;
}): Promise<string> {
  const res = await api.post<{ id: string }>("/api/v2/contractors", data);
  return res.id;
}

export async function updateContractor(id: string, data: Partial<FgContractor>): Promise<void> {
  await api.patch(`/api/v2/contractors`, { id, ...data });
}

export async function deactivateContractor(id: string): Promise<void> {
  await api.patch(`/api/v2/contractors`, { id, isActive: false });
}
