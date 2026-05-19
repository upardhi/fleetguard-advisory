/**
 * FleetGuard — license lookup against the shared (DocuFast) Firebase project.
 *
 * Cost-cutting layer for IDfy DL verify + crime-check vendor calls in
 * /api/v2/verify and /api/crimecheck/poll. DocuFast already runs Parivahan
 * DL lookups and Signzy crime checks against the same DL numbers; when a
 * record exists there we reuse it instead of paying the third-party again.
 *
 * Scope: cost cutting only. Not used by /api/dl-ocr.
 *
 * Read-only access. `verificationRequests` and `reports` are non-`fg_*`
 * collections owned by DocuFast — see AGENTS.md. Never write to them.
 *
 * DocuFast schema (read shape only):
 *   verificationRequests/{id}
 *     data.drivingLicense   : string  (original user input — typically dashed, e.g. "TN45-19940004775")
 *     drivingLicenseUpper?  : string  (uppercase, no spaces/dashes — when present)
 *     criminalData?         : object  (legacy fallback for crime details)
 *     createdAt             : Timestamp
 *
 *   reports/{id}/results/{stepId}
 *     type    : "DRIVING_LICENSE" | "Signzy_Crime" | "CRIME"
 *     details : string (JSON) | object — provider raw response
 */

import admin from "firebase-admin";
import type { Firestore, Timestamp } from "firebase-admin/firestore";

const APP_NAME = "fg-license-lookup";

// The lookup is purely a cost-cutting cache. Any Firebase init failure here —
// missing creds, malformed PEM that passes the BEGIN/END check, network issues,
// stale app state — must NOT break the verify flow. Always return null on
// failure; callers fall through to the live IDfy / crime-vendor calls.
function getDb(): Firestore | null {
  try {
    const existing = admin.apps.find((a) => a?.name === APP_NAME);
    if (existing) return existing.firestore();

    const projectId   = process.env.FIREBASE_ADMIN_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const privateKey  = (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");

    if (!projectId || !clientEmail || !privateKey) return null;
    if (!privateKey.includes("-----BEGIN") || !privateKey.includes("-----END")) return null;

    const app = admin.initializeApp(
      { credential: admin.credential.cert({ projectId, clientEmail, privateKey }) },
      APP_NAME,
    );
    return app.firestore();
  } catch (err) {
    console.error(
      "[licenseLookup] Firebase admin init failed — falling back to live verify",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

type FirestoreTs =
  | Timestamp
  | { seconds: number }
  | { _seconds: number }
  | string
  | null
  | undefined;

interface PipelineStep {
  id: string;
  type?: string;
  details?: string | Record<string, unknown>;
  createdAt?: FirestoreTs;
  [key: string]: unknown;
}

interface VerificationRequest {
  id: string;
  data?: { drivingLicense?: string };
  drivingLicenseUpper?: string;
  criminalData?: Record<string, unknown>;
  createdAt?: FirestoreTs;
  [key: string]: unknown;
}

function tsKey(t: FirestoreTs): string {
  if (!t) return "";
  if (typeof t === "string") return t;
  if (typeof t === "object") {
    const anyT = t as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof anyT.toDate   === "function") return anyT.toDate().toISOString();
    if (typeof anyT.seconds  === "number")   return new Date(anyT.seconds  * 1000).toISOString();
    if (typeof anyT._seconds === "number")   return new Date(anyT._seconds * 1000).toISOString();
  }
  return "";
}

function parseDetails(step: PipelineStep | undefined): Record<string, unknown> | null {
  if (!step?.details) return null;
  if (typeof step.details === "object") return step.details as Record<string, unknown>;
  try { return JSON.parse(step.details) as Record<string, unknown>; } catch { return null; }
}

async function findRequestByField(
  db: Firestore,
  field: string,
  value: string,
): Promise<VerificationRequest | null> {
  const snap = await db
    .collection("verificationRequests")
    .where(field, "==", value)
    .get();
  if (snap.empty) return null;

  const docs: VerificationRequest[] = snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as object) }) as VerificationRequest,
  );
  docs.sort((a, b) => tsKey(b.createdAt).localeCompare(tsKey(a.createdAt)));
  return docs[0] ?? null;
}

async function fetchResults(db: Firestore, reportId: string): Promise<PipelineStep[]> {
  const snap = await db.collection("reports").doc(reportId).collection("results").get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as PipelineStep);
}

export interface LicenseLookupHit {
  /** Parivahan-shape DL response, ready to feed translateDlResponse("parivahan", …). */
  dl: Record<string, unknown> | null;
  /** Crime poll response — vendor-specific shape; pair with crimeProvider for the translator. */
  crime: Record<string, unknown> | null;
  /** Which crime translator to use for `crime`. null → no crime data. */
  crimeProvider: "gfc" | "signzy" | "wizer" | null;
}

