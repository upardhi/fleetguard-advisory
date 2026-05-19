"use client";
import { useState, useEffect, useMemo } from "react";
import { TopBar } from "@/app/_components/TopBar";
import RiskBadge from "@/app/_components/RiskBadge";
import {
  Route, Loader2, Clock, CheckCircle, XCircle,
  BarChart3, Navigation, Zap, MapPin, ArrowRight,
} from "lucide-react";
import type { RiskLevel } from "@/app/_lib/types";
import Link from "next/link";

interface Corridor { id: string; name: string; origin: string; destination: string }

interface WatchedSegment {
  id: string;
  route_variant: number;
  name: string;
  state: string | null;
  seq: number;
  has_disruption: boolean;
  disruption_risk_level: RiskLevel | null;
  disruption_title: string | null;
  disruption_eta_hours: number | null;
}

interface VariantAnalysis {
  variant: number;
  label: string;
  segmentCount: number;
  disruptedCount: number;
  totalEta: number;
  maxRisk: RiskLevel;
  riskScore: number;
  disruptions: WatchedSegment[];
}

const RISK_ORDER: Record<string, number> = { critical: 5, high: 4, medium: 3, low: 2, safe: 1 };
const RISK_BASE_SCORE: Record<string, number> = { critical: 88, high: 68, medium: 44, low: 18, safe: 4 };

const REC_CONFIG = {
  dispatch: { label: "SAFE TO DISPATCH",  icon: CheckCircle, bg: "bg-emerald-50 border-emerald-200" },
  delay:    { label: "DELAY RECOMMENDED", icon: Clock,       bg: "bg-amber-50 border-amber-200" },
  reroute:  { label: "REROUTE REQUIRED",  icon: Route,       bg: "bg-orange-50 border-orange-200" },
  hold:     { label: "HOLD VEHICLE",       icon: XCircle,     bg: "bg-red-50 border-red-200" },
};

const RISK_GAUGE_COLOR: Record<RiskLevel, string> = {
  critical: "text-red-600", high: "text-orange-500",
  medium: "text-amber-500", low: "text-green-600", safe: "text-emerald-600",
};

function riskDotCls(r: RiskLevel): string {
  return { critical: "bg-red-500", high: "bg-orange-500", medium: "bg-yellow-400", low: "bg-blue-400", safe: "bg-green-400" }[r] ?? "bg-green-400";
}

function riskToRec(risk: RiskLevel): "dispatch" | "delay" | "reroute" | "hold" {
  if (risk === "critical") return "hold";
  if (risk === "high") return "reroute";
  if (risk === "medium") return "delay";
  return "dispatch";
}

function variantLabel(idx: number) {
  return idx === 0 ? "Primary Route" : `Alternative ${idx}`;
}

function computeVariant(segments: WatchedSegment[], variant: number): VariantAnalysis {
  const vSegs = segments.filter((s) => s.route_variant === variant);
  const disrupted = vSegs.filter((s) => s.has_disruption);
  const totalEta = disrupted.reduce((sum, s) => sum + (s.disruption_eta_hours ?? 0), 0);
  const maxRisk = disrupted.reduce<RiskLevel>((best, s) => {
    const sl = s.disruption_risk_level as RiskLevel;
    return (RISK_ORDER[sl] ?? 0) > (RISK_ORDER[best] ?? 0) ? sl : best;
  }, "safe");
  const densityPenalty = vSegs.length > 0 ? (disrupted.length / vSegs.length) * 35 : 0;
  const riskScore = disrupted.length === 0 ? 4
    : Math.min(95, Math.round((RISK_BASE_SCORE[maxRisk] ?? 20) * 0.65 + densityPenalty));
  return { variant, label: variantLabel(variant), segmentCount: vSegs.length, disruptedCount: disrupted.length, totalEta, maxRisk, riskScore, disruptions: disrupted };
}

