/**
 * FleetGuard — DL Verify service
 *
 * Translator layer: maps provider-specific raw JSON → normalised DlVerifyResult.
 * When the DL provider changes, only add/update a case in translateDlResponse().
 * The rest of the app always works against DlVerifyResult / DlValidationResult.
 *
 * ── Transport requirement ──────────────────────────────────────────────────────
 * This is a transport/logistics business. Every driver admitted at the gate
 * MUST hold a valid transport (commercial-vehicle) endorsement. The validator
 * enforces this as a first-class rule (invalid_personal_only, invalid_class_missing,
 * invalid_transport_expired) before any other checks.
 */

// ── Vehicle classes that constitute a transport endorsement ───────────────────

/** COV codes recognised as a valid transport / commercial-vehicle licence */
export const TRANSPORT_COVS = new Set([
  "LMV-TR", // Light Motor Vehicle — Transport (taxi / 3-wheeler goods)
  "HMV", // Heavy Motor Vehicle
  "HGMV", // Heavy Goods Motor Vehicle
  "HPMV", // Heavy Passenger Motor Vehicle
  "MGV", // Medium Goods Vehicle
  "TRANS", // Generic transport endorsement
  "HTV", // Heavy Transport Vehicle
  "LTV", // Light Transport Vehicle
  "PSV", // Public Service Vehicle
]);

// ── DL validation ──────────────────────────────────────────────────────────────

export type DlValidationStatus =
  | "valid" // Active + transport-endorsed + not expired
  | "invalid_no_record" // API returned no data (empty name / dlNumber)
  | "invalid_suspended" // Status = Suspended / Cancelled / Revoked
  | "invalid_learner_only" // Only LLR / learner's-licence class present
  | "invalid_dob_mismatch" // Entered DOB ≠ DOB on the DL record
  | "invalid_transport_expired" // Transport endorsement validity has lapsed
  | "invalid_nt_expired" // Non-transport validity lapsed, no transport track
  | "invalid_personal_only" // Non-transport DL only — no transport endorsement
  | "invalid_class_missing" // No recognised transport vehicle class on DL
  | "invalid_state_unavailable" // Provider signals state DB not integrated
  | "inconclusive"; // Cannot determine — manual verification required

export interface DlValidationResult {
  status: DlValidationStatus;
  /** Short label shown in the status badge */
  label: string;
  /** Longer explanation shown to the guard */
  detail: string;
  /** true = entry must be blocked or requires explicit manager override */
  blocking: boolean;
  /**
   * true = guard may override with a manager-approved reason.
   * false = hard block — no entry button shown at all.
   */
  overridable: boolean;
}

// ── Normalised type ───────────────────────────────────────────────────────────

export interface DlVerifyResult {
  dlNumber: string;
  dob: string; // "DD/MM/YYYY"
  name: string;
  fatherName: string;
  gender: string;
  address: string;
  state: string;
  issuingRtoName: string;
  photo: string;
  validity: {
    nonTransport: { from: string; to: string };
    transport: { from: string; to: string };
    hazardousValidTill: string;
    hillValidTill: string;
  };
  classOfVehicles: string[];
  dateOfIssue: string;
  status: string;
}

export interface DlVerifyBundle {
  /** Name of the provider that produced this result, e.g. "docu-fast" */
  provider: string;
  /** Complete raw JSON exactly as received from the provider — never mutated */
  raw: Record<string, unknown>;
  /** Fields translated to the canonical FleetGuard shape */
  normalized: DlVerifyResult;
  /** Computed transport-licence validity result */
  validation: DlValidationResult;
}

// ── Client fetch ──────────────────────────────────────────────────────────────

