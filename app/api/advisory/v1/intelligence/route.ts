import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/app/_server/auth/getUser";
import { db } from "@/app/_server/db/client";
import { applySecurityHeaders } from "@/app/_server/security/headers";
import type { Disruption, Advisory, RiskLevel, DisruptionCategory, EventSource } from "@/app/_lib/types";

const VALID_CATEGORIES = new Set([
  "political", "weather", "traffic", "security",
  "infrastructure", "religious", "vvip", "natural_disaster",
]);

function safeCategory(raw: string | null): DisruptionCategory {
  if (raw && VALID_CATEGORIES.has(raw)) return raw as DisruptionCategory;
  return "traffic";
}

const RISK_ORDER: Record<string, number> = {
  critical: 5, high: 4, medium: 3, low: 2, safe: 1,
};

function worstRisk(levels: (string | null | undefined)[]): string {
  let best = "safe";
  for (const l of levels) {
    if (l && (RISK_ORDER[l] ?? 0) > (RISK_ORDER[best] ?? 0)) best = l;
  }
  return best;
}

function confidenceForRisk(risk: string): number {
  const m: Record<string, number> = { critical: 92, high: 87, medium: 78, low: 65 };
  return m[risk] ?? 70;
}

function impactText(risk: string, segName: string, corridorName: string): string {
  if (risk === "critical")
    return `Critical disruption on ${segName} blocks ${corridorName}. All dispatches must be halted until situation clears.`;
  if (risk === "high")
    return `Significant delays expected on ${corridorName} via ${segName}. Alternate routing strongly recommended.`;
  if (risk === "medium")
    return `Moderate impact on ${corridorName}. Consider delaying dispatch or use alternate highway.`;
  return `Minor impact on ${segName}. Monitor closely before dispatch.`;
}

function advisoryAction(risk: string, segName: string, corridorName: string): string {
  if (risk === "critical")
    return `Hold all dispatches on ${corridorName}. Immediate alternate route assessment required for segments via ${segName}.`;
  if (risk === "high")
    return `Reroute dispatches away from ${segName} on ${corridorName}. Review alternate corridors.`;
  if (risk === "medium")
    return `Delay dispatch by 2–4h pending situation update on ${segName}.`;
  return `Monitor ${segName} closely. No immediate action required.`;
}

type AdvisoryType = Advisory["type"];
const RISK_TO_TYPE: Record<string, AdvisoryType> = {
  critical: "hold",
  high:     "reroute",
  medium:   "delay",
  low:      "avoid_night",
};

interface SegmentRow {
  id: string;
  name: string;
  segment_type: string;
  state: string | null;
  disruption_risk_level: string;
  disruption_title: string | null;
  disruption_summary: string | null;
  disruption_eta_hours: number | null;
  disruption_category: string | null;
  disruption_sources: unknown | null;
  last_checked_at: string | null;
  corridor_id: string;
  corridor_name: string;
  origin: string;
  destination: string;
}

interface CorridorRow {
  id: string;
  name: string;
  origin: string;
  destination: string;
  max_risk_level: string | null;
  disruption_count: number;
  last_intel_at: string | null;
  routes_fetched: boolean;
}

interface MapSegmentRow {
  watched_route_id: string;
  route_variant: number;
  seq: number;
  lat: string | null;
  lng: string | null;
  has_disruption: boolean;
  disruption_risk_level: string | null;
  name: string;
}

