"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { TopBar } from "@/app/_components/TopBar";
import { StatCard } from "@/app/_components/StatCard";
import RiskBadge from "@/app/_components/RiskBadge";
import DisruptionCard from "@/app/_components/DisruptionCard";
import AdvisoryCard from "@/app/_components/AdvisoryCard";
import { LiveIndicator } from "@/app/_components/LiveIndicator";
import { categoryIcon } from "@/app/_lib/utils";
import type { Disruption, Advisory, RiskLevel, DisruptionCategory } from "@/app/_lib/types";
import {
  AlertTriangle, Zap, ShieldCheck, Map as MapIcon, BrainCircuit,
  ArrowRight, Clock, TrendingUp, Loader2, Route,
  ExternalLink, ChevronDown, ChevronUp, Building2, X,
} from "lucide-react";
import Link from "next/link";

// ── ITC Region → Indian States mapping ────────────────────────────────────────
// Based on ITC depot distribution (East/West/North/South)

type OpsRegion = "all" | "north" | "south" | "east" | "west";

const REGION_STATES: Record<Exclude<OpsRegion, "all">, string[]> = {
  north: [
    "Delhi", "Uttar Pradesh", "Rajasthan", "Haryana", "Punjab",
    "Uttarakhand", "Jammu and Kashmir", "Jammu & Kashmir",
    "Himachal Pradesh", "Chandigarh",
  ],
  south: [
    "Tamil Nadu", "Karnataka", "Kerala", "Telangana", "Puducherry",
  ],
  east: [
    "West Bengal", "Odisha", "Jharkhand", "Bihar", "Assam",
    "Tripura", "Andhra Pradesh", "Manipur", "Meghalaya",
    "Arunachal Pradesh", "Nagaland", "Mizoram", "Sikkim",
  ],
  west: [
    "Maharashtra", "Gujarat", "Goa", "Madhya Pradesh", "Chhattisgarh",
  ],
};

const REGION_META: Record<Exclude<OpsRegion, "all">, { label: string; depots: string[]; color: string; bg: string; border: string }> = {
  north: {
    label: "North", color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200",
    depots: ["Delhi New", "Gaziabad", "Haridwar", "Hassangarh", "Jaipur", "Jammu", "Jodhpur", "Kanpur", "Kapurthala", "Lucknow", "Srinagar", "Varanasi"],
  },
  south: {
    label: "South", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200",
    depots: ["Chennai", "Cochin", "Coimbatore", "Dabaspet", "Hubli", "Hyderabad", "Kakancherry", "Malur", "Trichy"],
  },
  east: {
    label: "East", color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200",
    depots: ["Agartala", "Andal", "Chandaka", "Cuttack", "Dhulagarh New", "Jamshedpur New", "Jorhat", "Madanpur", "Panchla New", "Patna", "Sambalpur", "Siliguri New", "Vijaywada PC", "Vizag 2"],
  },
  west: {
    label: "West", color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200",
    depots: ["Ahmedabad", "Ambarnath", "Bhopal", "Goa", "Nagpur", "Pune", "Raipur"],
  },
};

function stateToRegion(state: string): Exclude<OpsRegion, "all"> | null {
  for (const [region, states] of Object.entries(REGION_STATES) as [Exclude<OpsRegion, "all">, string[]][]) {
    if (states.some((s) => state?.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(state?.toLowerCase()))) {
      return region;
    }
  }
  return null;
}

// ── Category display config ────────────────────────────────────────────────────

const CATEGORY_META: Record<DisruptionCategory | "all", { label: string; icon: string }> = {
  all:            { label: "All Types",      icon: "🗂" },
  political:      { label: "Political / Bandh", icon: "🚫" },
  security:       { label: "Security",       icon: "🔒" },
  infrastructure: { label: "Highway / Corridor", icon: "🛣" },
  natural_disaster:{ label: "Natural Disaster", icon: "🌊" },
  weather:        { label: "Weather",        icon: "🌩" },
  religious:      { label: "Religious / Mela", icon: "🎯" },
  vvip:           { label: "VVIP / Convoy",  icon: "🚨" },
  traffic:        { label: "Traffic / Fuel", icon: "⛽" },
};

// ── Risk color helpers ─────────────────────────────────────────────────────────

const RISK_ROW: Record<string, string> = {
  critical: "border-l-4 border-red-500 bg-red-50/60",
  high:     "border-l-4 border-orange-400 bg-orange-50/60",
  medium:   "border-l-4 border-amber-400 bg-amber-50/40",
  low:      "border-l-4 border-green-400 bg-green-50/30",
  safe:     "border-l-4 border-emerald-400 bg-emerald-50/30",
};
const RISK_DOT_CLS: Record<string, string> = {
  critical: "w-3 h-3 rounded-full bg-red-500",
  high:     "w-3 h-3 rounded-full bg-orange-500",
  medium:   "w-3 h-3 rounded-full bg-amber-500",
  low:      "w-3 h-3 rounded-full bg-green-500",
  safe:     "w-3 h-3 rounded-full bg-emerald-500",
};

// ── Data types ─────────────────────────────────────────────────────────────────

