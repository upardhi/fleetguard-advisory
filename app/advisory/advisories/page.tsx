"use client";
import { useState, useMemo, useEffect } from "react";
import { TopBar } from "@/app/_components/TopBar";
import AdvisoryCard from "@/app/_components/AdvisoryCard";
import { BrainCircuit, Zap, Clock, CheckCircle, Loader2, Route, ArrowRight } from "lucide-react";
import type { Advisory } from "@/app/_lib/types";
import Link from "next/link";

const TYPE_LABELS: Record<string, string> = {
  all:            "All Advisories",
  delay:          "Delay Dispatch",
  reroute:        "Reroute",
  hold:           "Hold Vehicle",
  dispatch_early: "Dispatch Early",
  split_shipment: "Split Shipment",
  avoid_night:    "Avoid Night",
};

interface Corridor { id: string; name: string; origin: string; destination: string }

interface IntelData {
  advisories: (Advisory & { corridorName?: string })[];
  corridors: Corridor[];
}

export default function AdvisoriesPage() {
  const [advisories, setAdvisories]     = useState<(Advisory & { corridorName?: string })[]>([]);
  const [corridors, setCorridors]       = useState<Corridor[]>([]);
  const [loading, setLoading]           = useState(true);
  const [typeFilter, setTypeFilter]     = useState("all");
  const [urgentOnly, setUrgentOnly]     = useState(false);
  const [corridorFilter, setCorridorFilter] = useState("all");

  useEffect(() => {
    fetch("/api/advisory/v1/intelligence", { credentials: "include" })
      .then((r) => r.json())
      .then((d: IntelData) => {
        setAdvisories(d.advisories ?? []);
        setCorridors(d.corridors ?? []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return advisories.filter((a) => {
      const matchType      = typeFilter      === "all" || a.type === typeFilter;
      const matchUrgent    = !urgentOnly     || a.isUrgent;
      const matchCorridor  = corridorFilter  === "all" || a.corridorName === corridorFilter;
      return matchType && matchUrgent && matchCorridor;
    });
  }, [advisories, typeFilter, urgentOnly, corridorFilter]);

  // Count per corridor
  const perCorridor = useMemo(() => {
    const m: Record<string, number> = {};
    advisories.forEach((a) => {
      const c = a.corridorName ?? "—";
      m[c] = (m[c] ?? 0) + 1;
    });
    return m;
  }, [advisories]);

  const urgentCount   = advisories.filter((a) => a.isUrgent).length;
  const avgConfidence = advisories.length > 0
    ? Math.round(advisories.reduce((s, a) => s + a.confidence, 0) / advisories.length)
    : 0;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar
        title="AI Advisories"
        subtitle="AI-generated dispatch advisories based on live corridor intelligence"
      />

      <div className="flex-1 overflow-auto">
        <div className="p-6 max-w-screen-xl mx-auto space-y-5">

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                <BrainCircuit size={18} className="text-brand-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Total Advisories</p>
                <p className="text-2xl font-bold text-slate-900 num">{loading ? "—" : advisories.length}</p>
              </div>
            </div>
            <div className="bg-red-50 rounded-xl border border-red-200 shadow-sm p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                <Zap size={18} className="text-red-600" />
              </div>
              <div>
                <p className="text-xs text-red-600">Urgent Actions</p>
                <p className="text-2xl font-bold text-red-700 num">{loading ? "—" : urgentCount}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                <CheckCircle size={18} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Avg Confidence</p>
                <p className="text-2xl font-bold text-emerald-600 num">{loading ? "—" : `${avgConfidence}%`}</p>
              </div>
            </div>
          </div>

          {/* No data state */}
          {!loading && advisories.length === 0 && (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 px-6 py-10 text-center">
              <Route size={32} className="mx-auto mb-3 text-blue-400" />
              <p className="text-sm font-semibold text-blue-800 mb-1">
                {corridors.length === 0 ? "No watched corridors yet" : "No disruptions detected"}
              </p>
              <p className="text-xs text-blue-600 mb-4">
                {corridors.length === 0
                  ? "Add a corridor and run intelligence to generate AI advisories."
                  : "All watched corridors are currently clear — no advisories to show."}
              </p>
              <Link href="/advisory/planned" className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-brand-700 text-white hover:bg-brand-800 transition">
                Go to Watched Corridors <ArrowRight size={13} />
              </Link>
            </div>
          )}

          {!loading && advisories.length > 0 && (
            <>
              {/* Corridor filter */}
              {corridors.length > 1 && (
                <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                  <button
                    onClick={() => setCorridorFilter("all")}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition flex items-center gap-1.5 ${
                      corridorFilter === "all" ? "bg-brand-700 text-white" : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <Route size={11} /> All Corridors
                  </button>
                  {corridors.map((c) => {
                    const count = perCorridor[c.name] ?? 0;
                    if (count === 0) return null;
                    return (
                      <button
                        key={c.id}
                        onClick={() => setCorridorFilter(c.name)}
                        className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition flex items-center gap-1.5 ${
                          corridorFilter === c.name ? "bg-brand-700 text-white" : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        {c.origin} → {c.destination}
                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                          corridorFilter === c.name ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                        }`}>{count}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Type + urgent filters */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex gap-1.5 flex-wrap">
                  {Object.entries(TYPE_LABELS).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setTypeFilter(key)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                        typeFilter === key
                          ? "bg-brand-700 text-white"
                          : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setUrgentOnly(!urgentOnly)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                    urgentOnly ? "bg-red-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:border-red-200"
                  }`}
                >
                  <Zap size={11} /> Urgent Only
                </button>
                <span className="text-xs text-slate-400 ml-auto">{filtered.length} advisories</span>
              </div>

              {urgentCount > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
                  <Zap size={18} className="text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-red-800">
                      {urgentCount} advisory action{urgentCount > 1 ? "s" : ""} require immediate attention
                    </p>
                    <p className="text-xs text-red-600 mt-0.5">Review and take action before dispatch.</p>
                  </div>
                </div>
              )}

              <div className="grid lg:grid-cols-2 gap-4">
                {filtered.map((a) => <AdvisoryCard key={a.id} a={a} />)}
              </div>

              {filtered.length === 0 && (
                <div className="text-center py-16 text-slate-400">
                  <Clock size={36} className="mx-auto mb-3 opacity-40" />
                  <p className="text-sm font-medium">No advisories match your filters</p>
                </div>
              )}
            </>
          )}

          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={28} className="animate-spin text-slate-300" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