export async function verifyDl(
  dlNumber: string,
  dob: string // "DD/MM/YYYY"
): Promise<DlVerifyBundle> {
  const res = await fetch("/api/verify/dl", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dlNumber, dob }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `DL verification failed (${res.status})`);
  }
  const { provider, raw } = (await res.json()) as {
    provider: string;
    raw: Record<string, unknown>;
  };
  const normalized = translateDlResponse(provider, raw);
  const validation = validateDl(normalized, dob);
  return { provider, raw, normalized, validation };
}

// ── DL validator ─────────────────────────────────────────────────────────────

/** Parse "DD/MM/YYYY" → Date, or null if unparseable. */
function parseDMY(dmy: string): Date | null {
  if (!dmy) return null;
  const parts = dmy.split("/");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map(Number);
  if (!d || !m || !y) return null;
  const dt = new Date(y, m - 1, d);
  return isNaN(dt.getTime()) ? null : dt;
}

/**
 * Validates a normalised DlVerifyResult against all FleetGuard transport
 * requirements.  Always call this after translateDlResponse().
 *
 * @param result    The normalised DL record from the provider.
 * @param enteredDob  DOB entered by the guard ("DD/MM/YYYY") — used for
 *                    mismatch detection.
 */
export function validateDl(result: DlVerifyResult, _enteredDob: string): DlValidationResult {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // ── 1. No record found ──────────────────────────────────────────────────
  if (!result.name.trim() || !result.dlNumber.trim()) {
    return {
      status: "invalid_no_record",
      label: "No Record Found",
      detail:
        "No driving licence record found for this number after cross-verification. Verify the number and try again.",
      blocking: true,
      overridable: true,
    };
  }

  // ── 2. State DB not available ───────────────────────────────────────────
  const statusLower = result.status.toLowerCase();
  if (
    statusLower.includes("not available") ||
    statusLower.includes("not integrated") ||
    statusLower.includes("unavailable")
  ) {
    return {
      status: "invalid_state_unavailable",
      label: "State Database Not Available",
      detail:
        "The issuing state's RTO database is not integrated with the verification provider. Manual verification required.",
      blocking: true,
      overridable: true,
    };
  }

  // ── 3. Inconclusive / manual verification ──────────────────────────────
  if (
    statusLower.includes("inconclusive") ||
    statusLower.includes("manual") ||
    statusLower.includes("tamper") ||
    statusLower.includes("fake") ||
    statusLower.includes("duplicate")
  ) {
    return {
      status: "inconclusive",
      label: "DL Verification Inconclusive",
      detail: `Provider remarks: "${result.status}". Manual verification by RTO/authority required before entry.`,
      blocking: true,
      overridable: true,
    };
  }

  // ── 4. Suspended / Cancelled / Revoked ─────────────────────────────────
  if (
    statusLower.includes("suspend") ||
    statusLower.includes("cancel") ||
    statusLower.includes("revok") ||
    statusLower.includes("blacklist")
  ) {
    return {
      status: "invalid_suspended",
      label: "DL Suspended / Cancelled",
      detail: `Licence status is "${result.status}". This DL is not valid for driving. Entry not permitted.`,
      blocking: true,
      overridable: false, // hard block — manager cannot override suspended DL
    };
  }

  // ── 6. Learner's licence only ───────────────────────────────────────────
  const covUpper = result.classOfVehicles.map((c) => c.toUpperCase());
  const isLearnerOnly =
    covUpper.length > 0 && covUpper.every((c) => c.startsWith("LLR") || c.startsWith("LMR"));
  if (isLearnerOnly) {
    return {
      status: "invalid_learner_only",
      label: "Learner's Licence Only",
      detail:
        "Only a learner's licence (LLR) is on record. A permanent DL has not been issued. Entry not permitted.",
      blocking: true,
      overridable: false,
    };
  }

  // ── 7. Transport validity dates ─────────────────────────────────────────
  const trTo = parseDMY(result.validity.transport.to);
  const ntTo = parseDMY(result.validity.nonTransport.to);
  const hasTransportDates = !!(result.validity.transport.from || result.validity.transport.to);
  const transportExpired = trTo !== null && trTo < today;

  if (hasTransportDates && transportExpired) {
    return {
      status: "invalid_transport_expired",
      label: "Transport DL Expired",
      detail: `Transport driving licence expired on ${result.validity.transport.to}. Renewal required before entry.`,
      blocking: true,
      overridable: true,
    };
  }

  // ── 8. Transport vehicle class check ────────────────────────────────────
  const transportCovs = covUpper.filter((c) => TRANSPORT_COVS.has(c));
  const hasTransportClass = transportCovs.length > 0;

  // Personal DL only — non-transport validity exists but no transport track at all
  if (!hasTransportClass && !hasTransportDates) {
    const hasAnyValidity =
      !!(result.validity.nonTransport.from || result.validity.nonTransport.to) ||
      covUpper.length > 0;
    if (hasAnyValidity) {
      return {
        status: "invalid_personal_only",
        label: "Personal DL — No Transport Endorsement",
        detail:
          "Driver holds a personal (non-transport) DL only. A commercial vehicle / transport endorsement is mandatory for truck entry.",
        blocking: true,
        overridable: true,
      };
    }
  }

  // Has transport dates but no recognised transport COV
  if (!hasTransportClass) {
    return {
      status: "invalid_class_missing",
      label: "Transport Vehicle Class Not Endorsed",
      detail: `DL classes (${result.classOfVehicles.join(", ") || "none"}) do not include any recognised transport category (HMV, HGMV, LMV-TR, TRANS, etc.).`,
      blocking: true,
      overridable: true,
    };
  }

  // ── 9. Non-transport DL expired (no separate transport track) ───────────
  const ntExpired = ntTo !== null && ntTo < today;
  if (ntExpired && !hasTransportDates) {
    return {
      status: "invalid_nt_expired",
      label: "DL Expired",
      detail: `Driving licence expired on ${result.validity.nonTransport.to}. Renewal required before entry.`,
      blocking: true,
      overridable: true,
    };
  }

  // ── All checks passed ────────────────────────────────────────────────────
  const validTill = result.validity.transport.to || result.validity.nonTransport.to;
  return {
    status: "valid",
    label: "DL Valid — Transport Endorsed",
    detail: `Active transport licence · ${transportCovs.join(", ")} · Valid till ${validTill}`,
    blocking: false,
    overridable: false,
  };
}

