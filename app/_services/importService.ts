/**
 * FleetGuard — Import Service
 *
 * Imports external `driver-verification-v3` documents (from legacy / third-party
 * systems) into FleetGuard collections:
 *   - fg_drivers   (upsert by DL number)
 *   - fg_vehicles  (upsert by registration number)
 *   - fg_gate_events (entry + exit pair when inOutStatus === "out")
 *
 * The caller must supply orgId, warehouseId, and a system guard identity
 * (guardUid / guardName) to stamp the gate events.
 */

import { getDriverByDl, createDriver, updateDriverBgStatus } from "./driverService";
import { getVehicleByReg, createVehicle, normalizeReg } from "./vehicleService";
import { createGateEvent, closeGateEvent } from "./gateEventService";
import { translateCrimeCheckResponse } from "./crimeCheckService";
import type { CheckStatus, BGStatus } from "../_lib/types";

// ── External document shape ───────────────────────────────────────────────────

/**
 * Minimal shape of a `driver-verification-v3` Firestore document from the
 * legacy / third-party ingestion pipeline (docu-fast or equivalent).
 * Only fields that ImportService reads are declared here.
 */
export interface DriverVerificationV3Doc {
  type?: string;

  // Driver identity
  driverName?: string;
  name?: string; // fallback
  dlNumber?: string;
  licenseNo?: string; // fallback
  fatherName?: string;
  driverPhotoUrl?: string | null;
  photoUrl?: string | null; // fallback

  // Vehicle
  vehicleReg?: string;
  vehicleNumber?: string; // fallback

  // Service provider — external system ID (NOT the FleetGuard doc ID)
  contractorId?: string;
  serviceProviderId?: string;
  contractorName?: string;
  serviceProviderName?: string;

  // Timestamps — Firestore-exported seconds or ISO-8601 string
  createdAt?:
    | { _seconds: number; _nanoseconds?: number }
    | { seconds: number; nanoseconds?: number }
    | string
    | null;
  outTime?: string | null;
  inOutStatus?: "in" | "out";

  // DL verification
  licenseStatus?: string; // "valid" | "expired" | "invalid" | …
  dlVerifyData?: Record<string, unknown>;

  // Signzy crime-check data
  signzyCompleted?: boolean;
  signzyTotalCases?: number;
  signzyCaseId?: string;
  caseId?: string;
  /** Raw poll response — the `cases` field may be object OR array */
  signzyResultResponse?: Record<string, unknown>;
  /** Richer transformed results with caseDetails[] */
  signzyTransformedResult?: Record<string, unknown>;

  // Allow any other fields — we ignore them
  [key: string]: unknown;
}

// ── Import params ─────────────────────────────────────────────────────────────

export interface ImportParams {
  orgId: string;
  warehouseId: string;
  /** UID to stamp as the "guard" who recorded the gate events */
  guardUid: string;
  /** Display name to stamp as the "guard" who recorded the gate events */
  guardName: string;
}

// ── Result ────────────────────────────────────────────────────────────────────

