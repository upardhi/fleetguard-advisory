/**
 * Client-side helper for the unified verify endpoint (POST /api/v2/verify).
 *
 * One call replaces the former 4–6 sequential client→server round trips:
 *   verifyDl + getVehicleByReg + verifyRc + initiateCrimeCheck
 *
 * The server decides whether to use cached DB data or call 3rd-party IDfy.
 * This client translates raw IDfy responses when needed (cached bundles are
 * already translated server-side and returned ready to use).
 */

import { api } from "./v2/api";
import { translateDlResponse, validateDl } from "./dlVerifyService";
import type { DlVerifyBundle } from "./dlVerifyService";
import { translateRcResponse } from "./rcVerifyService";
import type { RcVerifyBundle } from "./rcVerifyService";
import type { FgVehicle } from "./vehicleService";
import type { CheckStatus } from "../_lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VerifyEntryResult {
  /** Full DL bundle ready to put into verifyState */
  dlBundle: DlVerifyBundle;

  /** Existing driver record from DB, or null if this is a first-time driver */
  driverRecord: {
    id: string;
    fullName: string;
    dlNumber: string;
    dlExpiry: string | null;
    dlStatus: string | null;
    bgStatus: string | null;
    facePhotoUrl: string | null;
    contractorId: string | null;
    registeredAt: string;
  } | null;

  /** Existing vehicle record from DB (FgVehicle-compatible), or null */
  vehicle: FgVehicle | null;

  /** RC bundle (from DB cache or IDfy), or null */
  rcBundle: RcVerifyBundle | null;

  /** Crime check initiation result */
  crimeCheck:
    | { step: "waiting"; caseId: string; provider: string; rawInitiate: Record<string, unknown> }
    | { step: "error"; message: string };
}

// ── Server response shape ─────────────────────────────────────────────────────

interface ServerDlBundle {
  provider: string;
  raw: Record<string, unknown>;
  // null when provider is "idfy" — client must call translateDlResponse.
  normalized: null | {
    dlNumber: string; dob: string; name: string; fatherName: string; gender: string;
    address: string; state: string; issuingRtoName: string; photo: string;
    validity: {
      transport: { from: string; to: string };
      nonTransport: { from: string; to: string };
      hazardousValidTill: string; hillValidTill: string;
    };
    classOfVehicles: string[]; dateOfIssue: string; status: string;
  };
  validation: null | {
    status: string; label: string; detail: string; blocking: boolean; overridable: boolean;
  };
}

interface ServerRcBundle {
  provider: string;
  raw: Record<string, unknown>;
  // null when provider is "idfy" — client must call translateRcResponse.
  normalized: null | Record<string, unknown>;
}

interface ServerResponse {
  dlBundle:      ServerDlBundle;
  driverRecord:  VerifyEntryResult["driverRecord"];
  vehicleRecord: Record<string, unknown> | null;
  rcBundle:      ServerRcBundle | null;
  crimeCheck: {
    step:        "waiting" | "error";
    caseId:      string | null;
    provider:    string | null;
    rawInitiate: Record<string, unknown> | null;
    message?:    string;
  };
}

// ── Vehicle mapper ────────────────────────────────────────────────────────────

