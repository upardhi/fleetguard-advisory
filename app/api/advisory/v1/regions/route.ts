import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/app/_server/auth/getUser";
import { db } from "@/app/_server/db/client";
import { applySecurityHeaders } from "@/app/_server/security/headers";

const RISK_ORDER: Record<string, number> = {
  critical: 5, high: 4, medium: 3, low: 2, safe: 1,
};

// GET /api/advisory/v1/regions
// Returns all 4 ops regions with live disruption stats from watched segments.
export async function GET(req: NextRequest) {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  // Load regions with their state lists
  const regions = await db`SELECT id, label, color, states FROM adv_regions ORDER BY id` as {
    id: string; label: string; color: string; states: string[];
  }[];

  // Load all active disrupted segments for the org
  const segments = await db`
    SELECT s.state, s.disruption_risk_level, s.disruption_title, s.disruption_category,
           r.id AS route_id, r.name AS route_name
    FROM   adv_watched_segments s
    JOIN   adv_watched_routes   r ON r.id = s.watched_route_id
    WHERE  r.org_id = ${actor.org}
      AND  r.is_active = true
      AND  s.has_disruption = true
      AND  s.disruption_risk_level IN ('critical', 'high')
  ` as { state: string | null; disruption_risk_level: string; disruption_title: string | null; disruption_category: string | null; route_id: string; route_name: string }[];

  // Load corridor counts per region
  const corridors = await db`
    SELECT region_id, COUNT(*)::int AS count
    FROM   adv_watched_routes
    WHERE  org_id = ${actor.org} AND is_active = true AND region_id IS NOT NULL
    GROUP  BY region_id
  ` as { region_id: string; count: number }[];
  const corridorsByRegion = new Map(corridors.map((c) => [c.region_id, c.count]));

  // Load city counts per region
  const cities = await db`
    SELECT region_id, COUNT(*)::int AS count
    FROM   adv_cities
    WHERE  org_id = ${actor.org}
    GROUP  BY region_id
  ` as { region_id: string; count: number }[];
  const citiesByRegion = new Map(cities.map((c) => [c.region_id, c.count]));

  // Load user counts per region
  const users = await db`
    SELECT region_id, COUNT(*)::int AS count
    FROM   adv_user_prefs
    WHERE  org_id = ${actor.org} AND region_id IS NOT NULL
    GROUP  BY region_id
  ` as { region_id: string; count: number }[];
  const usersByRegion = new Map(users.map((u) => [u.region_id, u.count]));

  // Last intel per region (via worst-risk segment's route)
  const lastIntel = await db`
    SELECT r.region_id, MAX(s.last_checked_at) AS last_at
    FROM   adv_watched_segments s
    JOIN   adv_watched_routes   r ON r.id = s.watched_route_id
    WHERE  r.org_id = ${actor.org} AND r.is_active = true AND r.region_id IS NOT NULL
    GROUP  BY r.region_id
  ` as { region_id: string; last_at: string | null }[];
  const lastIntelByRegion = new Map(lastIntel.map((l) => [l.region_id, l.last_at]));

  // Aggregate stats per region
  const result = regions.map((region) => {
    const mine = segments.filter((s) =>
      s.state && region.states.some((st) =>
        s.state!.toLowerCase().includes(st.toLowerCase()) ||
        st.toLowerCase().includes(s.state!.toLowerCase()),
      ),
    );

    const critical = mine.filter((s) => s.disruption_risk_level === "critical").length;
    const high     = mine.filter((s) => s.disruption_risk_level === "high").length;

    // Worst risk
    let worstRisk = "safe";
    for (const s of mine) {
      if ((RISK_ORDER[s.disruption_risk_level] ?? 0) > (RISK_ORDER[worstRisk] ?? 0)) {
        worstRisk = s.disruption_risk_level;
      }
    }

    // Top issues (by risk priority, deduplicated by title)
    const seen = new Set<string>();
    const topIssues = mine
      .sort((a, b) => (RISK_ORDER[b.disruption_risk_level] ?? 0) - (RISK_ORDER[a.disruption_risk_level] ?? 0))
      .filter((s) => {
        const key = (s.disruption_title ?? s.route_name).slice(0, 60);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 3)
      .map((s) => ({
        title:     s.disruption_title ?? `Disruption on ${s.route_name}`,
        state:     s.state,
        riskLevel: s.disruption_risk_level,
        category:  s.disruption_category,
      }));

    return {
      id:              region.id,
      label:           region.label,
      color:           region.color,
      states:          region.states,
      disruptions:     mine.length,
      critical,
      high,
      worstRisk,
      topIssues,
      corridors:       corridorsByRegion.get(region.id) ?? 0,
      cities:          citiesByRegion.get(region.id) ?? 0,
      teamMembers:     usersByRegion.get(region.id) ?? 0,
      lastIntelAt:     lastIntelByRegion.get(region.id) ?? null,
    };
  });

  return applySecurityHeaders(NextResponse.json({ regions: result }));
}
