import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { requireUser } from "@/app/_server/auth/getUser";
import { applySecurityHeaders } from "@/app/_server/security/headers";

const PayloadSchema = z.object({
  scope:          z.enum(["warehouse", "org"]),
  warehouseName:  z.string().max(200).optional(),
  warehouseCount: z.number().int().nonnegative().optional(),
  windowDays:     z.number().int().positive().max(365),
  metrics: z.object({
    totalGateEvents: z.number().int().nonnegative(),
    uniqueDrivers:   z.number().int().nonnegative(),
    flaggedDrivers:  z.number().int().nonnegative(),
    invalidDl:       z.number().int().nonnegative(),
    expiredDl:       z.number().int().nonnegative(),
    courtCases:      z.number().int().nonnegative(),
    activeCriminal:  z.number().int().nonnegative(),
    openAlerts:      z.number().int().nonnegative(),
    criticalAlerts:  z.number().int().nonnegative(),
    spCount:         z.number().int().nonnegative().optional(),
    topRiskSp:       z.object({ name: z.string().max(200), total: z.number().int().nonnegative() }).optional(),
  }),
});

const BodySchema = z.object({
  payload: PayloadSchema,
  force:   z.boolean().optional(),
});

type Payload = z.infer<typeof PayloadSchema>;

interface SummaryResponse {
  headline:    string;
  narrative:   string;
  insights:    string[];
  generatedAt: string;
  source:      "openai" | "fallback";
}

// In-memory cache keyed by hash of payload — same metrics → same response for
// 5 minutes. Avoids burning OpenAI tokens on every Insights page render.
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; res: SummaryResponse }>();

function hashPayload(p: Payload): string {
  return JSON.stringify(p);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Auth
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  // Insights are for managers, CSOs, and superadmins only.
  const allowedRoles = new Set(["wh_manager", "regional_manager", "cso", "company_admin", "superadmin"]);
  if (!allowedRoles.has(actor.role)) {
    return applySecurityHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }

  // Parse + validate
  let body: z.infer<typeof BodySchema>;
  try {
    const json = await req.json();
    body = BodySchema.parse(json);
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.issues.map((i) => i.message).join("; ") : "Invalid request body";
    return applySecurityHeaders(NextResponse.json({ error: msg }, { status: 400 }));
  }

  const { payload, force } = body;
  const key = hashPayload(payload);

  // Cache hit
  if (!force) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return applySecurityHeaders(NextResponse.json(hit.res));
    }
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const result: SummaryResponse = apiKey
    ? await generateWithOpenAI(payload, apiKey)
    : generateFallback(payload);

  cache.set(key, { at: Date.now(), res: result });
  return applySecurityHeaders(NextResponse.json(result));
}

// ── OpenAI generation ────────────────────────────────────────────────────────

