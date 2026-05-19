"use client";
import { useState, useEffect, useRef } from "react";
import { TopBar } from "@/app/_components/TopBar";
import { StatCard } from "@/app/_components/StatCard";
import RiskBadge from "@/app/_components/RiskBadge";
import DisruptionCard from "@/app/_components/DisruptionCard";
import AdvisoryCard from "@/app/_components/AdvisoryCard";
import { LiveIndicator } from "@/app/_components/LiveIndicator";
import { categoryIcon } from "@/app/_lib/utils";
import type { Disruption, Advisory, RiskLevel } from "@/app/_lib/types";
import {
  AlertTriangle, Zap, ShieldCheck, Map, BrainCircuit,
  ArrowRight, Clock, TrendingUp, Loader2, Route,
} from "lucide-react";
import Link from "next/link";

interface RegionRisk {
  region: string;
  state: string;
  riskLevel: RiskLevel;
  activeDisruptions: number;
  keyIssue: string;
}

interface CorridorRoute {
  corridorId: string;
  corridorName: string;
  origin: string;
  destination: string;
  points: { lat: number; lng: number; risk: string; name: string }[];
}

interface Stats {
  totalDisruptions: number;
  criticalAlerts: number;
  highRiskCorridors: number;
  safeCorridors: number;
  pendingAdvisories: number;
  regionsAffected: number;
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

// ── Leaflet risk map ──────────────────────────────────────────────

const RISK_COLOR_MAP: Record<string, string> = {
  critical: "#ef4444",
  high:     "#f97316",
  medium:   "#eab308",
  low:      "#22c55e",
  safe:     "#86efac",
};

const RISK_FILL_MAP: Record<string, string> = {
  critical: "rgba(239,68,68,0.18)",
  high:     "rgba(249,115,22,0.15)",
  medium:   "rgba(234,179,8,0.13)",
  low:      "rgba(34,197,94,0.12)",
  safe:     "rgba(134,239,172,0.10)",
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

    // Shadow stroke
    const shadow = L.polyline(pts.map((p) => [p.lat, p.lng] as [number, number]), {
      color: "#0f2347", weight: 8, opacity: 0.06, lineJoin: "round",
    }).addTo(map);
    layersRef.current.push(shadow);

    // Per-segment colored lines
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], n = pts[i + 1];
      const color  = RISK_COLOR_MAP[p.risk] ?? RISK_COLOR_MAP.safe;
      const weight = p.risk === "critical" ? 5 : p.risk === "high" ? 4.5 : 3.5;
      const seg = L.polyline([[p.lat, p.lng], [n.lat, n.lng]], { color, weight, opacity: 0.9, lineJoin: "round" })
        .bindTooltip(`<b>${p.name}</b><br/>Risk: <b>${p.risk.toUpperCase()}</b>`, { sticky: true })
        .addTo(map);
      layersRef.current.push(seg);
    }

    // Origin / destination dots
    const originDot = L.circleMarker([pts[0].lat, pts[0].lng], { radius: 6, fillColor: "#0f2347", color: "white", weight: 2, fillOpacity: 1 })
      .bindTooltip(`<b>${cr.origin}</b> — Origin`, { sticky: true }).addTo(map);
    const destDot = L.circleMarker([pts[pts.length - 1].lat, pts[pts.length - 1].lng], { radius: 6, fillColor: "#8b5cf6", color: "white", weight: 2, fillOpacity: 1 })
      .bindTooltip(`<b>${cr.destination}</b> — Destination`, { sticky: true }).addTo(map);
    layersRef.current.push(originDot, destDot);

    // Disruption hotspot markers
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

      // Link to disruption detail if available
      const matched = disruptions.find((d) => d.affectedRoutes.includes(cr.corridorName));
      if (matched) hotspot.on("click", () => onDisruptionClick(matched));

      layersRef.current.push(hotspot);
    });
  });
}

function ControlTowerLeafletMap({
  corridorRoutes,
  disruptions,
  onDisruptionClick,
}: {
  corridorRoutes: CorridorRoute[];
  disruptions: Disruption[];
  onDisruptionClick: (d: Disruption) => void;
}) {
  const mapRef         = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<import("leaflet").Map | null>(null);
  const layersRef      = useRef<import("leaflet").Layer[]>([]);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    import("leaflet").then((L) => {
      delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
      const map = L.map(mapRef.current!, { center: [22.5, 82.5], zoom: 5, zoomControl: true, scrollWheelZoom: true });
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
    });
  }, [corridorRoutes, disruptions, onDisruptionClick]);

  return <div ref={mapRef} style={{ width: "100%", height: "100%" }} />;
}

