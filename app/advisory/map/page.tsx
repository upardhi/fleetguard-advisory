"use client";
import { useState, useEffect } from "react";
import { TopBar } from "@/app/_components/TopBar";
import RiskBadge from "@/app/_components/RiskBadge";
import { categoryIcon } from "@/app/_lib/utils";
import { Map, Info, Loader2, Route, ArrowRight } from "lucide-react";
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

// Convert geographic lat/lng to SVG coordinates for the 600×680 India map
// Calibrated against city dot positions in the SVG
function toSvg(lat: number, lng: number): { x: number; y: number } {
  const x = 14.68 * lng - 888.37;
  const y = -27.39 * lat + 856.2;
  return { x, y };
}

const RISK_PATH_COLOR: Record<string, string> = {
  critical: "#ef4444",
  high:     "#f97316",
  medium:   "#f59e0b",
  low:      "#22c55e",
  safe:     "#86efac",
};

const RISK_FILL:   Record<string, string> = { critical: "rgba(239,68,68,0.25)",   high: "rgba(249,115,22,0.25)", medium: "rgba(245,158,11,0.2)", low: "rgba(34,197,94,0.18)", safe: "rgba(34,197,94,0.15)" };
const RISK_STROKE: Record<string, string> = { critical: "#ef4444",                high: "#f97316",               medium: "#f59e0b",              low: "#22c55e",              safe: "#15803d" };
const RISK_DOT_C:  Record<string, string> = { critical: "#ef4444",                high: "#f97316",               medium: "#f59e0b",              low: "#22c55e",              safe: "#15803d" };
const RISK_LCOLOR: Record<string, string> = { critical: "#991b1b",                high: "#7c2d12",               medium: "#78350f",              low: "#14532d",              safe: "#14532d" };
const RISK_TCOLOR: Record<string, string> = { critical: "#dc2626",                high: "#ea580c",               medium: "#d97706",              low: "#16a34a",              safe: "#16a34a" };

const STATE_SVG: Record<string, { cx: number; cy: number; rx: number; ry: number; lx: number; ly: number; ly2: number }> = {
  "Haryana":        { cx: 262, cy: 128, rx: 32, ry: 24, lx: 296, ly: 122, ly2: 134 },
  "Odisha":         { cx: 405, cy: 355, rx: 28, ry: 22, lx: 435, ly: 349, ly2: 361 },
  "Maharashtra":    { cx: 200, cy: 335, rx: 26, ry: 20, lx: 115, ly: 330, ly2: 342 },
  "Karnataka":      { cx: 235, cy: 460, rx: 22, ry: 18, lx: 260, ly: 455, ly2: 467 },
  "Rajasthan":      { cx: 172, cy: 215, rx: 22, ry: 18, lx: 115, ly: 210, ly2: 222 },
  "Uttar Pradesh":  { cx: 338, cy: 195, rx: 20, ry: 15, lx: 360, ly: 190, ly2: 202 },
  "Assam":          { cx: 455, cy: 175, rx: 18, ry: 14, lx: 448, ly: 160, ly2: 172 },
  "Tamil Nadu":     { cx: 278, cy: 558, rx: 18, ry: 14, lx: 294, ly: 553, ly2: 563 },
  "Gujarat":        { cx: 140, cy: 278, rx: 18, ry: 14, lx: 102, ly: 265, ly2: 277 },
  "West Bengal":    { cx: 415, cy: 245, rx: 18, ry: 14, lx: 435, ly: 240, ly2: 252 },
  "Madhya Pradesh": { cx: 268, cy: 265, rx: 20, ry: 15, lx: 232, ly: 248, ly2: 260 },
  "Telangana":      { cx: 295, cy: 392, rx: 18, ry: 14, lx: 315, ly: 387, ly2: 399 },
  "Mumbai":         { cx: 175, cy: 318, rx: 16, ry: 13, lx: 115, ly: 313, ly2: 323 },
  "Buldhana":       { cx: 245, cy: 285, rx: 16, ry: 13, lx: 262, ly: 280, ly2: 290 },
};

