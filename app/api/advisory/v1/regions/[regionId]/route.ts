import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/app/_server/auth/getUser";
import { db } from "@/app/_server/db/client";
import { applySecurityHeaders } from "@/app/_server/security/headers";
import type { EventSource, DisruptionCategory, RiskLevel } from "@/app/_lib/types";

const RISK_ORDER: Record<string, number> = {
  critical: 5, high: 4, medium: 3, low: 2, safe: 1,
};

// GET /api/advisory/v1/regions/[regionId]
// Returns full detail for one region: cities, corridors, disruptions grouped by state.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ regionId: string }> },
) {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { regionId } = await params;

  // Validate region
  const [region] = await db`
    SELECT id, label, color, states FROM adv_regions WHERE id = ${regionId}
  ` as { id: string; label: string; color: string; states: string[] }[];

  if (!region) {
    return applySecurityHeaders(NextResponse.json({ error: "Region not found" }, { status: 404 }));
  }

  // Load depot cities for this region
  const cities = await db`
    SELECT id, name, state, is_depot FROM adv_cities
    WHERE org_id = ${actor.org} AND region_id = ${regionId}
    ORDER BY name
  ` as { id: string; name: string; state: string | null; is_depot: boolean }[];

  // Load corridors in this region (both region_id-tagged and state-matched)
  const corridors = await db`
    SELECT id, name, origin, destination, max_risk_level, disruption_count,
           last_intel_at, routes_fetched, region_id
    FROM   adv_watched_routes
    WHERE  org_id = ${actor.org}
      AND  is_active = true
      AND  (
        region_id = ${regionId}
        OR EXISTS (
          SELECT 1 FROM adv_watched_segments s
          WHERE s.watched_route_id = adv_watched_routes.id
            AND s.state = ANY(${db.array(region.states)})
          LIMIT 1
        )
      )
    ORDER BY name
  ` as {
    id: string; name: string; origin: string; destination: string;
    max_risk_level: string | null; disruption_count: number;
    last_intel_at: string | null; routes_fetched: boolean; region_id: string | null;
  }[];

  // Load ALL disrupted segments for this region's states
  const segments = await db`
    SELECT
      s.id, s.name AS segment_name, s.state, s.disruption_risk_level,
      s.disruption_title, s.disruption_summary, s.disruption_eta_hours,
      s.disruption_category, s.disruption_sources, s.last_checked_at,
      r.id AS route_id, r.name AS route_name
    FROM   adv_watched_segments s
    JOIN   adv_watched_routes   r ON r.id = s.watched_route_id
    WHERE  r.org_id   = ${actor.org}
      AND  r.is_active = true
      AND  s.has_disruption = true
      AND  s.disruption_risk_level IN ('critical', 'high')
      AND  s.state = ANY(${db.array(region.states)})
    ORDER BY
      CASE s.disruption_risk_level WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,
      s.disruption_eta_hours DESC NULLS LAST
  ` as {
    id: string; segment_name: string; state: string | null;
    disruption_risk_level: string; disruption_title: string | null;
    disruption_summary: string | null; disruption_eta_hours: number | null;
    disruption_category: string | null; disruption_sources: unknown;
    last_checked_at: string | null; route_id: string; route_name: string;
  }[];

  // Deduplicate by title within each corridor
  const seenKeys = new Set<string>();
  const dedupedSegs = segments.filter((s) => {
    const key = `${s.route_id}::${(s.disruption_title ?? s.segment_name).trim().toLowerCase().slice(0, 60)}`;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });

  // Group disruptions by state
  const byState = new Map<string, typeof dedupedSegs>();
  for (const seg of dedupedSegs) {
    const key = seg.state ?? "Unknown";
    if (!byState.has(key)) byState.set(key, []);
    byState.get(key)!.push(seg);
  }

  const stateGroups = Array.from(byState.entries())
    .sort((a, b) => {
      const aRisk = a[1].some((s) => s.disruption_risk_level === "critical") ? 0 : 1;
      const bRisk = b[1].some((s) => s.disruption_risk_level === "critical") ? 0 : 1;
      return aRisk - bRisk;
    })
    .map(([state, segs]) => ({
      state,
      disruptions: segs.map((s) => ({
        id:              s.id,
        segmentName:     s.segment_name,
        title:           s.disruption_title ?? `Disruption on ${s.segment_name}`,
        summary:         s.disruption_summary ?? "",
        riskLevel:       s.disruption_risk_level as RiskLevel,
        etaImpactHours:  s.disruption_eta_hours ?? 0,
        category:        (s.disruption_category ?? "traffic") as DisruptionCategory,
        routeId:         s.route_id,
        routeName:       s.route_name,
        lastCheckedAt:   s.last_checked_at,
        sources:         Array.isArray(s.disruption_sources)
          ? (s.disruption_sources as EventSource[]).filter((src) => src.isRelevant)
          : [],
      })),
    }));

  // Stats
  const critical     = dedupedSegs.filter((s) => s.disruption_risk_level === "critical").length;
  const high         = dedupedSegs.filter((s) => s.disruption_risk_level === "high").length;
  const statesHit    = byState.size;

  let worstRisk = "safe";
  for (const s of dedupedSegs) {
    if ((RISK_ORDER[s.disruption_risk_level] ?? 0) > (RISK_ORDER[worstRisk] ?? 0)) worstRisk = s.disruption_risk_level;
  }

  const lastIntelAt = dedupedSegs.reduce<string | null>((best, s) => {
    if (!s.last_checked_at) return best;
    if (!best || s.last_checked_at > best) return s.last_checked_at;
    return best;
  }, null);

  // Load team members assigned to this region
  const teamMembers = await db`
    SELECT u.id, u.full_name, u.email, u.role,
           c.name AS city_name
    FROM   adv_user_prefs p
    JOIN   users           u ON u.id = p.user_id
    LEFT   JOIN adv_cities c ON c.id = p.city_id
    WHERE  p.org_id    = ${actor.org}
      AND  p.region_id = ${regionId}
    ORDER  BY u.full_name
  ` as unknown as { id: string; full_name: string; email: string; role: string; city_name: string | null }[];

  return applySecurityHeaders(NextResponse.json({
    region: {
      id:      region.id,
      label:   region.label,
      color:   region.color,
      states:  region.states,
    },
    stats: {
      disruptions:  dedupedSegs.length,
      critical,
      high,
      statesHit,
      worstRisk,
      corridors:    corridors.length,
      cities:       cities.length,
      teamMembers:  teamMembers.length,
      lastIntelAt,
    },
    stateGroups,
    corridors,
    cities,
    teamMembers,
  }));
}
