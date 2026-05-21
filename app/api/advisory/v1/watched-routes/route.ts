import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/app/_server/auth/getUser";
import { db } from "@/app/_server/db/client";
import { uuidv7 } from "@/app/_server/db/uuidv7";
import { applySecurityHeaders } from "@/app/_server/security/headers";
import { fetchWatchedRouteSegments } from "@/app/_server/advisory/watcher-pipeline";

const CreateSchema = z.object({
  name:        z.string().trim().max(100).default(""),
  origin:      z.string().trim().min(1).max(100),
  destination: z.string().trim().min(1).max(100),
});

// GET /api/advisory/v1/watched-routes — list routes for the authenticated org
// Optional ?regionId=east  — filters to corridors in that region (by region_id column or segment state match)
export async function GET(req: NextRequest) {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const url      = new URL(req.url);
  const regionId = url.searchParams.get("regionId");

  let regionStates: string[] = [];
  if (regionId) {
    const [region] = await db`
      SELECT states FROM adv_regions WHERE id = ${regionId}
    ` as unknown as { states: string[] }[];
    if (region) regionStates = region.states;
  }

  const routes = regionStates.length > 0
    ? await db`
        SELECT id, org_id, name, origin, destination, is_active,
               routes_fetched, last_intel_at, max_risk_level, disruption_count, created_at
        FROM   adv_watched_routes
        WHERE  org_id = ${actor.org} AND is_active = true
          AND  (region_id = ${regionId} OR EXISTS (
            SELECT 1 FROM adv_watched_segments s
            WHERE s.watched_route_id = adv_watched_routes.id
              AND s.state = ANY(${db.array(regionStates)})
            LIMIT 1
          ))
        ORDER BY created_at DESC
      `
    : await db`
        SELECT id, org_id, name, origin, destination, is_active,
               routes_fetched, last_intel_at, max_risk_level, disruption_count, created_at
        FROM   adv_watched_routes
        WHERE  org_id = ${actor.org} AND is_active = true
        ORDER  BY created_at DESC
      `;

  return applySecurityHeaders(NextResponse.json({ routes }));
}

// POST /api/advisory/v1/watched-routes — add a new watched corridor
export async function POST(req: NextRequest) {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }

  const { name, origin, destination } = parsed.data;
  const id = uuidv7();
  const orgId = actor.org;

  await db`
    INSERT INTO adv_watched_routes (id, org_id, name, origin, destination)
    VALUES (${id}, ${orgId}, ${name || `${origin} → ${destination}`}, ${origin}, ${destination})
  `;

  // Kick off route decomposition in the background — don't block the response.
  // Once segments are mapped, immediately queue an intel job so the
  // run-intelligence cron (fires every minute) starts processing within seconds.
  fetchWatchedRouteSegments(id, origin, destination)
    .then(async ({ segmentCount }) => {
      // Guard: skip if a job is already pending/running for this route
      const existing = await db`
        SELECT id FROM adv_intel_jobs
        WHERE  route_id = ${id}
          AND  status IN ('pending', 'running')
        LIMIT  1
      `;
      if (existing.length > 0) return;

      await db`
        INSERT INTO adv_intel_jobs
          (id, org_id, route_id, status, segments_total, triggered_by)
        VALUES
          (${uuidv7()}, ${orgId}, ${id}, 'pending', ${segmentCount}, 'on-create')
      `;
      console.info(`[watcher] queued intel job for new route ${id} (${segmentCount} segments)`);
    })
    .catch((err) => console.error("[watcher] bg fetch failed:", err));

  return applySecurityHeaders(NextResponse.json({ id }, { status: 201 }));
}