interface IntelData {
  disruptions: Disruption[];
  corridors: { id: string; name: string }[];
  regionRisks: RegionRisk[];
  corridorRoutes: CorridorRoute[];
  stats: { totalDisruptions: number };
}

export default function RiskMapPage() {
  const [data, setData]       = useState<IntelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredSeg, setHoveredSeg] = useState<string | null>(null);

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

  // Build SVG path from corridor points
  function corridorPath(points: CorridorRoute["points"]): string {
    return points
      .map((p, i) => {
        const { x, y } = toSvg(p.lat, p.lng);
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar title="India Risk Map" subtitle="Live disruption heatmap across watched corridor segments" />

      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-4 max-w-screen-2xl mx-auto">

          <div className="grid xl:grid-cols-4 gap-6">
            {/* Map */}
            <div className="xl:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Map size={15} className="text-brand-600" />
                  <h2 className="text-sm font-semibold text-slate-800">Watched Corridor Disruption Overlay</h2>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Info size={12} />
                  {corridorCount} corridor{corridorCount !== 1 ? "s" : ""} monitored
                </div>
              </div>

              <div className="relative p-6" style={{ minHeight: 560 }}>
                {loading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/60 z-10">
                    <Loader2 size={28} className="animate-spin text-slate-400" />
                  </div>
                )}

                <svg viewBox="0 0 600 680" className="w-full h-full" style={{ maxHeight: 560 }}>
                  {/* India base */}
                  <path
                    d="M 215 48 L 238 35 L 275 30 L 320 42 L 368 65 L 405 95 L 425 128 L 438 162 L 440 198 L 455 232 L 468 268 L 472 308 L 462 345 L 445 378 L 425 408 L 400 432 L 375 455 L 348 478 L 322 502 L 300 528 L 284 555 L 272 578 L 258 555 L 240 530 L 220 508 L 198 488 L 175 465 L 155 442 L 138 418 L 122 392 L 110 362 L 105 330 L 108 298 L 115 268 L 122 240 L 120 212 L 125 185 L 133 158 L 148 130 L 165 106 L 185 83 L 202 64 Z"
                    fill="#dbeafe" stroke="#93c5fd" strokeWidth="1.5"
                  />

                  {/* ── Corridor routes as colored paths ── */}
                  {corridorRoutes.map((cr, crIdx) => {
                    // Draw each segment as a colored line segment
                    const pts = cr.points;
                    return (
                      <g key={cr.corridorId}>
                        {/* Route base (shadow) */}
                        <path
                          d={corridorPath(pts)}
                          fill="none"
                          stroke="#1e3a5f"
                          strokeWidth="5"
                          strokeOpacity="0.12"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        {/* Colored segment lines */}
                        {pts.slice(0, -1).map((p, i) => {
                          const next = pts[i + 1];
                          const { x: x1, y: y1 } = toSvg(p.lat, p.lng);
                          const { x: x2, y: y2 } = toSvg(next.lat, next.lng);
                          const segKey = `${cr.corridorId}-${i}`;
                          const color = RISK_PATH_COLOR[p.risk] ?? RISK_PATH_COLOR.safe;
                          return (
                            <line
                              key={segKey}
                              x1={x1.toFixed(1)} y1={y1.toFixed(1)}
                              x2={x2.toFixed(1)} y2={y2.toFixed(1)}
                              stroke={color}
                              strokeWidth={hoveredSeg === segKey ? "6" : "3.5"}
                              strokeLinecap="round"
                              onMouseEnter={() => setHoveredSeg(segKey)}
                              onMouseLeave={() => setHoveredSeg(null)}
                              style={{ cursor: "default" }}
                            >
                              <title>{p.name} — {p.risk.toUpperCase()}</title>
                            </line>
                          );
                        })}
                        {/* Disruption hotspot markers */}
                        {pts.filter((p) => p.risk !== "safe" && p.risk !== "low").map((p, i) => {
                          const { x, y } = toSvg(p.lat, p.lng);
                          const r = p.risk === "critical" ? 7 : p.risk === "high" ? 5.5 : 4;
                          return (
                            <circle
                              key={`hotspot-${crIdx}-${i}`}
                              cx={x.toFixed(1)} cy={y.toFixed(1)}
                              r={r}
                              fill={RISK_PATH_COLOR[p.risk]}
                              stroke="white"
                              strokeWidth="1.5"
                              opacity="0.9"
                            >
                              <title>{p.name}</title>
                            </circle>
                          );
                        })}
                        {/* Origin/destination dots */}
                        {pts.length > 0 && (() => {
                          const first = toSvg(pts[0].lat, pts[0].lng);
                          const last  = toSvg(pts[pts.length-1].lat, pts[pts.length-1].lng);
                          return (
                            <>
                              <circle cx={first.x.toFixed(1)} cy={first.y.toFixed(1)} r="5" fill="#1e3a5f" stroke="white" strokeWidth="1.5" />
                              <circle cx={last.x.toFixed(1)}  cy={last.y.toFixed(1)}  r="5" fill="#1e3a5f" stroke="white" strokeWidth="1.5" />
                              <text x={(first.x + 7).toFixed(1)} y={(first.y + 4).toFixed(1)} fontSize="8" fill="#1e3a5f" fontWeight="700">{cr.origin}</text>
                              <text x={(last.x + 7).toFixed(1)}  y={(last.y + 4).toFixed(1)}  fontSize="8" fill="#1e3a5f" fontWeight="700">{cr.destination}</text>
                            </>
                          );
                        })()}
                      </g>
                    );
                  })}

                  {/* State risk zone overlays */}
                  {regionRisks.map((r) => {
                    const pos = STATE_SVG[r.state] ?? STATE_SVG[r.region];
                    if (!pos) return null;
                    const risk = r.riskLevel;
                    const dotR = risk === "critical" ? 7 : risk === "high" ? 6 : 5;
                    const shortName = r.state.length > 10 ? r.state.slice(0, 8) + "." : r.state;
                    return (
                      <g key={r.state}>
                        <ellipse cx={pos.cx} cy={pos.cy} rx={pos.rx} ry={pos.ry} fill={RISK_FILL[risk]} stroke={RISK_STROKE[risk]} strokeWidth="1.5" />
                        <circle  cx={pos.cx} cy={pos.cy} r={dotR} fill={RISK_DOT_C[risk]} />
                        <text x={pos.lx} y={pos.ly}  fontSize="10" fill={RISK_LCOLOR[risk]} fontWeight="800">{shortName}</text>
                        <text x={pos.lx} y={pos.ly2} fontSize="8"  fill={RISK_TCOLOR[risk]}>{risk.toUpperCase()}</text>
                      </g>
                    );
                  })}

                  {/* City dots */}
                  {[
                    { name: "Delhi",     cx: 262, cy: 88  },
                    { name: "Mumbai",    cx: 165, cy: 318 },
                    { name: "Chennai",   cx: 300, cy: 528 },
                    { name: "Kolkata",   cx: 400, cy: 225 },
                    { name: "Bengaluru", cx: 248, cy: 488 },
                    { name: "Nagpur",    cx: 270, cy: 285 },
                  ].map(({ name, cx, cy }) => (
                    <g key={name}>
                      <circle cx={cx} cy={cy} r="3" fill="#334155" opacity="0.7" />
                      <text x={cx+5} y={cy+4} fontSize="7.5" fill="#334155" fontWeight="600" opacity="0.8">{name}</text>
                    </g>
                  ))}

                  {/* Legend */}
                  <g transform="translate(12, 460)">
                    <rect x="0" y="0" width="120" height="132" rx="8" fill="white" fillOpacity="0.95" stroke="#e2e8f0" strokeWidth="1" />
                    <text x="10" y="16" fontSize="8" fill="#475569" fontWeight="700" letterSpacing="0.5">ROUTE RISK LEVEL</text>
                    {[
                      { label: "Critical", color: "#ef4444", y: 34 },
                      { label: "High",     color: "#f97316", y: 52 },
                      { label: "Medium",   color: "#f59e0b", y: 70 },
                      { label: "Clear",    color: "#86efac", y: 88 },
                    ].map(({ label, color, y }) => (
                      <g key={label}>
                        <line x1="12" y1={y} x2="30" y2={y} stroke={color} strokeWidth="3.5" strokeLinecap="round" />
                        <text x="36" y={y + 4} fontSize="9" fill="#475569">{label}</text>
                      </g>
                    ))}
                    <circle cx="18" cy="116" r="5" fill="#ef4444" stroke="white" strokeWidth="1.5" />
                    <text x="28" y="120" fontSize="9" fill="#475569">Hotspot</text>
                  </g>

                  {/* Stats badge */}
                  {!loading && (
                    <g transform="translate(490, 30)">
                      <rect x="0" y="0" width="95" height="58" rx="8" fill="white" stroke="#e2e8f0" strokeWidth="1" />
                      <text x="47" y="22" fontSize="24" fill={totalEvents > 0 ? "#dc2626" : "#15803d"} fontWeight="800" textAnchor="middle">{totalEvents}</text>
                      <text x="47" y="38" fontSize="8"  fill="#64748b" textAnchor="middle">Active Events</text>
                      <text x="47" y="50" fontSize="7"  fill="#94a3b8" textAnchor="middle">{corridorCount} corridor{corridorCount !== 1 ? "s" : ""} watched</text>
                    </g>
                  )}
                </svg>

                {!loading && corridorCount === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                    <div className="text-center">
                      <Route size={32} className="mx-auto mb-3 text-blue-400" />
                      <p className="text-sm font-semibold text-slate-700 mb-1">No watched corridors</p>
                      <p className="text-xs text-slate-500 mb-4">Add corridors to see live route risk on the map</p>
                      <Link href="/advisory/planned" className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-brand-700 text-white hover:bg-brand-800 transition">
                        Add Corridor <ArrowRight size={11} />
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              {/* Corridor list */}
              {corridorRoutes.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-100">
                    <h2 className="text-sm font-semibold text-slate-800">Watched Corridors</h2>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {corridorRoutes.map((cr) => {
                      const hotspots = cr.points.filter((p) => p.risk === "critical" || p.risk === "high").length;
                      return (
                        <Link
                          key={cr.corridorId}
                          href={`/advisory/planned/${cr.corridorId}`}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition"
                        >
                          <Route size={13} className="text-brand-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-800 truncate">{cr.origin} → {cr.destination}</p>
                            <p className="text-[11px] text-slate-400">{hotspots} disruption hotspot{hotspots !== 1 ? "s" : ""}</p>
                          </div>
                          {hotspots > 0 && (
                            <span className="text-[10px] font-bold text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">{hotspots}</span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Region Risk */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100">
                  <h2 className="text-sm font-semibold text-slate-800">Region Risk Status</h2>
                </div>
                {loading ? (
                  <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-slate-300" /></div>
                ) : regionRisks.length === 0 ? (
                  <div className="px-4 py-6 text-xs text-slate-400 text-center">No disruptions detected</div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {regionRisks.map((r) => (
                      <div key={r.region} className="flex items-center gap-3 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-800 truncate">{r.region}</p>
                          <p className="text-[11px] text-slate-400 truncate">{r.keyIssue}</p>
                        </div>
                        <RiskBadge level={r.riskLevel} size="xs" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Active events */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-800">Active Events</h2>
                  {disruptions.length > 5 && (
                    <Link href="/advisory/disruptions" className="text-xs text-brand-600 hover:underline">+{disruptions.length - 5} more</Link>
                  )}
                </div>
                {loading ? (
                  <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-slate-300" /></div>
                ) : disruptions.length === 0 ? (
                  <div className="px-4 py-6 text-xs text-slate-400 text-center">All corridors clear</div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {disruptions.slice(0, 5).map((d) => (
                      <div key={d.id} className="flex items-center gap-2 px-4 py-2.5">
                        <span className="text-base shrink-0">{categoryIcon(d.category)}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-700 truncate">{d.region}</p>
                          <p className="text-[11px] text-slate-400 truncate">{d.highway ?? d.affectedRoutes[0] ?? "—"}</p>
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
