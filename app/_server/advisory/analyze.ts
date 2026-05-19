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

const HIGH_RISK_WORDS   = ["blocked", "closed", "stranded", "suspended", "shut", "impassable", "submerged"];
const CRITICAL_WORDS    = ["complete shutdown", "indefinite", "severe", "washed away", "collapsed"];

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

  let riskLevel: RiskLevel = "low";
  let etaImpactHours = 0.5;
  if (CRITICAL_WORDS.some((w) => lower.includes(w)))     { riskLevel = "critical"; etaImpactHours = 8; }
  else if (HIGH_RISK_WORDS.some((w) => lower.includes(w))) { riskLevel = "high";  etaImpactHours = 4; }
  else if (score >= 2)                                     { riskLevel = "medium"; etaImpactHours = 2; }

  const isFuture = FUTURE_KEYWORDS.some((w) => lower.includes(w));
  const eventDate = extractDate(content);
  const eventType: EventType = isFuture ? "scheduled" : "ongoing";

  const firstLine = content.split("\n").find((l) => l.trim().length > 20)?.trim() ?? content.slice(0, 120);

  return {
    isRelevant: score > 0 || HIGH_RISK_WORDS.some((w) => lower.includes(w)),
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

const SYSTEM_PROMPT = `You are a logistics risk analyst for an Indian fleet management and trucking advisory platform.

Given a news article and a road segment, determine whether it describes ANY transport disruption — current OR future.
CRITICAL: Detect future planned events (PM/CM visits, bandh, election rallies, religious processions, road closures) even if they haven't started yet — fleet planners need advance warning to plan routes.

Respond ONLY with minified JSON:
{"isRelevant":boolean,"category":"political|weather|traffic|security|infrastructure|religious|vvip|natural_disaster","title":string,"summary":string,"detail":string,"riskLevel":"critical|high|medium|low|safe","etaImpactHours":number,"confidence":number,"affectedLocation":string,"affectedHighway":string|null,"eventType":"ongoing|scheduled|historical","eventDate":"YYYY-MM-DD"|null,"durationDays":number}

Rules:
- eventType="scheduled"  if the event is announced for a FUTURE date (highest priority to detect)
- eventType="ongoing"    if the disruption is happening NOW (active in the last few days)
- eventType="historical" if the event has already concluded
- eventDate: extract specific date if mentioned ("June 15" → "YYYY-06-15", "next Monday" → calculate from today). null if unclear.
- durationDays: expected duration in days. 1 for single-day events. 0 if unknown.
- title: max 90 chars. summary: max 240 chars. detail: max 600 chars.
- etaImpactHours: expected extra delay for trucks. confidence: 0-100.
- isRelevant=false ONLY if completely unrelated to transport on this segment.
- For future scheduled events: set appropriate riskLevel for when the event occurs.`;

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
          content: `Today's date: ${today}\nRoad segment: ${ctx.segment}${ctx.state ? ` (${ctx.state})` : ""}\n\nArticle:\n${content.slice(0, 6000)}`,
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
