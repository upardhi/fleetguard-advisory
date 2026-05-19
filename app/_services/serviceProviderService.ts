/**
 * Service provider service — v2 API backed (Supabase).
 * Service providers map to contractors in the Supabase schema.
 * Same public signatures preserved for drop-in compatibility.
 */

import { api } from "./v2/api";

export type ServiceProviderType = "security" | "cleaning" | "maintenance" | "it" | "catering" | "logistics" | "other" | "transport" | "fuel" | "loading";
export type ServiceProviderStatus = "pending" | "reviewed" | "approved" | "rejected";

export interface FgServiceProvider {
  id:            string;
  orgId:         string;
  name:          string;
  type:          ServiceProviderType;
  contactName:   string;
  contactMobile: string;
  contractEnd:   string | null;
  status:        ServiceProviderStatus;
  isActive:      boolean;
  warehouseIds:  string[];
  warehouseId:   string | null;
  createdAt:     string;
  // Legacy fields — null/empty in Supabase model, kept for page compatibility
  code:          string | null;
  contactPhone:  string | null;
  contactEmail:  string | null;
  address:       string | null;
  city:          string | null;
  state:         string | null;
  notes:         string | null;
  createdByUid:  string | null;
  createdByRole: string | null;
  reviewedByUid: string | null;
  approvedByUid: string | null;
  rejectedByUid: string | null;
  reviewedAt:    string | null;
  approvedAt:    string | null;
  rejectedAt:    string | null;
  rejectionReason: string | null;
}

function mapSP(c: Record<string, unknown>): FgServiceProvider {
  const warehouseId = (c.warehouse_id as string | null) ?? null;
  const status = ((c.status as string | null) ?? "approved") as ServiceProviderStatus;
  const reviewedAt = (c.reviewed_at as string | null) ?? null;
  return {
    id:             c.id as string,
    orgId:          (c.org_id as string) ?? "",
    name:           c.name as string,
    type:           ((c.type as string | null) ?? "other") as ServiceProviderType,
    contactName:    (c.contact_name ?? "") as string,
    contactMobile:  (c.contact_mobile ?? "") as string,
    contractEnd:    null,
    status,
    isActive:       (c.is_active ?? true) as boolean,
    warehouseIds:   warehouseId ? [warehouseId] : [],
    warehouseId,
    createdAt:      c.created_at as string,
    code:           (c.code as string | null) ?? null,
    contactPhone:   (c.contact_mobile as string | null) ?? null,
    contactEmail:   (c.contact_email as string | null) ?? null,
    address:        (c.address as string | null) ?? null,
    city:           (c.city as string | null) ?? null,
    state:          (c.state as string | null) ?? null,
    notes:          null,
    createdByUid:   (c.created_by_uid as string | null) ?? null,
    createdByRole:  null,
    reviewedByUid:  (c.reviewed_by as string | null) ?? null,
    approvedByUid:  status === "approved" ? ((c.reviewed_by as string | null) ?? null) : null,
    rejectedByUid:  status === "rejected" ? ((c.reviewed_by as string | null) ?? null) : null,
    reviewedAt,
    approvedAt:     status === "approved" ? reviewedAt : null,
    rejectedAt:     status === "rejected" ? reviewedAt : null,
    rejectionReason: (c.reject_reason as string | null) ?? null,
  };
}

export async function getServiceProvidersByOrg(orgId: string): Promise<FgServiceProvider[]> {
  const data = await api.get<{ contractors: Record<string, unknown>[] }>(
    `/api/v2/contractors?limit=2000&orgId=${encodeURIComponent(orgId)}`,
  );
  return data.contractors.map(mapSP);
}

/**
 * Typeahead search for the gate entry contractor picker.
 * Fetches at most 20 results scoped to the warehouse — called on each
 * keystroke, not on page mount.
 */
export async function searchServiceProviders(
  query: string,
  warehouseId: string,
  orgId?: string,
): Promise<FgServiceProvider[]> {
  const params = new URLSearchParams({ limit: "20", warehouseId });
  if (query.trim()) params.set("q", query.trim());
  if (orgId)        params.set("orgId", orgId);
  const data = await api.get<{ contractors: Record<string, unknown>[] }>(
    `/api/v2/contractors?${params}`,
  );
  return data.contractors.map(mapSP);
}