export default function RouteAnalysisPage() {
  const [corridors, setCorridors]       = useState<Corridor[]>([]);
  const [loadingCors, setLoadingCors]   = useState(true);
  const [selectedId, setSelectedId]     = useState<string>("");
  const [segments, setSegments]         = useState<WatchedSegment[] | null>(null);
  const [loadingAna, setLoadingAna]     = useState(false);

  useEffect(() => {
    fetch("/api/advisory/v1/intelligence", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { corridors: Corridor[] }) => setCorridors(d.corridors ?? []))
      .catch(console.error)
      .finally(() => setLoadingCors(false));
  }, []);

  async function handleAnalyze() {
    if (!selectedId) return;
    setLoadingAna(true);
    setSegments(null);
    try {
      const res = await fetch(`/api/advisory/v1/watched-routes/${selectedId}`, { credentials: "include" });
      if (res.ok) {
        const d = await res.json() as { segments: WatchedSegment[] };
        setSegments(d.segments ?? []);
      }
    } finally { setLoadingAna(false); }
  }

  const selectedCorridor = useMemo(() => corridors.find((c) => c.id === selectedId), [corridors, selectedId]);

  const variants = useMemo(() => {
    if (!segments) return [];
    return Array.from(new Set(segments.map((s) => s.route_variant))).sort();
  }, [segments]);

  const analyses = useMemo(() => {
    if (!segments) return [];
    return variants.map((v) => computeVariant(segments, v));
  }, [segments, variants]);

  const primary = analyses.find((v) => v.variant === 0);

  const bestAlt = analyses
    .filter((v) => v.variant !== 0)
    .reduce<VariantAnalysis | null>((best, v) => {
      if (!best) return v;
      if ((RISK_ORDER[v.maxRisk] ?? 0) < (RISK_ORDER[best.maxRisk] ?? 0)) return v;
      if ((RISK_ORDER[v.maxRisk] ?? 0) === (RISK_ORDER[best.maxRisk] ?? 0) && v.totalEta < best.totalEta) return v;
      return best;
    }, null);

  const overallRec = primary ? riskToRec(primary.maxRisk) : "dispatch";

  function buildNarrative(): string {
    if (!primary || !selectedCorridor) return "";
    const altLine = bestAlt && (RISK_ORDER[bestAlt.maxRisk] ?? 0) < (RISK_ORDER[primary.maxRisk] ?? 0)
      ? ` Recommended alternative: ${bestAlt.label} with only ${bestAlt.disruptedCount} disruption${bestAlt.disruptedCount !== 1 ? "s" : ""} and +${bestAlt.totalEta}h impact — significantly safer than primary.`
      : bestAlt ? " All variants carry similar risk profiles." : "";
    if (primary.maxRisk === "safe" || primary.maxRisk === "low") {
      return `The ${selectedCorridor.origin} → ${selectedCorridor.destination} corridor is currently ${primary.maxRisk === "safe" ? "clear" : "low-risk"} with ${primary.disruptedCount} minor disruption${primary.disruptedCount !== 1 ? "s" : ""} on the primary route. Safe to dispatch with minimal ETA impact expected.${altLine}`;
    }
    return `The ${selectedCorridor.origin} → ${selectedCorridor.destination} corridor has ${primary.disruptedCount} active disruption${primary.disruptedCount !== 1 ? "s" : ""} on the primary route with a ${primary.maxRisk.toUpperCase()} risk profile. Total ETA impact: +${primary.totalEta}h. Immediate action recommended before dispatch.${altLine}`;
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar
        title="Route Risk Analysis"
        subtitle="Analyze watched corridors for pre-departure risk assessment"
      />

      <div className="flex-1 overflow-auto">
        <div className="p-6 max-w-screen-2xl mx-auto">
          <div className="grid xl:grid-cols-3 gap-6 items-start">

            {/* Left: corridor selector */}
            <div className="xl:col-span-1 space-y-4 sticky top-6">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
                  <div className="flex items-center gap-2">
                    <Route size={16} className="text-brand-600" />
                    <h2 className="text-sm font-semibold text-slate-800">Select Corridor</h2>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">Choose a watched corridor to analyze</p>
                </div>

                <div className="p-5 space-y-4">
                  {loadingCors ? (
                    <div className="flex items-center justify-center gap-2 text-slate-400 text-sm py-6">
                      <Loader2 size={16} className="animate-spin" /> Loading corridors…
                    </div>
                  ) : corridors.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      <Route size={28} className="mx-auto mb-2 opacity-40" />
                      <p className="text-sm font-medium mb-1">No watched corridors</p>
                      <p className="text-xs text-slate-400 mb-4">Add corridors to start analyzing routes.</p>
                      <Link
                        href="/advisory/planned"
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-brand-700 text-white hover:bg-brand-800 transition"
                      >
                        Go to Watched Corridors <ArrowRight size={11} />
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {corridors.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setSelectedId(c.id)}
                          className={`w-full text-left px-3.5 py-3 rounded-xl border transition-all ${
                            selectedId === c.id
                              ? "border-brand-300 bg-brand-50 ring-1 ring-brand-200"
                              : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Navigation size={12} className={selectedId === c.id ? "text-brand-600" : "text-slate-400"} />
                            <span className="text-xs font-semibold text-slate-700 truncate">
                              {c.origin} → {c.destination}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 mt-0.5 block pl-5">{c.name}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {corridors.length > 0 && (
                    <button
                      onClick={() => void handleAnalyze()}
                      disabled={!selectedId || loadingAna}
                      className="w-full flex items-center justify-center gap-2 rounded-lg bg-brand-700 text-white text-sm font-semibold py-3 hover:bg-brand-600 disabled:opacity-60 transition"
                    >
                      {loadingAna ? (
                        <><Loader2 size={15} className="animate-spin" /> Analyzing…</>
                      ) : (
                        <><BarChart3 size={15} /> Run Risk Analysis</>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Variant summary card */}
              {analyses.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-100">
                    <h3 className="text-sm font-semibold text-slate-800">Route Variants</h3>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {analyses.map((va) => (
                      <div key={va.variant} className="px-4 py-3 flex items-center gap-3">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${riskDotCls(va.maxRisk)}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-700">{va.label}</p>
                          <p className="text-[10px] text-slate-400">
                            {va.segmentCount} segs · {va.disruptedCount} disrupted · +{va.totalEta}h ETA
                          </p>
                        </div>
                        <RiskBadge level={va.maxRisk} size="xs" />
                      </div>
                    ))}
                  </div>
                  {bestAlt && primary && (RISK_ORDER[bestAlt.maxRisk] ?? 0) < (RISK_ORDER[primary.maxRisk] ?? 0) && (
                    <div className="px-4 py-3 bg-emerald-50 border-t border-emerald-200">
                      <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide mb-0.5">Recommended</p>
                      <p className="text-xs text-emerald-800 font-semibold">
                        Use {bestAlt.label} — {bestAlt.disruptedCount} vs {primary.disruptedCount} disruptions on primary
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right: analysis results */}
            <div className="xl:col-span-2">
              {!segments && !loadingAna && (
                <div className="h-full flex flex-col items-center justify-center text-center py-20">
                  <div className="w-16 h-16 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center mb-4">
                    <Route size={28} className="text-brand-400" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-700 mb-2">
                    {corridors.length === 0 ? "No Corridors Available" : "Select a Corridor"}
                  </h3>
                  <p className="text-sm text-slate-400 max-w-sm leading-relaxed">
                    {corridors.length === 0
                      ? "Add watched corridors first, then run intelligence to generate risk data."
                      : "Pick a corridor from the left panel and click Run Risk Analysis."}
                  </p>
                </div>
              )}

              {loadingAna && (
                <div className="h-full flex flex-col items-center justify-center text-center py-20">
                  <Loader2 size={40} className="animate-spin text-brand-500 mb-4" />
                  <p className="text-sm font-medium text-slate-600">Analyzing corridor intelligence…</p>
                  <p className="text-xs text-slate-400 mt-1">Scanning disruptions across all route variants</p>
                </div>
              )}

              {segments && primary && selectedCorridor && (
                <div className="space-y-4">
                  {/* Risk score hero */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6">
                      <div className="flex items-start justify-between gap-6 flex-wrap">
                        {/* Score gauge */}
                        <div className="flex items-center gap-6">
                          <div className="relative w-24 h-24 shrink-0">
                            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                              <circle cx="50" cy="50" r="42" fill="none" stroke="#e2e8f0" strokeWidth="8" />
                              <circle
                                cx="50" cy="50" r="42" fill="none"
                                stroke={primary.riskScore >= 70 ? "#f97316" : primary.riskScore >= 40 ? "#f59e0b" : "#22c55e"}
                                strokeWidth="8" strokeLinecap="round"
                                strokeDasharray={`${(primary.riskScore / 100) * 264} 264`}
                              />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <span className={`text-2xl font-bold num ${RISK_GAUGE_COLOR[primary.maxRisk]}`}>
                                {primary.riskScore}
                              </span>
                              <span className="text-[9px] text-slate-400 font-medium">/100</span>
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">Primary Route Risk</p>
                            <RiskBadge level={primary.maxRisk} size="md" pulse={primary.maxRisk === "critical"} />
                            <div className="mt-2 space-y-1">
                              <p className="text-xs text-slate-500">
                                Disrupted: <span className="font-bold text-orange-600">{primary.disruptedCount}/{primary.segmentCount} segs</span>
                              </p>
                              <p className="text-xs text-slate-500">
                                ETA impact: <span className="font-bold text-orange-600">+{primary.totalEta}h</span>
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Recommendation */}
                        {(() => {
                          const cfg = REC_CONFIG[overallRec];
                          const Icon = cfg.icon;
                          return (
                            <div className={`flex-1 min-w-48 rounded-xl border p-4 ${cfg.bg}`}>
                              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">AI Recommendation</p>
                              <div className="flex items-center gap-2">
                                <Icon size={18} className={overallRec === "dispatch" ? "text-emerald-600" : overallRec === "hold" ? "text-red-600" : "text-amber-600"} />
                                <span className="text-base font-bold text-slate-900">{cfg.label}</span>
                              </div>
                              {bestAlt && (RISK_ORDER[bestAlt.maxRisk] ?? 0) < (RISK_ORDER[primary.maxRisk] ?? 0) && (
                                <div className="mt-3 pt-3 border-t border-slate-200/60">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Safer Alternative Available</p>
                                  <p className="text-sm font-bold text-slate-800">{bestAlt.label}</p>
                                  <p className="text-[11px] text-slate-500">{bestAlt.disruptedCount} disruptions · +{bestAlt.totalEta}h ETA</p>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Intelligence narrative */}
                  <div className="bg-brand-950 rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 rounded-md bg-accent-500 flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-bold text-brand-950">AI</span>
                      </div>
                      <h3 className="text-sm font-semibold text-white">Intelligence Narrative</h3>
                    </div>
                    <p className="text-sm text-brand-100 leading-relaxed">{buildNarrative()}</p>
                  </div>

                  {/* Variant comparison */}
                  {analyses.length > 0 && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="px-5 py-3.5 border-b border-slate-100">
                        <h3 className="text-sm font-semibold text-slate-800">Route Variant Comparison</h3>
                      </div>
                      <div className="p-4">
                        <div className={`grid gap-4 ${analyses.length >= 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                          {analyses.map((va) => {
                            const isBest = bestAlt?.variant === va.variant
                              && !!primary
                              && (RISK_ORDER[bestAlt.maxRisk] ?? 0) < (RISK_ORDER[primary.maxRisk] ?? 0);
                            return (
                              <div
                                key={va.variant}
                                className={`rounded-xl border p-4 ${isBest ? "border-emerald-300 bg-emerald-50" : va.variant === 0 ? "border-slate-200 bg-slate-50" : "border-slate-100 bg-white"}`}
                              >
                                <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                                  <span className={`w-2 h-2 rounded-full shrink-0 ${riskDotCls(va.maxRisk)}`} />
                                  <p className="text-xs font-semibold text-slate-700">{va.label}</p>
                                  {isBest && <span className="text-[9px] font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full ml-auto">BEST</span>}
                                  {va.variant === 0 && !isBest && <span className="text-[9px] text-slate-400 ml-auto">Primary</span>}
                                </div>
                                <div className={`text-2xl font-bold num ${RISK_GAUGE_COLOR[va.maxRisk]} mb-1`}>{va.riskScore}</div>
                                <RiskBadge level={va.maxRisk} size="xs" />
                                <div className="mt-2 space-y-0.5 text-[11px] text-slate-500">
                                  <p>{va.disruptedCount}/{va.segmentCount} segments affected</p>
                                  <p className={va.totalEta > 0 ? "text-orange-600 font-semibold" : "text-green-600"}>
                                    {va.totalEta > 0 ? `+${va.totalEta}h delay` : "No delay"}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Primary disruption list */}
                  {primary.disruptions.length > 0 ? (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-800">Primary Route Disruptions</h3>
                        <span className="text-xs text-slate-400">{primary.disruptions.length} active</span>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {primary.disruptions.map((seg, i) => (
                          <div key={seg.id} className="flex items-start gap-4 px-5 py-3.5">
                            <div className="w-6 h-6 rounded-full bg-red-100 text-red-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-800">{seg.name}</p>
                              {seg.disruption_title && (
                                <p className="text-xs text-slate-500 mt-0.5">{seg.disruption_title}</p>
                              )}
                              <div className="flex items-center gap-3 mt-1 text-[11px]">
                                {seg.state && <span className="text-slate-400 flex items-center gap-0.5"><MapPin size={9} />{seg.state}</span>}
                                {(seg.disruption_eta_hours ?? 0) > 0 && (
                                  <span className="text-orange-600 font-semibold">+{seg.disruption_eta_hours}h delay</span>
                                )}
                              </div>
                            </div>
                            <RiskBadge level={seg.disruption_risk_level ?? "low"} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-6 py-8 text-center">
                      <CheckCircle size={28} className="mx-auto mb-2 text-emerald-500" />
                      <p className="text-sm font-semibold text-emerald-800">Primary route is clear</p>
                      <p className="text-xs text-emerald-600 mt-1">No active disruptions on primary route segments.</p>
                    </div>
                  )}

                  {/* Best alt disruptions (if it differs from primary) */}
                  {bestAlt && bestAlt.disruptions.length > 0 && (RISK_ORDER[bestAlt.maxRisk] ?? 0) < (RISK_ORDER[primary.maxRisk] ?? 0) && (
                    <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm overflow-hidden">
                      <div className="px-5 py-3.5 border-b border-emerald-100 bg-emerald-50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Zap size={14} className="text-emerald-600" />
                          <h3 className="text-sm font-semibold text-emerald-800">{bestAlt.label} — Remaining Disruptions</h3>
                        </div>
                        <RiskBadge level={bestAlt.maxRisk} size="xs" />
                      </div>
                      <div className="divide-y divide-slate-100">
                        {bestAlt.disruptions.map((seg, i) => (
                          <div key={seg.id} className="flex items-start gap-4 px-5 py-3.5">
                            <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-800">{seg.name}</p>
                              {seg.disruption_title && <p className="text-xs text-slate-500 mt-0.5">{seg.disruption_title}</p>}
                              {(seg.disruption_eta_hours ?? 0) > 0 && (
                                <p className="text-xs text-orange-600 font-semibold mt-0.5">+{seg.disruption_eta_hours}h</p>
                              )}
                            </div>
                            <RiskBadge level={seg.disruption_risk_level ?? "low"} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* View corridor detail link */}
                  <div className="text-center">
                    <Link
                      href={`/advisory/planned/${selectedId}`}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg border border-brand-200 text-brand-700 hover:bg-brand-50 transition"
                    >
                      View Full Corridor Detail <ArrowRight size={13} />
                    </Link>
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
