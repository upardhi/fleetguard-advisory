import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/app/_server/auth/getUser";
import { db } from "@/app/_server/db/client";
import { applySecurityHeaders } from "@/app/_server/security/headers";
import { runWatchedRouteIntelligence } from "@/app/_server/advisory/watcher-pipeline";

// POST /api/advisory/v1/watched-routes/[id]/run-intelligence
// Runs Firecrawl + OpenAI on every segment of this corridor.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { id } = await params;

  const [route] = (await db`
    SELECT id, org_id, routes_fetched
    FROM   adv_watched_routes
    WHERE  id = ${id} AND org_id = ${actor.org}
    LIMIT  1
  `) as unknown as Array<{ id: string; org_id: string; routes_fetched: boolean }>;

  if (!route) {
    return applySecurityHeaders(NextResponse.json({ error: "Not found" }, { status: 404 }));
  }

  if (!route.routes_fetched) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Fetch route segments first" }, { status: 400 }),
    );
  }

  try {
    const result = await runWatchedRouteIntelligence(id);
    return applySecurityHeaders(NextResponse.json({ ok: true, ...result }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Intelligence run failed";
    return applySecurityHeaders(NextResponse.json({ error: msg }, { status: 500 }));
  }
}
