import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/app/_server/auth/getUser";
import { db } from "@/app/_server/db/client";
import { applySecurityHeaders } from "@/app/_server/security/headers";

// GET /api/advisory/v1/intelligence-jobs/[jobId]
// Poll this to track progress of an async intelligence job.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { jobId } = await params;

  const [job] = (await db`
    SELECT id, status, segments_total, segments_done, disruptions_found,
           error, created_at, started_at, finished_at
    FROM   adv_intel_jobs
    WHERE  id      = ${jobId}
      AND  org_id  = ${actor.org}
    LIMIT  1
  `) as unknown as Array<{
    id: string;
    status: string;
    segments_total: number;
    segments_done: number;
    disruptions_found: number;
    error: string | null;
    created_at: string;
    started_at: string | null;
    finished_at: string | null;
  }>;

  if (!job) {
    return applySecurityHeaders(NextResponse.json({ error: "Job not found" }, { status: 404 }));
  }

  const progress = job.segments_total > 0
    ? Math.round((job.segments_done / job.segments_total) * 100)
    : 0;

  return applySecurityHeaders(
    NextResponse.json({
      jobId: job.id,
      status: job.status,
      progress,
      segmentsDone: job.segments_done,
      segmentsTotal: job.segments_total,
      disruptionsFound: job.disruptions_found,
      error: job.error,
      startedAt: job.started_at,
      finishedAt: job.finished_at,
    }),
  );
}
