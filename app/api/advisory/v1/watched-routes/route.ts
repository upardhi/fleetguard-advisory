import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/app/_server/auth/getUser";
import { db } from "@/app/_server/db/client";
import { uuidv7 } from "@/app/_server/db/uuidv7";
import { applySecurityHeaders } from "@/app/_server/security/headers";
import { fetchWatchedRouteSegments } from "@/app/_server/advisory/watcher-pipeline";

const CreateSchema = z.object({
  name: z.string().trim().max(100).default(""),
  origin: z.string().trim().min(1).max(100),
  destination: z.string().trim().min(1).max(100),
  region_id: z.string().max(100).nullable().optional(),
  schedule_type: z.enum(['daily', 'once']).default('daily'),
  scheduled_date: z.string().optional(), // ISO date string for 'once' type
});


// GET /api/advisory/v1/watched-routes — list routes for the authenticated org
// Optional ?regionId=east  — filters to corridors in that region (by region_id column or segment state match)
export async function GET(req: NextRequest) {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const url = new URL(req.url);
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
             routes_fetched, last_intel_at, max_risk_level, disruption_count, created_at,
             schedule_type, scheduled_date, is_schedule_active, last_scheduled_run
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
             routes_fetched, last_intel_at, max_risk_level, disruption_count, created_at,
             schedule_type, scheduled_date, is_schedule_active, last_scheduled_run
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

  const { name, origin, destination, region_id, schedule_type, scheduled_date } = parsed.data;
  const id = uuidv7();
  const orgId = actor.org;

  // Validate scheduled_date for 'once' type
  if (schedule_type === 'once' && !scheduled_date) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Scheduled date is required for one-time schedule" }, { status: 422 }),
    );
  }
  
  // Verify region exists if provided
  if (region_id) {
    const [region] = await db`
      SELECT id FROM adv_regions WHERE id = ${region_id}
    ` as unknown as Array<{ id: string }>;
    if (!region) {
      return applySecurityHeaders(NextResponse.json({ error: "Region not found" }, { status: 404 }));
    }
  }

  await db`
    INSERT INTO adv_watched_routes (
      id, org_id, name, origin, destination, region_id,
      schedule_type, scheduled_date, is_schedule_active
    ) VALUES (
      ${id}, ${orgId}, ${name || `${origin} → ${destination}`}, 
      ${origin}, ${destination}, ${region_id || null},
      ${schedule_type}, ${scheduled_date ? new Date(scheduled_date) : null}, 
      ${schedule_type === 'once' ? true : true}
    )
  `;

  // Kick off route decomposition only if schedule is active and applicable
  const shouldDecompose = schedule_type === 'daily' ||
    (schedule_type === 'once' && scheduled_date && new Date(scheduled_date) >= new Date());

  if (shouldDecompose) {
    fetchWatchedRouteSegments(id, origin, destination)
      .then(async ({ segmentCount }) => {
        // Only queue intel job if schedule is active
        const [route] = await db`
          SELECT schedule_type, scheduled_date, is_schedule_active 
          FROM adv_watched_routes WHERE id = ${id}
        `;

        if (route.is_schedule_active) {
          const existing = await db`
            SELECT id FROM adv_intel_jobs
            WHERE  route_id = ${id}
              AND  status IN ('pending', 'running')
            LIMIT  1
          `;
          if (existing.length === 0) {
            await db`
              INSERT INTO adv_intel_jobs
                (id, org_id, route_id, status, segments_total, triggered_by)
              VALUES
                (${uuidv7()}, ${orgId}, ${id}, 'pending', ${segmentCount}, 'on-create')
            `;
            console.info(`[watcher] queued intel job for new route ${id} (${segmentCount} segments)`);
          }
        }
      })
      .catch((err) => console.error("[watcher] bg fetch failed:", err));
  }

  return applySecurityHeaders(NextResponse.json({ id }, { status: 201 }));
}