async function generateWithOpenAI(p: Payload, apiKey: string): Promise<SummaryResponse> {
  const client = new OpenAI({ apiKey });

  const scopeLabel = p.scope === "warehouse"
    ? `the ${p.warehouseName ?? "warehouse"}`
    : `${p.warehouseCount ?? "all"} active warehouses across the organisation`;

  const systemPrompt = [
    "You are an executive analytics assistant for FleetGuard, a warehouse security and driver-verification platform used by FMCG companies in India.",
    "You write concise, board-grade narrative summaries for warehouse managers and chief security officers.",
    "Tone: confident, factual, action-oriented. No marketing fluff. No emojis. No hedging.",
    "Always reference the specific numbers given. Never invent numbers.",
    'Output STRICT JSON in this exact shape: {"headline": string, "narrative": string, "insights": [string, string, string]}',
    "headline: one short title-cased sentence (max 90 chars) capturing the headline finding.",
    "narrative: 3-4 sentences (max 480 chars) describing what the data shows and what it means operationally.",
    "insights: exactly 3 short bullet points (each max 130 chars) — concrete, prioritised, and tied to the numbers.",
  ].join("\n");

  const userPrompt = [
    `Scope: ${scopeLabel}.`,
    `Window: last ${p.windowDays} days.`,
    `Metrics:`,
    `- Gate events processed: ${p.metrics.totalGateEvents.toLocaleString()}`,
    `- Unique drivers seen: ${p.metrics.uniqueDrivers.toLocaleString()}`,
    `- Drivers flagged (any reason): ${p.metrics.flaggedDrivers.toLocaleString()}`,
    `- Invalid DLs caught at gate: ${p.metrics.invalidDl}`,
    `- Expired DLs caught at gate: ${p.metrics.expiredDl}`,
    `- Court cases discovered on entered drivers: ${p.metrics.courtCases}`,
    `- Active criminal cases (not yet closed): ${p.metrics.activeCriminal}`,
    `- Open alerts: ${p.metrics.openAlerts} (of which ${p.metrics.criticalAlerts} critical)`,
    p.metrics.spCount != null ? `- Service providers active: ${p.metrics.spCount}` : "",
    p.metrics.topRiskSp ? `- Highest-risk provider: ${p.metrics.topRiskSp.name} with ${p.metrics.topRiskSp.total} flagged drivers` : "",
    "",
    "Return strict JSON only.",
  ].filter(Boolean).join("\n");

  const completion = await client.chat.completions.create({
    model:           "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature:     0.4,
    max_tokens:      500,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userPrompt   },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error("OpenAI returned an empty response");

  let parsed: { headline?: string; narrative?: string; insights?: string[] };
  try { parsed = JSON.parse(raw); }
  catch { throw new Error("OpenAI returned non-JSON content"); }

  return {
    headline:    String(parsed.headline ?? "").slice(0, 200),
    narrative:   String(parsed.narrative ?? "").slice(0, 800),
    insights:    Array.isArray(parsed.insights)
      ? parsed.insights.slice(0, 3).map((s) => String(s).slice(0, 200))
      : [],
    generatedAt: new Date().toISOString(),
    source:      "openai",
  };
}

// ── Deterministic fallback (when OPENAI_API_KEY is not set) ─────────────────

function generateFallback(p: Payload): SummaryResponse {
  const m = p.metrics;
  const scope = p.scope === "warehouse"
    ? p.warehouseName ?? "this warehouse"
    : `${p.warehouseCount ?? "all"} warehouses`;

  const flaggedPct = m.uniqueDrivers > 0
    ? ((m.flaggedDrivers / m.uniqueDrivers) * 100).toFixed(1)
    : "0";

  const headline = m.criticalAlerts > 0
    ? `${m.criticalAlerts} critical alert${m.criticalAlerts === 1 ? "" : "s"} require attention at ${scope}`
    : m.flaggedDrivers > 0
    ? `${m.flaggedDrivers} of ${m.uniqueDrivers} drivers flagged across ${scope}`
    : `${scope} cleared with ${m.totalGateEvents.toLocaleString()} verified gate events`;

  const narrative = [
    `Over the last ${p.windowDays} days, ${m.totalGateEvents.toLocaleString()} gate events were processed at ${scope}, covering ${m.uniqueDrivers.toLocaleString()} unique drivers.`,
    `${m.flaggedDrivers} drivers (${flaggedPct}% of the pool) were flagged by Fraudcheck risk rules — ${m.invalidDl} invalid DLs, ${m.expiredDl} expired DLs, and ${m.courtCases} court records discovered.`,
    m.activeCriminal > 0
      ? `${m.activeCriminal} of those court records are still active criminal cases, which means a verified driver is currently entering site with an open matter.`
      : "No active criminal cases were detected on drivers currently entering site.",
    `${m.openAlerts} alerts are open${m.criticalAlerts > 0 ? `, ${m.criticalAlerts} of them critical and awaiting acknowledgement` : ""}.`,
  ].join(" ");

  const insights: string[] = [];
  if (m.invalidDl > 0)         insights.push(`Tighten DL scan-at-gate — ${m.invalidDl} invalid licences slipped through manual entry.`);
  if (m.expiredDl > 0)         insights.push(`Set 30-day SLA renewal alerts for transport-DL holders — ${m.expiredDl} expired licences caught.`);
  if (m.activeCriminal > 0)    insights.push(`Review ${m.activeCriminal} active criminal case${m.activeCriminal === 1 ? "" : "s"} with security before the next inbound.`);
  if (m.criticalAlerts > 0)    insights.push(`Acknowledge ${m.criticalAlerts} critical alert${m.criticalAlerts === 1 ? "" : "s"} — none should remain open beyond 24 h.`);
  if (m.topRiskSp)             insights.push(`${m.topRiskSp.name} carries the highest concentration of flags (${m.topRiskSp.total}). Consider procurement review.`);
  if (m.flaggedDrivers === 0)  insights.push("All gate events cleared — keep the playbook running and prepare scale-out to next warehouse.");
  while (insights.length < 3) insights.push("Continue monitoring · no additional action recommended right now.");

  return {
    headline,
    narrative,
    insights: insights.slice(0, 3),
    generatedAt: new Date().toISOString(),
    source:      "fallback",
  };
}