interface RegionRisk { region: string; state: string; riskLevel: RiskLevel; activeDisruptions: number; keyIssue: string }
interface CorridorRoute {
  corridorId: string; corridorName: string; origin: string; destination: string;
  points: { lat: number; lng: number; risk: string; name: string }[];
}
interface Stats {
  totalDisruptions: number; criticalAlerts: number; highRiskCorridors: number;
  safeCorridors: number; pendingAdvisories: number; regionsAffected: number;
}
interface IntelligenceData {
  stats: Stats;
  disruptions: Disruption[];
  advisories: Advisory[];
  corridors: Array<{ id: string; name: string; origin: string; destination: string; max_risk_level: string | null }>;
  corridorRoutes: CorridorRoute[];
  regionRisks: RegionRisk[];
  hasData: boolean;
  lastUpdated: string;
}

// ── Leaflet map ────────────────────────────────────────────────────────────────

const RISK_COLOR_MAP: Record<string, string> = {
  critical: "#ef4444", high: "#f97316", medium: "#eab308", low: "#22c55e", safe: "#86efac",
};
const RISK_FILL_MAP: Record<string, string> = {
  critical: "rgba(239,68,68,0.18)", high: "rgba(249,115,22,0.15)",
  medium: "rgba(234,179,8,0.13)",   low: "rgba(34,197,94,0.12)", safe: "rgba(134,239,172,0.10)",
};

function renderMapLayers(
  L: typeof import("leaflet"),
  map: import("leaflet").Map,
  layersRef: React.MutableRefObject<import("leaflet").Layer[]>,
  corridorRoutes: CorridorRoute[],
  disruptions: Disruption[],
  onDisruptionClick: (d: Disruption) => void,
) {
  layersRef.current.forEach((l) => l.remove());
  layersRef.current = [];

  corridorRoutes.forEach((cr) => {
    const pts = cr.points;
    if (pts.length < 2) return;

    const shadow = L.polyline(pts.map((p) => [p.lat, p.lng] as [number, number]), {
      color: "#0f2347", weight: 8, opacity: 0.06, lineJoin: "round",
    }).addTo(map);
    layersRef.current.push(shadow);

    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], n = pts[i + 1];
      const color  = RISK_COLOR_MAP[p.risk] ?? RISK_COLOR_MAP.safe;
      const weight = p.risk === "critical" ? 5 : p.risk === "high" ? 4.5 : 3.5;
      const seg = L.polyline([[p.lat, p.lng], [n.lat, n.lng]], { color, weight, opacity: 0.9, lineJoin: "round" })
        .bindTooltip(`<b>${p.name}</b><br/>Risk: <b>${p.risk.toUpperCase()}</b>`, { sticky: true })
        .addTo(map);
      layersRef.current.push(seg);
    }

    const originDot = L.circleMarker([pts[0].lat, pts[0].lng], { radius: 6, fillColor: "#0f2347", color: "white", weight: 2, fillOpacity: 1 })
      .bindTooltip(`<b>${cr.origin}</b> — Origin`, { sticky: true }).addTo(map);
    const destDot = L.circleMarker([pts[pts.length - 1].lat, pts[pts.length - 1].lng], { radius: 6, fillColor: "#8b5cf6", color: "white", weight: 2, fillOpacity: 1 })
      .bindTooltip(`<b>${cr.destination}</b> — Destination`, { sticky: true }).addTo(map);
    layersRef.current.push(originDot, destDot);

    pts.filter((p) => p.risk !== "safe" && p.risk !== "low").forEach((p) => {
      const r = p.risk === "critical" ? 10 : p.risk === "high" ? 8 : 6;
      if (p.risk === "critical" || p.risk === "high") {
        const glow = L.circleMarker([p.lat, p.lng], {
          radius: r + 6, fillColor: RISK_COLOR_MAP[p.risk], color: "transparent", fillOpacity: 0.2,
        }).addTo(map);
        layersRef.current.push(glow);
      }
      const hotspot = L.circleMarker([p.lat, p.lng], {
        radius: r, fillColor: RISK_COLOR_MAP[p.risk], color: "white", weight: 2, fillOpacity: 0.95,
      })
        .bindPopup(`
          <div style="min-width:200px;font-family:sans-serif">
            <div style="font-weight:800;font-size:13px;margin-bottom:4px">${p.name}</div>
            <div style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;background:${RISK_FILL_MAP[p.risk]};color:${RISK_COLOR_MAP[p.risk]};border:1px solid ${RISK_COLOR_MAP[p.risk]}">
              ${p.risk.toUpperCase()} RISK
            </div>
            <div style="margin-top:6px;font-size:11px;color:#64748b">Corridor: ${cr.corridorName}</div>
          </div>
        `, { maxWidth: 260 })
        .addTo(map);
      const matched = disruptions.find((d) => d.affectedRoutes.includes(cr.corridorName));
      if (matched) hotspot.on("click", () => onDisruptionClick(matched));
      layersRef.current.push(hotspot);
    });
  });
}

