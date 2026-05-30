import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/_server/db/client";
import { firecrawlScrape } from "@/app/_server/advisory/firecrawl";
import { analyzeNews } from "@/app/_server/advisory/analyze";
import { currentSearchQuery, futureSearchQuery } from "@/app/_server/advisory/decompose";
import { searchCurrentNews, searchFutureNews } from "@/app/_server/advisory/news-search.service";

export const maxDuration = 300;

const BATCH_SIZE = 10;

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
  eventType?: "ongoing" | "scheduled";
}

function getRiskScore(level: string): number {
  if (level === "critical") return 5;
  if (level === "high") return 4;
  if (level === "medium") return 3;
  if (level === "low") return 2;
  if (level === "safe") return 1;
  return 0;
}

export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get("x-vercel-cron-auth") ?? "";
  const hasCronAuth = !process.env.CRON_SECRET || cronSecret === process.env.CRON_SECRET;
  if (!hasCronAuth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const today = new Date().toISOString().slice(0, 10);

  const cities = (await db`
    SELECT c.id, c.org_id, c.name, c.state
    FROM   adv_cities c
    LEFT   JOIN adv_city_news cn ON cn.city_id = c.id
    WHERE  (cn.last_checked_at IS NULL
        OR cn.last_checked_at < now() - interval '24 hours')
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
    const allSources: EventSource[] = [];
    const now = new Date().toISOString();

    let bestRisk: string | null = null;
    let bestTitle: string | null = null;
    let bestSummary: string | null = null;
    let bestEta: number | null = null;
    let bestCategory: string | null = null;

    // ─────────────────────────────────────────────────────────────────
    // 1. CURRENT NEWS
    // ─────────────────────────────────────────────────────────────────
    try {
      const currentHits = await searchCurrentNews(
        currentSearchQuery({ name: city.name, state: city.state ?? undefined }), 
        8
      );

      for (const hit of currentHits) {
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

        allSources.push({
          url: hit.url,
          title: scraped.title || hit.title,
          snippet: hit.description.slice(0, 200),
          isRelevant: isCurrentDisruption,
          scrapedAt: now,
          eventType: "ongoing",
        });

        const isActionable = isCurrentDisruption &&
          (result.riskLevel === "critical" || result.riskLevel === "high");

        if (isActionable && getRiskScore(result.riskLevel) > getRiskScore(bestRisk ?? "safe")) {
          bestRisk = result.riskLevel;
          bestTitle = result.title;
          bestSummary = result.summary;
          bestEta = result.etaImpactHours;
          bestCategory = result.category;
        }
      }
    } catch (err) {
      console.error(`[city-cron] current search failed for ${city.name}:`, err);
    }

    // ─────────────────────────────────────────────────────────────────
    // 2. FUTURE NEWS (scheduled events)
    // ─────────────────────────────────────────────────────────────────
    try {
      const futureHits = await searchFutureNews(
        futureSearchQuery({ name: city.name, state: city.state ?? undefined }), 
        5
      );

      for (const hit of futureHits) {
        let scraped = scrapedCache.get(hit.url) ?? { markdown: hit.description, title: hit.title };
        if (!scrapedCache.has(hit.url)) {
          try { scraped = await firecrawlScrape(hit.url); } catch { /* use snippet */ }
          scrapedCache.set(hit.url, scraped);
        }

        const content = `${scraped.title}\n\n${scraped.markdown}`.trim();
        if (!content) continue;

        const result = await analyzeNews(content, ctx);
        const isFutureDisruption = result.isRelevant
          && result.eventType === "scheduled"
          && (result.riskLevel === "critical" || result.riskLevel === "high");

        allSources.push({
          url: hit.url,
          title: scraped.title || hit.title,
          snippet: hit.description.slice(0, 200),
          isRelevant: isFutureDisruption,
          scrapedAt: now,
          eventType: "scheduled",
        });

        const currentRiskScore = getRiskScore(bestRisk ?? "safe");
        const futureRiskScore = getRiskScore(result.riskLevel);

        if (isFutureDisruption && futureRiskScore > currentRiskScore) {
          bestRisk = result.riskLevel;
          bestTitle = result.title;
          bestSummary = result.summary;
          bestEta = result.etaImpactHours;
          bestCategory = result.category;
        }
      }
    } catch (err) {
      console.error(`[city-cron] future search failed for ${city.name}:`, err);
    }

    // Upsert into adv_city_news - using ONLY existing columns (no future_sources, no event_type)
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
        ${db.json(allSources as unknown as Parameters<typeof db.json>[0])},
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