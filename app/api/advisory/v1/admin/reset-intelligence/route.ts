import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/app/_server/auth/getUser";
import { db } from "@/app/_server/db/client";
import { uuidv7 } from "@/app/_server/db/uuidv7";
import { applySecurityHeaders } from "@/app/_server/security/headers";

/**
 * POST /api/advisory/v1/admin/reset-intelligence
 *
 * Clears ALL cached intelligence data for the authenticated org and immediately
 * re-queues every active corridor for a fresh scan.
 *
 * What gets cleared:
 *   • adv_watched_segments  — disruption columns reset, last_checked_at nulled
 *   • adv_intel_jobs        — all existing jobs cancelled
 *   • adv_corridor_events   — all scheduled/ongoing events deleted
 *   • adv_notifications     — all in-app alerts deleted
 *   • adv_watched_routes    — risk summary columns reset
 *
 * What gets re-queued:
 *   • One fresh 'pending' intel job for every active corridor that has segments
 */
export async function POST(req: NextRequest) {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const org = actor.org;

  // ── 1. Reset disruption columns on all segments for this org's routes ──────
  await db`
    UPDATE adv_watched_segments s
    SET    has_disruption        = false,
           disruption_risk_level = null,
           disruption_title      = null,
           disruption_summary    = null,
           disruption_eta_hours  = null,
           disruption_category   = null,
           disruption_sources    = null,
           last_checked_at       = null
    FROM   adv_watched_routes r
    WHERE  r.id     = s.watched_route_id
      AND  r.org_id = ${org}
  `;

  // ── 2. Cancel / delete all existing intel jobs for this org ───────────────
  await db`
    DELETE FROM adv_intel_jobs
    WHERE  org_id = ${org}
  `;

  // ── 3. Delete all corridor events for this org ────────────────────────────
  await db`
    DELETE FROM adv_corridor_events
    WHERE  org_id = ${org}
  `;

  // ── 4. Delete all notifications for this org ─────────────────────────────
  await db`
    DELETE FROM adv_notifications
    WHERE  org_id = ${org}
  `;

  // ── 5. Reset route-level risk summary ────────────────────────────────────
  await db`
    UPDATE adv_watched_routes
    SET    max_risk_level   = 'safe',
           disruption_count = 0,
           last_intel_at    = null,
           updated_at       = now()
    WHERE  org_id = ${org}
      AND  is_active = true
  `;

  // ── 6. Re-queue a fresh intel job for every active route with segments ────
  const routes = await db`
    SELECT r.id AS route_id, COUNT(s.id)::int AS segment_count
    FROM   adv_watched_routes r
    JOIN   adv_watched_segments s ON s.watched_route_id = r.id
    WHERE  r.org_id     = ${org}
      AND  r.is_active   = true
      AND  r.routes_fetched = true
    GROUP  BY r.id
    HAVING COUNT(s.id) > 0
  ` as unknown as Array<{ route_id: string; segment_count: number }>;

  let queued = 0;
  for (const route of routes) {
    await db`
      INSERT INTO adv_intel_jobs
        (id, org_id, route_id, status, segments_total, triggered_by)
      VALUES
        (${uuidv7()}, ${org}, ${route.route_id}, 'pending', ${route.segment_count}, 'manual-reset')
    `;
    queued++;
  }

  console.info(`[reset-intelligence] org=${org} cleared all data, queued ${queued} fresh job(s)`);

  return applySecurityHeaders(
    NextResponse.json({
      ok: true,
      message: `Intelligence data cleared. ${queued} corridor${queued !== 1 ? "s" : ""} queued for fresh scan.`,
      routesQueued: queued,
    }),
  );
}