function ControlTowerLeafletMap({
  corridorRoutes, disruptions, onDisruptionClick,
}: {
  corridorRoutes: CorridorRoute[];
  disruptions: Disruption[];
  onDisruptionClick: (d: Disruption) => void;
}) {
  const mapRef         = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<import("leaflet").Map | null>(null);
  const layersRef      = useRef<import("leaflet").Layer[]>([]);
  const hasFittedRef   = useRef(false);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    import("leaflet").then((L) => {
      delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
      const map = L.map(mapRef.current!, { center: [22.5, 82.0], zoom: 5, zoomControl: true, scrollWheelZoom: true });
      mapInstanceRef.current = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);
      renderMapLayers(L, map, layersRef, corridorRoutes, disruptions, onDisruptionClick);
    });
    return () => {
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current) return;
    import("leaflet").then((L) => {
      renderMapLayers(L, mapInstanceRef.current!, layersRef, corridorRoutes, disruptions, onDisruptionClick);
      // Auto-fit to all corridor points on first data load so no route is clipped
      if (!hasFittedRef.current && corridorRoutes.length > 0) {
        const allPts = corridorRoutes.flatMap((cr) => cr.points.map((p) => [p.lat, p.lng] as [number, number]));
        if (allPts.length > 0) {
          mapInstanceRef.current!.fitBounds(L.latLngBounds(allPts), { padding: [30, 30], maxZoom: 6 });
          hasFittedRef.current = true;
        }
      }
    });
  }, [corridorRoutes, disruptions, onDisruptionClick]);

  return <div ref={mapRef} style={{ width: "100%", height: "100%" }} />;
}

// ── Region detail drill-down components ───────────────────────────────────────

