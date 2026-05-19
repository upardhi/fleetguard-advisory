import { api } from "./api";

export interface DriverV2 {
  id:           string;
  fullName:     string;
  mobile:       string;
  dlNumber:     string;
  dlExpiry:     string;
  dlStatus:     string;
  bgStatus:     string;
  facePhotoUrl: string | null;
  contractorId: string | null;
  isActive:     boolean;
  createdAt:    string;
}

export async function getDrivers(params?: {
  search?: string; status?: string; limit?: number; offset?: number;
}): Promise<{ drivers: DriverV2[]; limit: number; offset: number }> {
  const q = new URLSearchParams();
  if (params?.search)          q.set("search",  params.search);
  if (params?.status)          q.set("status",  params.status);
  if (params?.limit  != null)  q.set("limit",   String(params.limit));
  if (params?.offset != null)  q.set("offset",  String(params.offset));
  const data = await api.get<{ drivers: Record<string, unknown>[]; limit: number; offset: number }>(
    `/api/v2/drivers?${q}`
  );
  return {
    drivers: data.drivers.map(mapDriver),
    limit:   data.limit,
    offset:  data.offset,
  };
}

export async function getDriverById(id: string): Promise<DriverV2 | null> {
  const data = await api.get<{ driver: Record<string, unknown> | null }>(`/api/v2/drivers/${id}`);
  return data.driver ? mapDriver(data.driver) : null;
}

export async function createDriver(body: {
  fullName: string; mobile: string; dlNumber: string; dlExpiry: string;
  contractorId?: string; facePhotoUrl?: string;
}): Promise<{ id: string }> {
  return api.post("/api/v2/drivers", body);
}

export async function updateDriver(id: string, body: Partial<{
  fullName: string; mobile: string; dlNumber: string; dlExpiry: string;
  bgStatus: string; facePhotoUrl: string; isActive: boolean;
}>): Promise<void> {
  await api.patch(`/api/v2/drivers/${id}`, body);
}

function mapDriver(d: Record<string, unknown>): DriverV2 {
  return {
    id:           d.id as string,
    fullName:     d.full_name as string,
    mobile:       d.mobile as string,
    dlNumber:     d.dl_number as string,
    dlExpiry:     d.dl_expiry as string,
    dlStatus:     d.dl_status as string,
    bgStatus:     d.bg_status as string,
    facePhotoUrl: (d.face_photo_url as string | null) ?? null,
    contractorId: (d.contractor_id as string | null) ?? null,
    isActive:     (d.is_active ?? true) as boolean,
    createdAt:    d.created_at as string,
  };
}
