/**
 * FleetGuard — Crime compliance classification
 *
 * Provider-agnostic, stable canonical schema for crime data stored on
 * fg_drivers.  "Today the API returns key X, tomorrow key Y" — so NEVER
 * store raw provider fields.  Everything goes through normalizeCrimeCase()
 * first, and only the output shape lands in Firestore.
 *
 * Stored on fg_drivers:
 *   crimeCheckedAt            — when the last check was run
 *   crimeProvider             — "signzy" | "gfc" | "wizer"
 *   crimeTotalCases           — provider-reported total (may exceed cases[].length)
 *   crimeActiveCases          — derived from cases[].isActive
 *   crimeDisposedCases        — derived
 *   crimeCriminalCases        — total criminal (active + disposed)
 *   crimeCivilCases           — total civil (active + disposed)
 *   crimeActiveCriminalCases  — criminal AND active
 *   crimeActiveCivilCases     — civil AND active
 *   crimeOtherCases           — neither criminal nor civil
 *   crimeCases                — NormalizedCrimeCase[] (transposed, stable keys)
 *   crimeRawPollData          — raw poll response (for re-translation / display)
 *
 * Run scripts/backfill-driver-crime-details.ts to populate existing records.
 */

import type { CrimeCase } from "../_services/crimeCheckService";

// ── Canonical case shape ──────────────────────────────────────────────────────

/**
 * One court case — all fields are stable regardless of which provider
 * returned the data.  Empty string = unknown, never undefined.
 */
export interface NormalizedCrimeCase {
  /** Court case number */
  caseNo:           string;
  /** CNR / unique case identifier */
  cnr:              string;
  /** Case type label as returned by provider (e.g. "Sessions Case", "Civil Suit") */
  caseType:         string;
  /** Derived broad category */
  category:         "criminal" | "civil" | "other";
  /** Whether the case is still open / active */
  isActive:         boolean;
  isCriminal:       boolean;
  isCivil:          boolean;
  /** Raw status string from provider — e.g. "Active", "Disposed", "Decided" */
  status:           string;
  /** Stage in proceedings — e.g. "Arguments", "Execution" */
  stage:            string;
  courtName:        string;
  district:         string;
  state:            string;
  /** IPC / BNS sections invoked */
  sections:         string;
  /** Acts invoked */
  acts:             string;
  registrationDate: string;
  filingDate:       string;
  nextHearingDate:  string;
  decisionDate:     string;
  /** Party on the other side (petitioner or complainant) */
  opposingParty:    string;
  /** Risk level string from provider — "high risk" | "low risk" | "very high risk" */
  riskLevel:        string;
  /** Score 0-100 from provider match algorithm */
  matchScore:       number;
  /** Data source — "ecourt" | "gfc" | "signzy" | "wizer" */
  source:           string;
}

// ── Aggregate profile written to fg_drivers ───────────────────────────────────

export interface DriverCrimeProfile {
  // ── Counts ──────────────────────────────────────────────────────────────
  /** Total cases as reported by provider (may > cases[].length) */
  totalCases:           number;
  activeCases:          number;
  disposedCases:        number;
  criminalCases:        number;
  civilCases:           number;
  activeCriminalCases:  number;
  activeCivilCases:     number;
  otherCases:           number;

  // ── Normalized case list ─────────────────────────────────────────────────
  cases: NormalizedCrimeCase[];

  // ── Metadata ─────────────────────────────────────────────────────────────
  checkedAt:  string;   // ISO 8601 timestamp of the last check
  provider:   string;   // "signzy" | "gfc" | "wizer"
  checkId:    string;
}

// ── Classification helpers ────────────────────────────────────────────────────

const DISPOSED_KEYWORDS = [
  "disposed", "decided", "closed", "decreed", "dismissed",
  "acquitted", "convicted", "settled", "compounded", "withdrawn",
  "transferred", "abated", "concluded", "final",
];

const CRIMINAL_KEYWORDS = [
  "criminal", "sessions", "magistrate", "ipc", "fir", "pocso",
  "ndps", "mva", "crpc", "bnss", "police", "offence",
];

const CIVIL_KEYWORDS = [
  "civil", "cheque", "motor", "matrimonial", "commercial",
  "probate", "succession", "rent", "revenue", "consumer",
  "arbitration", "insolvency", "execution",
];