function mapVehicleRecord(v: Record<string, unknown>): FgVehicle {
  const toDate = (s: unknown) => (s ? new Date(s as string) : null);
  return {
    id:                 v.id                 as string,
    registrationNumber: (v.registrationNumber as string) ?? "",
    vehicleType:        (v.vehicleType        as string) ?? "unknown",
    ownerType:          ((v.ownerType         as string) ?? "owned") as "owned" | "contractor",
    contractorId:       (v.contractorId       as string | null) ?? null,
    rcExpiry:           toDate(v.rcExpiry),
    insuranceExpiry:    toDate(v.insuranceExpiry),
    fitnessExpiry:      toDate(v.fitnessExpiry),
    pucExpiry:          toDate(v.pucExpiry),
    status:             ((v.status            as string) ?? "clear") as CheckStatus,
    warehouseId:        (v.warehouseId        as string) ?? "",
    orgId:              (v.orgId              as string) ?? "",
    isActive:           (v.isActive           as boolean) ?? true,
    rcOwnerName:        (v.rcOwnerName        as string | null) ?? null,
    rcManufacturer:     (v.rcManufacturer     as string | null) ?? null,
    rcVehicleClass:     (v.rcVehicleClass     as string | null) ?? null,
    rcFuelType:         (v.rcFuelType         as string | null) ?? null,
    rcChassisNumber:    (v.rcChassisNumber    as string | null) ?? null,
    rcEngineNumber:     (v.rcEngineNumber     as string | null) ?? null,
    rcColor:            (v.rcColor            as string | null) ?? null,
    rcVerifyProvider:   (v.rcVerifyProvider   as string | null) ?? null,
    rcVerifiedAt:       toDate(v.rcVerifiedAt),
    rcVerifyStatus:     (v.rcVerifyStatus     as string | null) ?? null,
    createdAt:          toDate(v.createdAt) ?? new Date(),
    updatedAt:          toDate(v.updatedAt) ?? new Date(),
  };
}

// ── Main function ─────────────────────────────────────────────────────────────

export async function verifyEntry(
  dlNumber:   string,  // normalized (uppercase, no spaces/dashes)
  dob:        string,  // "DD/MM/YYYY"
  vehicleReg: string | null,
): Promise<VerifyEntryResult> {
  const server = await api.post<ServerResponse>("/api/v2/verify", { dlNumber, dob, vehicleReg });

  // ── DL bundle ──────────────────────────────────────────────────────────────
  let dlBundle: DlVerifyBundle;
  const sb = server.dlBundle;

  if (sb.normalized !== null) {
    // Cached or fallback — already translated server-side.
    dlBundle = {
      provider:   sb.provider,
      raw:        sb.raw,
      normalized: sb.normalized as DlVerifyBundle["normalized"],
      validation: (sb.validation ?? {
        status: "inconclusive", label: "Unknown", detail: "", blocking: false, overridable: true,
      }) as DlVerifyBundle["validation"],
    };
  } else {
    // IDfy raw — translate client-side (same path as the former verifyDl()).
    const normalized = translateDlResponse(sb.provider, sb.raw);
    const validation = validateDl(normalized, dob);
    dlBundle = { provider: sb.provider, raw: sb.raw, normalized, validation };
  }

  // ── Vehicle record ────────────────────────────────────────────────────────
  const vehicle: FgVehicle | null = server.vehicleRecord
    ? mapVehicleRecord(server.vehicleRecord)
    : null;

  // ── RC bundle ─────────────────────────────────────────────────────────────
  let rcBundle: RcVerifyBundle | null = null;
  if (server.rcBundle) {
    const sr = server.rcBundle;
    if (sr.normalized !== null) {
      // Cached — already translated server-side.
      rcBundle = {
        provider:   sr.provider,
        raw:        sr.raw,
        normalized: sr.normalized as unknown as RcVerifyBundle["normalized"],
      };
    } else {
      // IDfy raw — translate client-side.
      const normalized = translateRcResponse(sr.provider, sr.raw);
      rcBundle = { provider: sr.provider, raw: sr.raw, normalized };
    }
  }

  // ── Crime check ───────────────────────────────────────────────────────────
  const sc = server.crimeCheck;
  const crimeCheck: VerifyEntryResult["crimeCheck"] =
    sc.step === "waiting" && sc.caseId && sc.provider
      ? { step: "waiting", caseId: sc.caseId, provider: sc.provider, rawInitiate: sc.rawInitiate ?? {} }
      : { step: "error", message: sc.message ?? "Crime check could not be initiated." };

  return { dlBundle, driverRecord: server.driverRecord, vehicle, rcBundle, crimeCheck };
}
