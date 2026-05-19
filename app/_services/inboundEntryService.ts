/** Inbound entry service — v2 API backed (Supabase). Same public signatures as former Firestore version. */

import { api } from "./v2/api";

export type InboundStatus = "unloading" | "completed" | "rejected";

export interface FgInboundEntry {
  id: string;
  vehicleReg: string;
  driverName: string;
  driverMobile: string;
  supplierName: string;
  poNumber: string;
  invoiceCount: number;
  status: InboundStatus;
  entryTime: Date;
  exitTime: Date | null;
  warehouseId: string;
  orgId: string;
  guardUid: string;
  photoUrl: string | null;
  notes: string | null;
}

function mapInbound(e: Record<string, unknown>): FgInboundEntry {
  return {
    id:           e.id as string,
    vehicleReg:   (e.vehicle_reg as string) ?? "",
    driverName:   (e.driver_name as string) ?? "",
    driverMobile: "",
    supplierName: (e.supplier_name as string) ?? "",
    poNumber:     (e.invoice_number as string) ?? "",
    invoiceCount: 1,
    status:       (e.status as InboundStatus) ?? "unloading",
    entryTime:    e.entry_time ? new Date(e.entry_time as string) : new Date(),
    exitTime:     e.exit_time ? new Date(e.exit_time as string) : null,
    warehouseId:  (e.warehouse_id as string) ?? "",
    orgId:        (e.org_id as string) ?? "",
    guardUid:     (e.guard_id as string) ?? "",
    photoUrl:     null,
    notes:        (e.notes as string | null) ?? null,
  };
}

export async function getInboundEntryById(id: string): Promise<FgInboundEntry | null> {
  const data = await api.get<{ entries: Record<string, unknown>[] }>(`/api/v2/inbound-entries?limit=2000`);
  const e = data.entries.find((x) => x.id === id);
  return e ? mapInbound(e) : null;
}

export async function getActiveInboundEntries(warehouseId: string): Promise<FgInboundEntry[]> {
  const data = await api.get<{ entries: Record<string, unknown>[] }>(
    `/api/v2/inbound-entries?warehouseId=${encodeURIComponent(warehouseId)}&status=unloading&limit=2000`,
  );
  return data.entries.map(mapInbound);
}

export async function getInboundLog(warehouseId: string, maxEntries = 50): Promise<FgInboundEntry[]> {
  const data = await api.get<{ entries: Record<string, unknown>[] }>(
    `/api/v2/inbound-entries?warehouseId=${encodeURIComponent(warehouseId)}&limit=${maxEntries}`,
  );
  return data.entries.map(mapInbound);
}

export async function createInboundEntry(data: Omit<FgInboundEntry, "id">): Promise<string> {
  const res = await api.post<{ id: string }>("/api/v2/inbound-entries", {
    warehouseId:   data.warehouseId,
    vehicleReg:    data.vehicleReg,
    driverName:    data.driverName,
    purpose:       "inbound",
    supplierName:  data.supplierName,
    invoiceNumber: data.poNumber,
    notes:         data.notes,
  });
  return res.id;
}

export async function completeInboundEntry(id: string, status: "completed" | "rejected" = "completed"): Promise<void> {
  await api.patch(`/api/v2/inbound-entries/${id}`, { status });
}
