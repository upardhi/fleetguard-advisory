import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/_server/db/client";
import { firecrawlSearch, firecrawlSearchFuture, firecrawlScrape } from "@/app/_server/advisory/firecrawl";
import { analyzeNews } from "@/app/_server/advisory/analyze";
import { currentSearchQuery, futureSearchQuery } from "@/app/_server/advisory/decompose";

export const maxDuration = 300;

const BATCH_SIZE = 8; // segments per cron invocation

const RISK_ORDER: Record<string, number> = {
  critical: 5, high: 4, medium: 3, low: 2, safe: 1,
};

function worstRisk(levels: (string | null | undefined)[]): string {
  let best = "safe";
  for (const l of levels) {
    if (l && (RISK_ORDER[l] ?? 0) > (RISK_ORDER[best] ?? 0)) best = l;
  }
  return best;
}

interface Job {
  id: string;
  route_id: string;
  org_id: string;
  segments_total: number;
  segments_done: number;
  disruptions_found: number;
}

interface SegmentRow {
  id: string;
  name: string;
  segment_type: string;
  state: string | null;
}

interface EventSource {
  url: string;
  title: string;
  snippet: string;
  isRelevant: boolean;
  scrapedAt: string;
}

// POST /api/cron/run-intelligence
// Fires every minute via Vercel Cron.
// Each invocation processes one batch of segments for the oldest pending/running job.
export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get("x-vercel-cron-auth") ?? "";
  if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Atomically claim the oldest pending or in-progress job
  const [job] = (await db`
    UPDATE adv_intel_jobs
    SET    status     = 'running',
           started_at = COALESCE(started_at, now())
    WHERE  id = (
      SELECT id FROM adv_intel_jobs
      WHERE  status IN ('pending', 'running')
      ORDER  BY created_at ASC
      LIMIT  1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, route_id, org_id, segments_total, segments_done, disruptions_found
  `) as unknown as Job[];

  if (!job) return NextResponse.json({ ok: true, message: "No pending jobs" });

  const today = new Date().toISOString().slice(0, 10);

  const segments = (await db`
    SELECT id, name, segment_type, state
    FROM   adv_watched_segments
    WHERE  watched_route_id = ${job.route_id}
    ORDER  BY route_variant, seq
    LIMIT  ${BATCH_SIZE}
    OFFSET ${job.segments_done}
  `) as unknown as SegmentRow[];

  if (segments.length === 0) {
    await finishJob(job);
    return NextResponse.json({ ok: true, jobId: job.id, message: "Job complete (no more segments)" });
  }

  let batchDisruptions = 0;
  // URL-level dedup within this batch: don't scrape/analyze the same URL
  // for multiple segments in the same batch invocation.
  const processedUrls = new Set<string>();

  for (const seg of segments) {
    const ctx = { segment: seg.name, state: seg.state ?? undefined, todayIso: today };
    const sources: EventSource[] = [];
    const now = new Date().toISOString();

    // ── Search 1: Current disruptions (past 24 hours only) ─────────────────
    let bestRisk: string | null = null;
    let bestTitle: string | null = null;
    let bestSummary: string | null = null;
    let bestEta: number | null = null;
    let bestCategory: string | null = null;

    try {
      const hits = await firecrawlSearch(currentSearchQuery({ name: seg.name, state: seg.state ?? undefined }), 3);

      for (const hit of hits) {
        // Skip URLs we already processed for another segment in this batch
        if (processedUrls.has(hit.url)) continue;
        processedUrls.add(hit.url);

        let scraped = { markdown: hit.description, title: hit.title };
        try { scraped = await firecrawlScrape(hit.url); } catch { /* use snippet */ }

        const content = `${scraped.title}\n\n${scraped.markdown}`.trim();
        if (!content) {
          sources.push({ url: hit.url, title: hit.title, snippet: hit.description, isRelevant: false, scrapedAt: now });
          continue;
        }

        const result = await analyzeNews(content, ctx);
        // Only accept ACTIVE (ongoing) events — not historical and not future scheduled
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

        // Hard filter: only Critical and High events are actionable
        const isActionable = isCurrentDisruption &&
          (result.riskLevel === "critical" || result.riskLevel === "high");

        if (isActionable && (RISK_ORDER[result.riskLevel] ?? 0) > (RISK_ORDER[bestRisk ?? "safe"] ?? 0)) {
          bestRisk     = result.riskLevel;
          bestTitle    = result.title;
          bestSummary  = result.summary;
          bestEta      = result.etaImpactHours;
          bestCategory = result.category;
        }
      }
    } catch (err) {
      console.error(`[cron] current search failed for ${seg.name}:`, err);
    }

    // Write current disruption state + sources to segment row
    if (bestRisk && bestRisk !== "safe") {
      await db`
        UPDATE adv_watched_segments
        SET    has_disruption        = true,
               disruption_risk_level = ${bestRisk},
               disruption_title      = ${bestTitle},
               disruption_summary    = ${bestSummary},
               disruption_eta_hours  = ${bestEta},
               disruption_category   = ${bestCategory},
               disruption_sources    = ${db.json(sources as unknown as Parameters<typeof db.json>[0])},
               last_checked_at       = now()
        WHERE  id = ${seg.id}
      `;
      batchDisruptions++;

      // ── Notify users whose region/city matches this segment's state ──────
      try {
        await createNotificationsForDisruption({
          orgId:     job.org_id,
          routeId:   job.route_id,
          segmentId: seg.id,
          state:     seg.state,
          title:     bestTitle ?? `Disruption on ${seg.name}`,
          summary:   bestSummary,
          riskLevel: bestRisk,
          category:  bestCategory,
        });
      } catch (err) {
        console.error(`[cron] notification creation failed for ${seg.name}:`, err);
      }
    } else {
      await db`
        UPDATE adv_watched_segments
        SET    has_disruption        = false,
               disruption_risk_level = null,
               disruption_title      = null,
               disruption_summary    = null,
               disruption_eta_hours  = null,
               disruption_category   = null,
               disruption_sources    = ${db.json(sources as unknown as Parameters<typeof db.json>[0])},
               last_checked_at       = now()
        WHERE  id = ${seg.id}
      `;
    }

    // ── Search 2: Future scheduled events (next 30 days) ────────────────────
    try {
      const futureHits = await firecrawlSearchFuture(futureSearchQuery({ name: seg.name, state: seg.state ?? undefined }), 3);

      for (const hit of futureHits) {
        let scraped = { markdown: hit.description, title: hit.title };
        try { scraped = await firecrawlScrape(hit.url); } catch { /* use snippet */ }

        const content = `${scraped.title}\n\n${scraped.markdown}`.trim();
        if (!content) continue;

        const result = await analyzeNews(content, ctx);

        // Only store scheduled events that are Critical or High — filter out noise
        if (result.isRelevant && result.eventType === "scheduled" &&
            (result.riskLevel === "critical" || result.riskLevel === "high")) {
          const eventSrc: EventSource[] = [{
            url: hit.url,
            title: scraped.title || hit.title,
            snippet: hit.description.slice(0, 200),
            isRelevant: true,
            scrapedAt: now,
          }];

          // Upsert — same segment + same title prefix = increment rescan_count, don't duplicate
          await db`
            INSERT INTO adv_corridor_events
              (id, org_id, watched_route_id, segment_id, event_type,
               event_start_at, title, summary, category, risk_level,
               eta_impact_hours, duration_days, sources, rescan_count)
            VALUES (
              ${crypto.randomUUID()}, ${job.org_id}, ${job.route_id}, ${seg.id},
              'scheduled',
              ${result.eventDate ? new Date(result.eventDate).toISOString() : null},
              ${result.title}, ${result.summary ?? null}, ${result.category},
              ${result.riskLevel}, ${result.etaImpactHours}, ${result.durationDays},
              ${JSON.stringify(eventSrc)}, 1
            )
            ON CONFLICT (segment_id, lower(left(title, 80)))
            DO UPDATE SET
              rescan_count     = adv_corridor_events.rescan_count + 1,
              summary          = EXCLUDED.summary,
              event_start_at   = COALESCE(EXCLUDED.event_start_at, adv_corridor_events.event_start_at),
              sources          = adv_corridor_events.sources || EXCLUDED.sources,
              updated_at       = now()
          `;
        }
      }
    } catch (err) {
      console.error(`[cron] future search failed for ${seg.name}:`, err);
    }
  }

  const newDone        = job.segments_done + segments.length;
  const newDisruptions = job.disruptions_found + batchDisruptions;
  const isComplete     = newDone >= job.segments_total;

  if (isComplete) {
    await db`
      UPDATE adv_intel_jobs
      SET    segments_done     = ${newDone},
             disruptions_found = ${newDisruptions},
             status            = 'completed',
             finished_at       = now()
      WHERE  id = ${job.id}
    `;
    await refreshRouteSummary(job.route_id);
  } else {
    await db`
      UPDATE adv_intel_jobs
      SET    segments_done     = ${newDone},
             disruptions_found = ${newDisruptions}
      WHERE  id = ${job.id}
    `;
  }

  return NextResponse.json({
    ok: true,
    jobId: job.id,
    segmentsDone: newDone,
    segmentsTotal: job.segments_total,
    disruptionsFound: newDisruptions,
    complete: isComplete,
  });
}

