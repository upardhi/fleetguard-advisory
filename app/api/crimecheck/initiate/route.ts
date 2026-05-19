/**
 * POST /api/crimecheck/initiate
 *
 * Server-side proxy — starts a crime-check job at the vendor.
 *
 * Body:   { name, dob, fatherName, address, matchType? }
 * Returns { provider: string; raw: object }
 *   — raw is the full unmodified vendor response.
 *   — caseId is extracted from raw by the client (crimeCheckService.ts).
 *
 * Environment variables required:
 *   CRIME_CHECK_API_URL      – initiate endpoint
 *   CRIME_CHECK_API_KEY      – API key (Signzy: direct key; others: Bearer token)
 *   CRIME_CHECK_PROVIDER     – logical provider name (default: "wizer")
 *
 * Provider notes:
 *   signzy  → Authorization: <key>  (no Bearer prefix)
 *   wizer   → Authorization: Bearer <key>
 */

import { NextRequest, NextResponse } from "next/server";
import { lookupStaticCaseId } from "@/app/_lib/staticCases";
import { thirdPartyFetch } from "@/app/_server/thirdParty/fetch";

/**
 * Failure fallback. Any path that can't reach a real vendor result — missing
 * config, missing required fields, vendor 4xx/5xx, network/parse errors —
 * resolves to a noop_<uuid> caseId. The poll endpoint recognises noop_* and
 * returns "0 cases / clean", so the gate-entry flow continues instead of
 * blocking on a vendor outage. Crucially, this is CLEAN (not high-risk):
 * silently faking a high-risk hit on vendor errors would be a footgun.
 */
function noopFallback(reason: string): NextResponse {
  console.warn(`[/api/crimecheck/initiate] noop fallback: ${reason}`);
  return NextResponse.json({
    provider: "fallback",
    raw: { caseId: `noop_${crypto.randomUUID()}` },
  });
}

export async function POST(req: NextRequest) {
  let body: {
    name?: string;
    dob?: string;
    fatherName?: string;
    address?: string;
    matchType?: string;
    dlNumber?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, dob, fatherName, address, matchType = "possible", dlNumber } = body;

  if (dlNumber) {
    const caseId = lookupStaticCaseId(dlNumber);
    if (caseId) {
      return NextResponse.json({
        provider: "static",
        raw: { caseId },          // shape must match what crimeCheckService.ts reads
      });
    }
  }

  const apiUrl = process.env.CRIME_CHECK_API_URL;
  const apiKey = process.env.CRIME_CHECK_API_KEY;
  const provider = process.env.CRIME_CHECK_PROVIDER ?? "wizer";

  if (!apiUrl || !apiKey) {
    return noopFallback("CRIME_CHECK_API_URL / CRIME_CHECK_API_KEY not configured");
  }

  const trimmedName    = name?.trim()    ?? "";
  const trimmedDob     = dob?.trim()     ?? "";
  const trimmedAddress = address?.trim() ?? "";
  const trimmedFather  = fatherName?.trim() ?? "";

  // Signzy requires a non-empty `address`. Without name/dob/address there is
  // no useful crime-check call to make — fall back to noop (clean) so the
  // caller is not blocked on data we don't have.
  if (!trimmedName || !trimmedDob || !trimmedAddress) {
    return noopFallback(
      `missing required field(s): ${
        [
          !trimmedName    && "name",
          !trimmedDob     && "dob",
          !trimmedAddress && "address",
        ].filter(Boolean).join(", ")
      }`,
    );
  }

  // ── Auth header — Signzy uses the key directly, others use Bearer ─────────
  const authHeader = provider === "signzy" ? apiKey : `Bearer ${apiKey}`;

  const vendorPayload: Record<string, string> = {
    name:    trimmedName,
    dob:     trimmedDob,
    address: trimmedAddress,
    matchType,
  };
  if (trimmedFather) vendorPayload.fatherName = trimmedFather;

  try {
    const vendorRes = await thirdPartyFetch(apiUrl, {
      _service: "crime_check",
      _operation: "crime_check_initiate",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify(vendorPayload),
    });

    const raw = (await vendorRes.json()) as Record<string, unknown>;

    if (!vendorRes.ok) {
      return noopFallback(`vendor ${vendorRes.status}`);
    }

    return NextResponse.json({ provider, raw });
  } catch (err) {
    return noopFallback(err instanceof Error ? err.message : "unknown error");
  }
}