function DisruptionRow({ d, expanded, onToggle }: {
  d: Disruption;
  expanded: boolean;
  onToggle: () => void;
}) {
  const relevantSources = (d.sources ?? []).filter((s) => s.isRelevant);
  const allSources      = d.sources ?? [];

  return (
    <div className="px-5 py-3.5">
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${d.risk === "critical" ? "bg-red-500" : "bg-orange-400"}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-slate-800 leading-snug">{d.title}</p>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] text-orange-600 font-bold">+{d.eta_impact_hours}h ETA</span>
              <RiskBadge level={d.risk} size="xs" />
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{d.summary}</p>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {d.affectedRoutes[0] && (
              <span className="inline-flex items-center gap-1 text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">
                🛣 {d.affectedRoutes[0]}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
              {categoryIcon(d.category)} {CATEGORY_META[d.category]?.label ?? d.category}
            </span>
            {/* Scan freshness — amber if >20h old */}
            {d.last_checked_at && (
              <span
                className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  Date.now() - new Date(d.last_checked_at).getTime() > 20 * 3600 * 1000
                    ? "bg-amber-50 text-amber-600 border border-amber-200"
                    : "bg-slate-100 text-slate-500"
                }`}
                title={`Scanned: ${new Date(d.last_checked_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`}
              >
                🔍 {(() => {
                  const ms = Date.now() - new Date(d.last_checked_at).getTime();
                  const h = Math.floor(ms / 3600000);
                  return h < 1 ? "just now" : `${h}h ago`;
                })()}
              </span>
            )}
            {allSources.length > 0 && (
              <button
                onClick={onToggle}
                className="inline-flex items-center gap-1 text-[11px] text-brand-600 font-semibold hover:text-brand-800 transition-colors"
              >
                {relevantSources.length} source{relevantSources.length !== 1 ? "s" : ""}
                {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Source articles */}
      {expanded && allSources.length > 0 && (
        <div className="mt-3 ml-5 space-y-2">
          {/* Relevant sources first */}
          {relevantSources.map((src, i) => (
            <a
              key={i}
              href={src.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 p-3 rounded-xl border border-brand-200 bg-brand-50/40 hover:bg-brand-50 hover:border-brand-300 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-brand-800 leading-snug group-hover:underline line-clamp-2">{src.title}</p>
                {src.snippet && (
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed line-clamp-2">{src.snippet}</p>
                )}
                <p className="text-[10px] text-slate-400 mt-1.5 truncate">{src.url}</p>
              </div>
              <ExternalLink size={12} className="shrink-0 mt-0.5 text-brand-400 group-hover:text-brand-600" />
            </a>
          ))}
          {/* Non-relevant sources (collapsed by default, shown as footnote) */}
          {allSources.filter((s) => !s.isRelevant).length > 0 && (
            <p className="text-[10px] text-slate-400 pl-1 italic">
              + {allSources.filter((s) => !s.isRelevant).length} additional article{allSources.filter((s) => !s.isRelevant).length > 1 ? "s" : ""} checked — not relevant
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function StateDisruptionGroup({ state, disruptions }: { state: string; disruptions: Disruption[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const worstRisk: RiskLevel = disruptions.some((d) => d.risk === "critical") ? "critical" : "high";

  return (
    <div className="border-b border-slate-100">
      <div className={`px-5 py-2.5 flex items-center gap-2.5 ${RISK_ROW[worstRisk]}`}>
        <span className={`shrink-0 ${RISK_DOT_CLS[worstRisk]}`} />
        <span className="text-sm font-bold text-slate-800">{state}</span>
        <span className="text-xs text-slate-500">{disruptions.length} alert{disruptions.length > 1 ? "s" : ""}</span>
        <div className="ml-auto"><RiskBadge level={worstRisk} size="xs" /></div>
      </div>
      <div className="divide-y divide-slate-50/80 bg-white">
        {disruptions.map((d) => (
          <DisruptionRow
            key={d.id}
            d={d}
            expanded={expandedId === d.id}
            onToggle={() => setExpandedId(expandedId === d.id ? null : d.id)}
          />
        ))}
      </div>
    </div>
  );
}

function RegionDetailPanel({
  region, disruptions, lastUpdated, onClose,
}: {
  region: Exclude<OpsRegion, "all">;
  disruptions: Disruption[];
  lastUpdated: string;
  onClose: () => void;
}) {
  const meta   = REGION_META[region];
  const states = REGION_STATES[region];

  const mine = useMemo(() => disruptions.filter((d) =>
    states.some((s) => d.state?.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(d.state?.toLowerCase())),
  ), [disruptions, states]);

  // Group by state, sorted by worst risk
  const byState = useMemo(() => {
    const groups = new Map<string, Disruption[]>();
    for (const d of mine) {
      const key = d.state || "Unknown";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(d);
    }
    return (Array.from(groups.entries()) as [string, Disruption[]][]).sort((a, b) => {
      const rankA = a[1].some((d: Disruption) => d.risk === "critical") ? 0 : 1;
      const rankB = b[1].some((d: Disruption) => d.risk === "critical") ? 0 : 1;
      return rankA - rankB;
    });
  }, [mine]);

  const criticalCount = mine.filter((d) => d.risk === "critical").length;
  const highCount     = mine.filter((d) => d.risk === "high").length;
  const statesHit     = byState.length;

  // Format last updated IST
  const lastUpdatedFmt = lastUpdated
    ? new Date(lastUpdated).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", timeStyle: "short", dateStyle: "medium" })
    : "—";

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white border-l border-slate-200 shadow-2xl z-50 flex flex-col slide-in">
      {/* Header */}
      <div className={`px-5 py-4 border-b ${meta.bg} ${meta.border}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`text-xs font-bold uppercase tracking-widest ${meta.color}`}>{meta.label} Region</span>
              <span className="text-[10px] text-slate-400 font-medium">· Morning Intelligence Brief</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 leading-tight">
              {mine.length === 0 ? "All Clear" : `${mine.length} Active Alert${mine.length > 1 ? "s" : ""}`}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {statesHit} state{statesHit !== 1 ? "s" : ""} with disruptions · {meta.depots.length} depots monitored
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/60 text-slate-400 hover:text-slate-700 transition-colors shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Quick stats */}
        {mine.length > 0 && (
          <div className="flex items-center gap-4 mt-3">
            {criticalCount > 0 && (
              <div className="flex items-center gap-1.5 text-red-700">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-sm font-bold">{criticalCount}</span>
                <span className="text-xs font-medium">Critical</span>
              </div>
            )}
            {highCount > 0 && (
              <div className="flex items-center gap-1.5 text-orange-700">
                <span className="w-2 h-2 rounded-full bg-orange-500" />
                <span className="text-sm font-bold">{highCount}</span>
                <span className="text-xs font-medium">High</span>
              </div>
            )}
            {mine.length === 0 && (
              <div className="flex items-center gap-1.5 text-emerald-700">
                <ShieldCheck size={14} />
                <span className="text-sm font-bold">All corridors clear for dispatch</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Depots strip */}
      <div className="px-5 py-2.5 border-b border-slate-100 bg-slate-50/80 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 mr-1 shrink-0">
            <Building2 size={11} className="text-slate-400" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Depots</span>
          </div>
          {meta.depots.map((depot) => (
            <span key={depot} className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600 font-medium">
              {depot}
            </span>
          ))}
        </div>
      </div>

      {/* Body — disruptions grouped by state */}
      <div className="flex-1 overflow-y-auto">
        {mine.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-8">
            <ShieldCheck size={40} className="text-emerald-400 mb-3" />
            <p className="text-base font-semibold text-slate-700 mb-1">{meta.label} region is clear</p>
            <p className="text-sm text-slate-400">No active disruptions on monitored corridors as of this morning&apos;s scan.</p>
          </div>
        ) : (
          <div>
            {byState.map(([state, disps]) => (
              <StateDisruptionGroup key={state} state={state} disruptions={disps} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/80 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-slate-400">
          <Clock size={11} />
          <span className="text-[11px]">Last scanned: <span className="font-semibold text-slate-600">{lastUpdatedFmt} IST</span></span>
        </div>
        <span className="text-[10px] text-slate-400 italic">Auto-refreshes daily at 11:00 IST</span>
      </div>
    </div>
  );
}

// ── 4-Region summary card ─────────────────────────────────────────────────────

function RegionCard({
  region, disruptions, selected, onClick,
}: {
  region: Exclude<OpsRegion, "all">;
  disruptions: Disruption[];
  selected: boolean;
  onClick: () => void;
}) {
  const meta   = REGION_META[region];
  const states = REGION_STATES[region];
  const mine   = disruptions.filter((d) => states.some((s) =>
    d.state?.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(d.state?.toLowerCase()),
  ));
  const critical = mine.filter((d) => d.risk === "critical").length;
  const high     = mine.filter((d) => d.risk === "high").length;
  const maxRisk: RiskLevel = critical > 0 ? "critical" : high > 0 ? "high" : mine.length > 0 ? "medium" : "safe";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border transition-all overflow-hidden ${
        selected
          ? `${meta.border} shadow ring-2 ring-offset-1 ${meta.border.replace("border-", "ring-")}`
          : "border-slate-200 bg-white hover:shadow-sm hover:border-slate-300"
      }`}
    >
      {/* Header */}
      <div className={`px-4 py-2.5 flex items-center justify-between ${selected ? meta.bg : "bg-slate-50"}`}>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold uppercase tracking-wider ${selected ? meta.color : "text-slate-600"}`}>
            {meta.label}
          </span>
          <span className="text-[10px] text-slate-400">{meta.depots.length} depots</span>
        </div>
        <RiskBadge level={maxRisk} size="xs" />
      </div>

      {/* Alert count row */}
      <div className={`px-4 py-2 border-b ${selected ? `${meta.border} bg-white` : "border-slate-100 bg-white"}`}>
        {mine.length === 0 ? (
          <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" /> All clear
          </span>
        ) : (
          <div className="flex items-center gap-3">
            {critical > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />{critical} critical
              </span>
            )}
            {high > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-orange-500">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" />{high} high
              </span>
            )}
          </div>
        )}
      </div>

      {/* Top disruptions list */}
      <div className="bg-white divide-y divide-slate-50">
        {mine.length === 0 ? (
          <p className="px-4 py-2.5 text-[11px] text-slate-400 italic">No active disruptions</p>
        ) : (
          mine.slice(0, 3).map((d, i) => (
            <div key={i} className="px-4 py-2 flex items-start gap-2">
              <span className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${d.risk === "critical" ? "bg-red-500" : "bg-orange-400"}`} />
              <div className="min-w-0">
                <p className="text-[11px] text-slate-700 font-medium leading-snug line-clamp-1">{d.title}</p>
                <p className="text-[10px] text-slate-400">{d.state} · +{d.eta_impact_hours}h ETA</p>
              </div>
            </div>
          ))
        )}
        {mine.length > 3 && (
          <p className="px-4 py-1.5 text-[10px] text-slate-400 font-medium">+{mine.length - 3} more alerts</p>
        )}
      </div>
      {/* Tap cue */}
      <div className={`px-4 py-2 flex items-center justify-between border-t ${selected ? meta.border : "border-slate-100"} bg-white`}>
        <span className={`text-[10px] font-semibold ${selected ? meta.color : "text-slate-400"}`}>
          {selected ? "▸ Region Report Open" : "Tap for full report"}
        </span>
        <ArrowRight size={11} className={selected ? meta.color : "text-slate-300"} />
      </div>
    </button>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ControlTowerPage() {
  const [selected, setSelected]             = useState<Disruption | null>(null);
  const [data, setData]                     = useState<IntelligenceData | null>(null);
  const [loading, setLoading]               = useState(true);
  const [activeRegion, setActiveRegion]     = useState<OpsRegion>("all");
  const [activeCategory, setActiveCategory] = useState<DisruptionCategory | "all">("all");
  const [selectedRegion, setSelectedRegion] = useState<Exclude<OpsRegion, "all"> | null>(null);

  useEffect(() => {
    fetch("/api/advisory/v1/intelligence", { credentials: "include" })
      .then((r) => r.json())
      .then((d: IntelligenceData) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const allDisruptions  = data?.disruptions    ?? [];
  const allAdvisories   = data?.advisories     ?? [];
  const allStats        = data?.stats ?? { totalDisruptions: 0, criticalAlerts: 0, highRiskCorridors: 0, safeCorridors: 0, pendingAdvisories: 0, regionsAffected: 0 };
  const regionRisks     = data?.regionRisks    ?? [];
  const corridorRoutes  = data?.corridorRoutes ?? [];

  // ── Client-side filtering ─────────────────────────────────────────────────
  const filteredDisruptions = useMemo(() => {
    let d = allDisruptions;
    if (activeRegion !== "all") {
      const states = REGION_STATES[activeRegion];
      d = d.filter((x) => states.some((s) =>
        x.state?.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(x.state?.toLowerCase()),
      ));
    }
    if (activeCategory !== "all") {
      d = d.filter((x) => x.category === activeCategory);
    }
    return d;
  }, [allDisruptions, activeRegion, activeCategory]);

  const filteredStats = useMemo(() => ({
    totalDisruptions:  filteredDisruptions.length,
    criticalAlerts:    filteredDisruptions.filter((d) => d.risk === "critical").length,
    highRiskCorridors: filteredDisruptions.filter((d) => d.risk === "high").length,
    safeCorridors:     allStats.safeCorridors,
    pendingAdvisories: allAdvisories.filter((a) => a.isUrgent).length,
    regionsAffected:   new Set(filteredDisruptions.map((d) => stateToRegion(d.state)).filter(Boolean)).size,
  }), [filteredDisruptions, allAdvisories, allStats.safeCorridors]);

  const filteredAdvisories = useMemo(() => {
    if (activeRegion === "all" && activeCategory === "all") return allAdvisories.filter((a) => a.isUrgent).slice(0, 3);
    return allAdvisories.filter((a) => {
      if (activeCategory !== "all") return false; // advisories don't have category yet — show all when no category filter
      return a.isUrgent;
    }).slice(0, 3);
  }, [allAdvisories, activeRegion, activeCategory]);

  const top5         = filteredDisruptions.slice(0, 5);
  const ticker       = allDisruptions;

  // ── Categories present in current data ───────────────────────────────────
  const presentCategories = useMemo(() => {
    const cats = new Set(allDisruptions.map((d) => d.category));
    return (["all", ...Array.from(cats)] as (DisruptionCategory | "all")[]);
  }, [allDisruptions]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar title="Control Tower" subtitle="Pan-India disruption intelligence — pre-dispatch advisory" />

      {/* Live alert ticker */}
      <div className="bg-brand-950 text-brand-100 text-xs py-1.5 px-4 overflow-hidden flex items-center gap-3 shrink-0">
        <span className="shrink-0 font-bold text-accent-400 tracking-wider">LIVE ALERTS</span>
        <div className="overflow-hidden flex-1">
          {ticker.length > 0 ? (
            <div className="flex gap-16 whitespace-nowrap overflow-hidden">
              {ticker.slice(0, 8).map((d) => (
                <span key={d.id} className="inline-flex items-center gap-2">
                  <span>{categoryIcon(d.category)}</span>
                  <span>{d.title}</span>
                  <span className="text-brand-400">· {d.state}</span>
                </span>
              ))}
            </div>
          ) : (
            <span className="text-brand-500 italic">No active disruptions on watched corridors</span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-4 max-w-screen-2xl mx-auto">

          {/* ── Region tabs + Category chips ─────────────────────────────── */}
          <div className="flex flex-col gap-3">
            {/* Region tabs */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-1">Region</span>
              {(["all", "north", "east", "west", "south"] as OpsRegion[]).map((r) => {
                const count = r === "all"
                  ? allDisruptions.length
                  : allDisruptions.filter((d) => REGION_STATES[r].some((s) =>
                      d.state?.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(d.state?.toLowerCase()),
                    )).length;
                const meta = r !== "all" ? REGION_META[r] : null;
                const isActive = activeRegion === r;
                return (
                  <button
                    key={r}
                    onClick={() => setActiveRegion(r)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                      isActive
                        ? r === "all"
                          ? "bg-brand-700 text-white border-brand-700"
                          : `${meta!.bg} ${meta!.color} ${meta!.border}`
                        : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    {r === "all" ? "All India" : REGION_META[r].label}
                    {count > 0 && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        isActive
                          ? r === "all" ? "bg-white/20 text-white" : "bg-white/60"
                          : "bg-slate-100 text-slate-500"
                      }`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}

              <div className="ml-auto flex items-center gap-2">
                <LiveIndicator />
                {activeRegion !== "all" && (
                  <span className="text-[11px] text-slate-400">
                    {REGION_META[activeRegion].depots.length} depots in region
                  </span>
                )}
              </div>
            </div>

            {/* Category chips — only show when there's data */}
            {presentCategories.length > 1 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-1">Risk Type</span>
                {presentCategories.map((cat) => {
                  const meta = CATEGORY_META[cat];
                  const isActive = activeCategory === cat;
                  const catCount = cat === "all"
                    ? filteredDisruptions.length
                    : allDisruptions.filter((d) => d.category === cat && (
                        activeRegion === "all" || REGION_STATES[activeRegion].some((s) =>
                          d.state?.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(d.state?.toLowerCase()),
                        )
                      )).length;
                  return (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                        isActive
                          ? "bg-slate-800 text-white border-slate-800"
                          : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <span>{meta.icon}</span>
                      <span>{meta.label}</span>
                      {catCount > 0 && <span className={`text-[10px] ${isActive ? "text-white/70" : "text-slate-400"}`}>({catCount})</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Stats row ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <StatCard label="Active Disruptions" value={loading ? "—" : filteredStats.totalDisruptions}  hint={activeRegion === "all" ? "Across all corridors" : `In ${REGION_META[activeRegion].label} region`} tone="warning" icon={AlertTriangle} />
            <StatCard label="Critical Alerts"     value={loading ? "—" : filteredStats.criticalAlerts}    hint="Dispatch hold required"   tone="danger"  icon={Zap}           />
            <StatCard label="High Risk"           value={loading ? "—" : filteredStats.highRiskCorridors} hint="Reroute recommended"       tone="warning" icon={MapIcon}            />
            <StatCard label="Safe Corridors"      value={loading ? "—" : allStats.safeCorridors}          hint="Clear for dispatch"        tone="success" icon={ShieldCheck}    />
            <StatCard label="AI Advisories"       value={loading ? "—" : filteredStats.pendingAdvisories} hint="Urgent actions"            tone="info"    icon={BrainCircuit}   />
            <StatCard label="Regions Affected"    value={loading ? "—" : filteredStats.regionsAffected}   hint="Of 4 ops regions"          tone="brand"   icon={TrendingUp}     />
          </div>

          {/* No corridors prompt — only when truly empty */}
          {!loading && (data?.corridors?.length ?? 0) === 0 && (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 px-6 py-8 text-center">
              <Route size={32} className="mx-auto mb-3 text-blue-400" />
              <p className="text-sm font-semibold text-blue-800 mb-1">No watched corridors yet</p>
              <p className="text-xs text-blue-600 mb-4">
                Add corridors in Watched Corridors to start monitoring disruptions.
                After adding, go to Settings → Process Jobs Now to run the first intelligence scan.
              </p>
              <Link href="/advisory/planned" className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-brand-700 text-white hover:bg-brand-800 transition">
                Go to Watched Corridors <ArrowRight size={13} />
              </Link>
            </div>
          )}

          {/* Intelligence not run yet — corridors exist but no scan done */}
          {!loading && (data?.corridors?.length ?? 0) > 0 && allDisruptions.length === 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 flex items-center gap-3">
              <BrainCircuit size={18} className="text-amber-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-800">No disruptions detected yet</p>
                <p className="text-xs text-amber-700">All {data?.corridors?.length} corridor{(data?.corridors?.length ?? 0) !== 1 ? "s" : ""} are clear — or intelligence hasn&apos;t run yet. Go to Settings → Process Jobs Now to trigger a fresh scan.</p>
              </div>
              <Link href="/advisory/settings" className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-700 text-white hover:bg-amber-800 transition">
                Run Scan <ArrowRight size={11} />
              </Link>
            </div>
          )}

          {/* ── Region-wise disruption strip — show as long as corridors exist ── */}
          {(loading || (data?.corridors?.length ?? 0) > 0) && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {(["north", "east", "west", "south"] as Exclude<OpsRegion, "all">[]).map((r) => (
                <RegionCard
                  key={r}
                  region={r}
                  disruptions={allDisruptions}
                  selected={activeRegion === r}
                  onClick={() => {
                    const toggling = activeRegion === r;
                    setActiveRegion(toggling ? "all" : r);
                    setSelectedRegion(toggling ? null : r);
                    setSelected(null); // close any open disruption detail
                  }}
                />
              ))}
            </div>
          )}

          {/* ── Main grid ─────────────────────────────────────────────────── */}
          {(loading || (data?.corridors?.length ?? 0) > 0) && (
            <div className="grid xl:grid-cols-5 gap-5">

              {/* Left: Map + Corridor detail */}
              <div className="xl:col-span-3 space-y-4">

                {/* Map */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <MapIcon size={15} className="text-brand-600" />
                      <h2 className="text-sm font-semibold text-slate-800">India Risk Map — Watched Corridors</h2>
                      {activeRegion !== "all" && (
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${REGION_META[activeRegion].bg} ${REGION_META[activeRegion].color}`}>
                          {REGION_META[activeRegion].label}
                        </span>
                      )}
                    </div>
                    <LiveIndicator />
                  </div>
                  <div className="relative" style={{ height: 380 }}>
                    {loading ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
                        <Loader2 size={28} className="animate-spin text-slate-300" />
                      </div>
                    ) : (
                      <ControlTowerLeafletMap
                        corridorRoutes={corridorRoutes}
                        disruptions={filteredDisruptions}
                        onDisruptionClick={(d) => setSelected(d)}
                      />
                    )}
                    {/* Stats badge */}
                    <div className="absolute top-3 right-3 z-[1000] bg-white rounded-lg border border-slate-200 shadow-sm px-3 py-2 text-center">
                      <div className="text-lg font-bold text-red-600 num">{filteredStats.totalDisruptions}</div>
                      <div className="text-[10px] text-slate-500 font-medium">Active Events</div>
                    </div>
                    {/* Risk legend */}
                    <div className="absolute bottom-3 left-3 z-[1000] bg-white/90 backdrop-blur-sm rounded-lg border border-slate-200 shadow-sm px-3 py-2">
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Risk Level</p>
                      <div className="space-y-1">
                        {[{ label: "Critical", color: "#ef4444" }, { label: "High", color: "#f97316" }].map(({ label, color }) => (
                          <div key={label} className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                            <span className="text-[10px] text-slate-600">{label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Regional risk table — shown when disruption data exists */}
                {regionRisks.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                      <h2 className="text-sm font-semibold text-slate-800">Corridor Risk Detail</h2>
                      <span className="text-xs text-slate-400">
                        {new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", timeStyle: "short", dateStyle: "medium" })} IST
                      </span>
                    </div>
                    <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                      {regionRisks
                        .filter((r) => activeRegion === "all" || REGION_STATES[activeRegion].some((s) =>
                          r.state?.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(r.state?.toLowerCase()),
                        ))
                        .map((r) => (
                          <div key={r.region} className={`flex items-center gap-3 px-5 py-2.5 ${RISK_ROW[r.riskLevel]}`}>
                            <span className={`shrink-0 ${RISK_DOT_CLS[r.riskLevel]}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-slate-800 truncate">{r.region}</p>
                              <p className="text-[11px] text-slate-500 truncate">{r.keyIssue}</p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-[11px] text-slate-400">{r.state}</span>
                              <RiskBadge level={r.riskLevel} size="xs" />
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right: Advisories + Feed */}
              <div className="xl:col-span-2 space-y-4">

                {/* Urgent Advisories */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <BrainCircuit size={15} className="text-brand-600" />
                      <h2 className="text-sm font-semibold text-slate-800">Urgent Advisories</h2>
                    </div>
                    <Link href="/advisory/advisories" className="text-xs text-brand-600 font-medium flex items-center gap-0.5 hover:gap-1.5 transition-all">
                      All <ArrowRight size={11} />
                    </Link>
                  </div>
                  <div className="p-3 space-y-3">
                    {loading ? (
                      <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-slate-300" /></div>
                    ) : filteredAdvisories.length === 0 ? (
                      <div className="py-6 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                        <ShieldCheck size={24} className="text-emerald-400" />
                        <span>No urgent advisories{activeRegion !== "all" ? ` for ${REGION_META[activeRegion].label}` : ""}</span>
                      </div>
                    ) : (
                      filteredAdvisories.map((a) => <AdvisoryCard key={a.id} a={a} compact />)
                    )}
                  </div>
                </div>

                {/* Live disruption feed */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Clock size={15} className="text-slate-500" />
                      <h2 className="text-sm font-semibold text-slate-800">Live Disruption Feed</h2>
                      {(activeRegion !== "all" || activeCategory !== "all") && (
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">
                          {filteredDisruptions.length} filtered
                        </span>
                      )}
                    </div>
                    <Link href="/advisory/disruptions" className="text-xs text-brand-600 font-medium flex items-center gap-0.5 hover:gap-1.5 transition-all">
                      All <ArrowRight size={11} />
                    </Link>
                  </div>
                  <div className="p-3 space-y-2.5 overflow-y-auto" style={{ maxHeight: 480 }}>
                    {loading ? (
                      <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-slate-300" /></div>
                    ) : top5.length === 0 ? (
                      <div className="py-6 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                        <ShieldCheck size={24} className="text-emerald-400" />
                        <span>
                          {activeRegion !== "all" ? `${REGION_META[activeRegion].label} region clear` : "All watched corridors clear"}
                        </span>
                      </div>
                    ) : (
                      top5.map((d) => (
                        <DisruptionCard
                          key={d.id}
                          d={d}
                          selected={selected?.id === d.id}
                          onClick={() => setSelected(d.id === selected?.id ? null : d)}
                        />
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Region detail panel */}
      {selectedRegion && (
        <RegionDetailPanel
          region={selectedRegion}
          disruptions={allDisruptions}
          lastUpdated={data?.lastUpdated ?? ""}
          onClose={() => {
            setSelectedRegion(null);
            setActiveRegion("all");
          }}
        />
      )}

      {/* Detail drawer */}
      {selected && !selectedRegion && (
        <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-white border-l border-slate-200 shadow-2xl z-50 flex flex-col slide-in">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Disruption Detail</h2>
              {(() => {
                const r = stateToRegion(selected.state);
                if (!r) return null;
                const m = REGION_META[r];
                return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${m.bg} ${m.color}`}>{m.label}</span>;
              })()}
            </div>
            <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="flex items-start gap-3">
              <RiskBadge level={selected.risk} size="md" pulse={selected.risk === "critical"} />
              <h3 className="text-base font-semibold text-slate-900 leading-tight">{selected.title}</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Segment",    value: selected.region },
                { label: "State",      value: selected.state },
                { label: "ETA Impact", value: `+${selected.eta_impact_hours}h`, cls: "text-orange-600" },
                { label: "Corridor",   value: selected.affectedRoutes[0] ?? "—" },
              ].map(({ label, value, cls }) => (
                <div key={label} className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{label}</p>
                  <p className={`text-sm font-semibold text-slate-800 mt-0.5 truncate ${cls ?? ""}`}>{value}</p>
                </div>
              ))}
            </div>
            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Situation Report</h4>
              <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 rounded-lg p-3 border border-slate-100">{selected.detail}</p>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Operational Impact</h4>
              <p className="text-sm text-slate-700 leading-relaxed bg-orange-50 rounded-lg p-3 border border-orange-100">{selected.impact}</p>
            </div>
            {selected.affectedRoutes.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Affected Corridors</h4>
                <div className="flex flex-wrap gap-2">
                  {selected.affectedRoutes.map((r) => (
                    <span key={r} className="px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium border border-brand-200">{r}</span>
                  ))}
                </div>
              </div>
            )}
            {/* Source articles */}
            {(selected.sources ?? []).filter((s) => s.isRelevant).length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Source Articles</h4>
                <div className="space-y-2">
                  {(selected.sources ?? []).filter((s) => s.isRelevant).map((src, i) => (
                    <a
                      key={i}
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 p-3 rounded-xl border border-brand-200 bg-brand-50/40 hover:bg-brand-50 transition-colors group"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-brand-800 leading-snug group-hover:underline line-clamp-2">{src.title}</p>
                        {src.snippet && (
                          <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{src.snippet}</p>
                        )}
                        <p className="text-[10px] text-slate-400 mt-1 truncate">{src.url}</p>
                      </div>
                      <ExternalLink size={12} className="shrink-0 mt-0.5 text-brand-400 group-hover:text-brand-600" />
                    </a>
                  ))}
                </div>
              </div>
            )}
            {/* Scan freshness — always show so operator knows data age */}
            <div className={`flex items-start gap-2 rounded-xl px-3 py-2.5 border text-xs ${
              selected.last_checked_at && Date.now() - new Date(selected.last_checked_at).getTime() > 20 * 3600 * 1000
                ? "bg-amber-50 border-amber-200 text-amber-800"
                : "bg-slate-50 border-slate-100 text-slate-500"
            }`}>
              <BrainCircuit size={12} className="shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p>{selected.source}</p>
                {selected.last_checked_at && (
                  <p className="font-semibold">
                    Data scanned: {new Date(selected.last_checked_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST
                    {Date.now() - new Date(selected.last_checked_at).getTime() > 20 * 3600 * 1000
                      ? " — ⚠ over 20h old, run a fresh scan in Settings"
                      : ""}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