/** @deprecated Use searchServiceProviders (typeahead) instead of loading 500 records up front. */
export async function getServiceProvidersForGate(warehouseId: string, orgId: string): Promise<FgServiceProvider[]> {
  return searchServiceProviders("", warehouseId, orgId);
}

export async function getPendingServiceProviders(_orgId: string): Promise<FgServiceProvider[]> {
  return []; // Status concept doesn't apply in Supabase model
}

export async function getServiceProviderById(id: string): Promise<FgServiceProvider | null> {
  try {
    const data = await api.get<{ contractor: Record<string, unknown> }>(`/api/v2/contractors/${id}`);
    return data.contractor ? mapSP(data.contractor) : null;
  } catch {
    return null;
  }
}

export async function createServiceProvider(
  data: Partial<FgServiceProvider> & { orgId: string; name: string; notifyManager?: boolean },
): Promise<string> {
  const res = await api.post<{ id: string }>("/api/v2/contractors", {
    name:          data.name,
    code:          data.code ?? undefined,
    type:          data.type ?? undefined,
    contactName:   data.contactName ?? "",
    contactPhone:  data.contactPhone ?? data.contactMobile ?? "",
    contactEmail:  data.contactEmail ?? undefined,
    address:       data.address ?? undefined,
    city:          data.city ?? undefined,
    state:         data.state ?? undefined,
    warehouseId:   data.warehouseId ?? undefined,
    isActive:      data.isActive ?? undefined,
    orgId:         data.orgId,
    notifyManager: data.notifyManager,
  });
  return res.id;
}

export async function updateServiceProvider(id: string, data: Partial<FgServiceProvider>): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (data.name         !== undefined) payload.name         = data.name;
  if (data.code         !== undefined) payload.code         = data.code;
  if (data.type         !== undefined) payload.type         = data.type;
  if (data.contactName  !== undefined) payload.contactName  = data.contactName;
  if (data.contactPhone !== undefined) payload.contactPhone = data.contactPhone;
  if (data.contactEmail !== undefined) payload.contactEmail = data.contactEmail;
  if (data.address      !== undefined) payload.address      = data.address;
  if (data.city         !== undefined) payload.city         = data.city;
  if (data.state        !== undefined) payload.state        = data.state;
  if (data.warehouseId  !== undefined) payload.warehouseId  = data.warehouseId;
  if (data.isActive     !== undefined) payload.isActive     = data.isActive;
  if (Object.keys(payload).length === 0) return;
  await api.patch(`/api/v2/contractors/${id}`, payload);
}

export async function deactivateServiceProvider(id: string): Promise<void> {
  await api.patch(`/api/v2/contractors/${id}`, { isActive: false });
}

export async function deleteServiceProvider(id: string): Promise<void> {
  await deactivateServiceProvider(id);
}

export async function activateServiceProvider(id: string): Promise<void> {
  await api.patch(`/api/v2/contractors/${id}`, { isActive: true });
}

// Review is currently a no-op — the Supabase model has only pending/approved/
// rejected, no intermediate "reviewed" stage. Kept as a no-op for compatibility
// with the older Firestore-era drawer flow.
export async function reviewServiceProvider(_id: string, _reviewerUid: string): Promise<void> { /* no-op */ }

export async function approveServiceProvider(id: string, _approverUid: string): Promise<void> {
  await api.patch(`/api/v2/contractors/${id}`, { status: "approved" });
}

export async function rejectServiceProvider(id: string, _rejectorUid: string, reason?: string): Promise<void> {
  await api.patch(`/api/v2/contractors/${id}`, {
    status: "rejected",
    rejectReason: reason ?? null,
  });
}

export function getSpPermissions(_user: unknown): { canApprove: boolean; canReject: boolean; canCreate: boolean } {
  return { canApprove: true, canReject: true, canCreate: true };
}
