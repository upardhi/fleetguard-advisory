/**
 * News analysis — turns a scraped news article into a structured disruption.
 * Uses OpenAI when OPENAI_API_KEY is set; otherwise falls back to a
 * deterministic keyword classifier so the pipeline still runs without a key.
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
}

export interface AnalyzeContext {
  /** The route segment (district / tehsil / highway name) that surfaced this news. */
  segment: string;
  state?: string;
}

// ── Keyword heuristic (fallback) ──────────────────────────────────────────────

const CATEGORY_KEYWORDS: Record<DisruptionCategory, string[]> = {
  political: ["bandh", "strike", "protest", "agitation", "election", "rally", "blockade", "dharna"],
  weather: ["rain", "fog", "storm", "heatwave", "hailstorm", "cyclone warning", "thunderstorm"],
  traffic: ["accident", "pile-up", "collision", "jam", "congestion", "overturn", "traffic"],
  security: ["curfew", "violence", "clash", "stone pelting", "law and order", "terror", "encounter"],
  infrastructure: ["bridge", "repair", "construction", "roadwork", "diversion", "closed", "collapse"],
  religious: ["procession", "festival", "yatra", "puja", "mela", "immersion", "kanwar"],
  vvip: ["vvip", "pm", "prime minister", "president", "convoy", "motorcade", "minister visit"],
  natural_disaster: ["flood", "landslide", "cyclone", "earthquake", "cloudburst", "deluge"],
};

const HIGH_RISK_WORDS = ["blocked", "closed", "stranded", "suspended", "shut", "impassable", "submerged"];
const CRITICAL_WORDS = ["complete shutdown", "indefinite", "severe", "washed away", "collapsed"];

function classify(text: string): { category: DisruptionCategory; score: number } {
  const lower = text.toLowerCase();
  let best: DisruptionCategory = "traffic";
  let bestHits = 0;
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS) as [DisruptionCategory, string[]][]) {
    const hits = words.filter((w) => lower.includes(w)).length;
    if (hits > bestHits) {
      bestHits = hits;
      best = cat;
    }
  }
  return { category: best, score: bestHits };
}

function heuristicAnalyze(content: string, ctx: AnalyzeContext): AnalyzedDisruption {
  const lower = content.toLowerCase();
  const { category, score } = classify(content);

  let riskLevel: RiskLevel = "low";
  let etaImpactHours = 0.5;
  if (CRITICAL_WORDS.some((w) => lower.includes(w))) {
    riskLevel = "critical";
    etaImpactHours = 8;
  } else if (HIGH_RISK_WORDS.some((w) => lower.includes(w))) {
    riskLevel = "high";
    etaImpactHours = 4;
  } else if (score >= 2) {
    riskLevel = "medium";
    etaImpactHours = 2;
  }

  const firstLine = content.split("\n").find((l) => l.trim().length > 20)?.trim() ?? content.slice(0, 120);

  return {
    isRelevant: score > 0 || HIGH_RISK_WORDS.some((w) => lower.includes(w)),
    category,
    title: firstLine.slice(0, 120),
    summary: content.slice(0, 240).replace(/\s+/g, " ").trim(),
    detail: content.slice(0, 800).replace(/\s+/g, " ").trim(),
    riskLevel,
    etaImpactHours,
    confidence: Math.min(70, 30 + score * 15),
    affectedLocation: ctx.segment,
  };
}

// ── OpenAI analysis ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a logistics risk analyst for an Indian trucking advisory platform.
Given a news article and the road segment it relates to, decide whether it describes a
real, current disruption that could delay truck movement on that segment.
Respond ONLY with minified JSON matching this TypeScript type:
{"isRelevant":boolean,"category":"political|weather|traffic|security|infrastructure|religious|vvip|natural_disaster","title":string,"summary":string,"detail":string,"riskLevel":"critical|high|medium|low|safe","etaImpactHours":number,"confidence":number,"affectedLocation":string,"affectedHighway":string}
- isRelevant=false if the article is old, unrelated, or not a transport disruption.
- etaImpactHours: estimated extra hours a truck would lose. confidence: 0-100.
- Keep title under 90 chars, summary under 240 chars.`;

async function openaiAnalyze(content: string, ctx: AnalyzeContext): Promise<AnalyzedDisruption> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Road segment: ${ctx.segment}${ctx.state ? ` (${ctx.state})` : ""}\n\nArticle:\n${content.slice(0, 6000)}`,
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  const parsed = JSON.parse(data.choices[0].message.content) as Partial<AnalyzedDisruption>;

  return {
    isRelevant: parsed.isRelevant ?? false,
    category: (parsed.category as DisruptionCategory) ?? "traffic",
    title: parsed.title ?? "Disruption reported",
    summary: parsed.summary ?? "",
    detail: parsed.detail ?? parsed.summary ?? "",
    riskLevel: (parsed.riskLevel as RiskLevel) ?? "medium",
    etaImpactHours: typeof parsed.etaImpactHours === "number" ? parsed.etaImpactHours : 1,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 50,
    affectedLocation: parsed.affectedLocation ?? ctx.segment,
    affectedHighway: parsed.affectedHighway,
  };
}

/** Analyze a news article into a structured disruption. */
export async function analyzeNews(
  content: string,
  ctx: AnalyzeContext,
): Promise<AnalyzedDisruption> {
  if (process.env.OPENAI_API_KEY) {
    try {
      return await openaiAnalyze(content, ctx);
    } catch (err) {
      console.error("[analyze] OpenAI failed, falling back to heuristic:", err);
    }
  }
  return heuristicAnalyze(content, ctx);
}
