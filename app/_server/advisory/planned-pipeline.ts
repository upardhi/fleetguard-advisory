/**
 * Planned route intelligence pipeline.
 *
 * Two exported functions:
 *   fetchPlannedRouteSegments  — calls Google Directions + Decompose, stores segments.
 *   runPlannedRouteIntelligence — runs Firecrawl + OpenAI analysis on every segment.
 */

import { db } from "@/app/_server/db/client";
import { uuidv7 } from "@/app/_server/db/uuidv7";
import { getDirections } from "@/app/_server/advisory/google";
import { decomposeRoute, segmentSearchQuery, type RouteSegment } from "@/app/_server/advisory/decompose";
import { firecrawlSearch, firecrawlScrape } from "@/app/_server/advisory/firecrawl";
import { analyzeNews, type RiskLevel } from "@/app/_server/advisory/analyze";

// ── Segment fetch ─────────────────────────────────────────────────────────────

export async function fetchPlannedRouteSegments(
  routeId: string,
  origin: string,
  destination: string,
): Promise<void> {
  const directions = await getDirections(origin, destination);
  if (directions.length === 0) {
    throw new Error("No routes found from Google Directions");
  }

  const first = directions[0];

  let segments: RouteSegment[];
  try {
    segments = await decomposeRoute(first.polyline, first.highways);
  } catch (err) {
    console.error("[planned-pipeline] decomposeRoute failed, using highways only:", err);
    segments = first.highways.map((hw, seq) => ({
      segmentType: hw.startsWith("NH")
        ? ("national_highway" as const)
        : ("state_highway" as const),
      name: hw,
      seq,
    }));
  }

  // Replace existing segments.
  await db`DELETE FROM adv_planned_segments WHERE planned_route_id = ${routeId}`;

  for (const s of segments) {
    await db`
      INSERT INTO adv_planned_segments
        (id, planned_route_id, segment_type, name, state, seq, lat, lng)
      VALUES (
        ${uuidv7()}, ${routeId}, ${s.segmentType}, ${s.name},
        ${s.state ?? null}, ${s.seq}, ${s.lat ?? null}, ${s.lng ?? null}
      )
    `;
  }

  await db`
    UPDATE adv_planned_routes
    SET routes_fetched = true, updated_at = now()
    WHERE id = ${routeId}
  `;
}

// ── Intelligence run ──────────────────────────────────────────────────────────

const RISK_ORDER: RiskLevel[] = ["critical", "high", "medium", "low", "safe"];

function worstRisk(levels: RiskLevel[]): RiskLevel {
  if (levels.length === 0) return "safe";
  for (const level of RISK_ORDER) {
    if (levels.includes(level)) return level;
  }
  return "safe";
}

interface PlannedSegmentRow {
  id: string;
  name: string;
  state: string | null;
}

export async function runPlannedRouteIntelligence(
  routeId: string,
): Promise<{ segmentsChecked: number; disruptionsFound: number }> {
  const segments = (await db`
    SELECT id, name, state
    FROM adv_planned_segments
    WHERE planned_route_id = ${routeId}
    ORDER BY seq
  `) as unknown as PlannedSegmentRow[];

  let segmentsChecked = 0;
  let disruptionsFound = 0;
  const disruptedRiskLevels: RiskLevel[] = [];

  for (const seg of segments) {
    try {
      const query = segmentSearchQuery({ name: seg.name, state: seg.state ?? undefined });
      const hits = await firecrawlSearch(query, 3);

      let foundDisruption = false;
      let bestRisk: RiskLevel = "safe";
      let bestTitle = "";
      let bestSummary = "";
      let bestEtaHours = 0;
      let bestCategory = "";

      for (const hit of hits) {
        try {
          const scraped = await firecrawlScrape(hit.url);
          const analysis = await analyzeNews(scraped.markdown || hit.description, {
            segment: seg.name,
            state: seg.state ?? undefined,
          });

          if (analysis.isRelevant) {
            // Pick the worst risk among hits for this segment.
            const thisRiskIdx = RISK_ORDER.indexOf(analysis.riskLevel);
            const bestRiskIdx = RISK_ORDER.indexOf(bestRisk);
            if (!foundDisruption || thisRiskIdx < bestRiskIdx) {
              bestRisk = analysis.riskLevel;
              bestTitle = analysis.title;
              bestSummary = analysis.summary;
              bestEtaHours = analysis.etaImpactHours;
              bestCategory = analysis.category;
            }
            foundDisruption = true;
          }
        } catch (scrapeErr) {
          console.error(`[planned-pipeline] scrape/analyze failed for ${hit.url}:`, scrapeErr);
          // Skip this hit, continue with others.
        }
      }

      if (foundDisruption) {
        await db`
          UPDATE adv_planned_segments SET
            has_disruption        = true,
            disruption_risk_level = ${bestRisk},
            disruption_title      = ${bestTitle},
            disruption_summary    = ${bestSummary},
            disruption_eta_hours  = ${Math.round(bestEtaHours)},
            disruption_category   = ${bestCategory},
            last_checked_at       = now()
          WHERE id = ${seg.id}
        `;
        disruptionsFound++;
        disruptedRiskLevels.push(bestRisk);
      } else {
        await db`
          UPDATE adv_planned_segments SET
            has_disruption        = false,
            disruption_risk_level = null,
            disruption_title      = null,
            disruption_summary    = null,
            disruption_eta_hours  = null,
            disruption_category   = null,
            last_checked_at       = now()
          WHERE id = ${seg.id}
        `;
      }

      segmentsChecked++;
    } catch (segErr) {
      console.error(`[planned-pipeline] segment ${seg.id} (${seg.name}) failed:`, segErr);
      // Skip segment, do not abort the entire run.
    }
  }

  const maxRisk = worstRisk(disruptedRiskLevels);

  await db`
    UPDATE adv_planned_routes SET
      max_risk_level   = ${maxRisk},
      disruption_count = ${disruptionsFound},
      last_intel_at    = now(),
      updated_at       = now()
    WHERE id = ${routeId}
  `;

  return { segmentsChecked, disruptionsFound };
}
