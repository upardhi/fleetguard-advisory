"use client";
import { useState, useMemo, useEffect } from "react";
import { TopBar } from "@/app/_components/TopBar";
import RiskBadge from "@/app/_components/RiskBadge";
import CategoryBadge from "@/app/_components/Badge";
import DisruptionCard from "@/app/_components/DisruptionCard";
import { categoryIcon, categoryLabel, timeAgo } from "@/app/_lib/utils";
import type { Disruption, DisruptionCategory, RiskLevel } from "@/app/_lib/types";
import {
  Search, Filter, MapPin, Clock, Shield, AlertCircle,
  ExternalLink, X, Loader2, Route, ArrowRight,
  CheckCircle2, XCircle, Database,
} from "lucide-react";
import Link from "next/link";

const CATEGORIES: (DisruptionCategory | "all")[] = [
  "all", "political", "weather", "traffic", "security", "infrastructure", "religious", "vvip", "natural_disaster",
];
const RISK_LEVELS: (RiskLevel | "all")[] = ["all", "critical", "high", "medium", "low", "safe"];

interface Corridor { id: string; name: string; origin: string; destination: string }

export default function DisruptionsPage() {
  const [disruptions, setDisruptions]   = useState<Disruption[]>([]);
  const [corridors, setCorridors]       = useState<Corridor[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [catFilter, setCatFilter]       = useState<DisruptionCategory | "all">("all");
  const [riskFilter, setRiskFilter]     = useState<RiskLevel | "all">("all");
  const [corridorFilter, setCorridorFilter] = useState<string>("all");
  const [selected, setSelected]         = useState<Disruption | null>(null);

  useEffect(() => {
    fetch("/api/advisory/v1/intelligence", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { disruptions: Disruption[]; corridors: Corridor[] }) => {
        setDisruptions(d.disruptions ?? []);
        setCorridors(d.corridors ?? []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return disruptions.filter((d) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        d.title.toLowerCase().includes(q) ||
        d.region.toLowerCase().includes(q) ||
        d.state.toLowerCase().includes(q) ||
        (d.highway ?? "").toLowerCase().includes(q) ||
        (d.affectedRoutes[0] ?? "").toLowerCase().includes(q);
      const matchCat      = catFilter      === "all" || d.category === catFilter;
      const matchRisk     = riskFilter     === "all" || d.risk     === riskFilter;
      const matchCorridor = corridorFilter === "all" || d.affectedRoutes[0] === corridorFilter;
      return matchSearch && matchCat && matchRisk && matchCorridor;
    });
  }, [disruptions, search, catFilter, riskFilter, corridorFilter]);

  // Count per corridor for badge
  const perCorridor = useMemo(() => {
    const m: Record<string, number> = {};
    disruptions.forEach((d) => {
      const c = d.affectedRoutes[0] ?? "—";
      m[c] = (m[c] ?? 0) + 1;
    });
    return m;
  }, [disruptions]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar
        title="Disruption Intelligence"
        subtitle={
          loading ? "Loading…" :
          disruptions.length > 0
            ? `${disruptions.length} active disruptions across ${corridors.length} watched corridor${corridors.length !== 1 ? "s" : ""}`
            : "No active disruptions detected"
        }
      />

      <div className="flex-1 overflow-hidden flex">
        <div className={`flex flex-col overflow-hidden transition-all ${selected ? "w-full md:w-1/2 lg:w-2/5" : "w-full"}`}>

          {/* Filters */}
          <div className="bg-white border-b border-slate-200 px-4 py-3 space-y-2.5 shrink-0">
            {/* Corridor filter pills */}
            {corridors.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                <button
                  onClick={() => setCorridorFilter("all")}
                  className={`shrink-0 px-3 py-1 rounded-full text-[11px] font-semibold transition flex items-center gap-1 ${
                    corridorFilter === "all" ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <Route size={10} /> All Corridors
                  <span className="ml-0.5 opacity-70">({disruptions.length})</span>
                </button>
                {corridors.map((c) => {
                  const count = perCorridor[c.name] ?? 0;
                  if (count === 0) return null;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setCorridorFilter(c.name)}
                      className={`shrink-0 px-3 py-1 rounded-full text-[11px] font-semibold transition flex items-center gap-1 ${
                        corridorFilter === c.name ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {c.origin} → {c.destination}
                      <span className={`ml-0.5 px-1 rounded-full text-[9px] font-bold ${
                        corridorFilter === c.name ? "bg-white/20" : "bg-slate-300/60"
                      }`}>{count}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search title, segment, highway…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
              />
            </div>

            {/* Category */}
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCatFilter(c)}
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold transition ${
                    catFilter === c ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {c === "all" ? "All Types" : `${categoryIcon(c as DisruptionCategory)} ${categoryLabel(c as DisruptionCategory)}`}
                </button>
              ))}
            </div>

            {/* Risk + count */}
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
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
                <Loader2 size={28} className="animate-spin" />
                <p className="text-sm">Loading disruptions…</p>
              </div>
            ) : corridors.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <Route size={36} className="mx-auto mb-3 opacity-40" />
                <p className="text-sm font-medium">No watched corridors yet</p>
                <p className="text-xs mt-1 text-slate-400">Add corridors to start monitoring disruptions</p>
                <Link href="/advisory/planned" className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-brand-700 text-white hover:bg-brand-800 transition">
                  Go to Watched Corridors <ArrowRight size={11} />
                </Link>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <Shield size={36} className="mx-auto mb-3 opacity-40" />
                <p className="text-sm font-medium">
                  {disruptions.length === 0
                    ? "All watched corridors are clear"
                    : "No disruptions match your filters"}
                </p>
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

        {/* Detail panel */}
        {selected && (
          <div className="hidden md:flex flex-col flex-1 border-l border-slate-200 bg-white overflow-hidden slide-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xl">{categoryIcon(selected.category)}</span>
                <span className="text-sm font-semibold text-slate-800">Situation Report</span>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/advisory/planned?highlight=${encodeURIComponent(selected.affectedRoutes[0] ?? "")}`}
                  className="text-xs text-brand-600 font-medium hover:underline flex items-center gap-1"
                >
                  <Route size={11} /> View Corridor
                </Link>
                <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
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

              {/* Corridor badge */}
              {selected.affectedRoutes[0] && (
                <div className="flex items-center gap-2 bg-brand-50 border border-brand-200 rounded-xl px-3 py-2">
                  <Route size={13} className="text-brand-600 shrink-0" />
                  <span className="text-xs font-semibold text-brand-800">{selected.affectedRoutes[0]}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Segment",    value: selected.region },
                  { label: "State",      value: selected.state },
                  { label: "ETA Impact", value: `+${selected.eta_impact_hours}h`, className: "text-orange-600" },
                  { label: "Detected",   value: timeAgo(selected.started_at) },
                ].map(({ label, value, className }) => (
                  <div key={label} className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{label}</p>
                    <p className={`text-sm font-semibold text-slate-800 mt-0.5 truncate ${className ?? ""}`}>{value}</p>
                  </div>
                ))}
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <AlertCircle size={11} /> Situation Detail
                </h4>
                <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 rounded-xl p-4 border border-slate-100">
                  {selected.detail}
                </p>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <AlertCircle size={11} /> Operational Impact
                </h4>
                <p className="text-sm text-slate-700 leading-relaxed bg-orange-50 rounded-xl p-4 border border-orange-100">
                  {selected.impact}
                </p>
              </div>

              {/* Sources */}
              {selected.sources && selected.sources.length > 0 ? (
                <div>
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Database size={11} /> Intelligence Sources
                  </h4>
                  <div className="space-y-2">
                    {selected.sources.map((src, i) => (
                      <div key={i} className={`flex items-start gap-2 p-2.5 rounded-lg text-[11px] ${src.isRelevant ? "bg-green-50 border border-green-100" : "bg-slate-50 border border-slate-100"}`}>
                        <span className="shrink-0 mt-0.5">
                          {src.isRelevant
                            ? <CheckCircle2 size={12} className="text-green-600" />
                            : <XCircle size={12} className="text-slate-300" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <a
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`font-medium truncate block hover:underline ${src.isRelevant ? "text-green-800" : "text-slate-500"}`}
                          >
                            {src.title || src.url}
                            <ExternalLink size={9} className="inline ml-1 opacity-60" />
                          </a>
                          {src.snippet && (
                            <p className="text-slate-400 mt-0.5 line-clamp-2">{src.snippet}</p>
                          )}
                        </div>
                        <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold ${src.isRelevant ? "bg-green-200 text-green-800" : "bg-slate-200 text-slate-500"}`}>
                          {src.isRelevant ? "Used ✓" : "Skipped"}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2 text-right">Powered by Firecrawl + OpenAI</p>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <ExternalLink size={11} />
                  <span>{selected.source}</span>
                </div>
              )}

              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Clock size={11} /> Event Timeline
                </h4>
                <div className="space-y-3">
                  {[
                    { time: selected.started_at, event: "Disruption detected by AI intelligence", dot: "bg-red-500" },
                    { time: new Date(new Date(selected.started_at).getTime() + 900000).toISOString(), event: "Advisory issued to operations", dot: "bg-orange-400" },
                    { time: new Date(new Date(selected.started_at).getTime() + 1800000).toISOString(), event: "Alternate routes identified", dot: "bg-brand-500" },
                  ].map((ev, i, arr) => (
                    <div key={i} className="flex gap-3">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`w-2.5 h-2.5 rounded-full ${ev.dot} shrink-0 mt-0.5`} />
                        {i < arr.length - 1 && <span className="w-px flex-1 bg-slate-200" />}
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
