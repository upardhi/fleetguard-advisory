"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Navigation, AlertTriangle, CheckCircle2, Clock, TrendingUp,
  ArrowRight, Loader2, ChevronDown, ChevronUp, Info,
} from "lucide-react";
import { TopBar } from "@/app/_components/TopBar";
import { usePlanStore } from "@/app/_hooks/usePlanStore";
import {
  MAJOR_CITIES, VEHICLE_TYPES, CARGO_TYPES, MOCK_DISRUPTIONS,
} from "@/app/_lib/mockData";
import type { DispatchPlan, RiskLevel, AlternativeRoute } from "@/app/_lib/types";

// ── Risk helpers ─────────────────────────────────────────────────

function riskColor(r: RiskLevel) {
  return {
    critical: "text-red-700 bg-red-50 border-red-200",
    high: "text-orange-700 bg-orange-50 border-orange-200",
    medium: "text-yellow-700 bg-yellow-50 border-yellow-200",
    low: "text-blue-700 bg-blue-50 border-blue-200",
    safe: "text-green-700 bg-green-50 border-green-200",
  }[r];
}

function riskGauge(score: number) {
  if (score >= 80) return { label: "Critical", color: "#dc2626", bg: "#fee2e2" };
  if (score >= 60) return { label: "High", color: "#ea580c", bg: "#fff7ed" };
  if (score >= 40) return { label: "Medium", color: "#ca8a04", bg: "#fefce8" };
  if (score >= 20) return { label: "Low", color: "#2563eb", bg: "#eff6ff" };
  return { label: "Safe", color: "#16a34a", bg: "#f0fdf4" };
}

const REC_CONFIG = {
  dispatch: { label: "Dispatch as planned", icon: CheckCircle2, cls: "text-green-700 bg-green-50 border-green-200" },
  delay: { label: "Delay recommended", icon: Clock, cls: "text-yellow-700 bg-yellow-50 border-yellow-200" },
  reroute: { label: "Reroute required", icon: TrendingUp, cls: "text-orange-700 bg-orange-50 border-orange-200" },
  hold: { label: "Hold — do not dispatch", icon: AlertTriangle, cls: "text-red-700 bg-red-50 border-red-200" },
  dispatch_early: { label: "Dispatch early", icon: Navigation, cls: "text-blue-700 bg-blue-50 border-blue-200" },
};

// ── Corridor analysis engine (mock intelligence) ─────────────────

interface Analysis {
  riskScore: number;
  riskLevel: RiskLevel;
  recommendation: DispatchPlan["recommendation"];
  etaImpactHours: number;
  safeWindowFrom: string;
  safeWindowTo: string;
  affectedDisruptionIds: string[];
  alternativeRoutes: AlternativeRoute[];
  aiNarrative: string;
}