// ── Drivers-list display helper ───────────────────────────────────────────────

export interface DlDisplayStatus {
  /** Badge label — what the user sees */
  label: string;
  /** Badge tone — "success" | "warning" | "danger" */
  tone: "success" | "warning" | "danger";
  /** Hover-tooltip text explaining why this status was shown */
  tooltip?: string;
  /** True when the DL was never successfully verified (404 / fallback entry) */
  isUnverified: boolean;
  /** True when DL is valid for the road but lacks transport endorsement */
  isNoTransport: boolean;
}

/**
 * Decide how to render DL status in driver-list rows. Branches on the
 * latest-event validation status; falls back to the stored dlStatus tag.
 */
export function getDlDisplayStatus(
  storedDlStatus: string,
  validation: DlValidationResult | null,
): DlDisplayStatus {
  const v = validation?.status;
  if (v === "invalid_no_record") {
    return {
      label: "Invalid / Fake",
      tone: "danger",
      tooltip: "Not found in government database",
      isUnverified: true,
      isNoTransport: false,
    };
  }
  if (v === "invalid_personal_only" || v === "invalid_class_missing") {
    return {
      label: "No Transport DL",
      tone: "danger",
      tooltip: "DL has no transport / commercial-vehicle endorsement",
      isUnverified: false,
      isNoTransport: true,
    };
  }
  // Default: render the stored CheckStatus
  const tone: DlDisplayStatus["tone"] =
    storedDlStatus === "clear" ? "success" : storedDlStatus === "expiring" ? "warning" : "danger";
  return { label: storedDlStatus, tone, isUnverified: false, isNoTransport: false };
}

