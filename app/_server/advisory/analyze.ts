/**
 * News analysis — turns a scraped news article into a structured disruption.
 * Detects current disruptions AND future scheduled events (PM visits, bandh, etc.)
 * Uses OpenAI when OPENAI_API_KEY is set; otherwise falls back to keyword classifier.
 */

export interface DisruptionSummaryItem {
  cityName: string;
  title: string;
  summary: string;
  riskLevel: string;
  eventType: "ongoing" | "scheduled";
  etaImpactHours?: number;
  eventDate?: string | null;
}

export interface ConsolidatedSummary {
  summary: string;           // Natural language summary (1-3 sentences)
  headline: string;          // Short headline for alert/notification
  riskLevel: string;         // Highest risk across all items
  actionRequired: string;    // Suggested action for fleet manager
  details: Array<{
    city: string;
    title: string;
    risk: string;
    eventType: string;
  }>;
}

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
  political: ["bandh", "strike", "protest", "agitation", "election", "rally", "blockade", "dharna"],
  weather: ["rain", "fog", "storm", "heatwave", "hailstorm", "cyclone", "thunderstorm"],
  traffic: ["accident", "pile-up", "collision", "jam", "congestion", "overturn", "traffic"],
  security: ["curfew", "violence", "clash", "stone pelting", "law and order", "terror", "encounter"],
  infrastructure: ["bridge", "repair", "construction", "roadwork", "diversion", "closed", "collapse"],
  religious: ["procession", "festival", "yatra", "puja", "mela", "immersion", "kanwar"],
  vvip: ["vvip", "pm ", "prime minister", "president", "convoy", "motorcade", "minister visit"],
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
  "traffic jam", "traffic snarl", "gridlock", "massive traffic", "severe traffic",
  "traffic standstill", "hours-long jam", "bumper to bumper", "kilometres of jam",
  "km of traffic", "miles of jam", "traffic backlog", "3-day", "two days jam",

];

const CONSTRUCTION_WORDS = [
  "construction", "roadwork", "road work", "flyover", "barricading",
  "carriageway narrowing", "lane closure", "infrastructure project",
  "widening", "repair work", "maintenance work", "under construction"
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
  debugger;
  // Check for construction activity (with potential disruption)
  const hasConstruction = CONSTRUCTION_WORDS.some((w) => lower.includes(w));

  // Check if construction is causing ANY disruption (even if minor)
  const hasDisruptionKeywords = HIGH_RISK_WORDS.some((w) => lower.includes(w)) ||
    CRITICAL_WORDS.some((w) => lower.includes(w));

  // Check for positive framing (negation of disruption)
  const positiveFraming = [
    "without", "sans", "no traffic chaos", "spared motorists",
    "no gridlock", "no jam", "smooth traffic", "business as usual"
  ];
  const isPositiveFraming = positiveFraming.some(p => {
    const idx = lower.indexOf(p);
    if (idx === -1) return false;
    // Check if it's referring to traffic/construction nearby
    const surrounding = lower.slice(Math.max(0, idx - 40), idx + 40);
    return surrounding.includes("construct") ||
      surrounding.includes("traffic") ||
      surrounding.includes("road");
  });

  // Determine relevance:
  // 1. Construction with disruption keywords → HIGH
  // 2. Construction WITHOUT positive framing → HIGH (assume some impact)
  // 3. Construction with positive framing → MEDIUM (still relevant but less severe)
  // 4. No construction → use existing logic

  let isRelevant = false;
  let riskLevel: RiskLevel = "safe";
  let etaImpactHours = 0;

  if (hasConstruction) {
    if (hasDisruptionKeywords) {
      // Construction actively causing gridlock/jam
      isRelevant = true;
      riskLevel = "high";
      etaImpactHours = 4;
    } else if (!isPositiveFraming) {
      // Construction present - assume SOME impact (even if not explicitly stated)
      // This catches articles like "flyover work progresses" that still have barricading
      isRelevant = true;
      riskLevel = "high";
      etaImpactHours = 3;
    } else {
      // Construction but article explicitly says "no disruption"
      // Still flag as medium for awareness
      isRelevant = true;
      riskLevel = "medium";
      etaImpactHours = 1;
    }
  } else {
    // No construction - use existing logic
    const isCritical = CRITICAL_WORDS.some((w) => lower.includes(w));
    const isHigh = HIGH_RISK_WORDS.some((w) => lower.includes(w));
    isRelevant = isCritical || isHigh;
    riskLevel = isCritical ? "critical" : isHigh ? "high" : "safe";
    etaImpactHours = isCritical ? 8 : isHigh ? 4 : 0;
  }

  const isFuture = FUTURE_KEYWORDS.some((w) => lower.includes(w));
  const eventDate = extractDate(content);
  const eventType: EventType = isFuture ? "scheduled" : "ongoing";

  const firstLine = content.split("\n").find((l) => l.trim().length > 20)?.trim() ?? content.slice(0, 120);

  return {
    isRelevant,
    category: hasConstruction ? "infrastructure" : category,
    title: firstLine.slice(0, 90),
    summary: content.slice(0, 240).replace(/\s+/g, " ").trim(),
    detail: content.slice(0, 600).replace(/\s+/g, " ").trim(),
    riskLevel,
    etaImpactHours,
    confidence: hasConstruction ? 75 : Math.min(70, 30 + score * 15),
    affectedLocation: ctx.segment,
    eventType,
    eventDate,
    durationDays: hasConstruction ? 30 : 1, // Construction usually lasts weeks/months
  };
}

