/** Driver service — v2 API backed (Supabase). Same public signatures as former Firestore version. */

import { api } from "./v2/api";
import { getDriverEntryEvents } from "./gateEventService";
import type { CheckStatus, BGStatus } from "../_lib/types";
import { computeDlInvalidReason, type DlInvalidReason } from "../_lib/dlCompliance";
import type { DriverCrimeProfile, NormalizedCrimeCase } from "../_lib/crimeCompliance";

export interface FgDriver {
  id: string;
  fullName: string;
  mobile: string;
  dob: string | null;
  dlNumber: string;
  dlNumberDisplay: string | null;
  dlExpiry: Date;
  dlStatus: CheckStatus;
  dlInvalidReason: DlInvalidReason;
  dlGender: string | null;
  dlFatherName: string | null;
  dlAddress: string | null;
  dlState: string | null;
  dlIssuingRto: string | null;
  dlClassOfVehicles: string[] | null;
  dlHasTransport: boolean;
  dlTransportValidFrom: string | null;
  dlTransportValidTo: string | null;
  dlNonTransportValidFrom: string | null;
  dlNonTransportValidTo: string | null;
  dlHazardousValidTill: string | null;
  dlHillValidTill: string | null;
  dlDateOfIssue: string | null;
  dlApiStatus: string | null;
  dlVerifyProvider: string | null;
  dlVerifiedAt: Date | null;
  dlVerifyData: { provider: string; capturedAt: string; data: Record<string, unknown> } | null;
  bgStatus: BGStatus;
  crimeCheckedAt: string | null;
  crimeProvider: string | null;
  crimeCheckId: string | null;
  crimeTotalCases: number;
  crimeActiveCases: number;
  crimeDisposedCases: number;
  crimeCriminalCases: number;
  crimeCivilCases: number;
  crimeActiveCriminalCases: number;
  crimeActiveCivilCases: number;
  crimeOtherCases: number;
  crimeCases: NormalizedCrimeCase[];
  crimeRawPollData: Record<string, unknown> | null;
  facePhotoUrl: string | null;
  facePhotoStoragePath: string | null;
  warehouseId: string;
  orgId: string;
  isActive: boolean;
  registeredAt: Date;
  updatedAt: Date;
  serviceProviderId: string | null;
  serviceProviderName: string | null;
  underCrossVerification?: boolean;
  openTicketCount?: number;
}

export interface DlDetailsPayload {
  dlNumber: string;
  dlNumberDisplay?: string | null;
  dob?: string | null;
  dlExpiry: Date;
  dlStatus: CheckStatus;
  dlGender?: string | null;
  dlFatherName?: string | null;
  dlAddress?: string | null;
  dlState?: string | null;
  dlIssuingRto?: string | null;
  dlClassOfVehicles?: string[] | null;
  dlHasTransport: boolean;
  dlTransportValidFrom?: string | null;
  dlTransportValidTo?: string | null;
  dlNonTransportValidFrom?: string | null;
  dlNonTransportValidTo?: string | null;
  dlHazardousValidTill?: string | null;
  dlHillValidTill?: string | null;
  dlDateOfIssue?: string | null;
  dlApiStatus?: string | null;
  dlVerifyProvider?: string | null;
  dlVerifiedAt?: Date | null;
  dlVerifyData?: { provider: string; capturedAt: string; data: Record<string, unknown> } | null;
}

function mapDriver(d: Record<string, unknown>): FgDriver {
  const dlExpiry = d.dl_expiry ? new Date(d.dl_expiry as string) : new Date(2099, 0, 1);
  const dlStatus = (d.dl_status as CheckStatus) ?? "clear";
  return {
    id:                      d.id as string,
    fullName:                (d.full_name as string) ?? "",
    mobile:                  (d.mobile as string) ?? "",
    dob:                     null,
    dlNumber:                (d.dl_number as string) ?? "",
    dlNumberDisplay:         (d.dl_number as string) ?? null,
    dlExpiry,
    dlStatus,
    dlInvalidReason:         computeDlInvalidReason({ dlNumber: (d.dl_number as string) ?? "", dlHasTransport: false, dlClassOfVehicles: null, dlApiStatus: null, dlVerifyProvider: null, dlStatus }),
    dlGender:                null,
    dlFatherName:            null,
    dlAddress:               null,
    dlState:                 null,
    dlIssuingRto:            null,
    dlClassOfVehicles:       null,
    dlHasTransport:          false,
    dlTransportValidFrom:    null,
    dlTransportValidTo:      null,
    dlNonTransportValidFrom: null,
    dlNonTransportValidTo:   null,
    dlHazardousValidTill:    null,
    dlHillValidTill:         null,
    dlDateOfIssue:           null,
    dlApiStatus:             null,
    dlVerifyProvider:        null,
    dlVerifiedAt:            null,
    dlVerifyData:            null,
    bgStatus:                (d.bg_status as BGStatus) ?? "pending",
    crimeCheckedAt:          null,
    crimeProvider:           null,
    crimeCheckId:            null,
    crimeTotalCases:         0,
    crimeActiveCases:        0,
    crimeDisposedCases:      0,
    crimeCriminalCases:      0,
    crimeCivilCases:         0,
    crimeActiveCriminalCases: 0,
    crimeActiveCivilCases:   0,
    crimeOtherCases:         0,
    crimeCases:              [],
    crimeRawPollData:        null,
    facePhotoUrl:            (d.face_photo_url as string | null) ?? null,
    facePhotoStoragePath:    null,
    warehouseId:             (d.warehouse_id as string) ?? "",
    orgId:                   (d.org_id as string) ?? "",
    isActive:                (d.is_active ?? true) as boolean,
    registeredAt:            d.registered_at ? new Date(d.registered_at as string) : new Date(),
    updatedAt:               d.updated_at ? new Date(d.updated_at as string) : new Date(),
    serviceProviderId:       (d.contractor_id as string | null) ?? null,
    serviceProviderName:     null,
  };
}

