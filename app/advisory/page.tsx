"use client";
import { useState, useEffect } from "react";
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
  regionRisks: RegionRisk[];
  hasData: boolean;
  lastUpdated: string;
}

// SVG positions for known Indian states
const STATE_SVG: Record<string, { cx: number; cy: number; labelX: number; labelY: number; labelY2: number }> = {
  "Haryana":       { cx: 228, cy: 120, labelX: 247, labelY: 118, labelY2: 128 },
  "Odisha":        { cx: 340, cy: 310, labelX: 358, labelY: 308, labelY2: 318 },
  "Maharashtra":   { cx: 185, cy: 295, labelX: 115, labelY: 293, labelY2: 303 },
  "Karnataka":     { cx: 215, cy: 400, labelX: 228, labelY: 398, labelY2: 408 },
  "Rajasthan":     { cx: 160, cy: 190, labelX: 108, labelY: 188, labelY2: 198 },
  "Uttar Pradesh": { cx: 290, cy: 175, labelX: 303, labelY: 173, labelY2: 183 },
  "Assam":         { cx: 388, cy: 165, labelX: 363, labelY: 150, labelY2: 160 },
  "Tamil Nadu":    { cx: 245, cy: 470, labelX: 257, labelY: 468, labelY2: 478 },
  "Gujarat":       { cx: 130, cy: 235, labelX: 108, labelY: 228, labelY2: 238 },
  "West Bengal":   { cx: 360, cy: 240, labelX: 368, labelY: 238, labelY2: 248 },
  "Madhya Pradesh":{ cx: 235, cy: 235, labelX: 210, labelY: 210, labelY2: 220 },
  "Telangana":     { cx: 255, cy: 355, labelX: 268, labelY: 353, labelY2: 363 },
};

