/**
 * FleetGuard — Crime Check service
 *
 * Translator layer: maps provider-specific raw JSON → normalised CrimeCase[].
 * When the crime-check provider changes, only add/update a case in
 * translateCrimeCheckResponse(). The rest of the app always works against
 * CrimeCase / CrimeCheckResult.
 */

// ── Normalised types ──────────────────────────────────────────────────────────

export interface CrimeCase {
  id: string;
  name: string;
  caseNo: string;
  cnr: string;
  caseType: string;
  caseCategory: string; // "civil" | "criminal"
  caseStatus: string;
  caseStage: string;
  courtName: string;
  distName: string;
  stateName: string;
  underSections: string;
  underActs: string;
  registrationDate: string;
  filingDate: string;
  filingNo: string;
  firstHearingDate: string;
  nextHearingDate: string;
  decisionDate: string;
  oparty: string;
  algoRisk: string; // "very high risk" | "high risk" | …
  score: number;
  fatherMatchType: string;
  source: string; // "ecourt" | …
  f: string; // case disposition / stage
}

export interface CrimeCheckResult {
  total: number;
  cases: CrimeCase[];
}

export interface CrimeCheckInitiateBundle {
  provider: string;
  caseId: string;
  /** Full raw JSON from provider initiate call */
  raw: Record<string, unknown>;
}

export interface CrimeCheckPollBundle {
  provider: string;
  caseId: string;
  /** Full raw JSON from provider poll call */
  raw: Record<string, unknown>;
  normalized: CrimeCheckResult;
  /**
   * true  → result not ready yet; caller should wait and retry
   * false → result is final
   */
  pending: boolean;
}

// ── Client fetches ────────────────────────────────────────────────────────────

export async function initiateCrimeCheck(params: {
  name: string;
  dob: string; // "DD-MM-YYYY"
  fatherName: string;
  address: string;
  matchType?: string;
  dlNumber?: string;
}): Promise<CrimeCheckInitiateBundle> {
  const res = await fetch("/api/crimecheck/initiate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ matchType: "possible", ...params }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Crime check initiate failed (${res.status})`);
  }
  const { provider, raw } = (await res.json()) as {
    provider: string;
    raw: Record<string, unknown>;
  };
  // Provider caseId extraction:
  //   Signzy  → raw.caseId  (top-level)
  //   Wizer   → raw.caseId
  //   GFC     → raw.requestId (number)
  const r = raw as { caseId?: string; requestId?: string | number };
  const caseId = r.caseId ?? String(r.requestId ?? "");
  return { provider, caseId, raw };
}

