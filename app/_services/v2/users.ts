import { api } from "./api";

export interface UserV2 {
  id:          string;
  email:       string;
  fullName:    string;
  role:        string;
  warehouseId: string | null;
  isActive:    boolean;
  createdAt:   string;
}

export async function getUsers(params?: {
  limit?: number; offset?: number;
}): Promise<{ users: UserV2[]; limit: number; offset: number }> {
  const q = new URLSearchParams();
  if (params?.limit  != null)  q.set("limit",  String(params.limit));
  if (params?.offset != null)  q.set("offset", String(params.offset));
  const data = await api.get<{ users: Record<string, unknown>[]; limit: number; offset: number }>(
    `/api/v2/users?${q}`
  );
  return {
    users: data.users.map(mapUser),
    limit: data.limit,
    offset: data.offset,
  };
}

export async function createUser(body: {
  email: string; password: string; fullName: string; role: string; warehouseId?: string;
}): Promise<{ id: string }> {
  return api.post("/api/v2/users", body);
}

function mapUser(u: Record<string, unknown>): UserV2 {
  return {
    id:          u.id as string,
    email:       u.email as string,
    fullName:    u.full_name as string,
    role:        u.role as string,
    warehouseId: (u.warehouse_id as string | null) ?? null,
    isActive:    (u.is_active ?? true) as boolean,
    createdAt:   u.created_at as string,
  };
}
