/**
 * Organisation service — v2 API backed (Supabase).
 * Same public signatures as the former Firestore version.
 */

import { api } from "./v2/api";

export interface FgOrganisation {
  id:             string;
  name:           string;
  plan:           string;
  isActive:       boolean;
  userCount:      number;
  warehouseCount: number;
  createdAt:      string;
  updatedAt:      string;
  shortCode:      string | null;
  contactName:    string | null;
  contactEmail:   string | null;
  contactPhone:   string | null;
  address:        string | null;
  city:           string | null;
  state:          string | null;
}

export interface AdminStats {
  totalOrgs:       number;
  totalUsers:      number;
  totalWarehouses: number;
  totalTrips:      number;
  totalDealers:    number;
}

function mapOrg(o: Record<string, unknown>): FgOrganisation {
  return {
    id:             o.id as string,
    name:           o.name as string,
    plan:           (o.plan as string) ?? "standard",
    isActive:       (o.is_active ?? true) as boolean,
    userCount:      Number(o.user_count ?? 0),
    warehouseCount: Number(o.warehouse_count ?? 0),
    createdAt:      o.created_at as string,
    updatedAt:      (o.updated_at as string) ?? (o.created_at as string),
    shortCode:      (o.short_code    as string | null) ?? null,
    contactName:    (o.contact_name  as string | null) ?? null,
    contactEmail:   (o.contact_email as string | null) ?? null,
    contactPhone:   (o.contact_phone as string | null) ?? null,
    address:        (o.address       as string | null) ?? null,
    city:           (o.city          as string | null) ?? null,
    state:          (o.state         as string | null) ?? null,
  };
}

export async function getOrganisations(): Promise<FgOrganisation[]> {
  const data = await api.get<{ orgs: Record<string, unknown>[] }>("/api/v2/orgs");
  return data.orgs.map(mapOrg);
}

export async function getOrganisationById(id: string): Promise<FgOrganisation | null> {
  try {
    const data = await api.get<{ org: Record<string, unknown> }>(`/api/v2/orgs/${id}`);
    return data.org ? mapOrg(data.org) : null;
  } catch {
    return null;
  }
}

export async function createOrganisation(data: {
  name: string;
  plan?: string;
  shortCode?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  city?: string;
  state?: string;
  isActive?: boolean;
}): Promise<string> {
  const res = await api.post<{ id: string }>("/api/v2/orgs", data);
  return res.id;
}

export async function updateOrganisation(
  id: string,
  data: Partial<{
    name: string; plan: string; isActive: boolean;
    shortCode: string | null; contactName: string | null; contactEmail: string | null;
    contactPhone: string | null; address: string | null; city: string | null; state: string | null;
  }>,
): Promise<void> {
  await api.patch(`/api/v2/orgs/${id}`, data);
}

export async function getAdminStats(): Promise<AdminStats> {
  // /api/v2/orgs aggregates active counts per org in sub-selects — see the
  // route handler. Trips are excluded for now (would need a separate join /
  // index path that the SQL above doesn't pay for); the dashboard doesn't
  // surface this number anyway.
  const data = await api.get<{ orgs: Record<string, unknown>[] }>("/api/v2/orgs");
  return {
    totalOrgs:       data.orgs.length,
    totalUsers:      data.orgs.reduce((s, o) => s + Number(o.user_count ?? 0), 0),
    totalWarehouses: data.orgs.reduce((s, o) => s + Number(o.warehouse_count ?? 0), 0),
    totalDealers:    data.orgs.reduce((s, o) => s + Number(o.dealer_count ?? 0), 0),
    totalTrips:      0,
  };
}
