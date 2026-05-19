import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/app/_server/auth/getUser";
import { db } from "@/app/_server/db/client";
import { runFullPipeline } from "@/app/_server/advisory/pipeline";

// GET /api/advisory/v1/pipeline — recent pipeline runs.
export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    const runs = await db`
      SELECT * FROM adv_pipeline_runs ORDER BY started_at DESC LIMIT 20
    `;
    return NextResponse.json({ runs });
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 401)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("pipeline list error", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// POST /api/advisory/v1/pipeline — run the full search→scrape→analyze→match
// pipeline across all monitored trips.
export async function POST(req: NextRequest) {
  try {
    await requireUser(req);
    const result = await runFullPipeline();
    return NextResponse.json({ result });
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 401)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const msg = err instanceof Error ? err.message : "Pipeline failed";
    console.error("pipeline run error", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
