/** Dealer service — v2 API backed (Supabase). Same public signatures as former Firestore version. */

import { api } from "./v2/api";

export interface FgDealer {
  id: string;
  name: string;
  code: string;
  contactName: string;
  contactPhone: string;
  address: string;
  city: string;
  state: string;
  pinCode: string;
  orgId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function mapDealer(d: Record<string, unknown>): FgDealer {
  return {
    id:           d.id as string,
    name:         (d.name as string) ?? "",
    code:         (d.code as string) ?? "",
    contactName:  (d.contact_name as string) ?? "",
    contactPhone: (d.mobile as string) ?? "",
    address:      (d.address as string) ?? "",
    city:         (d.city as string) ?? "",
    state:        (d.state as string) ?? "",
    pinCode:      (d.pin_code as string) ?? "",
    orgId:        (d.org_id as string) ?? "",
    isActive:     (d.is_active ?? true) as boolean,
    createdAt:    d.created_at ? new Date(d.created_at as string) : new Date(),
    updatedAt:    d.updated_at ? new Date(d.updated_at as string) : new Date(),
  };
}

export async function getDealersByOrg(orgId: string): Promise<FgDealer[]> {
  const data = await api.get<{ dealers: Record<string, unknown>[] }>(
    `/api/v2/dealers?limit=2000&orgId=${encodeURIComponent(orgId)}`,
  );
  return data.dealers.map(mapDealer);
}

export async function getDealerById(id: string): Promise<FgDealer | null> {
  try {
    const data = await api.get<{ dealer: Record<string, unknown> }>(`/api/v2/dealers/${id}`);
    return data.dealer ? mapDealer(data.dealer) : null;
  } catch {
    return null;
  }
}

export async function createDealer(
  data: Omit<FgDealer, "id" | "createdAt" | "updatedAt"> & { orgId: string },
): Promise<string> {
  const res = await api.post<{ id: string }>("/api/v2/dealers", {
    name:        data.name,
    code:        data.code || undefined,
    contactName: data.contactName,
    mobile:      data.contactPhone,
    city:        data.city,
    state:       data.state,
    address:     data.address,
    pinCode:     data.pinCode || undefined,
    isActive:    data.isActive,
    orgId:       data.orgId,
  });
  return res.id;
}

export async function updateDealer(
  id: string,
  data: Partial<Omit<FgDealer, "id" | "orgId" | "createdAt" | "updatedAt">>,
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (data.name         !== undefined) payload.name         = data.name;
  if (data.code         !== undefined) payload.code         = data.code;
  if (data.contactName  !== undefined) payload.contactName  = data.contactName;
  if (data.contactPhone !== undefined) payload.mobile       = data.contactPhone;
  if (data.city         !== undefined) payload.city         = data.city;
  if (data.state        !== undefined) payload.state        = data.state;
  if (data.address      !== undefined) payload.address      = data.address;
  if (data.pinCode      !== undefined) payload.pinCode      = data.pinCode;
  if (data.isActive     !== undefined) payload.isActive     = data.isActive;
  if (Object.keys(payload).length === 0) return;
  await api.patch(`/api/v2/dealers/${id}`, payload);
}

export async function deactivateDealer(id: string): Promise<void> {
  await api.patch(`/api/v2/dealers/${id}`, { isActive: false });
}