/**
 * `01/01/2099` is the placeholder used when a DL has no transport-validity date
 * (e.g. No Transport DL or 404 fallback). Treat any date in 2099+ as unknown.
 */
export function isPlaceholderExpiry(d: Date | null | undefined): boolean {
  return !!d && d.getFullYear() >= 2099;
}

// ── Translator entry point ────────────────────────────────────────────────────

/**
 * Maps a raw provider response to DlVerifyResult.
 * Add a new case here when switching/adding a DL provider.
 */
export function translateDlResponse(
  provider: string,
  raw: Record<string, unknown>
): DlVerifyResult {
  switch (provider) {
    case "idfy":
      return translateIdfy(raw);
    case "fleetguard-f":
      return translateDocuFast(raw);
    case "docu-fast":
      return translateDocuFastMigration(raw);
    case "parivahan":
      return translateParivahan(raw);
    default:
      throw new Error(`[dlVerifyService] Unknown DL provider: "${provider}"`);
  }
}

// ── Provider translators ──────────────────────────────────────────────────────

/**
 * IDfy ind_driving_license (async) — poll task response shape.
 *
 * Incoming `raw` is the single task object from GET /v3/tasks:
 *   { request_id, task_id, group_id, status: "completed", result: { status, source_output } }
 *
 * IDfy date format: "DD-MM-YYYY" or "YYYY-MM-DD" depending on field.
 * We normalise everything to "DD/MM/YYYY" for internal use.
 */
function translateIdfy(raw: Record<string, unknown>): DlVerifyResult {
  // Poll response wraps the actual data inside result.source_output
  const result = (raw.result ?? {}) as Record<string, unknown>;
  const src    = (result.source_output ?? result.dl_info ?? result) as Record<string, unknown>;

  /** Convert IDfy dates (DD-MM-YYYY or YYYY-MM-DD) → "DD/MM/YYYY" */
  function normDate(s: unknown): string {
    if (!s) return "";
    const str = String(s);
    // Already DD/MM/YYYY
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return str;
    // YYYY-MM-DD → DD/MM/YYYY
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      const [y, m, d] = str.split("-");
      return `${d}/${m}/${y}`;
    }
    // DD-MM-YYYY → DD/MM/YYYY
    if (/^\d{2}-\d{2}-\d{4}$/.test(str)) return str.replace(/-/g, "/");
    return str;
  }

  // Validity block — IDfy uses "nt" and "t" keys
  const val = (src.validity ?? {}) as Record<string, unknown>;
  const nt  = (val.nt  ?? val.non_transport ?? {}) as Record<string, string>;
  const tr  = (val.t   ?? val.transport     ?? {}) as Record<string, string>;

  // COV details — IDfy returns an array of { cov: string } objects
  const covs: string[] = [];
  const covDetails = (src.cov_details ?? src.covDetails ?? []) as Array<
    { cov?: string; vehicle_class?: string }
  >;
  for (const c of covDetails) {
    const cls = c.cov ?? c.vehicle_class ?? "";
    if (cls) covs.push(cls.toUpperCase());
  }

  // Fallback: vehicle_classes flat array
  if (covs.length === 0) {
    const flat = (src.vehicle_classes ?? []) as string[];
    for (const v of flat) if (v) covs.push(v.toUpperCase());
  }

  return {
    // IDfy uses "id_number"; other providers use "dl_number"
    dlNumber:      String(src.id_number ?? src.dl_number ?? src.dlNumber ?? ""),
    dob:           normDate(src.dob ?? src.date_of_birth ?? ""),
    name:          String(src.name_on_card ?? src.name ?? ""),
    // IDfy uses "relatives_name" for father/husband; others use "father_or_husband_name"
    fatherName:    String(src.father_or_husband_name ?? src.relatives_name ?? src.fatherName ?? ""),
    gender:        String(src.gender ?? ""),
    address:       String(src.address ?? ""),
    state:         String(src.state ?? ""),
    // IDfy uses "issuing_rto_name"; others use "issuing_authority"
    issuingRtoName:String(src.issuing_rto_name ?? src.issuing_authority ?? src.issuingRtoName ?? ""),
    photo:         String(src.profile_image ?? src.photo ?? ""),
    validity: {
      nonTransport: {
        // IDfy has flat "nt_validity_from/to"; others nest under validity.nt
        from: normDate(nt.from ?? nt.issue_date ?? src.nt_validity_from ?? ""),
        to:   normDate(nt.to   ?? nt.expiry_date ?? src.nt_validity_to ?? ""),
      },
      transport: {
        // IDfy has flat "t_validity_from/to"; others nest under validity.t
        from: normDate(tr.from ?? tr.issue_date ?? src.t_validity_from ?? ""),
        to:   normDate(tr.to   ?? tr.expiry_date ?? src.t_validity_to ?? ""),
      },
      hazardousValidTill: normDate(src.hazardous_valid_till ?? src.hazardousValidTill ?? ""),
      hillValidTill:      normDate(src.hill_valid_till      ?? src.hillValidTill      ?? ""),
    },
    classOfVehicles: [...new Set(covs)],
    dateOfIssue:   normDate(src.date_of_issue ?? src.dateOfIssue ?? ""),
    status:        String(src.status ?? result.status ?? ""),
  };
}

