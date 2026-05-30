import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/app/_server/auth/getUser";
import { db } from "@/app/_server/db/client";
import { applySecurityHeaders } from "@/app/_server/security/headers";

const RISK_ORDER: Record<string, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  safe: 1,
};

// GET /api/advisory/v1/regions
// Returns all 4 ops regions with live disruption stats from watched segments.
export async function GET(req: NextRequest) {
  let actor;
  try {
    actor = await requireUser(req);
  } catch {
    return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }

  // Load regions with their state lists
  const regions = (await db`SELECT id, label, color, states FROM adv_regions ORDER BY id`) as {
    id: string;
    label: string;
    color: string;
    states: string[];
  }[];

  // Load all active disrupted segments for the org.
  // 36-hour staleness filter: segments not re-checked recently are excluded —
  // their disruption flag is considered expired.
  const segments = (await db`
    SELECT s.state, s.disruption_risk_level, s.disruption_title, s.disruption_category,
           r.id AS route_id, r.name AS route_name
    FROM   adv_watched_segments s
    JOIN   adv_watched_routes   r ON r.id = s.watched_route_id
    WHERE  r.org_id = ${actor.org}
      AND  r.is_active = true
      AND  s.has_disruption = true
      AND  s.disruption_risk_level IN ('critical', 'high')
      AND  s.last_checked_at >= now() - interval '36 hours'
  `) as {
    state: string | null;
    disruption_risk_level: string;
    disruption_title: string | null;
    disruption_category: string | null;
    route_id: string;
    route_name: string;
  }[];

  // Load corridor counts per region
  const corridors = (await db`
    SELECT region_id, COUNT(*)::int AS count
    FROM   adv_watched_routes
    WHERE  org_id = ${actor.org} AND is_active = true AND region_id IS NOT NULL
    GROUP  BY region_id
  `) as { region_id: string; count: number }[];
  const corridorsByRegion = new Map(corridors.map((c) => [c.region_id, c.count]));

  // Load all cities for this org — build both a count map and a list map
  const allCities = (await db`
    SELECT id, region_id, name, state, is_depot
    FROM   adv_cities
    WHERE  org_id = ${actor.org}
    ORDER  BY name
  `) as { id: string; region_id: string; name: string; state: string | null; is_depot: boolean }[];

  const citiesByRegion = new Map<string, number>();
  const citiesByRegionList = new Map<string, typeof allCities>();
  for (const city of allCities) {
    citiesByRegion.set(city.region_id, (citiesByRegion.get(city.region_id) ?? 0) + 1);
    const list = citiesByRegionList.get(city.region_id) ?? [];
    list.push(city);
    citiesByRegionList.set(city.region_id, list);
  }

  // Load user counts per region
  const users = (await db`
    SELECT region_id, COUNT(*)::int AS count
    FROM   adv_user_prefs
    WHERE  org_id = ${actor.org} AND region_id IS NOT NULL
    GROUP  BY region_id
  `) as { region_id: string; count: number }[];
  const usersByRegion = new Map(users.map((u) => [u.region_id, u.count]));

  // Last intel per region (via worst-risk segment's route)
  const lastIntel = (await db`
    SELECT r.region_id, MAX(s.last_checked_at) AS last_at
    FROM   adv_watched_segments s
    JOIN   adv_watched_routes   r ON r.id = s.watched_route_id
    WHERE  r.org_id = ${actor.org} AND r.is_active = true AND r.region_id IS NOT NULL
    GROUP  BY r.region_id
  `) as { region_id: string; last_at: string | null }[];
  const lastIntelByRegion = new Map(lastIntel.map((l) => [l.region_id, l.last_at]));

  // Aggregate stats per region
  const result = regions.map((region) => {
    const mine = segments.filter(
      (s) =>
        s.state &&
        region.states.some(
          (st) =>
            s.state!.toLowerCase().includes(st.toLowerCase()) ||
            st.toLowerCase().includes(s.state!.toLowerCase())
        )
    );

    const critical = mine.filter((s) => s.disruption_risk_level === "critical").length;
    const high = mine.filter((s) => s.disruption_risk_level === "high").length;

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
      .sort(
        (a, b) =>
          (RISK_ORDER[b.disruption_risk_level] ?? 0) - (RISK_ORDER[a.disruption_risk_level] ?? 0)
      )
      .filter((s) => {
        const key = (s.disruption_title ?? s.route_name).slice(0, 60);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 3)
      .map((s) => ({
        title: s.disruption_title ?? `Disruption on ${s.route_name}`,
        state: s.state,
        riskLevel: s.disruption_risk_level,
        category: s.disruption_category,
      }));

    return {
      id: region.id,
      label: region.label,
      color: region.color,
      states: region.states,
      disruptions: mine.length,
      critical,
      high,
      worstRisk,
      topIssues,
      corridors: corridorsByRegion.get(region.id) ?? 0,
      cities: citiesByRegion.get(region.id) ?? 0,
      cityList: citiesByRegionList.get(region.id) ?? [],
      teamMembers: usersByRegion.get(region.id) ?? 0,
      lastIntelAt: lastIntelByRegion.get(region.id) ?? null,
    };
  });

  return applySecurityHeaders(NextResponse.json({ regions: result }));
}

export async function POST(req: NextRequest) {
  let actor;
  debugger;
  try {
    actor = await requireUser(req);
  } catch {
    return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }

  // Only org admins may create regions (adjust role check to suit your auth model)
  if (actor.role !== "company_admin") {
    return applySecurityHeaders(
      NextResponse.json({ error: "Forbidden — admin role required" }, { status: 403 })
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }));
  }

  // ── Validate ────────────────────────────────────────────────────────────────
  const errors: string[] = [];

  const { id, label, color, states } = (body ?? {}) as Record<string, unknown>;

  // id
  if (!id || typeof id !== "string") {
    errors.push("id is required and must be a string");
  } else if (!/^[a-z0-9_-]{1,32}$/.test(id)) {
    errors.push("id must be 1–32 chars, lowercase alphanumeric, hyphens, or underscores");
  }

  // label
  if (!label || typeof label !== "string" || !label.trim()) {
    errors.push("label is required");
  } else if (label.trim().length > 80) {
    errors.push("label must be ≤ 80 characters");
  }

  // color — accept #rgb or #rrggbb
  if (!color || typeof color !== "string") {
    errors.push("color is required");
  } else if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color.trim())) {
    errors.push("color must be a valid hex color (e.g. #3b82f6 or #38f)");
  }

  // states
  if (!Array.isArray(states) || states.length === 0) {
    errors.push("states must be a non-empty array");
  } else if (states.length > 30) {
    errors.push("states may contain at most 30 entries");
  } else if (states.some((s) => typeof s !== "string" || !s.trim())) {
    errors.push("each state must be a non-empty string");
  }

  if (errors.length > 0) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", details: errors }, { status: 422 })
    );
  }

  const cleanId = (id as string).toLowerCase();
  const cleanLabel = (label as string).trim();
  const cleanColor = (color as string).trim().toLowerCase();
  const cleanStates = (states as string[]).map((s) => s.trim()).filter(Boolean);

  // ── Uniqueness check ────────────────────────────────────────────────────────
  const [existing] = (await db`
    SELECT id FROM adv_regions WHERE id = ${cleanId} LIMIT 1
  `) as { id: string }[];

  if (existing) {
    return applySecurityHeaders(
      NextResponse.json({ error: `Region with id "${cleanId}" already exists` }, { status: 409 })
    );
  }

  // ── Insert ──────────────────────────────────────────────────────────────────
  try {
    const [created] = (await db`
    INSERT INTO adv_regions (id, label, color, states)
    VALUES (${cleanId}, ${cleanLabel}, ${cleanColor}, ${cleanStates})
    RETURNING id, label, color, states
  `) as { id: string; label: string; color: string; states: string[] }[];

    return applySecurityHeaders(NextResponse.json({ region: created }, { status: 201 }));
  } catch (err) {
    console.error("DB Insert error:", err);
    return applySecurityHeaders(
      NextResponse.json({ error: "Database error: " + (err as Error).message }, { status: 500 })
    );
  }
}