function analyzeRoute(origin: string, destination: string, _date: string, _time: string): Analysis {
  const corridor = `${origin}–${destination}`.toLowerCase();
  const matched = MOCK_DISRUPTIONS.filter((d) => {
    const routes = d.affectedRoutes.map((r) => r.toLowerCase());
    return routes.some(
      (r) =>
        r.includes(origin.toLowerCase()) ||
        r.includes(destination.toLowerCase()) ||
        corridor.includes(d.region.toLowerCase())
    );
  });

  const maxRisk = matched.reduce((acc, d) => {
    const order: RiskLevel[] = ["safe", "low", "medium", "high", "critical"];
    return order.indexOf(d.risk) > order.indexOf(acc) ? d.risk : acc;
  }, "safe" as RiskLevel);

  const totalImpact = matched.reduce((s, d) => s + d.eta_impact_hours, 0);
  const score = Math.min(95, matched.length * 18 + (totalImpact > 5 ? 30 : totalImpact * 4));

  const now = new Date();
  const safeFrom = new Date(now.getTime() + (totalImpact + 4) * 3600000).toISOString();
  const safeTo = new Date(now.getTime() + (totalImpact + 14) * 3600000).toISOString();

  let recommendation: DispatchPlan["recommendation"] = "dispatch";
  if (score >= 80) recommendation = "hold";
  else if (score >= 60) recommendation = "reroute";
  else if (score >= 40) recommendation = "delay";

  const alts: AlternativeRoute[] = matched.length > 0 ? [
    {
      label: "Alternate inland route",
      via: "State highway bypass",
      extraKm: Math.round(30 + matched.length * 15),
      extraHours: matched.length * 0.5 + 0.5,
      riskLevel: "low",
      riskScore: Math.max(10, score - 40),
    },
    {
      label: "Delayed departure (off-peak)",
      via: "Original route after disruption clears",
      extraKm: 0,
      extraHours: totalImpact + 2,
      riskLevel: "safe",
      riskScore: 12,
    },
  ] : [];

  let aiNarrative = "";
  if (matched.length === 0) {
    aiNarrative = `No active disruptions detected on the ${origin}–${destination} corridor. Road conditions are clear. Dispatch as planned. Monitor 1h before departure for any late-breaking advisories.`;
  } else if (score >= 80) {
    aiNarrative = `⚠️ ${matched.length} critical disruption(s) detected on the ${origin}–${destination} corridor. ${matched.map((d) => d.title).join("; ")}. Total estimated delay: ${totalImpact}h. Holding the dispatch is strongly advised until the corridor clears.`;
  } else if (score >= 60) {
    aiNarrative = `${matched.length} disruption(s) are active on your planned route. ${matched[0].title}. An alternate route is recommended to avoid ${totalImpact}h of delay. The inland bypass adds distance but significantly reduces risk.`;
  } else if (score >= 40) {
    aiNarrative = `Minor disruption detected: ${matched[0].title}. Expected impact ~${totalImpact}h. Consider delaying departure by 2–3h to clear the bottleneck, or add a buffer ETA when communicating with the receiving team.`;
  } else {
    aiNarrative = `Low-risk corridor with minor activity. ${matched[0]?.summary ?? "No major disruptions."} Add a ~${totalImpact}h buffer but dispatch can proceed.`;
  }

  return {
    riskScore: score,
    riskLevel: maxRisk,
    recommendation,
    etaImpactHours: totalImpact,
    safeWindowFrom: safeFrom,
    safeWindowTo: safeTo,
    affectedDisruptionIds: matched.map((d) => d.id),
    alternativeRoutes: alts,
    aiNarrative,
  };
}

function CitySelect({
  label,
  value,
  onChange,
  exclude,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  exclude?: string;
}) {
  const isCustom = value !== "" && !MAJOR_CITIES.includes(value);
  const [mode, setMode] = useState<"list" | "custom">(isCustom ? "custom" : "list");
  const [customVal, setCustomVal] = useState(isCustom ? value : "");

  function handleSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    if (v === "__custom__") {
      setMode("custom");
      onChange(""); // clear until user types
    } else {
      setMode("list");
      onChange(v);
    }
  }

  function handleCustomChange(e: React.ChangeEvent<HTMLInputElement>) {
    setCustomVal(e.target.value);
    onChange(e.target.value);
  }

  return (
    <Field label={label}>
      {mode === "list" ? (
        <select
          value={value}
          onChange={handleSelectChange}
          className={selectCls}
        >
          <option value="">Select city…</option>
           <option value="__custom__">＋ Add custom city…</option>
          {MAJOR_CITIES.filter((c) => c !== exclude).map((c) => (
            <option key={c}>{c}</option>
          ))}
         
        </select>
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            value={customVal}
            onChange={handleCustomChange}
            autoFocus
            placeholder="Type city name…"
            className={inputCls + " flex-1"}
          />
          <button
            type="button"
            onClick={() => { setMode("list"); setCustomVal(""); onChange(""); }}
            className="px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition"
          >
            ✕
          </button>
        </div>
      )}
    </Field>
  );
}

// ── Page ─────────────────────────────────────────────────────────

