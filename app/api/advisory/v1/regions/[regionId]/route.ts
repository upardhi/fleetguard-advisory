// app/api/advisory/v1/regions/[regionId]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/app/_server/auth/getUser";
import { db } from "@/app/_server/db/client";
import { applySecurityHeaders } from "@/app/_server/security/headers";
import type { EventSource, DisruptionCategory, RiskLevel } from "@/app/_lib/types";

const RISK_ORDER: Record<string, number> = {
  critical: 5, high: 4, medium: 3, low: 2, safe: 1,
};

interface WarehouseWithAggregates {
  id: string;
  name: string;
  city_id: string;
  city_name: string;
  city_state: string | null;
  citiesCount: number;
  disruptionsCount: number;
  highestRisk: string;
  disruptions: Array<{
    id: string;
    title: string;
    summary: string;
    riskLevel: RiskLevel;
    etaImpactHours: number;
    category: DisruptionCategory;
    cityName: string;
    lastCheckedAt: string | null;
  }>;
}

// GET /api/advisory/v1/regions/[regionId]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ regionId: string }> },
) {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { regionId } = await params;

  const [region] = await db`
    SELECT id, label, color, states FROM adv_regions WHERE id = ${regionId}
  ` as { id: string; label: string; color: string; states: string[] }[];

  if (!region) {
    return applySecurityHeaders(NextResponse.json({ error: "Region not found" }, { status: 404 }));
  }

  // ── Warehouses in this region ────────────────────────────────────────────
  // Join warehouses → adv_cities by (org_id, city name) to get the city_id
  // needed to look up disruptions
  const warehouseRows = await db`
    SELECT
      w.id,
      w.name,
      w.city,
      w.state,
      ac.id   AS city_id,
      ac.name AS city_name
    FROM warehouses w
    LEFT JOIN adv_cities ac
           ON ac.org_id = w.org_id
          AND lower(ac.name) = lower(w.city)
    WHERE w.org_id    = ${actor.org}
      AND w.region    = ${regionId}
      AND w.is_active = true
    ORDER BY w.name
  ` as {
    id: string;
    name: string;
    city: string;
    state: string;
    city_id: string | null;
    city_name: string | null;
  }[];

  // ── All adv_city_news for this org's region ──────────────────────────────
  const allCityNews = await db`
    SELECT
      c.id,
      c.name,
      c.state,
      cn.has_disruption,
      cn.disruption_risk_level,
      cn.disruption_title,
      cn.disruption_summary,
      cn.disruption_eta_hours,
      cn.disruption_category,
      cn.disruption_sources,
      cn.last_checked_at
    FROM adv_cities c
    LEFT JOIN adv_city_news cn ON cn.city_id = c.id
    WHERE c.org_id    = ${actor.org}
      AND c.region_id = ${regionId}
  ` as {
    id: string;
    name: string;
    state: string | null;
    has_disruption: boolean | null;
    disruption_risk_level: string | null;
    disruption_title: string | null;
    disruption_summary: string | null;
    disruption_eta_hours: number | null;
    disruption_category: string | null;
    disruption_sources: unknown;
    last_checked_at: string | null;
  }[];

  // Index city news by city id for fast lookup
  const cityNewsById = new Map(allCityNews.map(c => [c.id, c]));

  // ── Build warehouse aggregates ───────────────────────────────────────────
  const warehouseMap = new Map<string, WarehouseWithAggregates>();

  for (const wh of warehouseRows) {
    const disruptionsList: WarehouseWithAggregates["disruptions"] = [];
    let highestRisk = "safe";
    let disruptionsCount = 0;
    let citiesCount = 0;

    if (wh.city_id) {
      // Get nearby cities from adv_nearby_cities
      const nearbyCities = await db`
        SELECT nc.id, nc.name
        FROM adv_nearby_cities nc
        WHERE nc.parent_city_id = ${wh.city_id}
          AND nc.name NOT LIKE '% (self)'
      ` as { id: string; name: string }[];

      // All related city IDs: the depot city + its nearby cities
      const relatedIds = [wh.city_id, ...nearbyCities.map(nc => nc.id)];
      citiesCount = relatedIds.length;

      for (const cityId of relatedIds) {
        const news = cityNewsById.get(cityId);
        if (
          news?.has_disruption &&
          news.disruption_risk_level &&
          news.disruption_risk_level !== "safe"
        ) {
          disruptionsCount++;
          disruptionsList.push({
            id: news.id,
            title: news.disruption_title ?? `Disruption in ${news.name}`,
            summary: news.disruption_summary ?? "",
            riskLevel: news.disruption_risk_level as RiskLevel,
            etaImpactHours: news.disruption_eta_hours ?? 0,
            category: (news.disruption_category ?? "traffic") as DisruptionCategory,
            cityName: news.name,
            lastCheckedAt: news.last_checked_at,
          });
          if ((RISK_ORDER[news.disruption_risk_level] ?? 0) > (RISK_ORDER[highestRisk] ?? 0)) {
            highestRisk = news.disruption_risk_level;
          }
        }
      }
    } else {
      // Warehouse city not found in adv_cities — count just itself
      citiesCount = 1;
    }

    warehouseMap.set(wh.id, {
      id: wh.id,
      name: wh.name,
      city_id: wh.city_id ?? "",
      city_name: wh.city,
      city_state: wh.state,
      citiesCount,
      disruptionsCount,
      highestRisk,
      disruptions: disruptionsList,
    });
  }

  // ── Corridors ────────────────────────────────────────────────────────────
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

  // ── Team ─────────────────────────────────────────────────────────────────
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

  // ── Stats ─────────────────────────────────────────────────────────────────
  const warehousesList = Array.from(warehouseMap.values());
  const totalDisruptions = warehousesList.reduce((s, w) => s + w.disruptionsCount, 0);
  const totalCities = warehousesList.reduce((s, w) => s + w.citiesCount, 0);
  const warehousesWithDisruptions = warehousesList.filter(w => w.disruptionsCount > 0).length;

  let regionWorstRisk = "safe";
  for (const w of warehousesList) {
    if ((RISK_ORDER[w.highestRisk] ?? 0) > (RISK_ORDER[regionWorstRisk] ?? 0)) {
      regionWorstRisk = w.highestRisk;
    }
  }

  return applySecurityHeaders(NextResponse.json({
    region: { id: region.id, label: region.label, color: region.color, states: region.states },
    stats: {
      disruptions: totalDisruptions,
      warehouses: warehousesList.length,
      warehousesWithDisruptions,
      cities: totalCities,
      worstRisk: regionWorstRisk,
      corridors: corridors.length,
      teamMembers: teamMembers.length,
      critical: warehousesList.filter(w => w.highestRisk === "critical").length,
      high: warehousesList.filter(w => w.highestRisk === "high").length,
      statesHit: new Set(warehousesList.map(w => w.city_state).filter(Boolean)).size,
      lastIntelAt: new Date().toISOString(),
    },
    warehouses: warehousesList,
    corridors,
    teamMembers,
    stateGroups: [],
    cities: [],
  }));
}