// ── Notification helper ────────────────────────────────────────────────────────
// Finds all users in the same org whose preferred region covers this state,
// then inserts a notification for each — deduplicating by (user_id, title prefix)
// within the last 20 hours so we don't spam on repeated scans.
async function createNotificationsForDisruption({
  orgId, routeId, segmentId, state, title, summary, riskLevel, category,
}: {
  orgId: string; routeId: string; segmentId: string;
  state: string | null; title: string; summary: string | null;
  riskLevel: string | null; category: string | null;
}) {
  if (!state) return;

  // Find region whose states[] contains this state
  const [region] = await db`
    SELECT id FROM adv_regions
    WHERE ${state} = ANY(states)
    LIMIT 1
  ` as { id: string }[];

  if (!region) return;

  // Find users in this org assigned to this region (or with no preference = gets all)
  const users = await db`
    SELECT user_id FROM adv_user_prefs
    WHERE org_id   = ${orgId}
      AND region_id = ${region.id}
  ` as unknown as { user_id: string }[];

  if (users.length === 0) return;

  const titleKey = title.slice(0, 60).toLowerCase();

  for (const { user_id } of users) {
    // Dedup: skip if same user already has this notification in last 20h
    const [existing] = await db`
      SELECT 1 FROM adv_notifications
      WHERE user_id = ${user_id}
        AND lower(left(title, 60)) = ${titleKey}
        AND created_at > now() - interval '20 hours'
      LIMIT 1
    ` as unknown as unknown[];

    if (existing) continue;

    await db`
      INSERT INTO adv_notifications
        (id, org_id, user_id, region_id, title, body, risk_level, category, segment_id, route_id)
      VALUES (
        ${crypto.randomUUID()}, ${orgId}, ${user_id}, ${region.id},
        ${title}, ${summary ?? null}, ${riskLevel ?? null}, ${category ?? null},
        ${segmentId}, ${routeId}
      )
    `;
  }
}

async function finishJob(job: Job) {
  await db`
    UPDATE adv_intel_jobs
    SET    status = 'completed', finished_at = now()
    WHERE  id = ${job.id}
  `;
  await refreshRouteSummary(job.route_id);
}

async function refreshRouteSummary(routeId: string) {
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
}
