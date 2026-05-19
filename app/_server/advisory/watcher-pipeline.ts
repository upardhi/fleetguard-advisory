/**
 * Watched-route intelligence pipeline.
 *
 * fetchWatchedRouteSegments  — call Google Directions for origin→destination,
 *                              decompose all returned routes into geographic
 *                              segments, persist to adv_watched_segments.
 *
 * runWatchedRouteIntelligence — for every segment on a watched route, query
 *                               Firecrawl for news, scrape, analyse with
 *                               OpenAI, and write disruption state back to the
 *                               segment row.
 */

import { db } from "../db/client";
import { uuidv7 } from "../db/uuidv7";
import { getDirections } from "./google";
import { decomposeRoute, segmentSearchQuery } from "./decompose";
import { firecrawlSearch, firecrawlScrape } from "./firecrawl";
import { analyzeNews } from "./analyze";

// Risk ordering for "worst across segments" calculation
const RISK_ORDER: Record<string, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  safe: 1,
};

function worstRisk(levels: (string | null | undefined)[]): string {
  let best = "safe";
  for (const l of levels) {
    if (l && (RISK_ORDER[l] ?? 0) > (RISK_ORDER[best] ?? 0)) best = l;
  }
  return best;
}

// ── Fetch route segments ──────────────────────────────────────────────────────

export async function fetchWatchedRouteSegments(
  routeId: string,
  origin: string,
  destination: string,
): Promise<{ segmentCount: number }> {
  const routes = await getDirections(origin, destination);
  if (routes.length === 0) throw new Error("Google Directions returned no routes");

  // Delete stale segments
  await db`DELETE FROM adv_watched_segments WHERE watched_route_id = ${routeId}`;

  let totalSegments = 0;

  for (let variantIdx = 0; variantIdx < routes.length; variantIdx++) {
    const route = routes[variantIdx];
    const segments = await decomposeRoute(route.polyline, route.highways);

    for (const seg of segments) {
      await db`
        INSERT INTO adv_watched_segments
          (id, watched_route_id, route_variant, segment_type, name, state, seq, lat, lng)
        VALUES (
          ${uuidv7()}, ${routeId}, ${variantIdx},
          ${seg.segmentType}, ${seg.name}, ${seg.state ?? null},
          ${seg.seq}, ${seg.lat ?? null}, ${seg.lng ?? null}
        )
        ON CONFLICT DO NOTHING
      `;
      totalSegments++;
    }
  }

  await db`
    UPDATE adv_watched_routes
    SET    routes_fetched = true, updated_at = now()
    WHERE  id = ${routeId}
  `;

  return { segmentCount: totalSegments };
}

// ── Run intelligence on all segments ─────────────────────────────────────────

interface SegmentRow {
  id: string;
  name: string;
  segment_type: string;
  state: string | null;
}

export async function runWatchedRouteIntelligence(
  routeId: string,
): Promise<{ segmentsChecked: number; disruptionsFound: number }> {
  const segments = (await db`
    SELECT id, name, segment_type, state
    FROM   adv_watched_segments
    WHERE  watched_route_id = ${routeId}
    ORDER  BY route_variant, seq
  `) as unknown as SegmentRow[];

  let disruptionsFound = 0;

  for (const seg of segments) {
    try {
      const query = segmentSearchQuery({ name: seg.name, state: seg.state ?? undefined });
      const hits = await firecrawlSearch(query, 3);

      let bestRisk: string | null = null;
      let bestTitle: string | null = null;
      let bestSummary: string | null = null;
      let bestEta: number | null = null;
      let bestCategory: string | null = null;

      for (const hit of hits) {
        let scraped: { markdown: string; title: string } | null = null;
        try {
          scraped = await firecrawlScrape(hit.url);
        } catch {
          // fallback to snippet only
          scraped = { markdown: hit.description ?? "", title: hit.title ?? "" };
        }

        const content = `${scraped.title}\n\n${scraped.markdown}`.trim();
        if (!content) continue;

        const result = await analyzeNews(content, {
          segment: seg.name,
          state: seg.state ?? undefined,
        });

        if (
          result.isRelevant &&
          (RISK_ORDER[result.riskLevel] ?? 0) > (RISK_ORDER[bestRisk ?? "safe"] ?? 0)
        ) {
          bestRisk = result.riskLevel;
          bestTitle = result.title;
          bestSummary = result.summary;
          bestEta = result.etaImpactHours;
          bestCategory = result.category;
        }
      }

      if (bestRisk && bestRisk !== "safe") {
        await db`
          UPDATE adv_watched_segments
          SET    has_disruption = true,
                 disruption_risk_level = ${bestRisk},
                 disruption_title      = ${bestTitle},
                 disruption_summary    = ${bestSummary},
                 disruption_eta_hours  = ${bestEta},
                 disruption_category   = ${bestCategory},
                 last_checked_at       = now()
          WHERE  id = ${seg.id}
        `;
        disruptionsFound++;
      } else {
        await db`
          UPDATE adv_watched_segments
          SET    has_disruption = false,
                 disruption_risk_level = null,
                 disruption_title      = null,
                 disruption_summary    = null,
                 disruption_eta_hours  = null,
                 disruption_category   = null,
                 last_checked_at       = now()
          WHERE  id = ${seg.id}
        `;
      }
    } catch (err) {
      console.error(`[watcher] segment ${seg.name} failed:`, err);
      // Continue with remaining segments
    }
  }

  // Refresh route-level summary
  const disrupted = (await db`
    SELECT disruption_risk_level
    FROM   adv_watched_segments
    WHERE  watched_route_id = ${routeId} AND has_disruption = true
  `) as unknown as Array<{ disruption_risk_level: string | null }>;

  const maxRisk = worstRisk(disrupted.map((r) => r.disruption_risk_level));

  await db`
    UPDATE adv_watched_routes
    SET    last_intel_at    = now(),
           max_risk_level   = ${maxRisk},
           disruption_count = ${disrupted.length},
           updated_at       = now()
    WHERE  id = ${routeId}
  `;

  return { segmentsChecked: segments.length, disruptionsFound };
}