export default function DispatchPlannerPage() {
  const router = useRouter();
  const { addPlan } = usePlanStore();

  const [form, setForm] = useState({
    origin: "", destination: "", vehicleType: "", cargoType: "",
    plannedDate: new Date().toISOString().slice(0, 10), plannedTime: "08:00", notes: "",
  });
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showRoutes, setShowRoutes] = useState(false);

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    setAnalysis(null);
    setSaved(false);
  }

  async function analyze() {
    if (!form.origin || !form.destination) return;
    setAnalyzing(true);
    setAnalysis(null);
    await new Promise((r) => setTimeout(r, 900));
    setAnalysis(analyzeRoute(form.origin, form.destination, form.plannedDate, form.plannedTime));
    setAnalyzing(false);
  }

  function savePlan() {
    if (!analysis) return;
    const plan: DispatchPlan = {
      id: `plan_${Date.now()}`,
      ...form,
      ...analysis,
      status: "draft",
      createdAt: new Date().toISOString(),
    };
    addPlan(plan);
    setSaved(true);
  }

  const gauge = analysis ? riskGauge(analysis.riskScore) : null;
  const canAnalyze = form.origin && form.destination && form.vehicleType && form.cargoType;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar title="Dispatch Planner" subtitle="Analyse route risk before dispatching" />
      <div className="flex-1 overflow-auto p-6 bg-slate-50">
        <div className="max-w-5xl mx-auto space-y-5">

          {/* Form card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Navigation size={15} className="text-brand-600" />
                Plan a Dispatch
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Enter route details to get an AI-powered risk analysis before dispatching your truck.
              </p>
            </div>
            <div className="p-6">
              <div className="grid sm:grid-cols-2 gap-4">
                <CitySelect
                  label="Origin City *"
                  value={form.origin}
                  onChange={(v) => set("origin", v)}
                />
                <CitySelect
                  label="Destination City *"
                  value={form.destination}
                  onChange={(v) => set("destination", v)}
                  exclude={form.origin}
                />
                <Field label="Vehicle Type *">
                  <select value={form.vehicleType} onChange={(e) => set("vehicleType", e.target.value)} className={selectCls}>
                    <option value="">Select vehicle…</option>
                    {VEHICLE_TYPES.map((v) => <option key={v}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Cargo Type *">
                  <select value={form.cargoType} onChange={(e) => set("cargoType", e.target.value)} className={selectCls}>
                    <option value="">Select cargo…</option>
                    {CARGO_TYPES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Planned Departure Date *">
                  <input type="date" value={form.plannedDate} onChange={(e) => set("plannedDate", e.target.value)} className={inputCls} />
                </Field>
                <Field label="Planned Departure Time *">
                  <input type="time" value={form.plannedTime} onChange={(e) => set("plannedTime", e.target.value)} className={inputCls} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Notes (optional)">
                    <textarea
                      value={form.notes}
                      onChange={(e) => set("notes", e.target.value)}
                      rows={2}
                      className={inputCls + " resize-none"}
                      placeholder="e.g. priority cold-chain, SLA by 20:00 IST…"
                    />
                  </Field>
                </div>
              </div>
              <div className="mt-5 flex items-center gap-3">
                <button
                  onClick={analyze}
                  disabled={!canAnalyze || analyzing}
                  className="flex items-center gap-2 rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  {analyzing ? <Loader2 size={15} className="animate-spin" /> : <Navigation size={15} />}
                  {analyzing ? "Analysing corridor…" : "Analyse Route Risk"}
                </button>
                {!canAnalyze && (
                  <p className="text-xs text-slate-400">Fill all required fields to analyse</p>
                )}
              </div>
            </div>
          </div>

          {/* Analysis result */}
          {analysis && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">

              {/* Risk gauge + recommendation */}
              <div className="grid sm:grid-cols-3 gap-4">
                {/* Gauge */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col items-center justify-center gap-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Risk Score</p>
                  <div className="relative w-28 h-28">
                    <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                      <circle cx="50" cy="50" r="42" fill="none" stroke="#e2e8f0" strokeWidth="12" />
                      <circle
                        cx="50" cy="50" r="42" fill="none"
                        stroke={gauge!.color} strokeWidth="12"
                        strokeDasharray={`${2.64 * analysis.riskScore} 264`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-bold" style={{ color: gauge!.color }}>{analysis.riskScore}</span>
                      <span className="text-[10px] text-slate-500 font-medium">{gauge!.label}</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 text-center">
                    {analysis.affectedDisruptionIds.length} disruption{analysis.affectedDisruptionIds.length !== 1 ? "s" : ""} detected
                  </p>
                </div>

                {/* Recommendation */}
                <div className="sm:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">AI Recommendation</p>
                  {(() => {
                    const cfg = REC_CONFIG[analysis.recommendation as keyof typeof REC_CONFIG]
                      ?? REC_CONFIG.dispatch;
                    const Icon = cfg.icon;
                    return (
                      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-semibold mb-3 ${cfg.cls}`}>
                        <Icon size={14} />
                        {cfg.label}
                      </div>
                    );
                  })()}
                  <p className="text-sm text-slate-700 leading-relaxed">{analysis.aiNarrative}</p>
                  {analysis.etaImpactHours > 0 && (
                    <p className="mt-3 text-xs text-slate-500">
                      Estimated ETA impact: <span className="font-semibold text-slate-700">+{analysis.etaImpactHours}h</span>
                      {" · "}Safe departure window: <span className="font-semibold text-slate-700">
                        {new Date(analysis.safeWindowFrom).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })} – {new Date(analysis.safeWindowTo).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
                      </span>
                    </p>
                  )}
                </div>
              </div>

              {/* Affected disruptions */}
              {analysis.affectedDisruptionIds.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
                    <AlertTriangle size={14} className="text-orange-500" />
                    <span className="text-sm font-semibold text-slate-900">Active Disruptions on Route</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {MOCK_DISRUPTIONS.filter((d) => analysis.affectedDisruptionIds.includes(d.id)).map((d) => (
                      <div key={d.id} className="px-5 py-3.5 flex items-start gap-3">
                        <span className={`mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full border ${riskColor(d.risk)}`}>{d.risk}</span>
                        <div>
                          <p className="text-sm font-medium text-slate-900">{d.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{d.summary}</p>
                        </div>
                        <span className="ml-auto shrink-0 text-xs text-slate-400">+{d.eta_impact_hours}h</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Alternative routes */}
              {analysis.alternativeRoutes.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <button
                    className="w-full px-5 py-3.5 border-b border-slate-100 flex items-center justify-between text-left"
                    onClick={() => setShowRoutes((v) => !v)}
                  >
                    <span className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                      <ArrowRight size={14} className="text-brand-600" />
                      Alternative Routes ({analysis.alternativeRoutes.length})
                    </span>
                    {showRoutes ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                  </button>
                  {showRoutes && (
                    <div className="divide-y divide-slate-100">
                      {analysis.alternativeRoutes.map((r, i) => (
                        <div key={i} className="px-5 py-4 flex items-center gap-4">
                          <div className="w-7 h-7 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-900">{r.label}</p>
                            <p className="text-xs text-slate-500">via {r.via}</p>
                          </div>
                          <div className="text-right shrink-0">
                            {r.extraKm > 0 && <p className="text-xs text-slate-600">+{r.extraKm} km</p>}
                            <p className="text-xs text-slate-600">+{r.extraHours}h</p>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${riskColor(r.riskLevel)}`}>{r.riskLevel}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Action bar */}
              <div className="flex items-center gap-3">
                {saved ? (
                  <div className="flex items-center gap-2 text-sm text-green-700 font-semibold">
                    <CheckCircle2 size={16} />
                    Plan saved to Planned Dispatches
                  </div>
                ) : (
                  <button
                    onClick={savePlan}
                    className="flex items-center gap-2 rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 transition"
                  >
                    Save Dispatch Plan
                  </button>
                )}
                <button
                  onClick={() => router.push("/advisory/planned")}
                  className="flex items-center gap-1.5 text-sm text-brand-700 font-medium hover:text-brand-900"
                >
                  View all plans <ArrowRight size={13} />
                </button>
              </div>

              {/* Info note */}
              <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <Info size={13} className="text-slate-400 mt-0.5 shrink-0" />
                <p className="text-xs text-slate-500">
                  Risk analysis is based on live disruption data and AI corridor matching. Always verify with your ground team before holding or rerouting a dispatch.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-slate-600">{label}</label>
      {children}
    </div>
  );
}

const selectCls = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-300";
const inputCls = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-300";