// ── OpenAI analysis ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior logistics risk analyst for an Indian fleet operations platform.

━━━ CRITICAL RULE FOR CONSTRUCTION ━━━
Any article mentioning ACTIVE construction ON A HIGHWAY or MAJOR ROAD with barricading, lane narrowing, or carriageway reduction is ALWAYS relevant - even if the article claims "no gridlock" or "smooth traffic".

Construction ALWAYS causes some level of disruption. Fleet managers MUST know about:
- Lane closures and diversions
- Reduced carriageway width
- Speed restrictions
- Potential for sudden congestion

For construction projects on NH, SH, or major arterial roads:
- Set isRelevant = true
- Set eventType = "ongoing" (if work is currently happening)
- Set riskLevel = "high" (for lane closures/barricading)
- etaImpactHours = minimum 2-3 hours delay

Exception: Only set isRelevant=false if construction is COMPLETELY finished OR explicitly says "road fully open" / "all lanes restored".

━━━ STALENESS CHECK ━━━
Today's date is provided. Use it strictly.

CURRENTLY ACTIVE (isRelevant=true):
✓ Construction work happening NOW or within the last 7 days with no completion announcement
✓ Multi-day events (flood, strike, construction) where today falls within duration
✓ Articles published TODAY or YESTERDAY describing ongoing situations
✓ ANY highway/flyover construction with active barricading - REGARDLESS of positive framing

STALE / CONCLUDED (isRelevant=false, eventType="historical"):
✗ Article explicitly states "work completed", "road reopened", "construction finished"
✗ Article is more than 7 days old AND no evidence work continues
✗ Past tense describing concluded event ("was blocked", "had closed", "took place")

━━━ ACTIONABLE TAXONOMY ━━━

CRITICAL - causes dispatch stoppage:
• Bandh, chakka jam, transport strike, complete shutdown
• Curfew, Section 144, riot, mob violence, highway blockade
• Bridge collapse, landslide blocking, flooded road, cyclone
• Cargo theft, hijack risk, highway robbery

HIGH - causes significant delay (minimum 2+ hours):
• Construction on NH/SH with lane closure or barricading ← ALWAYS HIGH
• Highway closure, toll plaza blocked, border congestion
• Fuel strike, diesel shortage, night movement ban
• Religious procession/yatra/mela on freight route
• Multi-day traffic snarl (2+ days of congestion)

━━━ IGNORE (set isRelevant=false) ━━━
✗ Events that happened >24 hours ago without ongoing impact
✗ Minor accidents cleared within hours (routine)
✗ Light rain or ordinary weather without road closure
✗ Local processions NOT on freight routes
✗ Political speeches or meetings without transport impact
✗ Stock market news, entertainment, sports, celebrity news

━━━ KEY PRINCIPLE ━━━
When in doubt about construction: flag it. False positives are acceptable; missing a construction disruption is NOT.

Respond ONLY with minified JSON (NO markdown, NO explanation, ONLY the JSON object):

{
  "isRelevant": true,
  "category": "infrastructure",
  "title": "Short title under 90 chars",
  "summary": "Brief summary under 240 chars",
  "detail": "Detailed description under 600 chars",
  "riskLevel": "critical|high|medium|low|safe",
  "etaImpactHours": 2,
  "confidence": 85,
  "affectedLocation": "city name",
  "affectedHighway": "NH number if mentioned",
  "eventType": "ongoing|scheduled|historical",
  "eventDate": null or "YYYY-MM-DD",
  "durationDays": 30
}`;

async function openaiAnalyze(content: string, ctx: AnalyzeContext): Promise<AnalyzedDisruption> {
  const today = ctx.todayIso ?? new Date().toISOString().slice(0, 10);
debugger;
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
    isRelevant: p.isRelevant ?? false,
    category: (p.category as DisruptionCategory) ?? "traffic",
    title: p.title ?? "Disruption reported",
    summary: p.summary ?? "",
    detail: p.detail ?? p.summary ?? "",
    riskLevel: (p.riskLevel as RiskLevel) ?? "medium",
    etaImpactHours: typeof p.etaImpactHours === "number" ? p.etaImpactHours : 1,
    confidence: typeof p.confidence === "number" ? p.confidence : 50,
    affectedLocation: p.affectedLocation ?? ctx.segment,
    affectedHighway: p.affectedHighway ?? undefined,
    eventType: (p.eventType as EventType) ?? "ongoing",
    eventDate: p.eventDate ?? null,
    durationDays: typeof p.durationDays === "number" ? p.durationDays : 1,
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


const SUMMARY_SYSTEM_PROMPT = `You are a logistics risk analyst creating concise, actionable summaries for fleet managers.

