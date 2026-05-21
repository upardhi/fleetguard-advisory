/**
 * News analysis — turns a scraped news article into a structured disruption.
 * Detects current disruptions AND future scheduled events (PM visits, bandh, etc.)
 * Uses OpenAI when OPENAI_API_KEY is set; otherwise falls back to keyword classifier.
 */

export type DisruptionCategory =
  | "political"
  | "weather"
  | "traffic"
  | "security"
  | "infrastructure"
  | "religious"
  | "vvip"
  | "natural_disaster";

export type RiskLevel = "critical" | "high" | "medium" | "low" | "safe";

export type EventType = "ongoing" | "scheduled" | "historical";

export interface AnalyzedDisruption {
  isRelevant: boolean;
  category: DisruptionCategory;
  title: string;
  summary: string;
  detail: string;
  riskLevel: RiskLevel;
  etaImpactHours: number;
  confidence: number;
  affectedLocation?: string;
  affectedHighway?: string;
  // Event timing — critical for future fleet planning
  eventType: EventType;
  eventDate: string | null;   // ISO date if extractable, e.g. "2026-06-15"
  durationDays: number;       // expected duration in days
}

export interface AnalyzeContext {
  segment: string;
  state?: string;
  /** Today's date in YYYY-MM-DD — injected so the model can resolve relative dates */
  todayIso?: string;
}

// ── Keyword heuristic (fallback) ──────────────────────────────────────────────

const CATEGORY_KEYWORDS: Record<DisruptionCategory, string[]> = {
  political:        ["bandh", "strike", "protest", "agitation", "election", "rally", "blockade", "dharna"],
  weather:          ["rain", "fog", "storm", "heatwave", "hailstorm", "cyclone", "thunderstorm"],
  traffic:          ["accident", "pile-up", "collision", "jam", "congestion", "overturn", "traffic"],
  security:         ["curfew", "violence", "clash", "stone pelting", "law and order", "terror", "encounter"],
  infrastructure:   ["bridge", "repair", "construction", "roadwork", "diversion", "closed", "collapse"],
  religious:        ["procession", "festival", "yatra", "puja", "mela", "immersion", "kanwar"],
  vvip:             ["vvip", "pm ", "prime minister", "president", "convoy", "motorcade", "minister visit"],
  natural_disaster: ["flood", "landslide", "cyclone", "earthquake", "cloudburst", "deluge"],
};

const FUTURE_KEYWORDS = [
  "will be", "scheduled", "planned", "announced", "upcoming", "on sunday", "on monday",
  "on tuesday", "on wednesday", "on thursday", "on friday", "on saturday",
  "next week", "next month", "tomorrow", "will visit", "will hold", "to be held",
  "is expected", "is likely", "proposed", "set to",
];

// Critical: events that stop movement entirely
const CRITICAL_WORDS = [
  "bandh", "chakka jam", "truckers strike", "transport strike", "driver strike",
  "complete shutdown", "indefinite", "washed away", "collapsed", "bridge collapse",
  "curfew", "section 144", "riot", "communal", "mob violence", "road roko",
  "landslide blocking", "highway blocked", "flooded road", "submerged",
  "cargo theft", "hijack", "highway robbery", "extortion zone", "vehicle arson",
  "road washout", "cyclone",
];
// High: events that cause major delay or rerouting
const HIGH_RISK_WORDS = [
  "highway closure", "nh closed", "sh closed", "toll plaza blocked",
  "border closed", "check post congestion", "vehicle ban", "movement restriction",
  "fuel strike", "diesel shortage", "pump strike", "night ban",
  "procession blocking", "yatra", "mela road closure",
];

// Try to extract a date from text like "June 15", "15th June 2026", etc.
const MONTH_MAP: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04",
  may: "05", june: "06", july: "07", august: "08",
  september: "09", october: "10", november: "11", december: "12",
};