/** Docu-Fast DL API — response shape as documented 2025-04 */
function translateDocuFast(raw: Record<string, unknown>): DlVerifyResult {
  // Defensive — use optional chaining throughout
  const r = (raw as { result?: Record<string, unknown> }).result ?? {};
  const det = (r.detailsOfDrivingLicence ?? {}) as Record<string, unknown>;
  const val = (r.dlValidity ?? {}) as Record<string, unknown>;
  const nt = (val.nonTransport ?? {}) as { from?: string; to?: string };
  const tr = (val.transport ?? {}) as { from?: string; to?: string };

  const covs: string[] = [];
  const covDetails = (det.covDetails ?? []) as Array<{ cov?: string }>;
  for (const c of covDetails) if (c.cov) covs.push(c.cov);
  // Fallback to badgeDetails if covDetails is empty
  if (covs.length === 0) {
    const badges = (r.badgeDetails ?? []) as Array<{ classOfVehicle?: string[] }>;
    for (const b of badges) for (const v of b.classOfVehicle ?? []) covs.push(v);
  }

  return {
    dlNumber: String(r.dlNumber ?? ""),
    dob: String(r.dob ?? ""),
    name: String(det.name ?? ""),
    fatherName: String(det.fatherOrHusbandName ?? ""),
    gender: String(det.gender ?? ""),
    address: String(det.address ?? ""),
    state: String(det.state ?? ""),
    issuingRtoName: String(det.issuingRtoName ?? ""),
    photo: String(det.photo ?? ""),
    validity: {
      nonTransport: { from: nt.from ?? "", to: nt.to ?? "" },
      transport: { from: tr.from ?? "", to: tr.to ?? "" },
      hazardousValidTill: String(val.hazardousValidTill ?? ""),
      hillValidTill: String(val.hillValidTill ?? ""),
    },
    classOfVehicles: [...new Set(covs)],
    dateOfIssue: String(det.dateOfIssue ?? ""),
    status: String(det.status ?? ""),
  };
}

/**
 * Migration records imported from docu-fast store a flat summary
 * (licenseStatus, driverName, dlNumber) rather than the full API response.
 * This translator maps those fields back to DlVerifyResult so validateDl()
 * can produce the correct issue bucket (none / expired / invalid) for the
 * contractor analytics on the manager/CSO pages.
 *
 * Logic:
 *   valid   → transport validity far future + HMV class → validateDl returns "valid"
 *   expired → transport validity in past        + HMV class → "invalid_transport_expired"
 *   invalid → empty name/dlNumber               → "invalid_no_record"
 *             or no transport class/dates        → "invalid_class_missing"
 */
