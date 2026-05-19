"use client";
import { useState, useEffect, useRef } from "react";
import { TopBar } from "@/app/_components/TopBar";
import RiskBadge from "@/app/_components/RiskBadge";
import { categoryIcon } from "@/app/_lib/utils";
import { Map, Info, Loader2, Route, ArrowRight, AlertTriangle, Shield } from "lucide-react";
import type { Disruption, RiskLevel } from "@/app/_lib/types";
import Link from "next/link";

interface RegionRisk { region: string; state: string; riskLevel: RiskLevel; activeDisruptions: number; keyIssue: string }
interface CorridorRoute {
  corridorId: string;
  corridorName: string;
  origin: string;
  destination: string;
  points: { lat: number; lng: number; risk: string; name: string }[];
}
interface IntelData {
  disruptions: Disruption[];
  corridors: { id: string; name: string }[];
  regionRisks: RegionRisk[];
  corridorRoutes: CorridorRoute[];
  stats: { totalDisruptions: number };
}

const RISK_COLOR: Record<string, string> = {
  critical: "#ef4444",
  high:     "#f97316",
  medium:   "#eab308",
  low:      "#22c55e",
  safe:     "#86efac",
};

const RISK_FILL: Record<string, string> = {
  critical: "rgba(239,68,68,0.18)",
  high:     "rgba(249,115,22,0.15)",
  medium:   "rgba(234,179,8,0.13)",
  low:      "rgba(34,197,94,0.12)",
  safe:     "rgba(134,239,172,0.10)",
};

// Lazy-loaded map component to avoid SSR issues with Leaflet
function LeafletMap({ corridorRoutes, disruptions }: { corridorRoutes: CorridorRoute[]; disruptions: Disruption[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const layersRef = useRef<any[]>([]);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Dynamic import to avoid SSR
    import("leaflet").then((L) => {
      // Fix default marker icon resolution in bundled environments
      delete (L.Icon.Default.prototype as any)._getIconUrl;

      const map = L.map(mapRef.current!, {
        center: [22.5, 82.5],
        zoom: 5,
        zoomControl: true,
        scrollWheelZoom: true,
      });
      mapInstanceRef.current = map;

      // OpenStreetMap tiles
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);

      renderLayers(L, map, corridorRoutes, disruptions);
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Re-render layers when data changes
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    import("leaflet").then((L) => {
      layersRef.current.forEach((l) => l.remove());
      layersRef.current = [];
      renderLayers(L, mapInstanceRef.current, corridorRoutes, disruptions);
    });
  }, [corridorRoutes, disruptions]);

  function renderLayers(L: any, map: any, routes: CorridorRoute[], disrpts: Disruption[]) {
    const newLayers: any[] = [];

    routes.forEach((cr) => {
      const pts = cr.points;
      if (pts.length < 2) return;

      // Draw route shadow
      const shadow = L.polyline(pts.map((p) => [p.lat, p.lng]), {
        color: "#0f2347",
        weight: 8,
        opacity: 0.06,
        lineJoin: "round",
      }).addTo(map);
      newLayers.push(shadow);

      // Draw per-segment colored lines
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i];
        const n = pts[i + 1];
        const color = RISK_COLOR[p.risk] ?? RISK_COLOR.safe;
        const weight = p.risk === "critical" ? 5 : p.risk === "high" ? 4.5 : 3.5;
        const seg = L.polyline([[p.lat, p.lng], [n.lat, n.lng]], {
          color,
          weight,
          opacity: 0.9,
          lineJoin: "round",
        })
          .bindTooltip(`<b>${p.name}</b><br/>Risk: <b>${p.risk.toUpperCase()}</b>`, { sticky: true })
          .addTo(map);
        newLayers.push(seg);
      }

      // Origin dot
      const originDot = L.circleMarker([pts[0].lat, pts[0].lng], {
        radius: 6, fillColor: "#0f2347", color: "white", weight: 2, fillOpacity: 1,
      })
        .bindTooltip(`<b>${cr.origin}</b><br/>Origin`, { sticky: true })
        .addTo(map);
      newLayers.push(originDot);

      // Destination dot
      const destDot = L.circleMarker([pts[pts.length - 1].lat, pts[pts.length - 1].lng], {
        radius: 6, fillColor: "#0f2347", color: "white", weight: 2, fillOpacity: 1,
      })
        .bindTooltip(`<b>${cr.destination}</b><br/>Destination`, { sticky: true })
        .addTo(map);
      newLayers.push(destDot);

      // Disruption hotspot markers
      pts.filter((p) => p.risk !== "safe" && p.risk !== "low").forEach((p) => {
        const r = p.risk === "critical" ? 10 : p.risk === "high" ? 8 : 6;
        const pulse = p.risk === "critical" || p.risk === "high";

        // Outer glow ring for critical/high
        if (pulse) {
          const glow = L.circleMarker([p.lat, p.lng], {
            radius: r + 6,
            fillColor: RISK_COLOR[p.risk],
            color: "transparent",
            fillOpacity: 0.2,
          }).addTo(map);
          newLayers.push(glow);
        }

        const hotspot = L.circleMarker([p.lat, p.lng], {
          radius: r,
          fillColor: RISK_COLOR[p.risk],
          color: "white",
          weight: 2,
          fillOpacity: 0.95,
        })
          .bindPopup(`
            <div style="min-width:200px;font-family:sans-serif">
              <div style="font-weight:800;font-size:13px;margin-bottom:4px">${p.name}</div>
              <div style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;background:${RISK_FILL[p.risk]};color:${RISK_COLOR[p.risk]};border:1px solid ${RISK_COLOR[p.risk]}">
                ${p.risk.toUpperCase()} RISK
              </div>
              <div style="margin-top:6px;font-size:11px;color:#64748b">Corridor: ${cr.corridorName}</div>
            </div>
          `, { maxWidth: 260 })
          .addTo(map);
        newLayers.push(hotspot);
      });
    });

    layersRef.current = newLayers;
  }

  return <div ref={mapRef} style={{ width: "100%", height: "100%" }} />;
}

