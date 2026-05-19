/**
 * Disruption intelligence pipeline.
 *
 *   search  → for every segment of every monitored trip's routes, query
 *             Firecrawl for news; save hits as adv_news_items.
 *   scrape  → fetch full content for found news items.
 *   analyze → LLM turns scraped content into adv_disruptions.
 *   match   → link each disruption to the trips whose route crosses the
 *             segment that surfaced it; create adv_trip_alerts.
 *
 * runFullPipeline() chains all four. Each stage is also exported so a cron
 * or admin UI can run them independently.
 */

import { db } from "../db/client";
import { uuidv7 } from "../db/uuidv7";
import { firecrawlSearch, firecrawlScrape } from "./firecrawl";
import { analyzeNews } from "./analyze";
import { segmentSearchQuery } from "./decompose";

const MAX_SEGMENTS_PER_RUN = 40;
const MAX_NEWS_PER_RUN = 30;
const SEARCH_HITS_PER_SEGMENT = 20;

export interface PipelineResult {
  runId: string;
  segmentsSeen: number;
  newsFound: number;
  disruptions: number;
  alerts: number;
}

interface SegmentRow {
  name: string;
  segment_type: string;
  state: string | null;
}

// ── Stage 1: search ───────────────────────────────────────────────────────────

async function runSearch(): Promise<{ segmentsSeen: number; newsFound: number }> {
  // Distinct segments across all monitored / planned trips.
  const segments = (await db`
    SELECT DISTINCT s.name, s.segment_type, s.state
    FROM   adv_route_segments s
    JOIN   adv_routes r ON r.id = s.route_id
    JOIN   adv_trips  t ON t.id = r.trip_id
    WHERE  t.status IN ('planned', 'monitoring')
    LIMIT  ${MAX_SEGMENTS_PER_RUN}
  `) as unknown as SegmentRow[];

  let newsFound = 0;

  for (const seg of segments) {
    let hits;
    try {
      hits = await firecrawlSearch(
        segmentSearchQuery({ name: seg.name, state: seg.state ?? undefined }),
        SEARCH_HITS_PER_SEGMENT,
      );
    } catch (err) {
      console.error(`[pipeline] search failed for ${seg.name}:`, err);
      continue;
    }

    for (const hit of hits) {
      const inserted = (await db`
        INSERT INTO adv_news_items
          (id, url, title, source, snippet, search_query, matched_segment, segment_type, state, status)
        VALUES (
          ${uuidv7()}, ${hit.url}, ${hit.title}, ${new URL(hit.url).hostname},
          ${hit.description}, ${segmentSearchQuery({ name: seg.name, state: seg.state ?? undefined })},
          ${seg.name}, ${seg.segment_type}, ${seg.state}, 'found'
        )
        ON CONFLICT (url) DO NOTHING
        RETURNING id
      `) as unknown as Array<{ id: string }>;
      if (inserted.length > 0) newsFound++;
    }
  }

  return { segmentsSeen: segments.length, newsFound };
}

// ── Stage 2: scrape ───────────────────────────────────────────────────────────

async function runScrape(): Promise<void> {
  const items = (await db`
    SELECT id, url FROM adv_news_items
    WHERE  status = 'found'
    ORDER  BY created_at ASC
    LIMIT  ${MAX_NEWS_PER_RUN}
  `) as unknown as Array<{ id: string; url: string }>;

  for (const item of items) {
    try {
      const { markdown, title } = await firecrawlScrape(item.url);
      await db`
        UPDATE adv_news_items
        SET    raw_content = ${markdown},
               title = COALESCE(NULLIF(${title}, ''), title),
               status = 'scraped'
        WHERE  id = ${item.id}
      `;
    } catch (err) {
      console.error(`[pipeline] scrape failed for ${item.url}:`, err);
      await db`UPDATE adv_news_items SET status = 'irrelevant' WHERE id = ${item.id}`;
    }
  }
}

// ── Stage 3: analyze ──────────────────────────────────────────────────────────