function extractDate(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [month, mm] of Object.entries(MONTH_MAP)) {
    // "June 15" or "15 June" or "15th June"
    const m1 = new RegExp(`${month}\\s+(\\d{1,2})(?:st|nd|rd|th)?`).exec(lower);
    const m2 = new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+${month}`).exec(lower);
    const day = m1?.[1] ?? m2?.[1];
    if (day) {
      const year = new Date().getFullYear();
      return `${year}-${mm}-${day.padStart(2, "0")}`;
    }
  }
  return null;
}

function classify(text: string): { category: DisruptionCategory; score: number } {
  const lower = text.toLowerCase();
  let best: DisruptionCategory = "traffic";
  let bestHits = 0;
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS) as [DisruptionCategory, string[]][]) {
    const hits = words.filter((w) => lower.includes(w)).length;
    if (hits > bestHits) { bestHits = hits; best = cat; }
  }
  return { category: best, score: bestHits };
}

function heuristicAnalyze(content: string, ctx: AnalyzeContext): AnalyzedDisruption {
  const lower = content.toLowerCase();
  const { category, score } = classify(content);

  const isCritical = CRITICAL_WORDS.some((w) => lower.includes(w));
  const isHigh     = HIGH_RISK_WORDS.some((w) => lower.includes(w));

  // Heuristic only surfaces actionable (critical/high) events — never medium/low noise
  const isRelevant = isCritical || isHigh;
  const riskLevel: RiskLevel  = isCritical ? "critical" : isHigh ? "high" : "safe";
  const etaImpactHours        = isCritical ? 8 : isHigh ? 4 : 0;

  const isFuture = FUTURE_KEYWORDS.some((w) => lower.includes(w));
  const eventDate = extractDate(content);
  const eventType: EventType = isFuture ? "scheduled" : "ongoing";

  const firstLine = content.split("\n").find((l) => l.trim().length > 20)?.trim() ?? content.slice(0, 120);

  return {
    isRelevant,
    category,
    title:    firstLine.slice(0, 90),
    summary:  content.slice(0, 240).replace(/\s+/g, " ").trim(),
    detail:   content.slice(0, 600).replace(/\s+/g, " ").trim(),
    riskLevel,
    etaImpactHours,
    confidence: Math.min(70, 30 + score * 15),
    affectedLocation: ctx.segment,
    eventType,
    eventDate,
    durationDays: 1,
  };
}

// ── OpenAI analysis ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior logistics risk analyst for an Indian fleet operations platform.
Your job is NOT to report the news — it is to surface ONLY events that require fleet managers to take a concrete action RIGHT NOW (hold, reroute, delay, or escalate a dispatch).

━━━ STALENESS CHECK — DO THIS FIRST ━━━
Before anything else, determine if this event is CURRENTLY ACTIVE.
You will be told Today's date. Use it strictly.

STALE / CONCLUDED → set isRelevant=false, eventType="historical":
✗ The article uses past tense to describe the disruption ("was blocked", "had closed", "took place", "was held")
✗ The article says the situation has been resolved ("roads reopened", "traffic cleared", "bandh called off", "situation normal", "protest withdrawn", "back to normal")
✗ The event date is clearly MORE THAN 24 HOURS before today's date and there is no indication it is still ongoing
✗ The event was a one-time occurrence (single-day bandh, rally, procession) that has already passed
✗ The headline uses "YESTERDAY", "LAST WEEK", or a past date that is before today
✗ Any article that reports a RESULT of a past event ("X people arrested after...", "highway reopened after...", "police dispersed...")

CURRENTLY ACTIVE → may be relevant:
✓ The disruption is described as happening NOW or TODAY
✓ Multi-day events (flood, prolonged strike, construction diversion) where today falls within the stated duration
✓ Ongoing situations with no stated end ("indefinite bandh", "highway still blocked")
✓ Articles published today or yesterday that describe a continuing situation

━━━ ACTIONABLE TAXONOMY — only ACTIVE events qualify ━━━

CRITICAL (isRelevant=true, riskLevel="critical") — causes dispatch stoppage or severe delay:
• Political / Civil Agitation — Bharat bandh, state bandh, chakka jam, farmer protest, political blockade, district-level agitation, road-roko (ONLY if happening today or still active)
• Labour / Transport Union Action — truckers' strike, transport union strike, driver strike, loading-labour agitation near industrial/warehouse areas
• Law & Order Disruption — riot, communal tension, curfew, Section 144, mob violence, highway mob blockade
• Natural Disaster on Roads — flooded roads, landslide blocking highway, bridge collapse, road washout, cyclone cutting access
• Security Threat on Route — cargo theft alert, hijack risk, highway robbery, extortion zone, vehicle arson during unrest
• Strategic Corridor Disruption — closure of key factory-to-warehouse or inter-city freight artery, industrial belt access blockage

HIGH (isRelevant=true, riskLevel="high") — causes significant delay or rerouting:
• Highway / Corridor Blockage — national highway closure, state highway closure, toll plaza blockade, border check-post congestion
• Regulatory / Government Restriction — inter-state movement ban, pollution-based vehicle ban, city entry restriction, night-movement enforcement
• Fuel / Transport Infrastructure Disruption — fuel pump strike, major diesel shortage, widespread toll-system failure
• Large Religious Event / Yatra / Mela with confirmed road impact on freight routes (ONLY if starting today or tomorrow)

━━━ DO NOT REPORT — set isRelevant=false ━━━
✗ ANY event that has already concluded (this is the most important rule)
✗ Events that happened MORE THAN 24 HOURS AGO unless clearly still ongoing today
✗ Routine traffic jams or minor congestion (no physical blockage)
✗ Light rain, morning fog, or ordinary weather without road closure
✗ Minor accidents that have been cleared
✗ Religious processions limited to city lanes not used by freight
✗ VIP/VVIP movement unless it causes a multi-hour NH/SH closure
✗ Construction or pothole news without active road closure
✗ General political speeches, meetings, or rallies without transport impact
✗ Any event where freight movement is possible with minor delay (<1 hour)
✗ Anything medium-risk, low-risk, or local in nature that does not block a freight corridor
✗ News articles that are follow-ups, analyses, or reviews of past events

━━━ KEY PRINCIPLE ━━━
If a truck driver can pass through with minor inconvenience, it is NOT relevant.
Only flag when a fleet manager must take a DECISION TODAY — hold the truck, reroute, or escalate.
When in doubt about whether an event is still active — set isRelevant=false. False negatives are safe; false positives cause operational chaos.

Respond ONLY with minified JSON:
{"isRelevant":boolean,"category":"political|weather|traffic|security|infrastructure|religious|vvip|natural_disaster","title":string,"summary":string,"detail":string,"riskLevel":"critical|high|medium|low|safe","etaImpactHours":number,"confidence":number,"affectedLocation":string,"affectedHighway":string|null,"eventType":"ongoing|scheduled|historical","eventDate":"YYYY-MM-DD"|null,"durationDays":number}

Field rules:
- isRelevant=true ONLY for Critical or High events that are CURRENTLY ACTIVE. Everything else is false.
- riskLevel must be "critical" or "high" when isRelevant=true. Never return medium/low/safe with isRelevant=true.
- eventType="scheduled" — confirmed future event not yet started (announced for tomorrow or later)
- eventType="ongoing"   — ACTIVE disruption happening RIGHT NOW or started within last 24h and still continuing
- eventType="historical"— event has concluded or happened more than 24h ago without ongoing impact; MUST set isRelevant=false
- eventDate: specific ISO date if extractable (the actual event date, not the article date), else null
- durationDays: 1 for single-day events, 0 if unknown, actual days for multi-day events
- etaImpactHours: realistic extra truck delay — minimum 2h for high, 4h+ for critical
- title ≤90 chars. summary ≤240 chars. detail ≤600 chars. confidence 0-100.`;

async function openaiAnalyze(content: string, ctx: AnalyzeContext): Promise<AnalyzedDisruption> {
  const today = ctx.todayIso ?? new Date().toISOString().slice(0, 10);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Today's date: ${today}
Road segment being checked: ${ctx.segment}${ctx.state ? ` (${ctx.state})` : ""}

IMPORTANT: Apply the staleness check FIRST. If this article describes an event that has already concluded or occurred more than 24 hours before today (${today}), set isRelevant=false and eventType="historical" regardless of how severe it sounds.

Article content:
${content.slice(0, 6000)}`,
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  const p = JSON.parse(data.choices[0].message.content) as Partial<AnalyzedDisruption>;

  return {
    isRelevant:      p.isRelevant ?? false,
    category:        (p.category as DisruptionCategory) ?? "traffic",
    title:           p.title ?? "Disruption reported",
    summary:         p.summary ?? "",
    detail:          p.detail ?? p.summary ?? "",
    riskLevel:       (p.riskLevel as RiskLevel) ?? "medium",
    etaImpactHours:  typeof p.etaImpactHours === "number" ? p.etaImpactHours : 1,
    confidence:      typeof p.confidence === "number" ? p.confidence : 50,
    affectedLocation: p.affectedLocation ?? ctx.segment,
    affectedHighway:  p.affectedHighway ?? undefined,
    eventType:       (p.eventType as EventType) ?? "ongoing",
    eventDate:       p.eventDate ?? null,
    durationDays:    typeof p.durationDays === "number" ? p.durationDays : 1,
  };
}

/** Analyze a news article into a structured disruption, detecting both current and future events. */
export async function analyzeNews(
  content: string,
  ctx: AnalyzeContext,
): Promise<AnalyzedDisruption> {
  if (process.env.OPENAI_API_KEY) {
    try { return await openaiAnalyze(content, ctx); }
    catch (err) { console.error("[analyze] OpenAI failed, falling back to heuristic:", err); }
  }
  return heuristicAnalyze(content, ctx);
}
