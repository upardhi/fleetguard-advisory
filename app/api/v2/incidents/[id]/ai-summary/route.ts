/**
 * POST /api/v2/incidents/:id/ai-summary
 *
 * Generates an AI-written, per-case + overall driver-risk summary for a
 * single incident. Mirrors the prompt + cache discipline of the existing
 * /api/v2/insights/summary route so behaviour is consistent.
 *
 * Source data:
 *   - incidents row (status, severity, type)
 *   - linked gate event metadata.crimeCheckData.pollData.caseDetails
 *   - driver row (name, dl_number)
 *
 * Output:
 *   {
 *     cases:   Array<{ index, summary, status, riskLevel, severity, type, year }>,
 *     overall: { totalCases, pattern, behavior, riskLevel, recommendation, narrative },
 *     generatedAt: string,
 *     source: "openai" | "fallback"
 *   }
 *
 * Cache: 5 minutes per (incident_id, case-data hash). Force refresh with
 *        `force: true` in the body.
 */
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { requireUser } from "@/app/_server/auth/getUser";
import { applySecurityHeaders } from "@/app/_server/security/headers";
import { db } from "@/app/_server/db/client";

// ── Types ────────────────────────────────────────────────────────────────

type AnyObj = Record<string, unknown>;

interface CaseSummary {
  index:     number;
  summary:   string;
  status:    string;   // "Active" | "Closed" | "Pending" | "Convicted" | "Unknown"
  riskLevel: string;   // "High" | "Medium" | "Low"
  severity:  string;   // raw from data, normalised
  type:      string;   // "Criminal" | "Civil" | …
  year:      string;
}

interface OverallSummary {
  totalCases:     number;
  pattern:        string;
  behavior:       string;
  riskLevel:      string;   // "High" | "Medium" | "Low"
  recommendation: string;
  narrative:      string;   // a one-paragraph version for header display
}

interface AIResponse {
  cases:       CaseSummary[];
  overall:     OverallSummary;
  generatedAt: string;
  source:      "openai" | "fallback";
}

// ── Cache (5 min) ────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; res: AIResponse }>();

function hashCases(incidentId: string, cases: AnyObj[], driverName: string, incidentType: string): string {
  return JSON.stringify({ incidentId, cases, driverName, incidentType });
}

// ── Helpers ──────────────────────────────────────────────────────────────

function asStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function normaliseStatus(raw: string): string {
  const s = raw.toLowerCase();
  if (s === "pending")           return "Pending";
  if (s === "convicted")         return "Convicted";
  if (s === "acquitted")         return "Acquitted";
  if (s === "closed")            return "Closed";
  if (s === "active")            return "Active";
  if (s === "")                  return "Unknown";
  return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

function riskFromCase(c: AnyObj): "High" | "Medium" | "Low" {
  const sev = asStr(c.severity).toLowerCase();
  if (sev === "high")   return "High";
  if (sev === "medium") return "Medium";
  if (sev === "low")    return "Low";
  // Fall back on caseType + status
  const type   = asStr(c.caseTypeName ?? c.caseType).toLowerCase();
  const status = asStr(c.caseStatus).toLowerCase();
  if (type === "criminal" && status === "pending")   return "High";
  if (type === "criminal" && status === "convicted") return "High";
  if (type === "criminal")                            return "Medium";
  return "Low";
}

function overallRisk(cases: CaseSummary[]): "High" | "Medium" | "Low" {
  if (cases.length === 0) return "Low";
  const high = cases.filter((c) => c.riskLevel === "High").length;
  const med  = cases.filter((c) => c.riskLevel === "Medium").length;
  if (high >= 2 || (high >= 1 && cases.length >= 3)) return "High";
  if (high >= 1 || med >= 2)                          return "Medium";
  return "Low";
}

// ── Handler ──────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  // Auth — same role set as the existing insights summary route.
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const allowedRoles = new Set([
    "wh_manager", "regional_manager", "cso", "company_admin", "superadmin",
  ]);
  if (!allowedRoles.has(actor.role)) {
    return applySecurityHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }

  const { id: incidentId } = await params;

  // Parse force flag from body — body itself is optional.
  let force = false;
  try {
    const body = await req.json().catch(() => ({}));
    force = !!(body as AnyObj).force;
  } catch { /* empty body is fine */ }

  // ── Load incident ──────────────────────────────────────────────────────
  const incidentRows = await db<AnyObj[]>`
    SELECT id, type, status, severity, description, linked_gate_event_id
    FROM   incidents
    WHERE  id = ${incidentId} AND org_id = ${actor.org}
    LIMIT  1
  `;
  if (incidentRows.length === 0) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Incident not found" }, { status: 404 }),
    );
  }
  const incident = incidentRows[0];

  // ── Load gate event metadata (where the crime check lives) ─────────────
  const linkedEventId = incident.linked_gate_event_id as string | null;
  let caseDetails: AnyObj[] = [];
  let driverIdFromEvent: string | null = null;
  if (linkedEventId) {
    const evRows = await db<AnyObj[]>`
      SELECT driver_id, metadata
      FROM   gate_events
      WHERE  id = ${linkedEventId}
      LIMIT  1
    `;
    if (evRows.length > 0) {
      driverIdFromEvent = (evRows[0].driver_id as string) ?? null;
      const meta = (evRows[0].metadata as AnyObj) ?? {};
      const cc   = (meta.crimeCheckData as AnyObj) ?? {};
      const pd   = (cc.pollData       as AnyObj) ?? {};
      const arr  = pd.caseDetails as unknown;
      if (Array.isArray(arr)) caseDetails = arr as AnyObj[];
    }
  }

  // ── Load driver name for the prompt ────────────────────────────────────
  let driverName = "";
  if (driverIdFromEvent) {
    const drvRows = await db<AnyObj[]>`
      SELECT full_name FROM drivers WHERE id = ${driverIdFromEvent} LIMIT 1
    `;
    driverName = asStr(drvRows[0]?.full_name) || "the driver";
  } else {
    driverName = "the driver";
  }

  // ── Cache disabled — always generate a fresh summary so the prose
  //    stays in step with any data edits and the manager sees the latest
  //    phrasing on every page visit. (The `cache` Map and `key`/`force`
  //    plumbing is intentionally left in place but unused so we can
  //    re-enable later by re-introducing the lookup if cost becomes an
  //    issue.)
  void hashCases; void cache; void CACHE_TTL_MS; void force;

  // ── Build the deterministic skeleton first (used as the fallback AND
  //    passed to the LLM so it has correct numbers/structure to work from).
  const skeleton: AIResponse = buildDeterministic(caseDetails, driverName, asStr(incident.type));

  // ── If OPENAI_API_KEY is set, ask GPT to rewrite the prose nicely.
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const result: AIResponse = apiKey && caseDetails.length > 0
    ? await tryWithOpenAI(apiKey, caseDetails, driverName, asStr(incident.type), skeleton)
    : skeleton;

  // Cache write intentionally removed — we want fresh prose every visit.
  return applySecurityHeaders(NextResponse.json(result));
}

// ── Deterministic fallback (no OpenAI key, or LLM errored) ──────────────