Given a list of disruptions across nearby cities, create a SINGLE consolidated summary that helps a fleet manager make quick decisions.

Rules:
- Keep summary UNDER 200 characters for alerts, UNDER 500 characters for detailed view
- Start with the HIGHEST risk disruption first
- Be specific about locations and event types
- Include action recommendation if needed (reroute, hold, monitor)
- Use natural, business-friendly language (no markdown, no emojis)
- For multiple events, group by severity: Critical > High > Scheduled

Output JSON format:
{
  "headline": "Short alert (max 60 chars)",
  "summary": "Detailed summary for dashboard (max 500 chars)",
  "actionRequired": "Hold | Reroute | Monitor | No action needed",
  "riskLevel": "critical | high | medium | low",
  "details": []
}`;

export async function generateConsolidatedSummary(
  items: DisruptionSummaryItem[],
  parentCityName?: string
): Promise<ConsolidatedSummary> {

  if (!items || items.length === 0) {
    return {
      summary: "No active disruptions in nearby areas.",
      headline: "All clear",
      riskLevel: "low",
      actionRequired: "No action needed",
      details: [],
    };
  }

  // Sort by risk (highest first)
  const riskOrder = { critical: 5, high: 4, medium: 3, low: 2, safe: 1 };
  const sorted = [...items].sort((a, b) =>
    (riskOrder[b.riskLevel as keyof typeof riskOrder] || 0) -
    (riskOrder[a.riskLevel as keyof typeof riskOrder] || 0)
  );


  // If no OpenAI key, fall back to template
  if (!process.env.OPENAI_API_KEY) {
    return templateSummary(sorted, parentCityName);
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SUMMARY_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Parent city: ${parentCityName || "Unknown"}
Nearby cities with disruptions:
${JSON.stringify(sorted, null, 2)}

Generate a consolidated summary for fleet operations.`
          }
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI HTTP ${res.status}`);
    }

    const data = await res.json();
    const result = JSON.parse(data.choices[0].message.content) as Partial<ConsolidatedSummary>;

    return {
      headline: result.headline ?? sorted[0].title.slice(0, 60),
      summary: result.summary ?? `${sorted.length} disruption(s) in nearby areas. Highest risk: ${sorted[0].riskLevel}.`,
      actionRequired: result.actionRequired ?? getDefaultAction(sorted[0].riskLevel),
      riskLevel: result.riskLevel ?? sorted[0].riskLevel,
      details: sorted.map(s => ({
        city: s.cityName,
        title: s.title.slice(0, 100),
        risk: s.riskLevel,
        eventType: s.eventType,
      })),
    };

  } catch (error) {
    console.error("[summary] OpenAI failed, using fallback:", error);
    return templateSummary(sorted, parentCityName);
  }
}

// Fallback template function
function templateSummary(
  sorted: DisruptionSummaryItem[],
  parentCityName?: string
): ConsolidatedSummary {
  const highest = sorted[0];
  const ongoing = sorted.filter(s => s.eventType === "ongoing");
  const scheduled = sorted.filter(s => s.eventType === "scheduled");

  let summary = "";
  let headline = "";

  if (ongoing.length > 0) {
    headline = `${ongoing[0].riskLevel.toUpperCase()}: ${ongoing[0].cityName}`;
    if (ongoing.length === 1) {
      summary = `${ongoing[0].riskLevel.toUpperCase()} in ${ongoing[0].cityName}: ${ongoing[0].title.slice(0, 150)}`;
    } else {
      summary = `${ongoing.length} active disruptions. Highest risk: ${highest.riskLevel.toUpperCase()} in ${ongoing.map(c => c.cityName).join(", ")}.`;
    }
  } else if (scheduled.length > 0) {
    headline = `UPCOMING: ${scheduled[0].cityName}`;
    summary = `${scheduled.length} scheduled event(s). ${scheduled[0].title.slice(0, 120)}`;
  }

  return {
    headline: headline.slice(0, 60),
    summary: summary.slice(0, 500),
    actionRequired: getDefaultAction(highest.riskLevel),
    riskLevel: highest.riskLevel,
    details: sorted.map(s => ({
      city: s.cityName,
      title: s.title.slice(0, 100),
      risk: s.riskLevel,
      eventType: s.eventType,
    })),
  };
}

function getDefaultAction(riskLevel: string): string {
  switch (riskLevel) {
    case "critical": return "Hold - Do not dispatch until further notice";
    case "high": return "Reroute - Use alternative corridors";
    case "medium": return "Monitor - Expect delays of 1-2 hours";
    default: return "No action needed";
  }
}