export function isCaseActive(c: Pick<NormalizedCrimeCase, "status" | "stage">): boolean {
  const text = `${c.status} ${c.stage}`.toLowerCase();
  return !DISPOSED_KEYWORDS.some(kw => text.includes(kw));
}

export function classifyCase(
  caseCategory: string,
  caseType: string
): "criminal" | "civil" | "other" {
  const text = `${caseCategory} ${caseType}`.toLowerCase();
  if (CRIMINAL_KEYWORDS.some(kw => text.includes(kw))) return "criminal";
  if (CIVIL_KEYWORDS.some(kw => text.includes(kw))) return "civil";
  return "other";
}

// ── Normalizer ────────────────────────────────────────────────────────────────

/** Maps a provider-translated CrimeCase → stable NormalizedCrimeCase */
export function normalizeCrimeCase(c: CrimeCase): NormalizedCrimeCase {
  const category = classifyCase(c.caseCategory, c.caseType);
  const status   = c.caseStatus || c.f || "";
  const stage    = c.caseStage  || c.f || "";

  const nc: NormalizedCrimeCase = {
    caseNo:           c.caseNo           || "",
    cnr:              c.cnr              || "",
    caseType:         c.caseType         || "",
    category,
    isActive:         isCaseActive({ status, stage }),
    isCriminal:       category === "criminal",
    isCivil:          category === "civil",
    status,
    stage,
    courtName:        c.courtName        || "",
    district:         c.distName         || "",
    state:            c.stateName        || "",
    sections:         c.underSections    || "",
    acts:             c.underActs        || "",
    registrationDate: c.registrationDate || "",
    filingDate:       c.filingDate       || "",
    nextHearingDate:  c.nextHearingDate  || "",
    decisionDate:     c.decisionDate     || "",
    opposingParty:    c.oparty           || c.name || "",
    riskLevel:        c.algoRisk         || "",
    matchScore:       c.score            || 0,
    source:           c.source           || "",
  };

  return nc;
}

// ── Profile builder ───────────────────────────────────────────────────────────

/**
 * Takes the translator output and builds a complete DriverCrimeProfile
 * with all counts computed and cases normalized.
 */
export function buildCrimeProfile(
  providerTotal: number,
  cases: CrimeCase[],
  meta: { checkedAt: string; provider: string; checkId: string }
): DriverCrimeProfile {
  const normalized = cases.map(normalizeCrimeCase);

  const totalCases          = Math.max(providerTotal, normalized.length);
  const activeCases         = normalized.filter(c => c.isActive).length;
  const disposedCases       = normalized.filter(c => !c.isActive).length;
  const criminalCases       = normalized.filter(c => c.isCriminal).length;
  const civilCases          = normalized.filter(c => c.isCivil).length;
  const activeCriminalCases = normalized.filter(c => c.isCriminal && c.isActive).length;
  const activeCivilCases    = normalized.filter(c => c.isCivil    && c.isActive).length;
  const otherCases          = normalized.filter(c => !c.isCriminal && !c.isCivil).length;

  return {
    totalCases,
    activeCases,
    disposedCases,
    criminalCases,
    civilCases,
    activeCriminalCases,
    activeCivilCases,
    otherCases,
    cases: normalized,
    checkedAt: meta.checkedAt,
    provider:  meta.provider,
    checkId:   meta.checkId,
  };
}

// ── Convenience helpers for UI ────────────────────────────────────────────────

export function hasCriminalHistory(profile: DriverCrimeProfile | null): boolean {
  return (profile?.criminalCases ?? 0) > 0;
}

export function hasActiveCases(profile: DriverCrimeProfile | null): boolean {
  return (profile?.activeCases ?? 0) > 0;
}

export function getCrimeRiskTone(
  profile: DriverCrimeProfile | null
): "danger" | "warning" | "success" | "neutral" {
  if (!profile || profile.totalCases === 0) return "success";
  if (profile.activeCriminalCases > 0)       return "danger";
  if (profile.activeCivilCases > 0)          return "warning";
  if (profile.criminalCases > 0)             return "warning";
  return "neutral"; // only disposed civil cases
}