export async function pollCrimeCheck(caseId: string): Promise<CrimeCheckPollBundle> {
  const res = await fetch(`/api/crimecheck/poll/${encodeURIComponent(caseId)}`);
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Crime check poll failed (${res.status})`);
  }
  const { provider, raw, pending = false } = (await res.json()) as {
    provider: string;
    raw: Record<string, unknown>;
    pending: boolean;
  };
  // When still pending, skip translation (no case data yet)
  const normalized = pending
    ? { total: 0, cases: [] }
    : translateCrimeCheckResponse(provider, raw);
  return { provider, caseId, raw, normalized, pending };
}

// ── Translator entry point ────────────────────────────────────────────────────

/**
 * Maps a raw poll response to CrimeCheckResult.
 * Add a new case here when switching/adding a crime-check provider.
 */
export function translateCrimeCheckResponse(
  provider: string,
  raw: Record<string, unknown>
): CrimeCheckResult {
  switch (provider) {
    case "wizer":
      return translateWizer(raw);
    case "gfc":
      return translateGfc(raw);
    case "signzy":
      return translateSignzy(raw);
    case "fallback":
    case "static":
      // Vendor was unavailable — noop fallback returns 0 cases.
      return { total: 0, cases: [] };
    default:
      throw new Error(`[crimeCheckService] Unknown crime-check provider: "${provider}"`);
  }
}

// ── Provider translators ──────────────────────────────────────────────────────

/** Wizer crime-check API — poll response shape as documented 2025-04 */
function translateWizer(raw: Record<string, unknown>): CrimeCheckResult {
  const total = Number((raw as { total?: number }).total ?? 0);
  const rawCases = ((raw as { cases?: unknown[] }).cases ?? []) as Record<string, unknown>[];

  const cases: CrimeCase[] = rawCases.map((c) => ({
    id: String(c.id ?? c.uniqCaseId ?? ""),
    name: String(c.name ?? ""),
    caseNo: String(c.caseNo ?? ""),
    cnr: String(c.cnr ?? ""),
    caseType: String(c.caseType ?? ""),
    caseCategory: String(c.caseCategory ?? ""),
    caseStatus: String(c.caseStatus ?? ""),
    caseStage: String(c.caseStage ?? ""),
    courtName: String(c.courtName ?? ""),
    distName: String(c.distName ?? ""),
    stateName: String(c.stateName ?? ""),
    underSections: String(c.underSections ?? ""),
    underActs: String(c.underActs ?? ""),
    registrationDate: String(c.registrationDate ?? ""),
    filingDate: String(c.filingDate ?? ""),
    filingNo: String(c.filingNo ?? ""),
    firstHearingDate: String(c.firstHearingDate ?? ""),
    nextHearingDate: String(c.nextHearingDate ?? ""),
    decisionDate: String(c.decisionDate ?? ""),
    oparty: String(c.oparty ?? ""),
    algoRisk: String(c.algoRisk ?? ""),
    score: Number(c.score ?? 0),
    fatherMatchType: String(c.fatherMatchType ?? ""),
    source: String(c.source ?? ""),
    f: String(c.f ?? ""),
  }));

  return { total, cases };
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * GetUpForChange (GFC) crime-check API — poll response shape as documented 2026-04.
 *
 * Key differences from Wizer:
 *  - total lives in `numberOfCases` (may exceed caseDetails.length — provider
 *    only returns a subset of matched cases)
 *  - case array is `caseDetails`, not `cases`
 *  - job reference is `requestId` (number), not `caseId`
 *  - risk level is `riskType` ("Low Risk", "High Risk", …) at both top and case level
 *  - match score is embedded in `matchSummary` as a leading percentage ("90% with…")
 *  - party names use `petitioner` / `respondent` (strings), not `name` / `oparty`
 */
function translateGfc(raw: Record<string, unknown>): CrimeCheckResult {
  const total = Number((raw as { numberOfCases?: number }).numberOfCases ?? 0);
  const topRisk = String((raw as { riskType?: string }).riskType ?? "").toLowerCase();
  const rawCases = ((raw as { caseDetails?: unknown[] }).caseDetails ?? []) as Record<
    string,
    unknown
  >[];

  const cases: CrimeCase[] = rawCases.map((c) => {
    // Extract numeric score from matchSummary ("90% with Name Full match…")
    const matchSummary = String(c.matchSummary ?? "");
    const scoreMatch = matchSummary.match(/^(\d+)%/);
    const score = scoreMatch ? Number(scoreMatch[1]) : 0;

    // Risk level — per-case overrides top-level
    const rawRisk = String(c.riskType ?? "").trim();
    const algoRisk = (rawRisk || topRisk).toLowerCase(); // e.g. "high risk", "low risk"

    // caseCategory drives the civil / criminal split everywhere downstream
    // (parseCrimeSummary on /manager/drivers, the SP risk leaderboard, the
    // active-criminal counters, etc.). The original GFC docs implied a
    // `gfc_overall_case_bucket` field, but real production payloads don't
    // include it — they expose the bucket via `caseType` ("Civil",
    // "Criminal"). Fall back through both so old AND new GFC responses
    // produce a non-empty category, and lowercase it so consumers can
    // compare with `=== "civil"` / `=== "criminal"` directly.
    const rawCategory =
      String(c.gfc_overall_case_bucket ?? "").trim() ||
      String(c.caseCategory ?? "").trim() ||
      String(c.caseType ?? "").trim();
    const caseCategory = rawCategory.toLowerCase();

    // GFC's caseStatus uses "Pending" / "Disposed" / etc. Disposed cases
    // carry no decisionDate, so the existing isActive() heuristic
    // (no decisionDate || status contains "active"|"pending") incorrectly
    // counts disposed cases as active. Synthesise a decisionDate when the
    // status is explicitly disposed/closed so the heuristic resolves
    // correctly.
    const status = String(c.caseStatus ?? "");
    const looksDisposed = /dispos|closed|decided|acquit|convict/i.test(status);
    const decisionDate = looksDisposed
      ? String(c.regNumber ?? c.hearingDate ?? c.filingDate ?? "disposed")
      : "";

    return {
      id: String(c.gfc_uniqueid ?? c.cinNumber ?? ""),
      name: String(c.respondent ?? ""),
      caseNo: String(c.caseNo ?? c.caseNumber ?? ""),
      cnr: String(c.cinNumber ?? ""),
      caseType: String(c.caseType ?? ""),
      caseCategory,
      caseStatus: status,
      caseStage: String(c.severity ?? ""),
      courtName: String(c.courtName ?? ""),
      distName: String(c.district ?? ""),
      stateName: String(c.state ?? ""),
      underSections: String(c.underSection ?? c.section ?? ""),
      underActs: String(c.underAct ?? ""),
      registrationDate: String(c.caseRegDate ?? ""),
      filingDate: String(c.filingDate ?? ""),
      filingNo: String(c.filingNumber ?? ""),
      firstHearingDate: String(c.hearingDate ?? ""),
      nextHearingDate: String(c.hearingDate ?? ""),
      decisionDate,
      oparty: String(c.petitioner ?? ""),
      algoRisk,
      score,
      fatherMatchType: "",
      source: "gfc",
      f: status,
    };
  });

  return { total, cases };
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Signzy crime-check — the `cases` field may be a single object (1 match)
 * or an array (>1 match). Both are normalised here.
 *
 * Field names use a mix of camelCase and snake_case across Signzy response
 * versions — both forms are checked for each field.
 */
function translateSignzy(raw: Record<string, unknown>): CrimeCheckResult {
  const total = Number(
    (raw as { total?: number }).total ??
      (raw as { signzyTotalCases?: number }).signzyTotalCases ??
      0
  );

  // cases can be a single object or an array
  const rawCases = (raw as { cases?: unknown }).cases;
  const casesArr: Record<string, unknown>[] = !rawCases
    ? []
    : Array.isArray(rawCases)
      ? (rawCases as Record<string, unknown>[])
      : [rawCases as Record<string, unknown>];

  // signzyTransformedResult.caseDetails provides richer per-case info
  const transformed = (raw as { signzyTransformedResult?: { caseDetails?: unknown[] } })
    .signzyTransformedResult;
  const caseDetails: Record<string, unknown>[] = Array.isArray(transformed?.caseDetails)
    ? (transformed!.caseDetails as Record<string, unknown>[])
    : [];

  const cases: CrimeCase[] = casesArr.map((c, idx) => {
    const detail = caseDetails[idx] ?? {};

    // Support both camelCase and snake_case field names
    const get = (camel: string, snake: string): string =>
      String(c[camel] ?? c[snake] ?? detail[camel] ?? detail[snake] ?? "");

    const algoRiskRaw = get("algoRisk", "algo_risk") || get("riskType", "risk_type");
    const algoRisk = algoRiskRaw.toLowerCase() || "unknown";

    return {
      id: get("id", "case_id") || get("caseNo", "case_no"),
      name: get("name", "name"),
      caseNo: get("caseNo", "case_no"),
      cnr: get("cnr", "cnr_no"),
      caseType: get("caseType", "case_type"),
      caseCategory: (get("caseCategory", "case_category") || get("caseType", "case_type")).toLowerCase(),
      caseStatus: get("caseStatus", "case_status"),
      caseStage: get("caseStage", "case_stage"),
      courtName: get("courtName", "court_name"),
      distName: get("distName", "dist_name"),
      stateName: get("stateName", "state_name"),
      underSections: get("underSections", "under_sections"),
      underActs: get("underActs", "under_acts"),
      registrationDate: get("registrationDate", "reg_date"),
      filingDate: get("filingDate", "filing_date"),
      filingNo: get("filingNo", "filing_no"),
      firstHearingDate: get("firstHearingDate", "first_hearing_date"),
      nextHearingDate: get("nextHearingDate", "next_hearing_date"),
      decisionDate: get("decisionDate", "decision_date"),
      oparty: get("oparty", "o_party"),
      algoRisk,
      score: Number(c.score ?? detail.score ?? 0),
      fatherMatchType: get("fatherMatchType", "father_match_type"),
      source: "signzy",
      f: get("f", "case_stage"),
    };
  });

  return { total, cases };
}
