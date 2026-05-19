/** Support ticket service — v2 API backed (Supabase). Same public signatures as former Firestore version. */

import { api } from "./v2/api";

export type SupportTicketStatus = "ongoing" | "in_progress" | "resolved" | "closed";

export type SupportTicketReason =
  | "missing_verification" | "suspicious_data" | "fake_documents"
  | "dl_mismatch" | "bg_concern" | "other";

export const REASON_LABELS: Record<SupportTicketReason, string> = {
  missing_verification: "Missing verification",
  suspicious_data:      "Suspicious data",
  fake_documents:       "Fake / forged documents",
  dl_mismatch:          "DL mismatch",
  bg_concern:           "Background concern",
  other:                "Other",
};

export const STATUS_LABELS: Record<SupportTicketStatus, string> = {
  ongoing:     "Ongoing",
  in_progress: "In progress",
  resolved:    "Resolved",
  closed:      "Closed",
};

export interface DriverSnapshot {
  fullName: string;
  mobile: string;
  dlNumber: string;
  dlStatus: string;
  bgStatus: string;
  facePhotoUrl: string | null;
}

export interface FgSupportTicket {
  id: string;
  driverId: string;
  driverSnapshot: DriverSnapshot;
  orgId: string;
  warehouseId: string;
  reason: SupportTicketReason;
  description: string;
  status: SupportTicketStatus;
  createdBy: string;
  createdByName: string;
  createdByRole: string;
  notifyEmail: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedBy?: string;
  resolvedByName?: string;
  resolvedAt?: Date | null;
  resolutionNote?: string;
}

function mapTicket(t: Record<string, unknown>): FgSupportTicket {
  const meta = (t.metadata ?? t.description_meta ?? {}) as Record<string, unknown>;
  const driverSnapshot: DriverSnapshot = {
    fullName:     (meta.driverFullName as string) ?? "",
    mobile:       (meta.driverMobile as string) ?? "",
    dlNumber:     (meta.driverDlNumber as string) ?? "",
    dlStatus:     (meta.driverDlStatus as string) ?? "",
    bgStatus:     (meta.driverBgStatus as string) ?? "",
    facePhotoUrl: (meta.driverPhotoUrl as string | null) ?? null,
  };
  const rawStatus = (t.status as string) ?? "ongoing";
  const status = (rawStatus === "open" ? "ongoing" : rawStatus === "in_progress" ? "in_progress" : rawStatus) as SupportTicketStatus;
  return {
    id:             t.id as string,
    driverId:       (t.raised_by as string) ?? "",
    driverSnapshot,
    orgId:          (t.org_id as string) ?? "",
    warehouseId:    (t.warehouse_id as string) ?? "",
    reason:         ((t.category as SupportTicketReason) ?? "other"),
    description:    (t.description as string) ?? "",
    status,
    createdBy:      (t.raised_by as string) ?? "",
    createdByName:  (t.raised_by_name as string) ?? "",
    createdByRole:  (t.raised_by_role as string) ?? "",
    notifyEmail:    "",
    createdAt:      t.created_at ? new Date(t.created_at as string) : new Date(),
    updatedAt:      t.updated_at ? new Date(t.updated_at as string) : new Date(),
    resolvedBy:     (t.resolved_by as string | undefined) ?? undefined,
    resolvedByName: undefined,
    resolvedAt:     t.resolved_at ? new Date(t.resolved_at as string) : null,
    resolutionNote: (t.resolution as string | undefined) ?? undefined,
  };
}

export async function getTicketById(id: string): Promise<FgSupportTicket | null> {
  const data = await api.get<{ tickets: Record<string, unknown>[] }>(`/api/v2/support-tickets?limit=2000`);
  const t = data.tickets.find((x) => x.id === id);
  return t ? mapTicket(t) : null;
}

export async function getAllTickets(): Promise<FgSupportTicket[]> {
  const data = await api.get<{ tickets: Record<string, unknown>[] }>(`/api/v2/support-tickets?limit=2000`);
  return data.tickets.map(mapTicket);
}

export async function getTicketsByOrg(_orgId: string): Promise<FgSupportTicket[]> {
  const data = await api.get<{ tickets: Record<string, unknown>[] }>(`/api/v2/support-tickets?limit=2000`);
  return data.tickets.map(mapTicket);
}

export async function getTicketsByWarehouse(warehouseId: string): Promise<FgSupportTicket[]> {
  const data = await api.get<{ tickets: Record<string, unknown>[] }>(
    `/api/v2/support-tickets?warehouseId=${encodeURIComponent(warehouseId)}&limit=2000`,
  );
  return data.tickets.map(mapTicket);
}

export async function getTicketsByWarehouses(warehouseIds: string[]): Promise<FgSupportTicket[]> {
  if (warehouseIds.length === 0) return [];
  const all = await getAllTickets();
  const set = new Set(warehouseIds);
  return all.filter((t) => set.has(t.warehouseId));
}

export async function getTicketsByDriver(driverId: string): Promise<FgSupportTicket[]> {
  const all = await getAllTickets();
  return all.filter((t) => t.driverId === driverId);
}

export const OPEN_STATUSES: SupportTicketStatus[] = ["ongoing", "in_progress"];

export function isOpenStatus(status: SupportTicketStatus): boolean {
  return OPEN_STATUSES.includes(status);
}
