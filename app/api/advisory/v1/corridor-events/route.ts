import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/app/_server/auth/getUser";
import { db } from "@/app/_server/db/client";
import { applySecurityHeaders } from "@/app/_server/security/headers";
import type { CorridorEvent, DisruptionCategory, RiskLevel } from "@/app/_lib/types";

const VALID_CATEGORIES = new Set([
  "political", "weather", "traffic", "security",
  "infrastructure", "religious", "vvip", "natural_disaster",
]);

function safeCategory(raw: string | null): DisruptionCategory {
  if (raw && VALID_CATEGORIES.has(raw)) return raw as DisruptionCategory;
  return "traffic";
}

interface EventRow {
  id: string;
  org_id: string;
  watched_route_id: string;
  segment_id: string | null;
  event_type: string;
  event_start_at: string | null;
  event_end_at: string | null;
  detected_at: string;
  title: string;
  summary: string | null;
  category: string | null;
  risk_level: string;
  eta_impact_hours: number;
  duration_days: number;
  sources: unknown;
  rescan_count: number;
  is_active: boolean;
  corridor_name: string;
  corridor_origin: string;
  corridor_destination: string;
}

// GET /api/advisory/v1/corridor-events
// Returns future/scheduled corridor events for the org's watched routes.
// Query params:
//   eventType = ongoing | scheduled | historical | all  (default: all)
//   routeId   = filter to specific route
//   limit     = max rows (default 100)
export async function GET(req: NextRequest) {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const url = new URL(req.url);
  const eventType = url.searchParams.get("eventType") ?? "all";
  const routeId   = url.searchParams.get("routeId");
  const limit     = Math.min(parseInt(url.searchParams.get("limit") ?? "100"), 200);

  const rows = (await db`
    SELECT
      ce.id, ce.org_id, ce.watched_route_id, ce.segment_id,
      -- Dynamically reclassify event_type based on current date
      CASE
        WHEN ce.event_start_at IS NULL                              THEN 'scheduled'
        WHEN ce.event_start_at > now()                             THEN 'scheduled'
        WHEN ce.event_start_at > now() - interval '14 days'       THEN 'ongoing'
        ELSE 'historical'
      END                                                          AS event_type,
      ce.event_start_at, ce.event_end_at,
      ce.detected_at, ce.title, ce.summary, ce.category,
      ce.risk_level, ce.eta_impact_hours, ce.duration_days,
      ce.sources, ce.rescan_count, ce.is_active,
      r.name        AS corridor_name,
      r.origin      AS corridor_origin,
      r.destination AS corridor_destination
    FROM   adv_corridor_events ce
    JOIN   adv_watched_routes  r ON r.id = ce.watched_route_id
    WHERE  ce.org_id = ${actor.org}
      AND  r.is_active = true
      AND  (${eventType} = 'all' OR
            CASE
              WHEN ce.event_start_at IS NULL                        THEN 'scheduled'
              WHEN ce.event_start_at > now()                       THEN 'scheduled'
              WHEN ce.event_start_at > now() - interval '14 days' THEN 'ongoing'
              ELSE 'historical'
            END = ${eventType})
      AND  (${routeId ?? null}::text IS NULL OR ce.watched_route_id = ${routeId ?? null})
    ORDER  BY
      CASE
        WHEN ce.event_start_at IS NULL OR ce.event_start_at > now()             THEN 1
        WHEN ce.event_start_at > now() - interval '14 days'                    THEN 2
        ELSE 3
      END,
      ce.event_start_at ASC NULLS LAST,
      ce.detected_at DESC
    LIMIT  ${limit}
  `) as unknown as EventRow[];

  const events: CorridorEvent[] = rows.map((r) => ({
    id: r.id,
    watched_route_id: r.watched_route_id,
    segment_id: r.segment_id,
    event_type: r.event_type as CorridorEvent["event_type"],
    event_start_at: r.event_start_at,
    event_end_at: r.event_end_at,
    detected_at: r.detected_at,
    title: r.title,
    summary: r.summary,
    category: safeCategory(r.category),
    risk_level: r.risk_level as RiskLevel,
    eta_impact_hours: r.eta_impact_hours,
    duration_days: r.duration_days,
    sources: Array.isArray(r.sources) ? r.sources : [],
    rescan_count: r.rescan_count,
    is_active: r.is_active,
    corridor_name: r.corridor_name,
    corridor_origin: r.corridor_origin,
    corridor_destination: r.corridor_destination,
  }));

  // Summary counts
  const ongoing   = events.filter((e) => e.event_type === "ongoing").length;
  const scheduled = events.filter((e) => e.event_type === "scheduled").length;
  const historical = events.filter((e) => e.event_type === "historical").length;

  return applySecurityHeaders(
    NextResponse.json({
      events,
      counts: { ongoing, scheduled, historical, total: events.length },
    }),
  );
}