const RISK_FILL: Record<string, string>   = { critical: "rgba(239,68,68,0.2)",   high: "rgba(249,115,22,0.2)",  medium: "rgba(245,158,11,0.2)", low: "rgba(34,197,94,0.15)",   safe: "rgba(34,197,94,0.1)" };
const RISK_STROKE: Record<string, string> = { critical: "#ef4444",               high: "#f97316",               medium: "#f59e0b",              low: "#22c55e",                safe: "#15803d" };
const RISK_DOT_C: Record<string, string>  = { critical: "#ef4444",               high: "#f97316",               medium: "#f59e0b",              low: "#22c55e",                safe: "#15803d" };
const RISK_LABEL: Record<string, string>  = { critical: "#991b1b",               high: "#7c2d12",               medium: "#78350f",              low: "#14532d",                safe: "#14532d" };
const RISK_TEXT: Record<string, string>   = { critical: "#dc2626",               high: "#ea580c",               medium: "#d97706",              low: "#16a34a",                safe: "#16a34a" };

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

  const disruptions = data?.disruptions ?? [];
  const advisories  = data?.advisories  ?? [];
  const stats       = data?.stats ?? { totalDisruptions: 0, criticalAlerts: 0, highRiskCorridors: 0, safeCorridors: 0, pendingAdvisories: 0, regionsAffected: 0 };
  const regionRisks = data?.regionRisks ?? [];
  const top5        = disruptions.slice(0, 5);
  const urgent      = advisories.filter((a) => a.isUrgent).slice(0, 3);
  const ticker      = disruptions.length > 0 ? disruptions : [];

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

                  <div className="relative bg-slate-50 p-4" style={{ minHeight: 420 }}>
                    {loading ? (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 size={28} className="animate-spin text-slate-300" />
                      </div>
                    ) : (
                      <svg viewBox="0 0 500 560" className="w-full h-full" style={{ maxHeight: 420 }}>
                        {/* India outline */}
                        <path
                          d="M 180 40 L 200 30 L 230 28 L 270 35 L 310 50 L 340 70 L 360 100 L 370 130 L 380 160 L 375 190 L 390 220 L 400 250 L 410 280 L 400 310 L 385 340 L 370 360 L 350 380 L 330 400 L 310 420 L 290 445 L 270 465 L 255 490 L 245 510 L 235 490 L 215 470 L 200 450 L 185 430 L 165 410 L 148 390 L 135 370 L 120 350 L 110 320 L 105 290 L 108 260 L 115 230 L 120 200 L 115 170 L 120 145 L 130 120 L 145 95 L 160 70 Z"
                          fill="#e8f0fe" stroke="#93c5fd" strokeWidth="1.5"
                        />
                        {/* Grid lines */}
                        <line x1="180" y1="160" x2="340" y2="160" stroke="#bfdbfe" strokeWidth="0.8" strokeDasharray="4,3" />
                        <line x1="170" y1="260" x2="400" y2="260" stroke="#bfdbfe" strokeWidth="0.8" strokeDasharray="4,3" />
                        <line x1="175" y1="360" x2="390" y2="360" stroke="#bfdbfe" strokeWidth="0.8" />
                        <line x1="255" y1="40"  x2="255" y2="510" stroke="#bfdbfe" strokeWidth="0.8" strokeDasharray="4,3" />
                        {/* Highway lines */}
                        <path d="M 230 50 L 225 100 L 222 155 L 228 220 L 235 290 L 240 360 L 250 430" stroke="#94a3b8" strokeWidth="2" fill="none" strokeDasharray="6,3" />
                        <text x="196" y="140" fontSize="8" fill="#64748b" fontWeight="600">NH44</text>
                        <path d="M 155 300 L 180 330 L 200 360 L 215 390 L 225 420" stroke="#94a3b8" strokeWidth="2" fill="none" strokeDasharray="6,3" />
                        <text x="130" y="330" fontSize="8" fill="#64748b" fontWeight="600">NH48</text>
                        <path d="M 310 290 L 330 315 L 345 340 L 355 365" stroke="#94a3b8" strokeWidth="2" fill="none" strokeDasharray="6,3" />
                        <text x="352" y="320" fontSize="8" fill="#64748b" fontWeight="600">NH16</text>

                        {/* Dynamic state risk markers from real data */}
                        {regionRisks.map((r) => {
                          const pos = STATE_SVG[r.state] ?? STATE_SVG[r.region];
                          if (!pos) return null;
                          const risk = r.riskLevel;
                          const radius = risk === "critical" ? 16 : risk === "high" ? 14 : 12;
                          const shortName = r.state.length > 9 ? r.state.slice(0, 7) + "." : r.state;
                          return (
                            <g key={r.state}>
                              <circle cx={pos.cx} cy={pos.cy} r={radius} fill={RISK_FILL[risk]} stroke={RISK_STROKE[risk]} strokeWidth="1.5" />
                              <circle cx={pos.cx} cy={pos.cy} r={radius * 0.38} fill={RISK_DOT_C[risk]} />
                              <text x={pos.labelX} y={pos.labelY}  fontSize="9" fill={RISK_LABEL[risk]} fontWeight="700">{shortName}</text>
                              <text x={pos.labelX} y={pos.labelY2} fontSize="8" fill={RISK_TEXT[risk]}>{risk.toUpperCase()}</text>
                            </g>
                          );
                        })}

                        {/* Fallback placeholder states when no real data */}
                        {regionRisks.length === 0 && (
                          <>
                            {[
                              { cx: 228, cy: 120, label: "North",  lx: 240, ly: 118 },
                              { cx: 185, cy: 295, label: "West",   lx: 135, ly: 293 },
                              { cx: 340, cy: 310, label: "East",   lx: 352, ly: 308 },
                              { cx: 245, cy: 470, label: "South",  lx: 257, ly: 468 },
                            ].map((p) => (
                              <g key={p.label}>
                                <circle cx={p.cx} cy={p.cy} r={12} fill="rgba(34,197,94,0.15)" stroke="#22c55e" strokeWidth="1.5" />
                                <circle cx={p.cx} cy={p.cy} r={4}  fill="#22c55e" />
                                <text x={p.lx} y={p.ly} fontSize="8" fill="#14532d" fontWeight="600">{p.label}</text>
                              </g>
                            ))}
                          </>
                        )}

                        {/* Legend */}
                        <g transform="translate(15, 380)">
                          <rect x="0" y="0" width="90" height="100" rx="6" fill="white" fillOpacity="0.9" stroke="#e2e8f0" strokeWidth="1" />
                          <text x="8" y="14" fontSize="8" fill="#475569" fontWeight="700" letterSpacing="0.5">RISK LEVEL</text>
                          {[
                            { label: "Critical", color: "#ef4444", y: 26 },
                            { label: "High",     color: "#f97316", y: 40 },
                            { label: "Medium",   color: "#f59e0b", y: 54 },
                            { label: "Low",      color: "#22c55e", y: 68 },
                            { label: "Safe",     color: "#15803d", y: 82 },
                          ].map(({ label, color, y }) => (
                            <g key={label}>
                              <circle cx="14" cy={y} r="4" fill={color} />
                              <text x="24" y={y + 3.5} fontSize="8" fill="#475569">{label}</text>
                            </g>
                          ))}
                        </g>
                      </svg>
                    )}
                    {/* Active event badge */}
                    <div className="absolute top-4 right-4 bg-white rounded-lg border border-slate-200 shadow-sm px-3 py-2 text-center">
                      <div className="text-lg font-bold text-red-600 num">{stats.totalDisruptions}</div>
                      <div className="text-[10px] text-slate-500 font-medium">Active Events</div>
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
