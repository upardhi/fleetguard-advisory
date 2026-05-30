import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/_server/db/client";
import { firecrawlScrape } from "@/app/_server/advisory/firecrawl";
import { analyzeNews, generateConsolidatedSummary, type DisruptionSummaryItem } from "@/app/_server/advisory/analyze";
import { currentSearchQuery, futureSearchQuery } from "@/app/_server/advisory/decompose";
import { searchCurrentNews, searchFutureNews } from "@/app/_server/advisory/news-search.service";

export const maxDuration = 300;

const BATCH_SIZE = 15;

function getRiskScore(level: string): number {
    if (level === "critical") return 5;
    if (level === "high") return 4;
    if (level === "medium") return 3;
    if (level === "low") return 2;
    if (level === "safe") return 1;
    return 0;
}

interface NearbyCityRow {
    id: string;
    org_id: string;
    name: string;
    state: string | null;
    parent_city_name: string;
    parent_city_id: string;
}

interface EventSource {
    url: string;
    title: string;
    snippet: string;
    isRelevant: boolean;
    scrapedAt: string;
    eventType?: "ongoing" | "scheduled";
    sourceCity?: string;
}

interface ProcessedNews {
    url: string;
    title: string;
    content: string;
    result: any;
    sourceCityId: string;
}

interface ParentCityAccumulator {
    orgId: string;
    parentCityName: string;
    disruptions: DisruptionSummaryItem[];
    allSources: EventSource[];
    highestRisk: string;
    highestRiskCategory: string | null;
    highestRiskEta: number | null;
    highestRiskEventType: string;
}