/**
 * The DocuFast `Signzy_Crime` step name is historical — the underlying vendor
 * may be Signzy, GFC, or Wizer depending on when the record was created. We
 * detect the shape so the correct translator runs in crimeCheckService.
 */
function detectCrimeProvider(
  raw: Record<string, unknown> | null,
): "gfc" | "signzy" | "wizer" | null {
  if (!raw) return null;
  // GFC: numberOfCases / caseDetails / gfc_uniqueid
  if ("numberOfCases" in raw || "caseDetails" in raw) return "gfc";
  // Signzy: signzyTotalCases / signzyTransformedResult, OR cases array with snake_case fields
  if ("signzyTotalCases" in raw || "signzyTransformedResult" in raw) return "signzy";
  // Wizer: total + cases (with id/uniqCaseId at the case level)
  if ("cases" in raw && ("total" in raw || "status" in raw)) {
    const cases = (raw as { cases?: unknown[] }).cases;
    const first = Array.isArray(cases) ? (cases[0] as Record<string, unknown> | undefined) : undefined;
    if (first && ("uniqCaseId" in first || "algoRisk" in first)) return "wizer";
    return "signzy";
  }
  return null;
}

/**
 * Look up DL + crime data for a license number in the shared Firebase project.
 *
 * Tries `licenseNumber` as given first, then a normalised form (uppercase,
 * spaces/dashes stripped) — DocuFast may have stored either shape depending
 * on which intake form ran.
 *
 * Returns null on any failure (project not configured, license unknown, read
 * error). Callers fall back to the live third-party flow.
 */
export async function lookupLicense(licenseNumber: string): Promise<LicenseLookupHit | null> {
  if (!licenseNumber) return null;
  const db = getDb();
  if (!db) {
    console.log(`[licenseLookup] dl=${licenseNumber} skipped: FIREBASE_ADMIN_* not configured`);
    return null;
  }

  // DocuFast stores DLs in two complementary fields:
  //   data.drivingLicense   — original user input, usually dashed (e.g. "TN45-19940004775")
  //   drivingLicenseUpper   — canonical compact uppercase (e.g. "TN4519940004775")
  // The verify route hands us the already-stripped form, so we reconstruct
  // the dashed variant for the data.drivingLicense path.
  const compact = licenseNumber.toUpperCase().replace(/[\s\-]/g, "");
  // Indian DL: 2-letter state + 2-digit RTO + rest. Insert dash after 4 chars.
  const dashed4Match = compact.match(/^([A-Z]{2}\d{2})(.+)$/);
  const dashed = dashed4Match ? `${dashed4Match[1]}-${dashed4Match[2]}` : "";

  // attempts: [field, value] pairs, tried in order — first hit wins.
  const attempts: Array<[string, string]> = [
    ["drivingLicenseUpper", compact],          // canonical, when present
    ["data.drivingLicense", dashed],           // most common dashed form
    ["data.drivingLicense", licenseNumber],    // raw input as-is
    ["data.drivingLicense", compact],          // compact form
  ].filter(([, v]) => !!v) as Array<[string, string]>;

  try {
    let request: VerificationRequest | null = null;
    let matched = "";
    for (const [field, value] of attempts) {
      request = await findRequestByField(db, field, value);
      if (request) { matched = `${field}=${value}`; break; }
    }
    if (!request) {
      const tried = attempts.map(([f, v]) => `${f}=${v}`).join("|");
      console.log(`[licenseLookup] dl=${licenseNumber} miss tried=[${tried}]`);
      return null;
    }

    const steps = await fetchResults(db, request.id);
    const dlStep     = steps.find((s) => s.type === "DRIVING_LICENSE");
    const signzyStep = steps.find((s) => s.type === "Signzy_Crime");
    const crimeStep  = steps.find((s) => s.type === "CRIME");

    const crime =
      parseDetails(signzyStep) ??
      parseDetails(crimeStep) ??
      request.criminalData ??
      null;
    const crimeProvider = detectCrimeProvider(crime);

    const hit: LicenseLookupHit = {
      dl: parseDetails(dlStep),
      crime,
      crimeProvider,
    };
    console.log(
      `[licenseLookup] dl=${licenseNumber} hit matched=${matched} reportId=${request.id}` +
      ` dl=${!!hit.dl} crime=${!!hit.crime} crimeProvider=${crimeProvider ?? "?"}` +
      ` steps=[${steps.map((s) => s.type).join(",")}]`,
    );
    return hit;
  } catch (err) {
    console.error("[licenseLookup] read failed", err);
    return null;
  }
}
