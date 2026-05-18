"use client";
import { useState, useMemo } from "react";
import TopBar from "@/app/_components/TopBar";
import RiskBadge from "@/app/_components/RiskBadge";
import CategoryBadge from "@/app/_components/Badge";
import DisruptionCard from "@/app/_components/DisruptionCard";
import { MOCK_DISRUPTIONS } from "@/app/_lib/mockData";
import { categoryIcon, categoryLabel, timeAgo, formatDate } from "@/app/_lib/utils";
import type { Disruption, DisruptionCategory, RiskLevel } from "@/app/_lib/types";
import { Search, Filter, MapPin, Clock, Shield, AlertCircle, ExternalLink, X } from "lucide-react";

const CATEGORIES: (DisruptionCategory | "all")[] = [
  "all", "political", "weather", "traffic", "security", "infrastructure", "religious", "vvip", "natural_disaster",
];

const RISK_LEVELS: (RiskLevel | "all")[] = ["all", "critical", "high", "medium", "low", "safe"];

export default function DisruptionsPage() {
  const [search,       setSearch]       = useState("");
  const [catFilter,    setCatFilter]    = useState<DisruptionCategory | "all">("all");
  const [riskFilter,   setRiskFilter]   = useState<RiskLevel | "all">("all");
  const [selected,     setSelected]     = useState<Disruption | null>(null);

  const filtered = useMemo(() => {
    return MOCK_DISRUPTIONS.filter((d) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        d.title.toLowerCase().includes(q) ||
        d.region.toLowerCase().includes(q) ||
        d.state.toLowerCase().includes(q) ||
        (d.highway ?? "").toLowerCase().includes(q);
      const matchesCat  = catFilter  === "all" || d.category === catFilter;
      const matchesRisk = riskFilter === "all" || d.risk     === riskFilter;
      return matchesSearch && matchesCat && matchesRisk;
    });
  }, [search, catFilter, riskFilter]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar
        title="Disruption Intelligence"
        subtitle={`${MOCK_DISRUPTIONS.length} active events across India — updated live`}
      />

      <div className="flex-1 overflow-hidden flex">
        {/* Left: list */}
        <div className={`flex flex-col overflow-hidden transition-all ${selected ? "w-full md:w-1/2 lg:w-2/5" : "w-full"}`}>

          {/* Filters */}
          <div className="bg-white border-b border-slate-200 px-4 py-3 space-y-3 shrink-0">
            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by title, region, highway…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
              />
            </div>

            {/* Category pills */}
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCatFilter(c)}
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold transition ${
                    catFilter === c
                      ? "bg-brand-700 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {c === "all" ? "All Types" : `${categoryIcon(c as DisruptionCategory)} ${categoryLabel(c as DisruptionCategory)}`}
                </button>
              ))}
            </div>

            {/* Risk level pills */}
            <div className="flex items-center gap-1.5">
              <Filter size={12} className="text-slate-400 shrink-0" />
              {RISK_LEVELS.map((r) => (
                <button
                  key={r}
                  onClick={() => setRiskFilter(r)}
                  className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold transition border ${
                    riskFilter === r
                      ? "bg-slate-800 text-white border-slate-800"
                      : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {r === "all" ? "All Severity" : r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
              <span className="ml-auto text-xs text-slate-400 shrink-0">{filtered.length} results</span>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <Shield size={36} className="mx-auto mb-3 opacity-40" />
                <p className="text-sm font-medium">No disruptions match your filters</p>
              </div>
            ) : (
              filtered.map((d) => (
                <DisruptionCard
                  key={d.id}
                  d={d}
                  selected={selected?.id === d.id}
                  onClick={() => setSelected(selected?.id === d.id ? null : d)}
                />
              ))
            )}
          </div>
        </div>

        {/* Right: detail panel */}
        {selected && (
          <div className="hidden md:flex flex-col flex-1 border-l border-slate-200 bg-white overflow-hidden slide-in">
            {/* Panel header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xl">{categoryIcon(selected.category)}</span>
                <span className="text-sm font-semibold text-slate-800">Situation Report</span>
              </div>
              <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Title + badges */}
              <div>
                <div className="flex items-start gap-3 mb-3">
                  <RiskBadge level={selected.risk} size="md" pulse={selected.risk === "critical"} />
                  <CategoryBadge category={selected.category} />
                  {selected.highway && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold border border-slate-200">
                      {selected.highway}
                    </span>
                  )}
                </div>
                <h2 className="text-base font-bold text-slate-900 leading-tight">{selected.title}</h2>
              </div>

              {/* Meta grid */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Region",     value: selected.region },
                  { label: "State",      value: selected.state },
                  { label: "ETA Impact", value: `+${selected.eta_impact_hours}h`, className: "text-orange-600" },
                  { label: "Verified",   value: selected.verified ? "✅ Confirmed" : "Unverified" },
                  { label: "Started",    value: timeAgo(selected.started_at) },
                  { label: "Est. Clear", value: selected.expected_clear_at ? formatDate(selected.expected_clear_at) : "Unknown" },
                ].map(({ label, value, className }) => (
                  <div key={label} className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{label}</p>
                    <p className={`text-sm font-semibold text-slate-800 mt-0.5 ${className ?? ""}`}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Situation detail */}
              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <AlertCircle size={11} /> Situation Detail
                </h4>
                <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 rounded-xl p-4 border border-slate-100">
                  {selected.detail}
                </p>
              </div>

              {/* Operational impact */}
              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <AlertCircle size={11} /> Operational Impact
                </h4>
                <p className="text-sm text-slate-700 leading-relaxed bg-orange-50 rounded-xl p-4 border border-orange-100">
                  {selected.impact}
                </p>
              </div>

              {/* Source */}
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <ExternalLink size={11} />
                <span>Source: {selected.source}</span>
              </div>

              {/* Affected routes */}
              {selected.affectedRoutes.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <MapPin size={11} /> Affected Routes
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {selected.affectedRoutes.map((r) => (
                      <span key={r} className="px-3 py-1.5 rounded-full bg-brand-50 text-brand-700 text-xs font-semibold border border-brand-200">{r}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Timeline */}
              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Clock size={11} /> Event Timeline
                </h4>
                <div className="space-y-3">
                  {[
                    { time: selected.started_at, event: "Disruption detected and verified", dot: "bg-red-500" },
                    { time: new Date(new Date(selected.started_at).getTime() + 1800000).toISOString(), event: "Advisory issued to operations teams", dot: "bg-orange-400" },
                    { time: new Date(new Date(selected.started_at).getTime() + 3600000).toISOString(), event: "Alternate routes identified", dot: "bg-brand-500" },
                    ...(selected.expected_clear_at ? [{ time: selected.expected_clear_at, event: "Estimated corridor clearance", dot: "bg-emerald-500" }] : []),
                  ].map((ev, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`w-2.5 h-2.5 rounded-full ${ev.dot} shrink-0 mt-0.5`} />
                        {i < 3 && <span className="w-px flex-1 bg-slate-200" />}
                      </div>
                      <div className="pb-3">
                        <p className="text-xs font-semibold text-slate-700">{ev.event}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{timeAgo(ev.time)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
