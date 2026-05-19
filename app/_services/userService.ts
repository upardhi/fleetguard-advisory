/** User service — v2 API backed (Supabase). Same public signatures as former Firestore version. */

import { api } from "./v2/api";
import type { UserRole } from "../_lib/types";

export interface FgUser {
  uid:          string;
  email:        string;
  displayName:  string;
  role:         UserRole;
  warehouseId:  string;
  warehouseIds?: string[];
  orgId:        string;
  isActive:     boolean;
  createdAt:    string;
  updatedAt:    string;
}

function mapUser(u: Record<string, unknown>): FgUser {
  return {
    uid:          (u.id ?? u.uid) as string,
    email:        u.email as string,
    displayName:  (u.full_name ?? u.displayName) as string,
    role:         ((u.role === "superadmin" ? "super_admin" : u.role) as UserRole),
    warehouseId:  (u.warehouse_id ?? u.warehouseId ?? "") as string,
    warehouseIds: (u.warehouse_ids ?? u.warehouseIds ?? []) as string[],
    orgId:        (u.org_id ?? u.orgId ?? "") as string,
    isActive:     (u.is_active ?? u.isActive ?? true) as boolean,
    createdAt:    (u.created_at ?? u.createdAt ?? "") as string,
    updatedAt:    (u.updated_at ?? u.updatedAt ?? "") as string,
  };
}

export async function getUserById(uid: string): Promise<FgUser | null> {
  try {
    const data = await api.get<{ user: Record<string, unknown> }>(`/api/v2/users/${uid}`);
    return data.user ? mapUser(data.user) : null;
  } catch {
    return null;
  }
}

export async function getUsersByOrg(orgId: string): Promise<FgUser[]> {
  const data = await api.get<{ users: Record<string, unknown>[] }>(
    `/api/v2/users?limit=2000&orgId=${encodeURIComponent(orgId)}`,
  );
  return data.users.map(mapUser);
}

export async function getUsersByWarehouse(warehouseId: string): Promise<FgUser[]> {
  const data = await api.get<{ users: Record<string, unknown>[] }>(`/api/v2/users?limit=2000`);
  return data.users.filter((u) => (u.warehouse_id as string) === warehouseId).map(mapUser);
}

export async function getWhManagerForWarehouse(warehouseId: string): Promise<FgUser | null> {
  const data = await api.get<{ users: Record<string, unknown>[] }>(`/api/v2/users?limit=2000`);
  const mgr = data.users.find((u) => u.warehouse_id === warehouseId && u.role === "wh_manager");
  return mgr ? mapUser(mgr) : null;
}

export async function createUser(uid: string, data: Omit<FgUser, "uid" | "createdAt" | "updatedAt"> & { password?: string }): Promise<void> {
  await api.post("/api/v2/users", {
    email:       data.email,
    password:    data.password ?? "TempPass@1234",
    fullName:    data.displayName,
    role:        data.role === "super_admin" ? "superadmin" : data.role,
    warehouseId: data.warehouseId,
  });
}

export async function createUserRecord(data: Omit<FgUser, "uid" | "createdAt" | "updatedAt"> & { password?: string }): Promise<string> {
  const res = await api.post<{ id: string }>("/api/v2/users", {
    email:       data.email,
    password:    data.password ?? "TempPass@1234",
    fullName:    data.displayName,
    role:        data.role === "super_admin" ? "superadmin" : data.role,
    warehouseId: data.warehouseId,
  });
  return res.id;
}

export async function updateUserWarehouse(uid: string, warehouseId: string): Promise<void> {
  await api.patch(`/api/v2/users/${uid}`, { warehouseId });
}

export async function updateUser(uid: string, data: Partial<Omit<FgUser, "uid" | "createdAt" | "updatedAt">>): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (data.displayName   !== undefined) payload.fullName     = data.displayName;
  if (data.warehouseId   !== undefined) payload.warehouseId  = data.warehouseId;
  if (data.warehouseIds  !== undefined) payload.warehouseIds = data.warehouseIds;
  if (data.isActive      !== undefined) payload.isActive     = data.isActive;
  if (data.role          !== undefined) payload.role         = data.role === "super_admin" ? "superadmin" : data.role;
  await api.patch(`/api/v2/users/${uid}`, payload);
}

export async function deactivateUser(uid: string): Promise<void> {
  await api.patch(`/api/v2/users/${uid}`, { isActive: false });
}