export interface ImportResult {
  driverId: string;
  vehicleId: string | null;
  entryEventId: string;
  exitEventId: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseTimestamp(
  ts:
    | { _seconds: number; _nanoseconds?: number }
    | { seconds: number; nanoseconds?: number }
    | string
    | null
    | undefined
): Date {
  if (!ts) return new Date();
  if (typeof ts === "string") return new Date(ts);
  // Firestore-exported JSON uses either _seconds or seconds
  const secs = ("_seconds" in ts ? ts._seconds : ts.seconds) ?? 0;
  return new Date(secs * 1000);
}

function dlStatusFromLicenseStatus(licenseStatus: string | undefined): CheckStatus {
  const s = (licenseStatus ?? "").toLowerCase();
  if (s === "valid") return "clear";
  if (s.includes("expired")) return "expired";
  if (s.includes("inconclusive") || s.includes("pending")) return "expiring";
  if (!s) return "clear"; // unknown → optimistic
  return "blocked";
}

function bgStatusFromSignzy(doc: DriverVerificationV3Doc): BGStatus {
  // Only "flagged" or "clear" — never leave the driver record in "pending"
  if (!doc.signzyCompleted) return "clear";
  const total = Number(doc.signzyTotalCases ?? doc.signzyResultResponse?.total ?? 0);
  return total > 0 ? "flagged" : "clear";
}

// ── Main import function ──────────────────────────────────────────────────────

/**
 * Import a single `driver-verification-v3` document into FleetGuard.
 *
 * Steps:
 *  1. Upsert driver (by DL number)
 *  2. Upsert vehicle (by registration number) — if vehicleReg is present
 *  3. Create entry gate event with full DL + crime-check snapshots
 *  4. If `inOutStatus === "out"`, close entry + create exit gate event
 */
export async function importDriverVerification(
  externalDoc: DriverVerificationV3Doc,
  params: ImportParams
): Promise<ImportResult> {
  const { orgId, warehouseId, guardUid, guardName } = params;

  // ── 1. Resolve field values ─────────────────────────────────────────────────

  const fullName = (externalDoc.driverName ?? externalDoc.name ?? "Unknown Driver").trim();
  const dlNumber = (externalDoc.dlNumber ?? externalDoc.licenseNo ?? "").trim();
  const vehicleReg = (externalDoc.vehicleReg ?? externalDoc.vehicleNumber ?? "").trim();
  const photoUrl = externalDoc.driverPhotoUrl ?? externalDoc.photoUrl ?? null;

  const contractorId = externalDoc.contractorId ?? externalDoc.serviceProviderId ?? null;
  const contractorName =
    externalDoc.contractorName ?? externalDoc.serviceProviderName ?? null;

  const entryTime = parseTimestamp(externalDoc.createdAt);
  const exitTime = externalDoc.outTime ? new Date(externalDoc.outTime) : null;
  const isOut = externalDoc.inOutStatus === "out";

  const dlStatus = dlStatusFromLicenseStatus(externalDoc.licenseStatus);
  const bgStatus = bgStatusFromSignzy(externalDoc);

  // Parse a rough DL expiry — signzy data doesn't always include it;
  // default to 5 years from now if not found.
  const farFuture = new Date();
  farFuture.setFullYear(farFuture.getFullYear() + 5);
  const dlExpiry = farFuture;

  // ── 2. Upsert driver ────────────────────────────────────────────────────────

  let driverId: string;
  if (dlNumber) {
    const existing = await getDriverByDl(dlNumber);
    if (existing) {
      driverId = existing.id;
      // Update BG status if crime check completed
      if (externalDoc.signzyCompleted) {
        await updateDriverBgStatus(existing.id, bgStatus);
      }
    } else {
      driverId = await createDriver({
        fullName,
        mobile:               "",
        dob:                  null,
        dlNumber,
        dlNumberDisplay:      null,
        dlExpiry,
        dlStatus,
        dlInvalidReason:      null, // recomputed inside createDriver
        dlGender:             null,
        dlFatherName:         null,
        dlAddress:            null,
        dlState:              null,
        dlIssuingRto:         null,
        dlClassOfVehicles:    null,
        dlHasTransport:       false,
        dlTransportValidFrom:    null,
        dlTransportValidTo:      null,
        dlNonTransportValidFrom: null,
        dlNonTransportValidTo:   null,
        dlHazardousValidTill:    null,
        dlHillValidTill:         null,
        dlDateOfIssue:        null,
        dlApiStatus:          null,
        dlVerifyProvider:     null,
        dlVerifiedAt:         null,
        dlVerifyData:         null,
        bgStatus,
        crimeCheckedAt:           null,
        crimeProvider:            null,
        crimeCheckId:             null,
        crimeTotalCases:          0,
        crimeActiveCases:         0,
        crimeDisposedCases:       0,
        crimeCriminalCases:       0,
        crimeCivilCases:          0,
        crimeActiveCriminalCases: 0,
        crimeActiveCivilCases:    0,
        crimeOtherCases:          0,
        crimeCases:               [],
        crimeRawPollData:         null,
        serviceProviderId:   contractorId,
        serviceProviderName: contractorName,
        facePhotoUrl:         photoUrl,
        facePhotoStoragePath: null,
        warehouseId,
        orgId,
        isActive:             true,
      });
    }
  } else {
    // No DL — create without one (edge case)
    driverId = await createDriver({
      fullName,
      mobile:               "",
      dob:                  null,
      dlNumber:             "",
      dlNumberDisplay:      null,
      dlExpiry,
      dlStatus:             "clear",
      dlInvalidReason:      null,
      dlGender:             null,
      dlFatherName:         null,
      dlAddress:            null,
      dlState:              null,
      dlIssuingRto:         null,
      dlClassOfVehicles:    null,
      dlHasTransport:       false,
      dlTransportValidFrom:    null,
      dlTransportValidTo:      null,
      dlNonTransportValidFrom: null,
      dlNonTransportValidTo:   null,
      dlHazardousValidTill:    null,
      dlHillValidTill:         null,
      dlDateOfIssue:        null,
      dlApiStatus:          null,
      dlVerifyProvider:     null,
      dlVerifiedAt:         null,
      dlVerifyData:         null,
      bgStatus,
      crimeCheckedAt:           null,
      crimeProvider:            null,
      crimeCheckId:             null,
      crimeTotalCases:          0,
      crimeActiveCases:         0,
      crimeDisposedCases:       0,
      crimeCriminalCases:       0,
      crimeCivilCases:          0,
      crimeActiveCriminalCases: 0,
      crimeActiveCivilCases:    0,
      crimeOtherCases:          0,
      crimeCases:               [],
      crimeRawPollData:         null,
      serviceProviderId:   contractorId,
      serviceProviderName: contractorName,
      facePhotoUrl:         photoUrl,
      facePhotoStoragePath: null,
      warehouseId,
      orgId,
      isActive:             true,
    });
  }

  // ── 3. Upsert vehicle ───────────────────────────────────────────────────────

  let vehicleId: string | null = null;
  if (vehicleReg) {
    const existingVehicle = await getVehicleByReg(vehicleReg);
    if (existingVehicle) {
      vehicleId = existingVehicle.id;
    } else {
      vehicleId = await createVehicle({
        registrationNumber: normalizeReg(vehicleReg),
        vehicleType: "truck",
        ownerType: contractorId ? "contractor" : "owned",
        contractorId,
        rcExpiry: farFuture,
        insuranceExpiry: farFuture,
        fitnessExpiry: farFuture,
        pucExpiry: farFuture,
        status: "clear",
        warehouseId,
        orgId,
        isActive: true,
        rcOwnerName: null,
        rcManufacturer: null,
        rcVehicleClass: null,
        rcFuelType: null,
        rcChassisNumber: null,
        rcEngineNumber: null,
        rcColor: null,
        rcVerifyProvider: null,
        rcVerifiedAt: null,
        rcVerifyStatus: null,
      });
    }
  }

  // ── 4. Build crime-check snapshot for gate event ────────────────────────────

  let crimeCheckData: {
    provider: string;
    caseId: string;
    capturedAt: string;
    initiateData: Record<string, unknown>;
    pollData: Record<string, unknown> | null;
  } | null = null;

  if (externalDoc.signzyResultResponse || externalDoc.signzyCompleted) {
    // Merge signzyResultResponse + signzyTransformedResult so the stored
    // pollData is as rich as possible for the UI translator.
    const pollData: Record<string, unknown> = {
      ...(externalDoc.signzyResultResponse ?? {}),
      signzyTransformedResult: externalDoc.signzyTransformedResult ?? null,
      signzyTotalCases: externalDoc.signzyTotalCases ?? 0,
    };

    crimeCheckData = {
      provider: "signzy",
      caseId: String(externalDoc.signzyCaseId ?? externalDoc.caseId ?? "imported"),
      capturedAt: entryTime.toISOString(),
      initiateData: {},
      pollData,
    };
  }

  // ── 5. Build DL-verify snapshot ─────────────────────────────────────────────

  const dlVerifyData: {
    provider: string;
    capturedAt: string;
    data: Record<string, unknown>;
  } | null = externalDoc.dlVerifyData
    ? {
        provider: "signzy",
        capturedAt: entryTime.toISOString(),
        data: externalDoc.dlVerifyData,
      }
    : null;

  // ── 6. Create entry gate event ──────────────────────────────────────────────

  const entryEventId = await createGateEvent({
    eventType: "contractor_entry",
    vehicleReg: vehicleReg || null,
    personName: fullName,
    contractorId,
    contractorName,
    contractorIds: contractorId ? [contractorId] : [],
    driverId,
    tripId: null,
    guardUid,
    guardName,
    time: entryTime,
    // If vehicle has already exited we'll close this below; set "inside" for now
    status: "inside",
    warehouseId,
    orgId,
    photoUrl: photoUrl,
    photoStoragePath: null,
    overrideReason: null,
    overriddenByUid: null,
    entryEventId: null,
    dlVerifyData,
    crimeCheckData,
  });

  // ── 7. Close entry + create exit if vehicle already exited ─────────────────

  let exitEventId: string | null = null;
  if (isOut && exitTime) {
    await closeGateEvent(entryEventId);

    exitEventId = await createGateEvent({
      eventType: "contractor_exit",
      vehicleReg: vehicleReg || null,
      personName: fullName,
      contractorId,
      contractorName,
      contractorIds: contractorId ? [contractorId] : [],
      driverId,
      tripId: null,
      guardUid,
      guardName,
      time: exitTime,
      status: "exited",
      warehouseId,
      orgId,
      photoUrl: null,
      photoStoragePath: null,
      overrideReason: null,
      overriddenByUid: null,
      entryEventId,
      dlVerifyData: null,
      crimeCheckData: null,
    });
  }

  return { driverId, vehicleId, entryEventId, exitEventId };
}