// POST /api/cron/run-nearby-city-intelligence
export async function POST(req: NextRequest) {
    const cronSecret = req.headers.get("x-vercel-cron-auth") ?? "";
    const hasCronAuth =
        !process.env.CRON_SECRET || cronSecret === process.env.CRON_SECRET;
    if (!hasCronAuth) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const today = new Date().toISOString().slice(0, 10);

    const cities = (await db`
    SELECT
      nc.id,
      nc.org_id,
      nc.name,
      nc.state,
      c.name AS parent_city_name,
      c.id   AS parent_city_id
    FROM   adv_nearby_cities nc
    JOIN   adv_cities c ON c.id = nc.parent_city_id
    LEFT   JOIN adv_nearby_city_news ncn ON ncn.nearby_city_id = nc.id
    WHERE  nc.name NOT LIKE '% (self)'
    AND  (ncn.last_checked_at IS NULL
        OR ncn.last_checked_at < now() - interval '24 hours')
    ORDER  BY ncn.last_checked_at ASC NULLS FIRST
    LIMIT  ${BATCH_SIZE}
  `) as unknown as NearbyCityRow[];

    if (cities.length === 0) {
        return NextResponse.json({ ok: true, message: "No cities to process" });
    }

    const scrapedCache = new Map<string, { markdown: string; title: string }>();
    let processed = 0;
    let disruptions = 0;

    const globalProcessedNews = new Map<string, ProcessedNews>();
    const parentAccumulators = new Map<string, ParentCityAccumulator>();

    // ─────────────────────────────────────────────────────────────────
    // STEP 1 — Process each nearby city, same as before
    // ─────────────────────────────────────────────────────────────────
    for (const city of cities) {
        const ctx = {
            segment: city.name,
            state: city.state ?? undefined,
            todayIso: today,
        };

        const allSources: EventSource[] = [];
        const now = new Date().toISOString();

        let bestRisk: string | null = null;
        let bestTitle: string | null = null;
        let bestSummary: string | null = null;
        let bestEta: number | null = null;
        let bestCategory: string | null = null;
        let bestEventType: string | null = null;

        // ── 1a. CURRENT NEWS ────────────────────────────────────────────────
        try {
            const currentHits = await searchCurrentNews(
                currentSearchQuery({ name: city.name, state: city.state ?? undefined }),
                8
            );

            for (const hit of currentHits) {
                const processedNews = globalProcessedNews.get(hit.url);

                let scraped: { markdown: string; title: string };
                let result: any;

                if (processedNews) {
                    scraped = { markdown: processedNews.content, title: processedNews.title };
                    result = processedNews.result;
                } else {
                    scraped = scrapedCache.get(hit.url) ?? {
                        markdown: hit.description,
                        title: hit.title,
                    };
                    if (!scrapedCache.has(hit.url)) {
                        try { scraped = await firecrawlScrape(hit.url); } catch { /* use snippet */ }
                        scrapedCache.set(hit.url, scraped);
                    }

                    const content = `${scraped.title}\n\n${scraped.markdown}`.trim();
                    if (!content) continue;

                    result = await analyzeNews(content, ctx);

                    globalProcessedNews.set(hit.url, {
                        url: hit.url,
                        title: scraped.title || hit.title,
                        content,
                        result,
                        sourceCityId: city.id,
                    });
                }

                const isCurrentDisruption =
                    result.isRelevant &&
                    result.eventType === "ongoing" &&
                    result.riskLevel !== "safe";

                allSources.push({
                    url: hit.url,
                    title: scraped.title || hit.title,
                    snippet: hit.description.slice(0, 200),
                    isRelevant: isCurrentDisruption,
                    scrapedAt: now,
                    eventType: "ongoing",
                    sourceCity: city.name,
                });

                const isActionable =
                    isCurrentDisruption &&
                    (result.riskLevel === "critical" || result.riskLevel === "high");

                if (isActionable && getRiskScore(result.riskLevel) > getRiskScore(bestRisk ?? "safe")) {
                    bestRisk = result.riskLevel;
                    bestTitle = result.title;
                    bestSummary = result.summary;
                    bestEta = result.etaImpactHours;
                    bestCategory = result.category;
                    bestEventType = "ongoing";
                }
            }
        } catch (err) {
            console.error(`[nearby-city-cron] current search failed for ${city.name}:`, err);
        }

        // ── 1b. FUTURE NEWS ─────────────────────────────────────────────────
        try {
            const futureHits = await searchFutureNews(
                futureSearchQuery({ name: city.name, state: city.state ?? undefined }),
                8
            );

            for (const hit of futureHits) {
                const processedNews = globalProcessedNews.get(hit.url);

                let scraped: { markdown: string; title: string };
                let result: any;

                if (processedNews) {
                    scraped = { markdown: processedNews.content, title: processedNews.title };
                    result = processedNews.result;
                } else {
                    scraped = scrapedCache.get(hit.url) ?? {
                        markdown: hit.description,
                        title: hit.title,
                    };
                    if (!scrapedCache.has(hit.url)) {
                        try { scraped = await firecrawlScrape(hit.url); } catch { /* use snippet */ }
                        scrapedCache.set(hit.url, scraped);
                    }

                    const content = `${scraped.title}\n\n${scraped.markdown}`.trim();
                    if (!content) continue;

                    result = await analyzeNews(content, ctx);

                    globalProcessedNews.set(hit.url, {
                        url: hit.url,
                        title: scraped.title || hit.title,
                        content,
                        result,
                        sourceCityId: city.id,
                    });
                }

                const isFutureDisruption =
                    result.isRelevant &&
                    result.eventType === "scheduled" &&
                    (result.riskLevel === "critical" || result.riskLevel === "high");

                allSources.push({
                    url: hit.url,
                    title: scraped.title || hit.title,
                    snippet: hit.description.slice(0, 200),
                    isRelevant: isFutureDisruption,
                    scrapedAt: now,
                    eventType: "scheduled",
                    sourceCity: city.name,
                });

                const currentRiskScore = getRiskScore(bestRisk ?? "safe");
                const futureRiskScore = getRiskScore(result.riskLevel);

                if (isFutureDisruption && futureRiskScore > currentRiskScore) {
                    bestRisk = result.riskLevel;
                    bestTitle = result.title;
                    bestSummary = result.summary;
                    bestEta = result.etaImpactHours;
                    bestCategory = result.category;
                    bestEventType = "scheduled";
                }
            }
        } catch (err) {
            console.error(`[nearby-city-cron] future search failed for ${city.name}:`, err);
        }

        // ── 1c. Upsert into adv_nearby_city_news ────────────────────────────
        await db`
      INSERT INTO adv_nearby_city_news
        (id, org_id, nearby_city_id, has_disruption,
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
      ON CONFLICT (nearby_city_id) DO UPDATE SET
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

        // ── 1d. Feed into parent city accumulator ────────────────────────────
        // Only accumulate if this nearby city has an actionable disruption
        if (bestRisk && bestRisk !== "safe" && bestTitle && bestSummary) {
            if (!parentAccumulators.has(city.parent_city_id)) {
                parentAccumulators.set(city.parent_city_id, {
                    orgId: city.org_id,
                    parentCityName: city.parent_city_name,
                    disruptions: [],
                    allSources: [],
                    highestRisk: "safe",
                    highestRiskCategory: null,
                    highestRiskEta: null,
                    highestRiskEventType: "ongoing",
                });
            }

            const acc = parentAccumulators.get(city.parent_city_id)!;

            acc.disruptions.push({
                cityName: city.name,
                title: bestTitle,
                summary: bestSummary,
                riskLevel: bestRisk,
                eventType: (bestEventType ?? "ongoing") as "ongoing" | "scheduled",
                etaImpactHours: bestEta ?? undefined,
            });

            // Only carry relevant sources to the parent
            acc.allSources.push(
                ...allSources
                    .filter((s) => s.isRelevant)
                    .map((s) => ({ ...s, sourceCity: city.name }))
            );

            // Track the highest risk seen across all nearby cities for this parent
            if (getRiskScore(bestRisk) > getRiskScore(acc.highestRisk)) {
                acc.highestRisk = bestRisk;
                acc.highestRiskCategory = bestCategory;
                acc.highestRiskEta = bestEta;
                acc.highestRiskEventType = bestEventType ?? "ongoing";
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // STEP 2 — Write a consolidated summary into adv_city_news for each
    //          parent city, using the EXACT same columns as run-city-intelligence.
    //
    //          Key decisions:
    //          • disruption_title   = consolidated.headline  (short, alert-friendly)
    //          • disruption_summary = consolidated.summary   (AI narrative across all cities)
    //          • disruption_sources = all relevant sources from nearby cities
    //            (each source has sourceCity tag so UI can show which city it came from)
    //          • disruption_category = "nearby_cities" so you can distinguish origin
    //            on the backend if ever needed, without changing the frontend
    //          • event_type / risk / eta = derived from the highest-risk nearby city
    //
    //          ON CONFLICT strategy:
    //          • We only overwrite if nearby risk is HIGHER than what's already stored.
    //            This prevents a medium nearby disruption from overwriting a critical
    //            direct disruption that run-city-intelligence already wrote.
    // ─────────────────────────────────────────────────────────────────
   let parentCitiesUpdated = 0;

for (const [parentCityId, acc] of parentAccumulators.entries()) {
    if (acc.disruptions.length === 0) continue;

    try {
        // Generate AI consolidated summary
        const consolidated = await generateConsolidatedSummary(
            acc.disruptions,
            acc.parentCityName
        );

        // Put ALL sources (both current and future) into disruption_sources
        // This matches the schema - everything in one JSON array
        const allSourcesCombined = acc.allSources;

        await db`
            INSERT INTO adv_city_news
                (id, org_id, city_id,
                 has_disruption,
                 disruption_risk_level,
                 disruption_title,
                 disruption_summary,
                 disruption_eta_hours,
                 disruption_category,
                 disruption_sources,
                 last_checked_at)
            VALUES (
                gen_random_uuid(),
                ${acc.orgId},
                ${parentCityId},
                true,
                ${acc.highestRisk},
                ${consolidated.headline},
                ${consolidated.summary},
                ${acc.highestRiskEta ?? null},
                ${"nearby_cities"},
                ${db.json(allSourcesCombined as unknown as Parameters<typeof db.json>[0])},
                now()
            )
            ON CONFLICT (city_id) DO UPDATE SET
                -- Only overwrite if nearby risk is HIGHER than what's stored
                has_disruption        = true,
                disruption_risk_level = CASE
                    WHEN (
                        CASE adv_city_news.disruption_risk_level
                            WHEN 'critical' THEN 5 WHEN 'high' THEN 4
                            WHEN 'medium'   THEN 3 WHEN 'low'  THEN 2
                            WHEN 'safe'     THEN 1 ELSE 0
                        END
                    ) < (
                        CASE EXCLUDED.disruption_risk_level
                            WHEN 'critical' THEN 5 WHEN 'high' THEN 4
                            WHEN 'medium'   THEN 3 WHEN 'low'  THEN 2
                            WHEN 'safe'     THEN 1 ELSE 0
                        END
                    )
                    THEN EXCLUDED.disruption_risk_level
                    ELSE adv_city_news.disruption_risk_level
                END,
                disruption_title      = CASE
                    WHEN (
                        CASE adv_city_news.disruption_risk_level
                            WHEN 'critical' THEN 5 WHEN 'high' THEN 4
                            WHEN 'medium'   THEN 3 WHEN 'low'  THEN 2
                            WHEN 'safe'     THEN 1 ELSE 0
                        END
                    ) < (
                        CASE EXCLUDED.disruption_risk_level
                            WHEN 'critical' THEN 5 WHEN 'high' THEN 4
                            WHEN 'medium'   THEN 3 WHEN 'low'  THEN 2
                            WHEN 'safe'     THEN 1 ELSE 0
                        END
                    )
                    THEN EXCLUDED.disruption_title
                    ELSE adv_city_news.disruption_title
                END,
                disruption_summary    = CASE
                    WHEN (
                        CASE adv_city_news.disruption_risk_level
                            WHEN 'critical' THEN 5 WHEN 'high' THEN 4
                            WHEN 'medium'   THEN 3 WHEN 'low'  THEN 2
                            WHEN 'safe'     THEN 1 ELSE 0
                        END
                    ) < (
                        CASE EXCLUDED.disruption_risk_level
                            WHEN 'critical' THEN 5 WHEN 'high' THEN 4
                            WHEN 'medium'   THEN 3 WHEN 'low'  THEN 2
                            WHEN 'safe'     THEN 1 ELSE 0
                        END
                    )
                    THEN EXCLUDED.disruption_summary
                    ELSE adv_city_news.disruption_summary
                END,
                disruption_eta_hours  = EXCLUDED.disruption_eta_hours,
                disruption_category   = EXCLUDED.disruption_category,
                disruption_sources    = EXCLUDED.disruption_sources,
                last_checked_at       = now()
        `;

        parentCitiesUpdated++;
        console.log(
            `[nearby-city-cron] Consolidated summary written for "${acc.parentCityName}" — ` +
            `${acc.disruptions.length} nearby disruption(s), highest risk: ${acc.highestRisk}`
        );
    } catch (err) {
        console.error(
            `[nearby-city-cron] Failed to write consolidated summary for parent ${parentCityId}:`,
            err
        );
    }
}

    console.log(
        `[nearby-city-cron] ${globalProcessedNews.size} unique articles across ` +
        `${processed} nearby cities → ${parentCitiesUpdated} parent cities updated`
    );

    return NextResponse.json({
        ok: true,
        processed,
        disruptions,
        uniqueNewsProcessed: globalProcessedNews.size,
        parentCitiesUpdated,
    });
}