export default function RiskMapPage() {
  const [data, setData]       = useState<IntelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCorridor, setSelectedCorridor] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/advisory/v1/intelligence", { credentials: "include" })
      .then((r) => r.json())
      .then((d: IntelData) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const regionRisks    = data?.regionRisks    ?? [];
  const disruptions    = data?.disruptions    ?? [];
  const corridorRoutes = data?.corridorRoutes ?? [];
  const corridorCount  = data?.corridors?.length ?? 0;
  const totalEvents    = data?.stats?.totalDisruptions ?? 0;

  const visibleRoutes = selectedCorridor
    ? corridorRoutes.filter((c) => c.corridorId === selectedCorridor)
    : corridorRoutes;

  const criticalCount = disruptions.filter((d) => d.risk === "critical").length;
  const highCount     = disruptions.filter((d) => d.risk === "high").length;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar title="India Risk Map" subtitle="Live disruption heatmap across watched corridor segments" />

      <div className="flex-1 overflow-auto">
        <div className="p-4 space-y-4 max-w-screen-2xl mx-auto">

          {/* Stats bar */}
          {!loading && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Active Disruptions", value: totalEvents, icon: <AlertTriangle size={14} className="text-red-500" />, color: totalEvents > 0 ? "text-red-600" : "text-green-600" },
                { label: "Critical Alerts",    value: criticalCount, icon: <AlertTriangle size={14} className="text-red-500" />, color: criticalCount > 0 ? "text-red-600" : "text-slate-500" },
                { label: "High Risk",          value: highCount,     icon: <AlertTriangle size={14} className="text-orange-500" />, color: highCount > 0 ? "text-orange-600" : "text-slate-500" },
                { label: "Corridors Watched",  value: corridorCount, icon: <Route size={14} className="text-brand-500" />, color: "text-brand-700" },
              ].map(({ label, value, icon, color }) => (
                <div key={label} className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3">
                  {icon}
                  <div>
                    <p className={`text-xl font-bold ${color}`}>{value}</p>
                    <p className="text-[11px] text-slate-400">{label}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid xl:grid-cols-4 gap-4">
            {/* Map */}
            <div className="xl:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Map size={14} className="text-brand-600" />
                  <h2 className="text-sm font-semibold text-slate-800">Watched Corridor Disruption Overlay</h2>
                </div>
                <div className="flex items-center gap-4">
                  {/* Risk legend */}
                  <div className="hidden md:flex items-center gap-3 text-[11px] text-slate-500">
                    {[["critical","#ef4444"],["high","#f97316"],["medium","#eab308"],["clear","#22c55e"]].map(([label, color]) => (
                      <span key={label} className="flex items-center gap-1">
                        <span style={{ background: color }} className="w-4 h-1.5 rounded-full inline-block" />
                        {label.charAt(0).toUpperCase() + label.slice(1)}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-slate-400">
                    <Info size={11} />
                    {corridorCount} monitored
                  </div>
                </div>
              </div>

              <div className="relative" style={{ height: 560 }}>
                {loading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-[9999]">
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 size={28} className="animate-spin text-brand-500" />
                      <p className="text-xs text-slate-400">Loading corridor intelligence…</p>
                    </div>
                  </div>
                )}

                {!loading && corridorCount === 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/90">
                    <div className="text-center">
                      <Route size={32} className="mx-auto mb-3 text-blue-400" />
                      <p className="text-sm font-semibold text-slate-700 mb-1">No watched corridors</p>
                      <p className="text-xs text-slate-500 mb-4">Add corridors to see live route risk on the map</p>
                      <Link href="/advisory/planned" className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-brand-700 text-white hover:bg-brand-800 transition">
                        Add Corridor <ArrowRight size={11} />
                      </Link>
                    </div>
                  </div>
                ) : (
                  <LeafletMap corridorRoutes={visibleRoutes} disruptions={disruptions} />
                )}

                {/* Click hint */}
                {!loading && corridorCount > 0 && (
                  <div className="absolute bottom-3 right-3 z-[1000] bg-white/90 backdrop-blur-sm border border-slate-200 rounded-lg px-3 py-1.5 text-[11px] text-slate-500 shadow-sm pointer-events-none">
                    Click a hotspot for details · Scroll to zoom
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              {/* Corridor filter */}
              {corridorRoutes.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <h2 className="text-sm font-semibold text-slate-800">Watched Corridors</h2>
                  </div>
                  <div className="divide-y divide-slate-100">
                    <button
                      onClick={() => setSelectedCorridor(null)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition text-xs ${!selectedCorridor ? "bg-brand-50 text-brand-700 font-semibold" : "text-slate-600 hover:bg-slate-50"}`}
                    >
                      <Shield size={12} className="shrink-0" />
                      All Corridors
                      <span className="ml-auto text-[10px] font-bold bg-slate-100 px-1.5 py-0.5 rounded-full">{corridorRoutes.length}</span>
                    </button>
                    {corridorRoutes.map((cr) => {
                      const hotspots = cr.points.filter((p) => p.risk === "critical" || p.risk === "high").length;
                      const worst = cr.points.reduce((best, p) => {
                        const order: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, safe: 0 };
                        return (order[p.risk] ?? 0) > (order[best] ?? 0) ? p.risk : best;
                      }, "safe");
                      return (
                        <button
                          key={cr.corridorId}
                          onClick={() => setSelectedCorridor(selectedCorridor === cr.corridorId ? null : cr.corridorId)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition ${selectedCorridor === cr.corridorId ? "bg-brand-50" : "hover:bg-slate-50"}`}
                        >
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: RISK_COLOR[worst] }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-800 truncate">{cr.origin} → {cr.destination}</p>
                            <p className="text-[10px] text-slate-400">{hotspots} hotspot{hotspots !== 1 ? "s" : ""}</p>
                          </div>
                          {hotspots > 0 && (
                            <span className="text-[10px] font-bold shrink-0" style={{ color: RISK_COLOR[worst] }}>{hotspots}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Region Risk */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100">
                  <h2 className="text-sm font-semibold text-slate-800">Region Risk Status</h2>
                </div>
                {loading ? (
                  <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-slate-300" /></div>
                ) : regionRisks.length === 0 ? (
                  <div className="px-4 py-6 text-xs text-slate-400 text-center">No disruptions detected</div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {regionRisks.map((r) => (
                      <div key={r.region} className="flex items-start gap-3 px-4 py-2.5">
                        <div className="w-2 h-2 rounded-full mt-1 shrink-0" style={{ background: RISK_COLOR[r.riskLevel] }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-800">{r.region}</p>
                          <p className="text-[10px] text-slate-400 truncate">{r.keyIssue}</p>
                        </div>
                        <RiskBadge level={r.riskLevel} size="xs" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Active events */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-800">Active Events</h2>
                  {disruptions.length > 5 && (
                    <Link href="/advisory/disruptions" className="text-[11px] text-brand-600 hover:underline">+{disruptions.length - 5} more</Link>
                  )}
                </div>
                {loading ? (
                  <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-slate-300" /></div>
                ) : disruptions.length === 0 ? (
                  <div className="px-4 py-6 text-xs text-slate-400 text-center">All corridors clear</div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {disruptions.slice(0, 5).map((d) => (
                      <div key={d.id} className="flex items-center gap-2 px-4 py-2.5">
                        <span className="text-sm shrink-0">{categoryIcon(d.category)}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-semibold text-slate-700 truncate">{d.title}</p>
                          <p className="text-[10px] text-slate-400 truncate">{d.region}</p>
                        </div>
                        <RiskBadge level={d.risk} size="xs" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
