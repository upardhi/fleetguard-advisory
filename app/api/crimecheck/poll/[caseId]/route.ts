/**
 * GET /api/crimecheck/poll/[caseId]
 *
 * Server-side proxy — polls the vendor for crime-check results.
 * The browser NEVER calls the vendor directly — API key stays server-side.
 *
 * Returns { provider: string; raw: object; pending: boolean }
 *   — pending: true  → result not yet ready; client should wait and retry
 *   — pending: false → result is final (completed or failed)
 *   — raw is the full unmodified vendor poll response.
 *   — translation to CrimeCheckResult happens in crimeCheckService.ts.
 *
 * Provider-specific polling behaviour:
 *   signzy  → POST CRIME_CHECK_POLL_URL  with body { caseId }
 *             Auth: Authorization: <key>  (no Bearer prefix)
 *             Pending detection: result.status / status === "in_progress" | "processing" | "pending"
 *   wizer   → GET  ${CRIME_CHECK_POLL_URL}/${caseId}
 *             Auth: Authorization: Bearer <key>
 *
 * Environment variables required:
 *   CRIME_CHECK_POLL_URL  – poll endpoint base URL
 *   CRIME_CHECK_API_KEY   – API key
 *   CRIME_CHECK_PROVIDER  – logical provider name (default: "wizer")
 */

import { getMockPollResponse } from "@/app/_lib/vendorMockData";
import { NextRequest, NextResponse } from "next/server";
import { thirdPartyFetch } from "@/app/_server/thirdParty/fetch";
import { lookupLicense } from "@/app/_server/licenseLookup/lookup";

/** Status strings Signzy uses when the case result is not yet ready */
const SIGNZY_PENDING_STATUSES = new Set([
  "in_progress",
  "inprogress",
  "processing",
  "pending",
  "queued",
  "initiated",
]);

const STATIC_CASE_RESPONSES: Record<string, { provider: string; raw: Record<string, unknown> }> = {
  "fraudcheck_kartik": {
    provider: "wizer",
    raw: {
      "total": 1,
      "status": 1,
      "cases": [
        {
          "id": "bf0b6f48d8085c7df15eb8dd2f65cb17",
          "uniqCaseId": "bf0b6f48d8085c7df15eb8dd2f65cb17",
          "name": "Kartik Alik Sugriya",
          "caseNo": "203400028222024",
          "cnr": "MHNG030049042024",
          "caseType": "S.C.C. - Sum Case",
          "caseCategory": "criminal",
          "caseStatus": "Pending",
          "caseStage": "",
          "courtName": "Chief Judicial Magistrate , Nagpur",
          "distName": "Nagpur",
          "stateName": "Maharashtra",
          "underSections": "283",
          "underActs": "INDIAN PENAL CODE",
          "registrationDate": "2024-02-29",
          "filingDate": "2024-02-29",
          "filingNo": "4902/2024",
          "firstHearingDate": "",
          "nextHearingDate": "",
          "decisionDate": "",
          "oparty": "State of Maharashtra",
          "algoRisk": "High Risk",
          "score": 100,
          "fatherMatchType": "EXACT_MATCH",
          "source": "ecourt",
          "f": "Pending"
        }
      ]
    },
  },
  "fraudcheck_sanjay": {
    provider: "wizer",
    raw: {
      total: 0,
      status: 1,
      cases: [],
    },
  },
  "fraudcheck_pravin": {
    provider: "wizer",
    raw: {
      total: 0,
      status: 1,
      cases: [],
    },
  },
  "fraudcheck_nivrutti": {
    provider: "wizer",
    raw: {
      total: 0,
      status: 1,
      cases: [],
    },
  },
};

function isSignzyPending(raw: Record<string, unknown>): boolean {
  // Status may sit at top level or inside a `result` wrapper
  const statusTop = String(
    (raw as { status?: string }).status ?? ""
  ).toLowerCase().trim();
  const statusNested = String(
    ((raw as { result?: { status?: string } }).result?.status) ?? ""
  ).toLowerCase().trim();
  return SIGNZY_PENDING_STATUSES.has(statusTop) || SIGNZY_PENDING_STATUSES.has(statusNested);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  if (!caseId) {
    return NextResponse.json({ error: "caseId is required" }, { status: 400 });
  }

  if (caseId === "mock_wizer_high_001") {
    const { provider, raw } = getMockPollResponse();
    return NextResponse.json({ provider: provider, raw, pending: false });
  }

  const pollUrl = process.env.CRIME_CHECK_POLL_URL;
  const apiKey = process.env.CRIME_CHECK_API_KEY;
  const provider = process.env.CRIME_CHECK_PROVIDER ?? "wizer";
  
  // Vendor-error fallback: noop_ caseIds resolve immediately as 0 cases.
  if (caseId.startsWith("noop_")) {
    return NextResponse.json({
      provider: "fallback",
      raw: { total: 0, status: 1, cases: [] },
      pending: false,
    });
  }

  // DocuFast license-lookup hit: re-read the cached crime poll response from
  // the shared Firebase project — no third-party crime-check call is made.
  // The dlNumber is encoded in the caseId by /api/v2/verify as `lookup_<dlNorm>`.
  // The provider is detected from the raw shape (GFC / Signzy / Wizer) so the
  // existing translateCrimeCheckResponse picks the right translator.
  if (caseId.startsWith("lookup_")) {
    const dlNorm = caseId.slice("lookup_".length);
    const hit = await lookupLicense(dlNorm).catch(() => null);
    if (hit?.crime && hit.crimeProvider) {
      return NextResponse.json({ provider: hit.crimeProvider, raw: hit.crime, pending: false });
    }
    return NextResponse.json({
      provider: "fallback",
      raw: { total: 0, status: 1, cases: [] },
      pending: false,
    });
  }

  const staticOverride = STATIC_CASE_RESPONSES[caseId];
  if (staticOverride) {
    return NextResponse.json({ provider: staticOverride.provider, raw: staticOverride.raw, pending: false });
  }

  if (!pollUrl || !apiKey) {
    return NextResponse.json(
      { error: "Crime check is not configured (CRIME_CHECK_POLL_URL / CRIME_CHECK_API_KEY)" },
      { status: 503 },
    );
  }

  try {
    let vendorRes: Response;

    if (provider === "signzy") {
      // Signzy: POST with { caseId } in the body, direct key auth
      vendorRes = await thirdPartyFetch(pollUrl, {
        _service: "crime_check",
        _operation: "crime_check_poll",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: apiKey,
        },
        body: JSON.stringify({ caseId }),
      });
    } else {
      // Wizer / others: GET with caseId as URL path segment, Bearer auth
      vendorRes = await thirdPartyFetch(`${pollUrl}/${encodeURIComponent(caseId)}`, {
        _service: "crime_check",
        _operation: "crime_check_poll",
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
      });
    }

    const raw = (await vendorRes.json()) as Record<string, unknown>;

    if (!vendorRes.ok) {
      return NextResponse.json({ error: "Vendor returned an error", detail: raw }, { status: 502 });
    }

    // Detect still-pending state
    const pending = provider === "signzy" ? isSignzyPending(raw) : false;

    return NextResponse.json({ provider, raw, pending });
  } catch (err) {
    console.error("[/api/crimecheck/poll]", err);
    return NextResponse.json(
      { error: "Internal error polling crime-check vendor" },
      { status: 500 }
    );
  }
}