export async function getDriverById(id: string): Promise<FgDriver | null> {
  try {
    const data = await api.get<{ driver: Record<string, unknown> }>(`/api/v2/drivers/${id}`);
    return data.driver ? mapDriver(data.driver) : null;
  } catch { return null; }
}

export async function getDriverByDl(dlNumber: string): Promise<FgDriver | null> {
  const data = await api.get<{ drivers: Record<string, unknown>[] }>(`/api/v2/drivers?limit=2000`);
  const normalized = dlNumber.toUpperCase().replace(/[-\s]/g, "");
  const match = data.drivers.find((d) => {
    const dn = ((d.dl_number as string) ?? "").toUpperCase().replace(/[-\s]/g, "");
    return dn === normalized;
  });
  return match ? mapDriver(match) : null;
}

export async function getDriversByWarehouse(warehouseId: string): Promise<FgDriver[]> {
  // Drivers aren't pinned to a warehouse in the schema (a driver can deliver
  // to several). Visibility for a warehouse = drivers who have entered it at
  // least once. This is what wh_manager / regional_manager scope expects.
  if (!warehouseId) return [];
  const [driversData, entryEvents] = await Promise.all([
    api.get<{ drivers: Record<string, unknown>[] }>(`/api/v2/drivers?limit=2000`),
    getDriverEntryEvents(warehouseId),
  ]);
  const driverIds = new Set<string>();
  const dlKeys    = new Set<string>();
  for (const ev of entryEvents) {
    if (ev.driverId) driverIds.add(ev.driverId);
    if (ev.dlNumber) dlKeys.add(ev.dlNumber.replace(/[\s-]/g, "").toUpperCase());
  }
  return driversData.drivers
    .filter((d) => {
      if (driverIds.has(d.id as string)) return true;
      const dn = ((d.dl_number as string) ?? "").replace(/[\s-]/g, "").toUpperCase();
      return dn !== "" && dlKeys.has(dn);
    })
    .map(mapDriver);
}

export async function getDriversByOrg(_orgId: string): Promise<FgDriver[]> {
  const data = await api.get<{ drivers: Record<string, unknown>[] }>(`/api/v2/drivers?limit=2000`);
  return data.drivers.map(mapDriver);
}

export async function getExpiringDrivers(warehouseId: string, withinDays: number): Promise<FgDriver[]> {
  const drivers = await getDriversByWarehouse(warehouseId);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);
  return drivers.filter((d) => d.dlExpiry <= cutoff);
}

// Local-date YYYY-MM-DD. `toISOString()` would shift IST midnight back to the previous UTC day.
function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function createDriver(data: Omit<FgDriver, "id" | "registeredAt" | "updatedAt">): Promise<string> {
  const res = await api.post<{ id: string }>("/api/v2/drivers", {
    fullName:      data.fullName,
    dlNumber:      data.dlNumber,
    dlExpiry:      toYmd(data.dlExpiry),
    contractorId:  data.serviceProviderId ?? undefined,
    facePhotoUrl:  data.facePhotoUrl ?? undefined,
    bgStatus:      data.bgStatus ?? undefined,
  });
  return res.id;
}

export async function updateDriverDlDetails(id: string, dl: DlDetailsPayload): Promise<void> {
  await api.patch(`/api/v2/drivers/${id}`, {
    dlExpiry: toYmd(dl.dlExpiry),
  });
}

export async function updateDriverCrimeProfile(
  id: string,
  profile: DriverCrimeProfile,
  _rawPollData: Record<string, unknown> | null,
): Promise<void> {
  // Crime profile detail columns aren't in the drivers table yet — but bg_status
  // is, so reflect the latest crime check there: 0 cases → clear, otherwise → flagged.
  const bgStatus: BGStatus = profile.totalCases === 0 ? "clear" : "flagged";
  await api.patch(`/api/v2/drivers/${id}`, { bgStatus });
}

export async function updateDriverServiceProvider(
  id: string,
  serviceProviderId: string | null,
  _serviceProviderName: string | null,
): Promise<void> {
  await api.patch(`/api/v2/drivers/${id}`, { contractorId: serviceProviderId });
}

export async function updateDriverDlStatus(id: string, _dlStatus: CheckStatus, dlExpiry?: Date): Promise<void> {
  await api.patch(`/api/v2/drivers/${id}`, {
    ...(dlExpiry ? { dlExpiry: toYmd(dlExpiry) } : {}),
  });
}

export async function updateDriverBgStatus(id: string, bgStatus: BGStatus): Promise<void> {
  await api.patch(`/api/v2/drivers/${id}`, { bgStatus });
}

export async function updateDriverFacePhoto(id: string, facePhotoUrl: string, _path: string): Promise<void> {
  await api.patch(`/api/v2/drivers/${id}`, { facePhotoUrl });
}

export async function deactivateDriver(id: string): Promise<void> {
  await api.patch(`/api/v2/drivers/${id}`, { isActive: false });
}

export async function searchDriversByDlPrefix(prefix: string, maxResults = 6): Promise<FgDriver[]> {
  const upper = prefix.toUpperCase().replace(/[-\s]/g, "");
  if (!upper) return [];
  const data = await api.get<{ drivers: Record<string, unknown>[] }>(`/api/v2/drivers?q=${encodeURIComponent(upper)}&limit=${maxResults}`);
  return data.drivers.map(mapDriver);
}