function buildDeterministic(cases: AnyObj[], driverName: string, _incidentType: string): AIResponse {
  if (cases.length === 0) {
    return {
      cases: [],
      overall: {
        totalCases:     0,
        pattern:        "No prior cases found on the driver's DL.",
        behavior:       "Clean record per the eFIR / court database lookup.",
        riskLevel:      "Low",
        recommendation: "No additional review required from a court-record standpoint.",
        narrative:      `${driverName} has no criminal or civil cases on record. Clean record per the eFIR / court database lookup.`,
      },
      generatedAt: new Date().toISOString(),
      source:      "fallback",
    };
  }

  const caseSummaries: CaseSummary[] = cases.map((c, i) => {
    const type      = asStr(c.caseTypeName ?? c.caseType) || "Case";
    const status    = normaliseStatus(asStr(c.caseStatus));
    const year      = asStr(c.caseYear) || asStr(c.year);
    const section   = asStr(c.underSection);
    const court     = asStr(c.courtName);
    const sev       = asStr(c.severity);
    const risk      = riskFromCase(c);
    const sevLabel  = sev ? sev.replace(/\b\w/g, (ch) => ch.toUpperCase()) : "—";

    // Facts only — what the case is, when it was filed, where, and its
    // current status. NO recommendation, advice, or risk-action phrasing.
    void section;
    const lcType  = type.toLowerCase();
    const subject = lcType.includes("criminal") ? "police case"
                  : lcType.includes("civil")    ? "court case"
                  : "case on record";

    const whenPhrase  = year ? `from ${year}` : "";
    const wherePhrase = court ? ` at ${court}` : "";

    let statusPhrase: string;
    const stLc = status.toLowerCase();
    if (stLc === "pending" || stLc === "active") statusPhrase = "It is still going on";
    else if (stLc === "convicted")                statusPhrase = "The court found the driver guilty";
    else if (stLc === "acquitted")                statusPhrase = "The driver was cleared by the court";
    else if (stLc === "closed" || stLc === "disposed") statusPhrase = "The case is now closed";
    else                                           statusPhrase = `Status: ${status.toLowerCase()}`;

    const summary = `${driverName} has a ${subject} ${whenPhrase}${wherePhrase}. ${statusPhrase}.`.replace(/\s{2,}/g, " ");
    void i;
    void risk;
    return {
      index:     i + 1,
      summary,
      status,
      riskLevel: risk,
      severity:  sevLabel,
      type,
      year,
    };
  });

  const total      = caseSummaries.length;
  const active     = caseSummaries.filter((c) => c.status === "Active" || c.status === "Pending").length;
  const high       = caseSummaries.filter((c) => c.riskLevel === "High").length;
  const repeat     = total > 1;
  const finalRisk  = overallRisk(caseSummaries);
  void high;

  // Plain English, easy for a non-expert manager. Deliberately avoids
  // surfacing the raw case-type codes (cc, crlmp, etc.) — those are
  // database tags, not something the reader would understand.
  const pattern = repeat
    ? `The driver has ${total} different cases on record — this isn't a one-off.`
    : "Only one case is on record. Looks like a one-off, not a pattern.";

  // Facts only — describe what the cases are. No recommendation, no
  // "worth a check", no "no need to do anything". Just describe.
  const behavior = active > 0
    ? `${active} of the ${total} ${active === 1 ? "case is" : "cases are"} still going on.`
    : `All ${total} ${total === 1 ? "case is" : "cases are"} already closed.`;

  // recommendation is kept in the response payload (for backwards-compat
  // and future use) but is intentionally NOT included in the narrative
  // paragraph any more — the manager asked for a factual case summary,
  // not an action recommendation.
  const recommendation = "";

  // Build a longer, detailed narrative — still facts only.
  // Includes: total + headline, status breakdown, type / category mix,
  // year span, severity mix, location hint (if all cases at one court).
  const closed     = total - active;
  const policeCount = caseSummaries.filter((c) => c.type.toLowerCase().includes("criminal")).length;
  const civilCount  = caseSummaries.filter((c) => c.type.toLowerCase().includes("civil")).length;
  const otherCount  = total - policeCount - civilCount;
  const highSev   = caseSummaries.filter((c) => c.severity.toLowerCase() === "high").length;
  const medSev    = caseSummaries.filter((c) => c.severity.toLowerCase() === "medium").length;
  const lowSev    = caseSummaries.filter((c) => c.severity.toLowerCase() === "low").length;
  const years     = caseSummaries.map((c) => parseInt(c.year, 10)).filter((y) => Number.isFinite(y));
  const minYear   = years.length ? Math.min(...years) : null;
  const maxYear   = years.length ? Math.max(...years) : null;
  const courts    = [...new Set(
    cases.map((c) => asStr(c.courtName)).filter((s) => s !== ""),
  )];

  const narrativeBits: string[] = [];

  // 1. Headline — total cases on record.
  narrativeBits.push(
    total === 1
      ? `${driverName} has one case on record.`
      : `${driverName} has ${total} cases on record.`,
  );

  // 2. Type / category mix.
  const mixParts: string[] = [];
  if (policeCount > 0) mixParts.push(`${policeCount} police ${policeCount === 1 ? "case" : "cases"}`);
  if (civilCount  > 0) mixParts.push(`${civilCount} court ${civilCount === 1 ? "case" : "cases"}`);
  if (otherCount  > 0) mixParts.push(`${otherCount} other ${otherCount === 1 ? "matter" : "matters"}`);
  if (mixParts.length > 1) {
    narrativeBits.push(`That breaks down into ${mixParts.join(" and ")}.`);
  } else if (mixParts.length === 1 && total > 1) {
    narrativeBits.push(`All of them are ${mixParts[0]}.`);
  }

  // 3. Status breakdown.
  if (active > 0 && closed > 0) {
    narrativeBits.push(
      `${active} ${active === 1 ? "is" : "are"} still going on, while ${closed} ${closed === 1 ? "has" : "have"} already been closed.`,
    );
  } else if (active > 0) {
    narrativeBits.push(
      active === total
        ? "All of them are still going on."
        : `${active} of those ${active === 1 ? "is" : "are"} still going on.`,
    );
  } else {
    narrativeBits.push("All of them are already closed.");
  }

  // 4. Year span.
  if (minYear && maxYear && minYear !== maxYear) {
    narrativeBits.push(`The cases span from ${minYear} to ${maxYear}.`);
  } else if (minYear) {
    narrativeBits.push(`The earliest case dates back to ${minYear}.`);
  }

  // 5. Severity mix — only if there's any variety.
  if (highSev > 0) {
    narrativeBits.push(
      highSev === 1
        ? "One of them is marked serious in the records."
        : `${highSev} of them are marked serious in the records.`,
    );
  } else if (medSev > 0 && lowSev === 0) {
    narrativeBits.push("They are all marked medium in severity.");
  } else if (lowSev === total) {
    narrativeBits.push("All of them are marked low in severity.");
  }

  // 6. Location hint when every case is at one court.
  if (courts.length === 1 && total > 1) {
    narrativeBits.push(`All cases were filed at ${courts[0]}.`);
  } else if (courts.length > 1 && courts.length <= 3) {
    narrativeBits.push(`Filed across ${courts.join(", ")}.`);
  }
  void repeat;

  const narrative = narrativeBits.join(" ");

  return {
    cases:   caseSummaries,
    overall: {
      totalCases:     total,
      pattern,
      behavior,
      riskLevel:      finalRisk,
      recommendation,
      narrative,
    },
    generatedAt: new Date().toISOString(),
    source:      "fallback",
  };
}