// GET /api/advisory/v1/intelligence
// Returns aggregated real data from watched corridors for all advisory pages.
export async function GET(req: NextRequest) {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }
//  s.disruption_event_date, meed to get this
  const [disruptedRows, corridors, mapSegments] = await Promise.all([
    db`
      SELECT
        s.id, s.name, s.segment_type, s.state,
        s.disruption_risk_level, s.disruption_title, s.disruption_summary,
        s.disruption_eta_hours, s.disruption_category, s.disruption_sources,
        s.last_checked_at, s.lat, s.lng,
        r.id          AS corridor_id,
        r.name        AS corridor_name,
        r.origin, r.destination
      FROM   adv_watched_segments s
      JOIN   adv_watched_routes   r ON r.id = s.watched_route_id
      WHERE  r.org_id        = ${actor.org}
        AND  r.is_active      = true
        AND  s.has_disruption = true
        AND  s.disruption_risk_level IS NOT NULL
        AND  s.disruption_risk_level != 'safe'
      ORDER BY
        CASE s.disruption_risk_level
          WHEN 'critical' THEN 1
          WHEN 'high'     THEN 2
          WHEN 'medium'   THEN 3
          WHEN 'low'      THEN 4
          ELSE 5
        END,
        s.disruption_eta_hours DESC NULLS LAST
    ` as unknown as (SegmentRow & { lat: string | null; lng: string | null })[],

    db`
      SELECT id, name, origin, destination, max_risk_level,
             disruption_count, last_intel_at, routes_fetched
      FROM   adv_watched_routes
      WHERE  org_id = ${actor.org} AND is_active = true
      ORDER  BY created_at DESC
    ` as unknown as CorridorRow[],

    // Primary route path (variant 0) for each corridor — for map rendering
    db`
      SELECT s.watched_route_id, s.route_variant, s.seq,
             s.lat, s.lng, s.has_disruption, s.disruption_risk_level, s.name
      FROM   adv_watched_segments s
      JOIN   adv_watched_routes   r ON r.id = s.watched_route_id
      WHERE  r.org_id     = ${actor.org}
        AND  r.is_active   = true
        AND  s.route_variant = 0
        AND  s.lat IS NOT NULL
        AND  s.lng IS NOT NULL
      ORDER  BY s.watched_route_id, s.seq
    ` as unknown as MapSegmentRow[],
  ]);

  // Group map segments by corridor for route rendering
  const corridorRoutes = corridors.map((c) => {
    const points = mapSegments
      .filter((s) => s.watched_route_id === c.id)
      .sort((a, b) => a.seq - b.seq)
      .map((s) => ({
        lat: parseFloat(s.lat!),
        lng: parseFloat(s.lng!),
        risk: s.has_disruption ? (s.disruption_risk_level ?? "safe") : "safe",
        name: s.name,
      }));
    return { corridorId: c.id, corridorName: c.name, origin: c.origin, destination: c.destination, points };
  }).filter((cr) => cr.points.length > 0);

  // Deduplicate: one disruption per unique (corridor + title) pair.
  // Multiple adjacent segments often describe the same real-world event.
  // Keep the highest-risk representative segment for each unique event.
  const seenDisruptionKeys = new Set<string>();
  const dedupedRows = disruptedRows.filter((seg) => {
    const key = `${seg.corridor_id}::${(seg.disruption_title ?? seg.name).trim().toLowerCase()}`;
    if (seenDisruptionKeys.has(key)) return false;
    seenDisruptionKeys.add(key);
    return true;
  });

  // Map segments → Disruption objects
  const disruptions: Disruption[] = dedupedRows.map((seg) => ({
    id: seg.id,
    category: safeCategory(seg.disruption_category),
    title: seg.disruption_title ?? `Disruption on ${seg.name}`,
    summary: seg.disruption_summary ?? `A disruption has been detected on ${seg.name}.`,
    detail: seg.disruption_summary ?? `A disruption has been detected on ${seg.name}.`,
    impact: impactText(seg.disruption_risk_level, seg.name, seg.corridor_name),
    risk: seg.disruption_risk_level as RiskLevel,
    region: seg.name,
    state: seg.state ?? seg.origin ?? "",
    highway: (seg.segment_type === "national_highway" || seg.segment_type === "state_highway")
      ? seg.name : undefined,
    affectedRoutes: [seg.corridor_name],
    eta_impact_hours: seg.disruption_eta_hours ?? 0,
    verified: true,
    source: `AI Intelligence — ${seg.corridor_name}`,
    started_at: seg.last_checked_at ?? new Date().toISOString(),
    expected_clear_at: undefined,
    sources: Array.isArray(seg.disruption_sources) ? (seg.disruption_sources as EventSource[]) : undefined,
  }));

  // Derive advisories from deduplicated disruptions (same dedup as above)
  const advisories: Advisory[] = dedupedRows.slice(0, 24).map((seg) => ({
    id: `adv-${seg.id}`,
    type: RISK_TO_TYPE[seg.disruption_risk_level] ?? "delay",
    title: `${seg.corridor_name} — ${seg.disruption_title ?? `Disruption on ${seg.name}`}`,
    narrative: seg.disruption_summary ?? `Disruption detected on ${seg.name} affecting ${seg.corridor_name}.`,
    recommendedAction: advisoryAction(seg.disruption_risk_level, seg.name, seg.corridor_name),
    region: [seg.name, seg.state].filter(Boolean).join(", "),
    riskLevel: seg.disruption_risk_level as RiskLevel,
    confidence: confidenceForRisk(seg.disruption_risk_level),
    isUrgent: seg.disruption_risk_level === "critical" || seg.disruption_risk_level === "high",
    validUntil: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
    disruptionIds: [seg.id],
  }));

  // Regional risk: aggregate by state — pick worst risk per state
  const stateMap = new Map<string, { risk: string; count: number; keyIssue: string }>();
  for (const seg of disruptedRows) {
    const s = seg.state ?? seg.origin;
    if (!s) continue;
    const existing = stateMap.get(s);
    if (!existing || (RISK_ORDER[seg.disruption_risk_level] ?? 0) > (RISK_ORDER[existing.risk] ?? 0)) {
      stateMap.set(s, {
        risk: seg.disruption_risk_level,
        count: (existing?.count ?? 0) + 1,
        keyIssue: seg.disruption_title ?? `Disruption on ${seg.name}`,
      });
    } else if (existing) {
      existing.count++;
    }
  }
  const regionRisks = Array.from(stateMap.entries())
    .sort((a, b) => (RISK_ORDER[b[1].risk] ?? 0) - (RISK_ORDER[a[1].risk] ?? 0))
    .slice(0, 10)
    .map(([state, info]) => ({
      region: state,
      state,
      riskLevel: info.risk as RiskLevel,
      activeDisruptions: info.count,
      keyIssue: info.keyIssue,
    }));

  // Stats
  const totalDisruptions = disruptions.length;
  const criticalAlerts = disruptions.filter((d) => d.risk === "critical").length;
  const highRiskCorridors = corridors.filter(
    (c) => c.max_risk_level === "critical" || c.max_risk_level === "high",
  ).length;
  const safeCorridors = corridors.filter(
    (c) => !c.max_risk_level || c.max_risk_level === "safe" || c.max_risk_level === "low",
  ).length;
  const statesAffected = stateMap.size;

  return applySecurityHeaders(
    NextResponse.json({
      corridorRoutes,
      stats: {
        totalDisruptions,
        criticalAlerts,
        highRiskCorridors,
        safeCorridors,
        pendingAdvisories: advisories.length,
        regionsAffected: statesAffected,
      },
      disruptions,
      advisories,
      corridors,
      regionRisks,
      hasData: corridors.length > 0 && disruptions.length > 0,
      lastUpdated: new Date().toISOString(),
    }),
  );
}
