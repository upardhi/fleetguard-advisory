import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/_server/db/client";
import { firecrawlSearch, firecrawlScrape } from "@/app/_server/advisory/firecrawl";
import { analyzeNews } from "@/app/_server/advisory/analyze";
import { segmentSearchQuery } from "@/app/_server/advisory/decompose";

export const maxDuration = 300; // Vercel Pro: up to 300s per invocation

const BATCH_SIZE = 10;

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

// POST /api/cron/run-intelligence
// Scheduled every minute by Vercel Cron.
// Picks up the oldest pending/running intelligence job and processes the next batch of segments.
export async function POST(req: NextRequest) {
  // Verify this is a legitimate Vercel Cron invocation
  const cronSecret = req.headers.get("x-vercel-cron-auth") ?? "";
  if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Claim the oldest pending job (atomic update to avoid double-processing)
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

  if (!job) {
    return NextResponse.json({ ok: true, message: "No pending jobs" });
  }

  // Fetch next batch of segments (offset by segments already done)
  const segments = (await db`
    SELECT id, name, segment_type, state
    FROM   adv_watched_segments
    WHERE  watched_route_id = ${job.route_id}
    ORDER  BY route_variant, seq
    LIMIT  ${BATCH_SIZE}
    OFFSET ${job.segments_done}
  `) as unknown as SegmentRow[];

  if (segments.length === 0) {
    // All segments processed — mark done and refresh route summary
    await finishJob(job);
    return NextResponse.json({ ok: true, jobId: job.id, message: "Job complete" });
  }

  let batchDisruptions = 0;

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
          SET    has_disruption        = true,
                 disruption_risk_level = ${bestRisk},
                 disruption_title      = ${bestTitle},
                 disruption_summary    = ${bestSummary},
                 disruption_eta_hours  = ${bestEta},
                 disruption_category   = ${bestCategory},
                 last_checked_at       = now()
          WHERE  id = ${seg.id}
        `;
        batchDisruptions++;
      } else {
        await db`
          UPDATE adv_watched_segments
          SET    has_disruption        = false,
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
      console.error(`[cron/run-intelligence] segment ${seg.name} failed:`, err);
    }
  }

  const newDone = job.segments_done + segments.length;
  const newDisruptions = job.disruptions_found + batchDisruptions;
  const isComplete = newDone >= job.segments_total;

  if (isComplete) {
    await db`
      UPDATE adv_intel_jobs
      SET    segments_done     = ${newDone},
             disruptions_found = ${newDisruptions},
             status            = 'done',
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

async function finishJob(job: Job) {
  await db`
    UPDATE adv_intel_jobs
    SET    status      = 'done',
           finished_at = now()
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
