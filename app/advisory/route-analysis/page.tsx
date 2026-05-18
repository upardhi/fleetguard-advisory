"use client";
import { useState } from "react";
import TopBar from "@/app/_components/TopBar";
import RiskBadge from "@/app/_components/RiskBadge";
import DisruptionCard from "@/app/_components/DisruptionCard";
import { MOCK_DISRUPTIONS, VEHICLE_TYPES, CARGO_TYPES, MAJOR_CITIES } from "@/app/_lib/mockData";
import type { RiskLevel } from "@/app/_lib/types";
import {
  Route,
  Loader2,
  ArrowRight,
  Clock,
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ChevronRight,
  BarChart3,
} from "lucide-react";

const REC_CONFIG = {
  dispatch:  { label: "SAFE TO DISPATCH",    color: "bg-emerald-500", icon: CheckCircle,   bg: "bg-emerald-50 border-emerald-200" },
  delay:     { label: "DELAY RECOMMENDED",   color: "bg-amber-500",   icon: Clock,         bg: "bg-amber-50 border-amber-200" },
  reroute:   { label: "REROUTE REQUIRED",    color: "bg-orange-500",  icon: Route,         bg: "bg-orange-50 border-orange-200" },
  hold:      { label: "HOLD VEHICLE",         color: "bg-red-500",     icon: XCircle,       bg: "bg-red-50 border-red-200" },
};

interface AnalysisResult {
  riskScore: number;
  riskLevel: RiskLevel;
  delayProbability: number;
  etaImpactHours: number;
  recommendation: "dispatch" | "delay" | "reroute" | "hold";
  safeWindow: { from: string; to: string; confidence: number };
  aiNarrative: string;
  segments: { name: string; highway: string; riskLevel: RiskLevel; issue: string }[];
  alternativeRoutes: { id: string; label: string; via: string; extraKm: number; extraHours: number; riskLevel: RiskLevel; riskScore: number }[];
}

function simulateAnalysis(origin: string, destination: string, vehicleType: string): AnalysisResult {
  const seed = (origin + destination + vehicleType).length;
  const score = Math.min(95, 30 + (seed % 65));
  const level: RiskLevel = score >= 75 ? "high" : score >= 50 ? "medium" : score >= 25 ? "low" : "safe";
  const rec = score >= 75 ? "hold" : score >= 55 ? "reroute" : score >= 35 ? "delay" : "dispatch";
  const now = new Date();
  const safeFrom = new Date(now.getTime() + (score > 50 ? 6 : 2) * 3600000);
  const safeTo   = new Date(safeFrom.getTime() + 8 * 3600000);

  return {
    riskScore: score,
    riskLevel: level,
    delayProbability: Math.min(95, score + 10),
    etaImpactHours: Math.round((score / 15) * 10) / 10,
    recommendation: rec as "dispatch" | "delay" | "reroute" | "hold",
    safeWindow: {
      from: safeFrom.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      to:   safeTo.toLocaleTimeString("en-IN",   { hour: "2-digit", minute: "2-digit" }),
      confidence: 85 + (seed % 12),
    },
    aiNarrative: `Based on current intelligence aggregated across ${Math.floor(Math.random() * 8) + 4} live sources, the ${origin} to ${destination} corridor presents a ${level.toUpperCase()} risk profile for dispatch at this time. ${score > 50 ? `Key risk drivers include active disruptions on primary highway segments and weather advisories affecting route passability. The probability of ETA deviation exceeding 2 hours is ${score + 10}%.` : `The corridor is largely clear with minor disruptions noted. A ${Math.round(score / 10)}h ETA buffer is recommended as a precaution.`} Safe dispatch window is identified between ${safeFrom.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} and ${safeTo.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} IST with ${85 + (seed % 12)}% confidence.`,
    segments: [
      { name: `${origin} – Intermediate Hub`, highway: "NH44", riskLevel: level, issue: score > 60 ? "Active disruption on segment" : "Minor congestion" },
      { name: `Intermediate Hub – ${destination}`, highway: "NH48", riskLevel: score > 40 ? "medium" : "low", issue: "Weather advisory in effect" },
    ],
    alternativeRoutes: [
      {
        id: "alt1",
        label: "Via NH37 Bypass",
        via: "NH37 → SH12 → NH48",
        extraKm: 45,
        extraHours: 1.5,
        riskLevel: "low",
        riskScore: Math.max(15, score - 35),
      },
      {
        id: "alt2",
        label: "Via Inner Corridor",
        via: "State Highway 7 → NH19",
        extraKm: 72,
        extraHours: 2.5,
        riskLevel: "safe",
        riskScore: Math.max(8, score - 55),
      },
    ],
  };
}

