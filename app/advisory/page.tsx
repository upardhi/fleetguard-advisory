"use client";
import { useState } from "react";
import { TopBar } from "@/app/_components/TopBar";
import { StatCard } from "@/app/_components/StatCard";
import RiskBadge from "@/app/_components/RiskBadge";
import DisruptionCard from "@/app/_components/DisruptionCard";
import AdvisoryCard from "@/app/_components/AdvisoryCard";
import { LiveIndicator } from "@/app/_components/LiveIndicator";
import {
  MOCK_DISRUPTIONS,
  MOCK_ADVISORIES,
  MOCK_REGION_RISKS,
  MOCK_STATS,
} from "@/app/_lib/mockData";
import { categoryIcon } from "@/app/_lib/utils";
import type { Disruption } from "@/app/_lib/types";
import {
  AlertTriangle,
  Zap,
  ShieldCheck,
  Map,
  BrainCircuit,
  ArrowRight,
  Clock,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";

const RISK_DOT: Record<string, string> = {
  critical: "w-3 h-3 rounded-full bg-red-500 live-dot-red",
  high:     "w-3 h-3 rounded-full bg-orange-500",
  medium:   "w-3 h-3 rounded-full bg-amber-500",
  low:      "w-3 h-3 rounded-full bg-green-500",
  safe:     "w-3 h-3 rounded-full bg-emerald-500",
};

const RISK_ROW: Record<string, string> = {
  critical: "border-l-4 border-red-500 bg-red-50/60",
  high:     "border-l-4 border-orange-400 bg-orange-50/60",
  medium:   "border-l-4 border-amber-400 bg-amber-50/40",
  low:      "border-l-4 border-green-400 bg-green-50/30",
  safe:     "border-l-4 border-emerald-400 bg-emerald-50/30",
};

export default function ControlTowerPage() {
  const [selected, setSelected] = useState<Disruption | null>(null);
  const top5 = MOCK_DISRUPTIONS.slice(0, 5);
  const urgentAdvisories = MOCK_ADVISORIES.filter((a) => a.isUrgent);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar
        title="Control Tower"
        subtitle="Pan-India disruption intelligence — pre-dispatch advisory"
      />

      {/* Alert ticker */}
      <div className="bg-brand-950 text-brand-100 text-xs py-1.5 px-4 overflow-hidden flex items-center gap-3 shrink-0">
        <span className="shrink-0 font-bold text-accent-400 tracking-wider">LIVE ALERTS</span>
        <div className="overflow-hidden flex-1">
          <div className="ticker flex gap-16 whitespace-nowrap">
            {MOCK_DISRUPTIONS.map((d) => (
              <span key={d.id} className="inline-flex items-center gap-2">
                <span>{categoryIcon(d.category)}</span>
                <span>{d.title}</span>
                <span className="text-brand-400">· {d.region}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-6 max-w-screen-2xl mx-auto">

          {/* Stats row */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <StatCard label="Active Disruptions" value={MOCK_STATS.totalDisruptions}  hint="Across all regions"   tone="warning" icon={AlertTriangle} />
            <StatCard label="Critical Alerts"     value={MOCK_STATS.criticalAlerts}    hint="Immediate action"     tone="danger"  icon={Zap}           />
            <StatCard label="High Risk Corridors" value={MOCK_STATS.highRiskCorridors} hint="Avoid or reroute"     tone="warning" icon={Map}            />
            <StatCard label="Safe Corridors"      value={MOCK_STATS.safeCorriders}     hint="Clear for dispatch"   tone="success" icon={ShieldCheck}    />
            <StatCard label="AI Advisories"       value={MOCK_STATS.pendingAdvisories} hint="Urgent actions"       tone="info"    icon={BrainCircuit}   />
            <StatCard label="Regions Affected"    value={MOCK_STATS.regionsAffected}   hint="Out of 28 monitored"  tone="brand"   icon={TrendingUp}     />
          </div>

          {/* Main grid: Map | Feed */}
          <div className="grid xl:grid-cols-5 gap-6">

            {/* Left: Region Risk Map (SVG-based) */}
            <div className="xl:col-span-3 space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Map size={15} className="text-brand-600" />
                    <h2 className="text-sm font-semibold text-slate-800">India Risk Map — Highway Corridors</h2>
                  </div>
                  <LiveIndicator />
                </div>

                {/* Simplified SVG India map with risk zones */}
                <div className="relative bg-slate-50 p-4" style={{ minHeight: 420 }}>
                  <svg
                    viewBox="0 0 500 560"
                    className="w-full h-full"
                    style={{ maxHeight: 420 }}
                  >
                    {/* India outline — simplified polygon */}
                    <path
                      d="M 180 40 L 200 30 L 230 28 L 270 35 L 310 50 L 340 70 L 360 100 L 370 130 L 380 160 L 375 190 L 390 220 L 400 250 L 410 280 L 400 310 L 385 340 L 370 360 L 350 380 L 330 400 L 310 420 L 290 445 L 270 465 L 255 490 L 245 510 L 235 490 L 215 470 L 200 450 L 185 430 L 165 410 L 148 390 L 135 370 L 120 350 L 110 320 L 105 290 L 108 260 L 115 230 L 120 200 L 115 170 L 120 145 L 130 120 L 145 95 L 160 70 Z"
                      fill="#e8f0fe"
                      stroke="#93c5fd"
                      strokeWidth="1.5"
                    />

                    {/* State boundaries — approximate lines */}
                    <line x1="180" y1="160" x2="340" y2="160" stroke="#bfdbfe" strokeWidth="0.8" strokeDasharray="4,3" />
                    <line x1="170" y1="260" x2="400" y2="260" stroke="#bfdbfe" strokeWidth="0.8" strokeDasharray="4,3" />
                    <line x1="175" y1="360" x2="390" y2="360" stroke="#bfdbfe" strokeWidth="0.8" strokeDasharray="0.8" />
                    <line x1="255" y1="40" x2="255" y2="510" stroke="#bfdbfe" strokeWidth="0.8" strokeDasharray="4,3" />

                    {/* NH44 corridor line */}
                    <path d="M 230 50 L 225 100 L 222 155 L 228 220 L 235 290 L 240 360 L 250 430" stroke="#94a3b8" strokeWidth="2" fill="none" strokeDasharray="6,3" />
                    <text x="196" y="140" fontSize="8" fill="#64748b" fontWeight="600">NH44</text>

                    {/* NH48 corridor line */}
                    <path d="M 155 300 L 180 330 L 200 360 L 215 390 L 225 420" stroke="#94a3b8" strokeWidth="2" fill="none" strokeDasharray="6,3" />
                    <text x="130" y="330" fontSize="8" fill="#64748b" fontWeight="600">NH48</text>

                    {/* NH16 corridor line */}
                    <path d="M 310 290 L 330 315 L 345 340 L 355 365" stroke="#94a3b8" strokeWidth="2" fill="none" strokeDasharray="6,3" />
                    <text x="352" y="320" fontSize="8" fill="#64748b" fontWeight="600">NH16</text>

                    {/* Risk zone markers */}
                    {/* Haryana — Critical */}
                    <circle cx="228" cy="120" r="16" fill="rgba(239,68,68,0.2)" stroke="#ef4444" strokeWidth="1.5" />
                    <circle cx="228" cy="120" r="6" fill="#ef4444" />
                    <text x="247" y="118" fontSize="9" fill="#991b1b" fontWeight="700">Haryana</text>
                    <text x="247" y="128" fontSize="8" fill="#dc2626">CRITICAL</text>

                    {/* Odisha — Critical */}
                    <circle cx="340" cy="310" r="16" fill="rgba(239,68,68,0.2)" stroke="#ef4444" strokeWidth="1.5" />
                    <circle cx="340" cy="310" r="6" fill="#ef4444" />
                    <text x="358" y="308" fontSize="9" fill="#991b1b" fontWeight="700">Odisha</text>
                    <text x="358" y="318" fontSize="8" fill="#dc2626">CRITICAL</text>

                    {/* Maharashtra — High */}
                    <circle cx="185" cy="295" r="14" fill="rgba(249,115,22,0.2)" stroke="#f97316" strokeWidth="1.5" />
                    <circle cx="185" cy="295" r="5" fill="#f97316" />
                    <text x="125" y="293" fontSize="9" fill="#7c2d12" fontWeight="700">Mah.</text>
                    <text x="118" y="303" fontSize="8" fill="#ea580c">HIGH</text>

                    {/* Karnataka — High */}
                    <circle cx="215" cy="400" r="12" fill="rgba(249,115,22,0.2)" stroke="#f97316" strokeWidth="1.5" />
                    <circle cx="215" cy="400" r="5" fill="#f97316" />
                    <text x="228" y="398" fontSize="9" fill="#7c2d12" fontWeight="700">Karnataka</text>
                    <text x="228" y="408" fontSize="8" fill="#ea580c">HIGH</text>

                    {/* Rajasthan — High */}
                    <circle cx="160" cy="190" r="12" fill="rgba(249,115,22,0.2)" stroke="#f97316" strokeWidth="1.5" />
                    <circle cx="160" cy="190" r="5" fill="#f97316" />
                    <text x="118" y="188" fontSize="9" fill="#7c2d12" fontWeight="700">Raj.</text>
                    <text x="114" y="198" fontSize="8" fill="#ea580c">HIGH</text>

                    {/* UP — Medium */}
                    <circle cx="290" cy="175" r="11" fill="rgba(245,158,11,0.2)" stroke="#f59e0b" strokeWidth="1.5" />
                    <circle cx="290" cy="175" r="4.5" fill="#f59e0b" />
                    <text x="303" y="173" fontSize="9" fill="#78350f" fontWeight="700">UP</text>
                    <text x="300" y="183" fontSize="8" fill="#d97706">MEDIUM</text>

                    {/* Assam — Medium */}
                    <circle cx="388" cy="165" r="10" fill="rgba(245,158,11,0.2)" stroke="#f59e0b" strokeWidth="1.5" />
                    <circle cx="388" cy="165" r="4" fill="#f59e0b" />
                    <text x="370" y="150" fontSize="8" fill="#92400e" fontWeight="700">Assam</text>

                    {/* Tamil Nadu — Safe */}
                    <circle cx="245" cy="470" r="10" fill="rgba(34,197,94,0.2)" stroke="#22c55e" strokeWidth="1.5" />
                    <circle cx="245" cy="470" r="4" fill="#22c55e" />
                    <text x="257" y="468" fontSize="9" fill="#14532d" fontWeight="700">TN</text>
                    <text x="255" y="478" fontSize="8" fill="#16a34a">SAFE</text>

                    {/* Gujarat — Safe */}
                    <circle cx="130" cy="235" r="10" fill="rgba(34,197,94,0.2)" stroke="#22c55e" strokeWidth="1.5" />
                    <circle cx="130" cy="235" r="4" fill="#22c55e" />
                    <text x="113" y="222" fontSize="8" fill="#14532d" fontWeight="700">Guj.</text>

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

                  {/* Active disruption count badge */}
                  <div className="absolute top-4 right-4 bg-white rounded-lg border border-slate-200 shadow-sm px-3 py-2 text-center">
                    <div className="text-lg font-bold text-red-600 num">{MOCK_STATS.totalDisruptions}</div>
                    <div className="text-[10px] text-slate-500 font-medium">Active Events</div>
                  </div>
                </div>
              </div>

              {/* Region risk table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-800">Regional Risk Snapshot</h2>
                  <span className="text-xs text-slate-400">{new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", timeStyle: "short", dateStyle: "medium" })} IST</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {MOCK_REGION_RISKS.map((r) => (
                    <div key={r.region} className={`flex items-center gap-3 px-5 py-2.5 ${RISK_ROW[r.riskLevel]}`}>
                      <span className={`shrink-0 ${RISK_DOT[r.riskLevel]}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">{r.region}</p>
                        <p className="text-[11px] text-slate-500 truncate">{r.keyIssue}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[11px] text-slate-400">{r.state}</span>
                        <RiskBadge level={r.riskLevel} size="xs" />
                        {r.activeDisruptions > 0 && (
                          <span className="text-[10px] font-semibold text-slate-500">{r.activeDisruptions} event{r.activeDisruptions > 1 ? "s" : ""}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Live Feed */}
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
                  {urgentAdvisories.map((a) => (
                    <AdvisoryCard key={a.id} a={a} compact />
                  ))}
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
                  {top5.map((d) => (
                    <DisruptionCard
                      key={d.id}
                      d={d}
                      selected={selected?.id === d.id}
                      onClick={() => setSelected(d.id === selected?.id ? null : d)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Detail drawer */}
          {selected && (
            <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-white border-l border-slate-200 shadow-2xl z-50 flex flex-col slide-in">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-900">Disruption Detail</h2>
                <button
                  onClick={() => setSelected(null)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <RiskBadge level={selected.risk} size="md" pulse={selected.risk === "critical"} />
                  <h3 className="text-base font-semibold text-slate-900 leading-tight">{selected.title}</h3>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Region</p>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5">{selected.region}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Highway</p>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5">{selected.highway ?? "—"}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">ETA Impact</p>
                    <p className="text-sm font-semibold text-orange-600 mt-0.5">+{selected.eta_impact_hours}h</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Source</p>
                    <p className="text-xs text-slate-700 mt-0.5 truncate">{selected.source}</p>
                  </div>
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
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Affected Routes</h4>
                    <div className="flex flex-wrap gap-2">
                      {selected.affectedRoutes.map((r) => (
                        <span key={r} className="px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium border border-brand-200">{r}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
