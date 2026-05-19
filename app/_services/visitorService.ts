/** Visitor service — v2 API backed (Supabase). Same public signatures as former Firestore version. */

import { api } from "./v2/api";

export interface FgVisitorEntry {
  id: string;
  visitorType: string;
  fullName: string;
  idType: string | null;
  idNumber: string | null;
  meetingPerson: string | null;
  department: string | null;
  description: string | null;
  passNumber: string;
  vehicleNumber: string | null;
  entryTime: Date;
  expectedExit: Date | null;
  exitTime: Date | null;
  status: "inside" | "exited";
  warehouseId: string;
  orgId: string;
  guardUid: string;
  photoUrl: string | null;
  photoStoragePath: string | null;
  exitPhotoUrl: string | null;
  identityMismatch: boolean;
}

function mapVisitor(v: Record<string, unknown>): FgVisitorEntry {
  return {
    id:               v.id as string,
    visitorType:      (v.visitor_type as string) ?? "visitor",
    fullName:         (v.full_name as string) ?? "",
    idType:           (v.id_type as string | null) ?? null,
    idNumber:         (v.id_number as string | null) ?? null,
    meetingPerson:    (v.host_name as string | null) ?? null,
    department:       (v.department as string | null) ?? null,
    description:      (v.purpose as string | null) ?? null,
    passNumber:       (v.pass_number as string) ?? "",
    vehicleNumber:    (v.vehicle_number as string | null) ?? null,
    entryTime:        v.entry_time ? new Date(v.entry_time as string) : new Date(),
    expectedExit:     v.expected_exit ? new Date(v.expected_exit as string) : null,
    exitTime:         v.exit_time ? new Date(v.exit_time as string) : null,
    status:           (v.status as "inside" | "exited") ?? "inside",
    warehouseId:      (v.warehouse_id as string) ?? "",
    orgId:            (v.org_id as string) ?? "",
    guardUid:         (v.guard_id as string) ?? "",
    photoUrl:         (v.photo_url as string | null) ?? null,
    photoStoragePath: null,
    exitPhotoUrl:     null,
    identityMismatch: false,
  };
}

export async function getVisitorById(id: string): Promise<FgVisitorEntry | null> {
  const data = await api.get<{ visitors: Record<string, unknown>[] }>(`/api/v2/visitors?limit=2000`);
  const v = data.visitors.find((x) => x.id === id);
  return v ? mapVisitor(v) : null;
}

export async function getActiveVisitors(warehouseId: string): Promise<FgVisitorEntry[]> {
  const data = await api.get<{ visitors: Record<string, unknown>[] }>(
    `/api/v2/visitors?warehouseId=${encodeURIComponent(warehouseId)}&status=inside&limit=2000`,
  );
  return data.visitors.map(mapVisitor);
}

export async function getVisitorLog(warehouseId: string, maxEntries = 50): Promise<FgVisitorEntry[]> {
  const data = await api.get<{ visitors: Record<string, unknown>[] }>(
    `/api/v2/visitors?warehouseId=${encodeURIComponent(warehouseId)}&limit=${maxEntries}`,
  );
  return data.visitors.map(mapVisitor);
}

export async function createVisitorEntry(data: Omit<FgVisitorEntry, "id">): Promise<string> {
  const res = await api.post<{ id: string }>("/api/v2/visitors", {
    warehouseId:   data.warehouseId,
    visitorType:   data.visitorType,
    fullName:      data.fullName,
    hostName:      data.meetingPerson ?? "",
    purpose:       data.description ?? "",
    passNumber:    data.passNumber,
    vehicleNumber: data.vehicleNumber ?? undefined,
    expectedExit:  data.expectedExit?.toISOString() ?? undefined,
    photoUrl:      data.photoUrl ?? undefined,
    idType:        data.idType ?? undefined,
    idNumber:      data.idNumber ?? undefined,
    department:    data.department ?? undefined,
  });
  return res.id;
}

export async function checkOutVisitor(
  id: string,
  _opts: { exitPhotoUrl?: string | null; identityMismatch?: boolean } = {},
): Promise<void> {
  await api.patch(`/api/v2/visitors/${id}`, { status: "exited" });
}