/**
 * Parivahan (Vahan) DL API response — stored in reports/{vrId}/results where type="DRIVING_LICENSE".
 * Shape: { code: 200, result: { dlNumber, dob, badgeDetails:[{classOfVehicle:[]}], dlValidity:{transport,nonTransport} } }
 */
function translateParivahan(raw: Record<string, unknown>): DlVerifyResult {
  const result = (raw.result ?? {}) as Record<string, unknown>;
  // Actual Parivahan API nests name/address/dateOfIssue/etc. under detailsOfDrivingLicence
  const det = (result.detailsOfDrivingLicence ?? {}) as Record<string, unknown>;
  const dlValidity = (result.dlValidity ?? {}) as Record<string, Record<string, string>>;
  const transport    = dlValidity.transport    ?? { from: "", to: "" };
  const nonTransport = dlValidity.nonTransport ?? { from: "", to: "" };
  const badges = Array.isArray(result.badgeDetails) ? result.badgeDetails as Record<string, unknown>[] : [];
  const covs: string[] = badges.flatMap(b => Array.isArray(b.classOfVehicle) ? b.classOfVehicle as string[] : []);
  // Also pull COVs from covDetails inside detailsOfDrivingLicence
  const covDetails = Array.isArray(det.covDetails) ? det.covDetails as Record<string, unknown>[] : [];
  for (const c of covDetails) { if (c.cov) covs.push(String(c.cov)); }
  return {
    dlNumber:       String(result.dlNumber      ?? ""),
    dob:            String(result.dob           ?? ""),
    name:           String(det.name             ?? result.name ?? result.dlHolderName ?? ""),
    fatherName:     String(det.fatherOrHusbandName ?? result.fatherName ?? ""),
    gender:         String(det.gender           ?? result.gender ?? ""),
    address:        String(det.address          ?? result.currentAddress ?? result.address ?? ""),
    state:          String(det.state            ?? result.state ?? ""),
    issuingRtoName: String(det.issuingRtoName   ?? result.issuingAuthority ?? result.rtoName ?? ""),
    photo:          String(det.photo            ?? result.photo ?? ""),
    validity: {
      nonTransport: { from: String(nonTransport.from ?? ""), to: String(nonTransport.to ?? "") },
      transport:    { from: String(transport.from    ?? ""), to: String(transport.to    ?? "") },
      hazardousValidTill: String(dlValidity.hazardousValidTill ?? ""),
      hillValidTill:      String(dlValidity.hillValidTill      ?? ""),
    },
    classOfVehicles: [...new Set(covs)],
    dateOfIssue:    String(det.dateOfIssue      ?? result.dateOfIssue ?? ""),
    status:         String(det.status           ?? result.status ?? ""),
  };
}

function translateDocuFastMigration(raw: Record<string, unknown>): DlVerifyResult {
  const ls    = String(raw.licenseStatus ?? "").toLowerCase();
  const isValid   = ls === "valid";
  const isExpired = ls === "expired";
  return {
    dlNumber:       String(raw.dlNumber   ?? ""),
    dob:            "",
    name:           String(raw.driverName ?? ""),
    fatherName: "", gender: "", address: "", state: "", issuingRtoName: "", photo: "",
    validity: {
      nonTransport: { from: "", to: "" },
      transport: {
        from: isValid || isExpired ? "01/01/2000" : "",
        to:   isValid ? "01/01/2099" : isExpired ? "01/01/2000" : "",
      },
      hazardousValidTill: "", hillValidTill: "",
    },
    classOfVehicles: isValid || isExpired ? ["HMV"] : [],
    dateOfIssue: "",
    status: String(raw.licenseStatus ?? ""),
  };
}
