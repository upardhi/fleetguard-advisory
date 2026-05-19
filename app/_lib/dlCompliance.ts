/**
 * FleetGuard — DL compliance classification
 *
 * Single source of truth for:
 *   • DlInvalidReason  — why a driver's DL is non-compliant
 *   • computeDlInvalidReason() — derives the reason from driver fields
 *   • DL_INVALID_REASON_META  — human-readable label / severity per reason
 *   • isDlCompliant()  — quick boolean gate for UI
 *
 * The `dlInvalidReason` field is written to every fg_drivers document
 * (null = fully compliant, string = specific problem).
 * Run `scripts/patch-dl-invalid-reason.ts` to backfill existing records.
 */

import type { CheckStatus } from "./types";

// ── Reason codes ─────────────────────────────────────────────────────────────

/**
 * Why a driver's DL is flagged as non-compliant.
 * null means the DL is valid and transport-endorsed.
 */
export type DlInvalidReason =
  /** DL number has fewer than 15 characters — likely a typo or fake entry */
  | "typo_invalid"
  /** DL number has fewer than 15 characters — likely a typo or fake entry */
  | "short_dl_number"
  /** Government API could not find any record for this DL number */
  | "api_not_found"
  /** Government API explicitly returned invalid / failed / blocked / suspended status */
  | "api_invalid"
  /** DL is a personal licence only (LMV / MCwG etc.) — no commercial transport endorsement */
  | "personal_dl_only"
  /** Transport endorsement existed but the validity date has lapsed */
  | "transport_expired"
  /** DL could not be verified via API — manual check required */
  | "no_api_data"
  /** Compliant — transport-endorsed and not expired */
  | null;

// ── Metadata ──────────────────────────────────────────────────────────────────

export interface DlInvalidReasonMeta {
  /** Short badge / tooltip label */
  label: string;
  /** One-line explanation shown to guards / managers */
  detail: string;
  /** Badge colour */
  tone: "danger" | "warning" | "info";
  /** true = entry should be blocked; false = warning only */
  blocking: boolean;
}

export const DL_INVALID_REASON_META: Record<NonNullable<DlInvalidReason>, DlInvalidReasonMeta> = {
  typo_invalid: {
    label: "TYpo / Invalid Format",
    detail:
      "DL number is in an invalid format (too short, contains invalid characters). Likely a typo or fake entry. Cannot be verified.",
    tone: "danger",
    blocking: true,
  },
  short_dl_number: {
    label: "Invalid DL Format",
    detail:
      "DL number is too short (< 15 chars). Likely a typo or incorrect entry. Cannot be verified.",
    tone: "danger",
    blocking: true,
  },
  api_not_found: {
    label: "DL Not Found",
    detail:
      "No record found in the government database for this DL number. Cannot confirm validity.",
    tone: "danger",
    blocking: true,
  },
  api_invalid: {
    label: "DL Invalid / Blocked",
    detail: "Government database returned an invalid, failed, or blocked status for this licence.",
    tone: "danger",
    blocking: true,
  },
  personal_dl_only: {
    label: "No Transport Endorsement",
    detail:
      "Driver holds a personal DL (LMV / MCwG etc.) with no commercial transport endorsement. Not eligible for truck entry.",
    tone: "danger",
    blocking: true,
  },
  transport_expired: {
    label: "Transport DL Expired",
    detail:
      "The commercial transport endorsement on this DL has expired. Renewal required before entry.",
    tone: "danger",
    blocking: true,
  },
  no_api_data: {
    label: "Unverified DL",
    detail:
      "DL could not be verified through the API (no data available). Manual verification required.",
    tone: "warning",
    blocking: false, // warn but allow with manager override
  },
};

// ── Compute function ──────────────────────────────────────────────────────────

/** Minimal driver fields needed to compute the reason */
export interface DlComplianceInput {
  dlNumber: string | null;
  dlHasTransport: boolean | null;
  dlClassOfVehicles: string[] | null;
  dlApiStatus: string | null;
  dlVerifyProvider: string | null;
  dlStatus: CheckStatus | null;
}

/**
 * Derives the DlInvalidReason for a driver record.
 * Returns null when the driver is fully compliant.
 *
 * Evaluation order:
 *   1. Short DL number (format check — most obvious error)
 *   2. Has transport + expired  → transport_expired
 *   3. Has transport + valid    → null (compliant)
 *   4. No transport: check API status for api_invalid
 *   5. No transport: has non-transport COV → personal_dl_only
 *   6. No transport + no data   → no_api_data
 *   7. No transport + verified but empty COV → api_not_found
 */
export function computeDlInvalidReason(d: DlComplianceInput): DlInvalidReason {
  const dl = (d.dlNumber ?? "").replace(/[\s\-]/g, "");

  // ── 1. Short DL number ────────────────────────────────────────────────────
  if (dl.length < 15) return "short_dl_number";

  // ── 2 & 3. Has transport ──────────────────────────────────────────────────
  if (d.dlHasTransport) {
    // transport endorsement exists — check if it has lapsed
    if (d.dlStatus === "expired") return "transport_expired";
    return null; // valid & transport-endorsed
  }

  // ── 4. API status indicates a hard problem ────────────────────────────────
  const status = (d.dlApiStatus ?? "").toLowerCase();
  if (
    status.includes("invalid") ||
    status.includes("failed") ||
    status.includes("blocked") ||
    status.includes("suspend") ||
    status.includes("cancel") ||
    status.includes("revok") ||
    status.includes("blacklist")
  ) {
    return "api_invalid";
  }

  // ── 5. Has vehicle classes but none are transport ─────────────────────────
  if (d.dlClassOfVehicles && d.dlClassOfVehicles.length > 0) {
    return "personal_dl_only";
  }

  // ── 6. No API verification data at all ───────────────────────────────────
  // "none" = DL API call itself failed (network/service error); treat same as no data
  if (!d.dlVerifyProvider || d.dlVerifyProvider === "docu-fast" || d.dlVerifyProvider === "none") {
    return "no_api_data";
  }

  // ── 7. API ran, returned empty COV list (no record found) ─────────────────
  return "api_not_found";
}

// ── Convenience helpers ───────────────────────────────────────────────────────

/** true = DL is valid and transport-endorsed — no issue */
export function isDlCompliant(reason: DlInvalidReason): boolean {
  return reason === null;
}

/** true = entry must be blocked outright (not just a warning) */
export function isDlBlocking(reason: DlInvalidReason): boolean {
  if (!reason) return false;
  return DL_INVALID_REASON_META[reason].blocking;
}

/** Returns the badge metadata for display, or null when compliant */
export function getDlReasonMeta(reason: DlInvalidReason): DlInvalidReasonMeta | null {
  if (!reason) return null;
  return DL_INVALID_REASON_META[reason];
}