async function runAnalyze(): Promise<number> {
  const items = (await db`
    SELECT id, title, raw_content, matched_segment, state
    FROM   adv_news_items
    WHERE  status = 'scraped'
    ORDER  BY created_at ASC
    LIMIT  ${MAX_NEWS_PER_RUN}
  `) as unknown as Array<{
    id: string;
    title: string | null;
    raw_content: string | null;
    matched_segment: string | null;
    state: string | null;
  }>;

  let created = 0;

  for (const item of items) {
    const content = `${item.title ?? ""}\n\n${item.raw_content ?? ""}`.trim();
    if (!content) {
      await db`UPDATE adv_news_items SET status = 'irrelevant' WHERE id = ${item.id}`;
      continue;
    }

    const result = await analyzeNews(content, {
      segment: item.matched_segment ?? "",
      state: item.state ?? undefined,
    });

    if (!result.isRelevant) {
      await db`UPDATE adv_news_items SET status = 'irrelevant' WHERE id = ${item.id}`;
      continue;
    }

    await db`
      INSERT INTO adv_disruptions
        (id, news_item_id, category, title, summary, detail, risk_level,
         affected_location, affected_highway, state, eta_impact_hours, confidence, starts_at)
      VALUES (
        ${uuidv7()}, ${item.id}, ${result.category}, ${result.title},
        ${result.summary}, ${result.detail}, ${result.riskLevel},
        ${result.affectedLocation ?? item.matched_segment}, ${result.affectedHighway ?? null},
        ${item.state}, ${result.etaImpactHours}, ${result.confidence}, now()
      )
    `;
    await db`UPDATE adv_news_items SET status = 'analyzed' WHERE id = ${item.id}`;
    created++;
  }

  return created;
}

// ── Stage 4: match ────────────────────────────────────────────────────────────

const SEVERITY_BY_RISK: Record<string, string> = {
  critical: "critical",
  high: "critical",
  medium: "warning",
  low: "info",
  safe: "info",
};

async function runMatch(): Promise<number> {
  // Disruptions whose source news segment still has no alert raised.
  const disruptions = (await db`
    SELECT d.id, d.title, d.risk_level, d.eta_impact_hours, n.matched_segment
    FROM   adv_disruptions d
    JOIN   adv_news_items  n ON n.id = d.news_item_id
    WHERE  d.is_active = true
  `) as unknown as Array<{
    id: string;
    title: string;
    risk_level: string;
    eta_impact_hours: number;
    matched_segment: string | null;
  }>;

  let created = 0;

  for (const d of disruptions) {
    if (!d.matched_segment) continue;

    // Every monitored trip whose route crosses this segment.
    const targets = (await db`
      SELECT DISTINCT t.id AS trip_id, r.id AS route_id
      FROM   adv_route_segments s
      JOIN   adv_routes r ON r.id = s.route_id
      JOIN   adv_trips  t ON t.id = r.trip_id
      WHERE  s.name = ${d.matched_segment}
        AND  t.status IN ('planned', 'monitoring')
    `) as unknown as Array<{ trip_id: string; route_id: string }>;

    for (const tgt of targets) {
      const exists = (await db`
        SELECT id FROM adv_trip_alerts
        WHERE  trip_id = ${tgt.trip_id} AND disruption_id = ${d.id}
        LIMIT  1
      `) as unknown as Array<{ id: string }>;
      if (exists.length > 0) continue;

      await db`
        INSERT INTO adv_trip_alerts
          (id, trip_id, route_id, disruption_id, matched_segment, severity, message, status)
        VALUES (
          ${uuidv7()}, ${tgt.trip_id}, ${tgt.route_id}, ${d.id}, ${d.matched_segment},
          ${SEVERITY_BY_RISK[d.risk_level] ?? "warning"},
          ${`${d.title} — affects ${d.matched_segment} on your route (+${d.eta_impact_hours}h)`},
          'new'
        )
      `;
      created++;
    }
  }

  return created;
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export async function runFullPipeline(): Promise<PipelineResult> {
  const runId = uuidv7();
  await db`
    INSERT INTO adv_pipeline_runs (id, stage, status)
    VALUES (${runId}, 'full', 'running')
  `;

  try {
    const { segmentsSeen, newsFound } = await runSearch();
    await runScrape();
    const disruptions = await runAnalyze();
    const alerts = await runMatch();

    await db`
      UPDATE adv_pipeline_runs
      SET    status = 'done', segments_seen = ${segmentsSeen}, news_found = ${newsFound},
             disruptions = ${disruptions}, alerts = ${alerts}, finished_at = now()
      WHERE  id = ${runId}
    `;

    return { runId, segmentsSeen, newsFound, disruptions, alerts };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db`
      UPDATE adv_pipeline_runs
      SET    status = 'failed', error = ${msg}, finished_at = now()
      WHERE  id = ${runId}
    `;
    throw err;
  }
}

export { runSearch, runScrape, runAnalyze, runMatch };
