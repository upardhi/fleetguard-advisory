import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/_server/db/client";
import { firecrawlSearch, firecrawlScrape } from "@/app/_server/advisory/firecrawl";
import { analyzeNews } from "@/app/_server/advisory/analyze";
import { currentSearchQuery } from "@/app/_server/advisory/decompose";

export const maxDuration = 300;

const BATCH_SIZE = 10;

const RISK_ORDER: Record<string, number> = {
  critical: 5, high: 4, medium: 3, low: 2, safe: 1,
};

interface CityRow {
  id: string;
  org_id: string;
  name: string;
  state: string | null;
}

interface EventSource {
  url: string;
  title: string;
  snippet: string;
  isRelevant: boolean;
  scrapedAt: string;
}

// POST /api/cron/run-city-intelligence
// Fires on its own cron schedule (e.g. every 30 mins).
// Processes one batch of cities per invocation — cycles through all orgs.
export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get("x-vercel-cron-auth") ?? "";
  const hasCronAuth = !process.env.CRON_SECRET || cronSecret === process.env.CRON_SECRET;
  if (!hasCronAuth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const today = new Date().toISOString().slice(0, 10);

  // Pick the batch of cities least recently checked — cycles through all naturally
  const cities = (await db`
    SELECT c.id, c.org_id, c.name, c.state
    FROM   adv_cities c
    LEFT   JOIN adv_city_news cn ON cn.city_id = c.id
    ORDER  BY cn.last_checked_at ASC NULLS FIRST
    LIMIT  ${BATCH_SIZE}
  `) as unknown as CityRow[];

  if (cities.length === 0) {
    return NextResponse.json({ ok: true, message: "No cities to process" });
  }

  const scrapedCache = new Map<string, { markdown: string; title: string }>();
  let processed = 0;
  let disruptions = 0;

  for (const city of cities) {
    const ctx = { segment: city.name, state: city.state ?? undefined, todayIso: today };
    const sources: EventSource[] = [];
    const now = new Date().toISOString();

    let bestRisk: string | null = null;
    let bestTitle: string | null = null;
    let bestSummary: string | null = null;
    let bestEta: number | null = null;
    let bestCategory: string | null = null;

    try {
      const hits = await firecrawlSearch(
        currentSearchQuery({ name: city.name, state: city.state ?? undefined }), 5
      );

      for (const hit of hits) {
        let scraped = scrapedCache.get(hit.url) ?? { markdown: hit.description, title: hit.title };
        if (!scrapedCache.has(hit.url)) {
          try { scraped = await firecrawlScrape(hit.url); } catch { /* use snippet */ }
          scrapedCache.set(hit.url, scraped);
        }

        const content = `${scraped.title}\n\n${scraped.markdown}`.trim();
        if (!content) continue;

        const result = await analyzeNews(content, ctx);
        const isCurrentDisruption = result.isRelevant
          && result.eventType === "ongoing"
          && result.riskLevel !== "safe";

        sources.push({
          url: hit.url,
          title: scraped.title || hit.title,
          snippet: hit.description.slice(0, 200),
          isRelevant: isCurrentDisruption,
          scrapedAt: now,
        });

        const isActionable = isCurrentDisruption &&
          (result.riskLevel === "critical" || result.riskLevel === "high");

        if (isActionable && (RISK_ORDER[result.riskLevel] ?? 0) > (RISK_ORDER[bestRisk ?? "safe"] ?? 0)) {
          bestRisk = result.riskLevel;
          bestTitle = result.title;
          bestSummary = result.summary;
          bestEta = result.etaImpactHours;
          bestCategory = result.category;
        }
      }
    } catch (err) {
      console.error(`[city-cron] search failed for ${city.name}:`, err);
    }

    // Upsert into adv_city_news
    await db`
      INSERT INTO adv_city_news
        (id, org_id, city_id, has_disruption,
         disruption_risk_level, disruption_title, disruption_summary,
         disruption_eta_hours, disruption_category, disruption_sources, last_checked_at)
      VALUES (
        gen_random_uuid(), ${city.org_id}, ${city.id},
        ${bestRisk !== null && bestRisk !== "safe"},
        ${bestRisk ?? null}, ${bestTitle ?? null}, ${bestSummary ?? null},
        ${bestEta ?? null}, ${bestCategory ?? null},
        ${db.json(sources as unknown as Parameters<typeof db.json>[0])},
        now()
      )
      ON CONFLICT (city_id) DO UPDATE SET
        has_disruption        = EXCLUDED.has_disruption,
        disruption_risk_level = EXCLUDED.disruption_risk_level,
        disruption_title      = EXCLUDED.disruption_title,
        disruption_summary    = EXCLUDED.disruption_summary,
        disruption_eta_hours  = EXCLUDED.disruption_eta_hours,
        disruption_category   = EXCLUDED.disruption_category,
        disruption_sources    = EXCLUDED.disruption_sources,
        last_checked_at       = now()
    `;

    if (bestRisk && bestRisk !== "safe") disruptions++;
    processed++;
  }

  return NextResponse.json({ ok: true, processed, disruptions });
}