const RISK_ROW: Record<string, string> = {
  critical: "border-l-4 border-red-500 bg-red-50/60",
  high:     "border-l-4 border-orange-400 bg-orange-50/60",
  medium:   "border-l-4 border-amber-400 bg-amber-50/40",
  low:      "border-l-4 border-green-400 bg-green-50/30",
  safe:     "border-l-4 border-emerald-400 bg-emerald-50/30",
};
const RISK_DOT_CLS: Record<string, string> = {
  critical: "w-3 h-3 rounded-full bg-red-500 live-dot-red",
  high:     "w-3 h-3 rounded-full bg-orange-500",
  medium:   "w-3 h-3 rounded-full bg-amber-500",
  low:      "w-3 h-3 rounded-full bg-green-500",
  safe:     "w-3 h-3 rounded-full bg-emerald-500",
};

export default function ControlTowerPage() {
  const [selected, setSelected] = useState<Disruption | null>(null);
  const [data, setData] = useState<IntelligenceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/advisory/v1/intelligence", { credentials: "include" })
      .then((r) => r.json())
      .then((d: IntelligenceData) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const disruptions    = data?.disruptions    ?? [];
  const advisories     = data?.advisories     ?? [];
  const stats          = data?.stats ?? { totalDisruptions: 0, criticalAlerts: 0, highRiskCorridors: 0, safeCorridors: 0, pendingAdvisories: 0, regionsAffected: 0 };
  const regionRisks    = data?.regionRisks    ?? [];
  const corridorRoutes = data?.corridorRoutes ?? [];
  const top5           = disruptions.slice(0, 5);
  const urgent         = advisories.filter((a) => a.isUrgent).slice(0, 3);
  const ticker         = disruptions.length > 0 ? disruptions : [];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar
        title="Control Tower"
        subtitle="Pan-India disruption intelligence — pre-dispatch advisory"
      />

      {/* Live alert ticker */}
      <div className="bg-brand-950 text-brand-100 text-xs py-1.5 px-4 overflow-hidden flex items-center gap-3 shrink-0">
        <span className="shrink-0 font-bold text-accent-400 tracking-wider">LIVE ALERTS</span>
        <div className="overflow-hidden flex-1">
          {ticker.length > 0 ? (
            <div className="ticker flex gap-16 whitespace-nowrap">
              {ticker.map((d) => (
                <span key={d.id} className="inline-flex items-center gap-2">
                  <span>{categoryIcon(d.category)}</span>
                  <span>{d.title}</span>
                  <span className="text-brand-400">· {d.region}</span>
                </span>
              ))}
            </div>
          ) : (
            <span className="text-brand-500 italic">No active disruptions on watched corridors — system clear</span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-6 max-w-screen-2xl mx-auto">

          {/* Stats row */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <StatCard label="Active Disruptions" value={loading ? "—" : stats.totalDisruptions}  hint="Across watched corridors" tone="warning" icon={AlertTriangle} />
            <StatCard label="Critical Alerts"     value={loading ? "—" : stats.criticalAlerts}    hint="Immediate action"         tone="danger"  icon={Zap}           />
            <StatCard label="High Risk Corridors" value={loading ? "—" : stats.highRiskCorridors} hint="Avoid or reroute"         tone="warning" icon={Map}            />
            <StatCard label="Safe Corridors"      value={loading ? "—" : stats.safeCorridors}     hint="Clear for dispatch"       tone="success" icon={ShieldCheck}    />
            <StatCard label="AI Advisories"       value={loading ? "—" : stats.pendingAdvisories} hint="Urgent actions"           tone="info"    icon={BrainCircuit}   />
            <StatCard label="Regions Affected"    value={loading ? "—" : stats.regionsAffected}   hint="States with disruptions"  tone="brand"   icon={TrendingUp}     />
          </div>

          {/* No data prompt */}
          {!loading && !data?.hasData && (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 px-6 py-8 text-center">
              <Route size={32} className="mx-auto mb-3 text-blue-400" />
              <p className="text-sm font-semibold text-blue-800 mb-1">
                {(data?.corridors?.length ?? 0) === 0
                  ? "No watched corridors yet"
                  : "Intelligence not run yet"}
              </p>
              <p className="text-xs text-blue-600 mb-4">
                {(data?.corridors?.length ?? 0) === 0
                  ? "Add corridors in Watched Corridors, then run intelligence to see live disruptions here."
                  : "Go to a Watched Corridor and click 'Run Intelligence' to populate live disruption data."}
              </p>
              <Link
                href="/advisory/planned"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-brand-700 text-white hover:bg-brand-800 transition"
              >
                Go to Watched Corridors <ArrowRight size={13} />
              </Link>
            </div>
          )}

          {/* Main grid */}
          {(loading || data?.hasData) && (
            <div className="grid xl:grid-cols-5 gap-6">
              {/* Left: Map + region table */}
              <div className="xl:col-span-3 space-y-4">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Map size={15} className="text-brand-600" />
                      <h2 className="text-sm font-semibold text-slate-800">India Risk Map — Watched Corridors</h2>
                    </div>
                    <LiveIndicator />
                  </div>

                  <div className="relative" style={{ height: 420 }}>
                    {loading ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
                        <Loader2 size={28} className="animate-spin text-slate-300" />
                      </div>
                    ) : (
                      <ControlTowerLeafletMap
                        corridorRoutes={corridorRoutes}
                        disruptions={disruptions}
                        onDisruptionClick={(d) => setSelected(d)}
                      />
                    )}
                    {/* Active event badge */}
                    <div className="absolute top-3 right-3 z-[1000] bg-white rounded-lg border border-slate-200 shadow-sm px-3 py-2 text-center">
                      <div className="text-lg font-bold text-red-600 num">{stats.totalDisruptions}</div>
                      <div className="text-[10px] text-slate-500 font-medium">Active Events</div>
                    </div>
                    {/* Risk legend */}
                    <div className="absolute bottom-3 left-3 z-[1000] bg-white/90 backdrop-blur-sm rounded-lg border border-slate-200 shadow-sm px-3 py-2">
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Risk Level</p>
                      <div className="space-y-1">
                        {[
                          { label: "Critical", color: "#ef4444" },
                          { label: "High",     color: "#f97316" },
                          { label: "Medium",   color: "#eab308" },
                          { label: "Low",      color: "#22c55e" },
                        ].map(({ label, color }) => (
                          <div key={label} className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                            <span className="text-[10px] text-slate-600">{label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Regional risk table */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-800">Regional Risk Snapshot</h2>
                    <span className="text-xs text-slate-400">
                      {new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", timeStyle: "short", dateStyle: "medium" })} IST
                    </span>
                  </div>
                  {loading ? (
                    <div className="flex items-center justify-center h-20">
                      <Loader2 size={20} className="animate-spin text-slate-300" />
                    </div>
                  ) : regionRisks.length === 0 ? (
                    <div className="px-5 py-4 text-sm text-slate-400 text-center">
                      No disruptions detected across watched corridors
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {regionRisks.map((r) => (
                        <div key={r.region} className={`flex items-center gap-3 px-5 py-2.5 ${RISK_ROW[r.riskLevel]}`}>
                          <span className={`shrink-0 ${RISK_DOT_CLS[r.riskLevel]}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-800 truncate">{r.region}</p>
                            <p className="text-[11px] text-slate-500 truncate">{r.keyIssue}</p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-[11px] text-slate-400">{r.state}</span>
                            <RiskBadge level={r.riskLevel} size="xs" />
                            {r.activeDisruptions > 0 && (
                              <span className="text-[10px] font-semibold text-slate-500">
                                {r.activeDisruptions} event{r.activeDisruptions > 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Advisories + Live feed */}
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
                    ) : urgent.length === 0 ? (
                      <div className="py-6 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                        <ShieldCheck size={24} className="text-emerald-400" />
                        <span>No urgent advisories right now</span>
                      </div>
                    ) : (
                      urgent.map((a) => <AdvisoryCard key={a.id} a={a} compact />)
                    )}
                  </div>
                </div>

                {/* Live disruption feed */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Clock size={15} className="text-slate-500" />
                      <h2 className="text-sm font-semibold text-slate-800">Live Disruption Feed</h2>
                    </div>
                    <Link href="/advisory/disruptions" className="text-xs text-brand-600 font-medium flex items-center gap-0.5 hover:gap-1.5 transition-all">
                      All <ArrowRight size={11} />
                    </Link>
                  </div>
                  <div className="p-3 space-y-2.5">
                    {loading ? (
                      <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-slate-300" /></div>
                    ) : top5.length === 0 ? (
                      <div className="py-6 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                        <ShieldCheck size={24} className="text-emerald-400" />
                        <span>All watched corridors clear</span>
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

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-white border-l border-slate-200 shadow-2xl z-50 flex flex-col slide-in">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">Disruption Detail</h2>
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
            <div className="text-xs text-slate-400 flex items-center gap-1.5">
              <BrainCircuit size={11} /> {selected.source}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
