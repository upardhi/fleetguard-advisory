/**
 * Client-side helper for the unified gate entry endpoint.
 * Packages verify results + form data into one POST — replaces the
 * ~10 sequential client→server round trips that used to happen in handleConfirmEntry.
 */

import { api } from "./v2/api";
import type { DlVerifyBundle } from "./dlVerifyService";
import type { RcVerifyBundle } from "./rcVerifyService";
import type { FgServiceProvider } from "./serviceProviderService";

type CrimeCheckStep = "initiating" | "waiting" | "polling" | "done" | "error";

interface CrimeCheckState {
  step:        CrimeCheckStep;
  provider?:   string;
  caseId?:     string;
  rawInitiate?: Record<string, unknown>;
  rawPoll?:    Record<string, unknown>;
  total?:      number;
  cases?:      Array<Record<string, unknown>>;
  message?:    string;
}

export interface GateEntryPayload {
  // Form inputs
  warehouseId:         string;
  vehicleReg:          string | null;
  contractorIds:       string[];
  contractorName:      string | null;
  overrideReason:      string | null;

  // Verify results (computed client-side during handleVerify)
  dlBundle:            DlVerifyBundle;
  rcBundle:            RcVerifyBundle | null;
  crimeCheck:          CrimeCheckState;

  // Pre-resolved IDs — skip redundant DB lookups on the server
  driverId:            string | null;
  vehicleId:           string | null;

  // Photos (already uploaded to storage, URL strings)
  photoUrl:            string | null;   // driver selfie
  dlImageUrl:          string | null;   // DL photo

  // Idempotency — generate once, re-use on retry
  idempotencyKey?:     string;
}

export interface GateEntryResult {
  eventId:       string;
  driverId:      string;
  vehicleId:     string | null;
  warehouseName: string;
}

export async function submitGateEntry(payload: GateEntryPayload): Promise<GateEntryResult> {
  const { dlBundle, rcBundle, crimeCheck } = payload;
  const n = dlBundle.normalized;
  const v = dlBundle.validation;

  // Count active criminal cases — used for alert severity on the server.
  const activeCriminal = (crimeCheck.cases ?? []).filter(
    (c) =>
      (c.caseCategory === "criminal" || c.category === "criminal") &&
      (c.caseStatus ?? c.status ?? "").toString().toLowerCase().includes("active"),
  ).length;

  const body = {
    idempotencyKey: payload.idempotencyKey ?? null,
    warehouseId:    payload.warehouseId,

    // Pre-resolved IDs — server skips redundant DL/reg lookups when set
    driverId:  payload.driverId ?? null,
    vehicleId: payload.vehicleId ?? null,

    // Driver / DL
    dlNumber:           n.dlNumber || "",
    dlNumberDisplay:    n.dlNumber || null,
    driverName:         n.name?.trim() || "Unverified driver",
    facePhotoUrl:       n.photo?.startsWith("blob:") ? null : (n.photo || null),
    dlImageUrl:         payload.dlImageUrl,

    // DL validation
    dlValidationStatus:   v.status,
    dlValidationLabel:    v.label,
    dlValidationBlocking: v.blocking,
    dlProvider:           dlBundle.provider,
    dlVerifyData:         dlBundle.provider !== "none"
      ? { provider: dlBundle.provider, capturedAt: new Date().toISOString(), data: dlBundle.raw }
      : null,

    // DL validity dates
    dlTransportValidTo:      n.validity.transport.to      || null,
    dlTransportValidFrom:    n.validity.transport.from    || null,
    dlNonTransportValidTo:   n.validity.nonTransport.to   || null,
    dlNonTransportValidFrom: n.validity.nonTransport.from || null,

    // Crime check
    crimeStep:           crimeCheck.step,
    crimeProvider:       crimeCheck.step !== "error" ? (crimeCheck.provider ?? null) : null,
    crimeCaseId:         crimeCheck.step !== "error" ? (crimeCheck.caseId   ?? null) : null,
    crimeTotal:          crimeCheck.step === "done"  ? (crimeCheck.total    ?? 0)    : 0,
    crimeActiveCriminal: crimeCheck.step === "done"  ? activeCriminal                : 0,
    crimeCheckedAt:      crimeCheck.step === "done" ? new Date().toISOString() : null,
    // Persist raw vendor payloads so cached-driver views render cases without
    // re-polling. pollData is sent ONLY when the poll actually returned data.
    crimeInitiateData:   crimeCheck.step !== "error" ? (crimeCheck.rawInitiate ?? null) : null,
    crimePollData:       crimeCheck.step === "done"  ? (crimeCheck.rawPoll     ?? null) : null,

    // Vehicle
    vehicleReg:      payload.vehicleReg?.trim().toUpperCase() || null,
    vehicleType:     rcBundle?.normalized.vehicleClass ?? null,
    rcExpiry:        isoFromRc(rcBundle?.normalized.rcExpiry),
    insuranceExpiry: isoFromRc(rcBundle?.normalized.insuranceExpiry),
    fitnessExpiry:   isoFromRc(rcBundle?.normalized.fitnessExpiry),
    pucExpiry:       isoFromRc(rcBundle?.normalized.pucExpiry),
    rcOwnerName:     rcBundle?.normalized.ownerName      ?? null,
    rcManufacturer:  rcBundle?.normalized.manufacturer   ?? null,
    rcVehicleClass:  rcBundle?.normalized.vehicleClass   ?? null,
    rcVerifyProvider: rcBundle?.provider ?? null,

    // Contractors
    contractorIds:  payload.contractorIds,
    contractorName: payload.contractorName,

    // Entry
    photoUrl:       payload.photoUrl?.startsWith("blob:") ? null : (payload.photoUrl ?? null),
    overrideReason: payload.overrideReason ?? null,
  };

  return api.post<GateEntryResult>("/api/v2/gate-entry", body);
}

// RC dates come back as "YYYY-MM-DD" already from rcVerifyService.
function isoFromRc(s: string | null | undefined): string | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}