const RISK_GAUGE_COLOR: Record<RiskLevel, string> = {
  critical: "text-red-600",
  high:     "text-orange-500",
  medium:   "text-amber-500",
  low:      "text-green-600",
  safe:     "text-emerald-600",
};

export default function RouteAnalysisPage() {
  const [origin,       setOrigin]       = useState("");
  const [destination,  setDestination]  = useState("");
  const [vehicleType,  setVehicleType]  = useState("");
  const [cargoType,    setCargoType]    = useState("");
  const [dispatchTime, setDispatchTime] = useState("");
  const [loading,      setLoading]      = useState(false);
  const [result,       setResult]       = useState<AnalysisResult | null>(null);

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    await new Promise((r) => setTimeout(r, 1800));
    setResult(simulateAnalysis(origin, destination, vehicleType));
    setLoading(false);
  }

  const activeDis = MOCK_DISRUPTIONS.filter((d) => d.risk === "critical" || d.risk === "high").slice(0, 2);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar
        title="Route Risk Analysis"
        subtitle="Enter dispatch details to generate a pre-departure risk assessment"
      />

      <div className="flex-1 overflow-auto">
        <div className="p-6 max-w-screen-2xl mx-auto">
          <div className="grid xl:grid-cols-3 gap-6">

            {/* Form panel */}
            <div className="xl:col-span-1">
              <form onSubmit={handleAnalyze} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
                  <div className="flex items-center gap-2">
                    <Route size={16} className="text-brand-600" />
                    <h2 className="text-sm font-semibold text-slate-800">Dispatch Parameters</h2>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">All fields required for accurate risk scoring</p>
                </div>

                <div className="p-5 space-y-4">
                  {/* Origin */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Origin</label>
                    <select
                      required
                      value={origin}
                      onChange={(e) => setOrigin(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
                    >
                      <option value="">Select origin city</option>
                      {MAJOR_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  {/* Destination */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Destination</label>
                    <select
                      required
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
                    >
                      <option value="">Select destination city</option>
                      {MAJOR_CITIES.filter((c) => c !== origin).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  {/* Vehicle type */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Vehicle Type</label>
                    <select
                      required
                      value={vehicleType}
                      onChange={(e) => setVehicleType(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
                    >
                      <option value="">Select vehicle type</option>
                      {VEHICLE_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>

                  {/* Cargo type */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Cargo Type</label>
                    <select
                      required
                      value={cargoType}
                      onChange={(e) => setCargoType(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
                    >
                      <option value="">Select cargo type</option>
                      {CARGO_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  {/* Dispatch time */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Planned Dispatch Time</label>
                    <input
                      type="datetime-local"
                      required
                      value={dispatchTime}
                      onChange={(e) => setDispatchTime(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 rounded-lg bg-brand-700 text-white text-sm font-semibold py-3 hover:bg-brand-600 disabled:opacity-60 transition"
                  >
                    {loading ? (
                      <><Loader2 size={15} className="animate-spin" /> Analyzing Route…</>
                    ) : (
                      <><BarChart3 size={15} /> Run Risk Analysis</>
                    )}
                  </button>
                </div>
              </form>

              {/* Active disruptions sidebar */}
              <div className="mt-4 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100">
                  <h3 className="text-sm font-semibold text-slate-800">Active High-Risk Events</h3>
                </div>
                <div className="p-3 space-y-2.5">
                  {activeDis.map((d) => <DisruptionCard key={d.id} d={d} />)}
                </div>
              </div>
            </div>

            {/* Results panel */}
            <div className="xl:col-span-2">
              {!result && !loading && (
                <div className="h-full flex flex-col items-center justify-center text-center py-20">
                  <div className="w-16 h-16 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center mb-4">
                    <Route size={28} className="text-brand-400" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-700 mb-2">Enter Route Details</h3>
                  <p className="text-sm text-slate-400 max-w-sm leading-relaxed">
                    Fill in dispatch parameters on the left to generate a comprehensive pre-departure risk assessment with AI advisory.
                  </p>
                </div>
              )}

              {loading && (
                <div className="h-full flex flex-col items-center justify-center text-center py-20">
                  <Loader2 size={40} className="animate-spin text-brand-500 mb-4" />
                  <p className="text-sm font-medium text-slate-600">Analyzing route intelligence…</p>
                  <p className="text-xs text-slate-400 mt-1">Scanning disruptions, weather, security alerts across corridor</p>
                </div>
              )}

              {result && (
                <div className="space-y-4">
                  {/* Risk score hero */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6">
                      <div className="flex items-start justify-between gap-6">
                        {/* Score circle */}
                        <div className="flex items-center gap-6">
                          <div className="relative w-24 h-24 shrink-0">
                            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                              <circle cx="50" cy="50" r="42" fill="none" stroke="#e2e8f0" strokeWidth="8" />
                              <circle
                                cx="50" cy="50" r="42"
                                fill="none"
                                stroke={result.riskScore >= 75 ? "#f97316" : result.riskScore >= 50 ? "#f59e0b" : "#22c55e"}
                                strokeWidth="8"
                                strokeLinecap="round"
                                strokeDasharray={`${(result.riskScore / 100) * 264} 264`}
                              />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <span className={`text-2xl font-bold num ${RISK_GAUGE_COLOR[result.riskLevel]}`}>
                                {result.riskScore}
                              </span>
                              <span className="text-[9px] text-slate-400 font-medium">/100</span>
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">Overall Risk Score</p>
                            <RiskBadge level={result.riskLevel} size="md" pulse={result.riskLevel === "high" || result.riskLevel === "critical"} />
                            <div className="mt-2 space-y-1">
                              <p className="text-xs text-slate-500">
                                Delay probability: <span className="font-bold text-orange-600">{result.delayProbability}%</span>
                              </p>
                              <p className="text-xs text-slate-500">
                                ETA impact: <span className="font-bold text-orange-600">+{result.etaImpactHours}h</span>
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Recommendation */}
                        {(() => {
                          const cfg = REC_CONFIG[result.recommendation];
                          const Icon = cfg.icon;
                          return (
                            <div className={`flex-1 rounded-xl border p-4 ${cfg.bg}`}>
                              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">AI Recommendation</p>
                              <div className="flex items-center gap-2">
                                <Icon size={18} className={result.recommendation === "dispatch" ? "text-emerald-600" : result.recommendation === "hold" ? "text-red-600" : "text-amber-600"} />
                                <span className="text-base font-bold text-slate-900">{cfg.label}</span>
                              </div>
                              <div className="mt-3 pt-3 border-t border-slate-200/60">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Safe Dispatch Window</p>
                                <p className="text-sm font-bold text-slate-800">
                                  {result.safeWindow.from} – {result.safeWindow.to} IST
                                </p>
                                <p className="text-[11px] text-slate-500">{result.safeWindow.confidence}% confidence</p>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* AI Narrative */}
                  <div className="bg-brand-950 rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 rounded-md bg-accent-500 flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-bold text-brand-950">AI</span>
                      </div>
                      <h3 className="text-sm font-semibold text-white">Intelligence Narrative</h3>
                    </div>
                    <p className="text-sm text-brand-100 leading-relaxed">{result.aiNarrative}</p>
                  </div>

                  {/* Route segments */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-slate-100">
                      <h3 className="text-sm font-semibold text-slate-800">Route Segment Analysis</h3>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {result.segments.map((seg, i) => (
                        <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                          <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{seg.name}</p>
                            <p className="text-xs text-slate-500">{seg.highway} — {seg.issue}</p>
                          </div>
                          <RiskBadge level={seg.riskLevel} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Alternative routes */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-slate-100">
                      <h3 className="text-sm font-semibold text-slate-800">Alternative Corridors</h3>
                    </div>
                    <div className="p-4 space-y-3">
                      {result.alternativeRoutes.map((alt) => (
                        <div key={alt.id} className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50 hover:bg-slate-100 transition-colors">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800">{alt.label}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{alt.via}</p>
                            <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                              <span>+{alt.extraKm} km</span>
                              <span>·</span>
                              <span>+{alt.extraHours}h ETA</span>
                              <span>·</span>
                              <span className="font-semibold">Risk score: {alt.riskScore}</span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <RiskBadge level={alt.riskLevel} />
                            <ChevronRight size={14} className="text-slate-400" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Route comparison */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-slate-100">
                      <h3 className="text-sm font-semibold text-slate-800">Route Comparison</h3>
                    </div>
                    <div className="p-5">
                      <div className="grid grid-cols-3 gap-4">
                        {[
                          { label: "Primary Route", score: result.riskScore, eta: "On schedule", level: result.riskLevel },
                          ...result.alternativeRoutes.map((a) => ({ label: a.label, score: a.riskScore, eta: `+${a.extraHours}h`, level: a.riskLevel })),
                        ].map((r) => (
                          <div key={r.label} className="text-center">
                            <p className="text-xs text-slate-500 font-medium mb-2 truncate">{r.label}</p>
                            <div className={`text-2xl font-bold num ${RISK_GAUGE_COLOR[r.level]}`}>{r.score}</div>
                            <RiskBadge level={r.level} size="xs" />
                            <p className="text-[11px] text-slate-400 mt-1">{r.eta}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