// ── OpenAI variant (uses the deterministic skeleton's numbers/risk to
//    ground the model so it can't drift on totals) ─────────────────────

async function tryWithOpenAI(
  apiKey:       string,
  cases:        AnyObj[],
  driverName:   string,
  incidentType: string,
  skeleton:     AIResponse,
): Promise<AIResponse> {
  try {
    const client = new OpenAI({ apiKey });
    const systemPrompt = [
      "You are writing case summaries for a warehouse manager in India who has NO legal or police background.",
      "They are NOT a lawyer. They just need to understand three things:",
      "  1. Did this driver do something wrong?",
      "  2. Is it still going on?",
      "  3. Should I let the driver through the gate, or check first?",
      "",
      "Voice and style — VERY IMPORTANT:",
      " - Write like you're explaining it to a colleague over WhatsApp.",
      " - Use plain everyday English. Short sentences (10–15 words max).",
      " - NEVER use legal jargon. Replace these terms:",
      "     'criminal matter / criminal proceedings' → 'police case'",
      "     'civil dispute / civil suit'             → 'court case'",
      "     'convicted'                              → 'found guilty by the court'",
      "     'acquitted'                              → 'cleared by the court'",
      "     'pending'                                → 'still going on'",
      "     'IPC Section X / under Section Y'        → just leave it out",
      "     'warrants review / clearance'            → 'should be checked'",
      "     'high-severity / matter of concern'      → 'serious'",
      " - Do NOT prefix with 'Case 1:' or any template label.",
      " - Use the driver's actual name (the input gives it).",
      " - No emojis. No marketing fluff. No hedging. Active voice.",
      " - NEVER surface raw case-type codes like 'CC', 'CRLMP', 'CRL.MP', 'WP', 'OS', 'CMA', etc. in the prose.",
      "   These are database tags. They mean nothing to a warehouse manager.",
      "   If you need to name the case, just say 'police case', 'court case', or 'legal matter'.",
      "   Do NOT write 'cc / crlmp' or '(cc / crlmp)' or similar in any string.",
      "",
      "Accuracy:",
      " - Preserve every total, status, year and risk level from the input verbatim — never invent or contradict them.",
      "",
      "Output STRICT JSON in this exact shape:",
      `{"cases":[{"index":1,"summary":string,"status":string,"riskLevel":"High"|"Medium"|"Low","severity":string,"type":string,"year":string}], "overall":{"totalCases":number,"pattern":string,"behavior":string,"riskLevel":"High"|"Medium"|"Low","recommendation":string,"narrative":string}}`,
      "",
      "VERY IMPORTANT — voice constraints:",
      " - Write FACTS ONLY. Describe what the cases are and their status.",
      " - Do NOT recommend any action. Do NOT use phrases like:",
      "     'please check…', 'worth a check', 'don't let them in', 'no need to do anything',",
      "     'keep an eye out', 'worth taking seriously', 'have a quick look',",
      "     'before clearing them', 'before letting him in', 'should be reviewed'.",
      " - Do NOT add 'Overall risk:' or any risk-tag suffix to the narrative.",
      " - Just describe the cases. The reader will judge what to do.",
      "",
      "Per case rules:",
      " - summary: 1–2 short plain-English sentences (≤220 chars total). Facts only.",
      "   GOOD: \"Suresh has a police case from 2023 in Madras. It is still going on.\"",
      "   BAD:  \"Suresh has a police case … please check with your manager before letting him in.\"",
      "   BAD:  \"Case 1: Criminal matter filed under IPC §304A at Madras HC in 2023. Status: Pending. Risk: Medium.\"",
      " - status / riskLevel / severity / type / year: PRESERVE EXACTLY from the input.",
      "",
      "Overall rules:",
      " - totalCases: must equal the number of cases provided.",
      " - riskLevel: PRESERVE EXACTLY from the input.",
      " - pattern: one plain-English fact about whether the cases are a one-off or repeated. No advice.",
      " - behavior: one plain-English fact about the case mix. No advice.",
      " - recommendation: return an empty string \"\". Recommendations are intentionally not surfaced to the reader.",
      " - narrative: 4–6 plain-English sentences that DESCRIBE the cases in detail. Facts only. No advice. No 'Overall risk:' suffix.",
      "   Cover: total cases, type breakdown (police / court), how many are still going on vs. closed, year span (oldest → newest), severity mix, location if helpful.",
      "   GOOD: \"Prabakaran V has 2 cases on record. That breaks down into 1 police case and 1 court case. One of those is still going on, while the other has already been closed. The cases were filed between 2018 and 2023. Both are marked low in severity.\"",
      "   BAD:  \"Prabakaran V has 2 cases on record. Repeated cases like this are worth taking seriously. No need to do anything special right now.\"",
      "   BAD:  \"Prabakaran V has 2 cases on record. 1 of those is still going on.\" (too short — needs more detail)",
    ].join("\n");

    const userPrompt = [
      `Incident type: ${incidentType || "(unspecified)"}`,
      `Driver: ${driverName}`,
      `Skeleton — KEEP the totals/status/year/riskLevel/severity/type values exactly as shown,`,
      `but REWRITE every prose string (cases[].summary, overall.pattern, overall.behavior,`,
      `overall.recommendation, overall.narrative) in your own plain-English voice.`,
      `Do not echo or copy the skeleton prose. Do not include the raw case-type codes`,
      `(e.g. cc, crlmp, wp, os, cma) anywhere in the prose strings.`,
      JSON.stringify(skeleton, null, 2),
      "",
      "Raw case rows (for context only):",
      JSON.stringify(cases, null, 2),
      "",
      "Return strict JSON only.",
    ].join("\n");

    const completion = await client.chat.completions.create({
      model:           "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature:     0.3,
      max_tokens:      1400,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt   },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) return skeleton;

    const parsed = JSON.parse(raw) as Partial<AIResponse>;
    if (!parsed || !Array.isArray(parsed.cases) || !parsed.overall) return skeleton;

    // Strip any raw case-type codes (cc, crlmp, wp, os, cma, crl.mp, …)
    // that may have slipped through the prompt's "do not surface" rule.
    // Matches forms like "(cc / crlmp)", "cc/crlmp", "CC and CRLMP", etc.
    // Replacement: empty — the surrounding sentence still reads fine.
    const stripCodes = (s: string): string => {
      let out = s;
      // Bracketed group of codes: "(cc / crlmp)", "(CC/CRLMP, WP)"
      out = out.replace(/\s*[(\[]\s*(?:cc|crlmp|crl\.?mp|wp|os|cma|cra|crp|cmp|mca|crmc)(?:\s*[/,&]\s*(?:cc|crlmp|crl\.?mp|wp|os|cma|cra|crp|cmp|mca|crmc))*\s*[)\]]/gi, "");
      // Inline pair: "cc / crlmp", "cc and crlmp"
      out = out.replace(/\b(?:cc|crlmp|crl\.?mp|wp|os|cma|cra|crp|cmp|mca|crmc)\s*(?:\/|,|and|or)\s*(?:cc|crlmp|crl\.?mp|wp|os|cma|cra|crp|cmp|mca|crmc)\b/gi, "");
      // Lonely token at word boundary (only if it really is one of these codes)
      out = out.replace(/\b(?:cc|crlmp|crl\.?mp|wp|os|cma|cra|crp|cmp|mca|crmc)\b/gi, "");
      // Tidy up double spaces / orphaned punctuation left behind
      return out.replace(/\s{2,}/g, " ").replace(/\s+([,.;:])/g, "$1").replace(/\(\s*\)/g, "").trim();
    };

    // Hard-guard the numbers/risk so the LLM can never drift on them.
    const safeCases: CaseSummary[] = skeleton.cases.map((sk, i) => {
      const llm = parsed.cases![i] as Partial<CaseSummary> | undefined;
      const llmSummary = stripCodes(asStr(llm?.summary)).slice(0, 320);
      return {
        index:     sk.index,
        summary:   llmSummary || sk.summary,
        status:    sk.status,
        riskLevel: sk.riskLevel,
        severity:  sk.severity,
        type:      sk.type,
        year:      sk.year,
      };
    });
    const safeOverall: OverallSummary = {
      totalCases:     skeleton.overall.totalCases,
      pattern:        stripCodes(asStr(parsed.overall.pattern)).slice(0, 240)        || skeleton.overall.pattern,
      behavior:       stripCodes(asStr(parsed.overall.behavior)).slice(0, 320)       || skeleton.overall.behavior,
      riskLevel:      skeleton.overall.riskLevel,
      recommendation: stripCodes(asStr(parsed.overall.recommendation)).slice(0, 320) || skeleton.overall.recommendation,
      narrative:      stripCodes(asStr(parsed.overall.narrative)).slice(0, 1200)     || skeleton.overall.narrative,
    };

    return {
      cases:       safeCases,
      overall:     safeOverall,
      generatedAt: new Date().toISOString(),
      source:      "openai",
    };
  } catch {
    return skeleton;
  }
}
