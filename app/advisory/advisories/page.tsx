"use client";
import { useState, useMemo } from "react";
import TopBar from "@/app/_components/TopBar";
import AdvisoryCard from "@/app/_components/AdvisoryCard";
import { MOCK_ADVISORIES } from "@/app/_lib/mockData";
import { BrainCircuit, Zap, Clock, CheckCircle } from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  all:            "All Advisories",
  delay:          "Delay Dispatch",
  reroute:        "Reroute",
  hold:           "Hold Vehicle",
  dispatch_early: "Dispatch Early",
  split_shipment: "Split Shipment",
  avoid_night:    "Avoid Night",
};

export default function AdvisoriesPage() {
  const [typeFilter, setTypeFilter] = useState("all");
  const [urgentOnly, setUrgentOnly] = useState(false);

  const filtered = useMemo(() => {
    return MOCK_ADVISORIES.filter((a) => {
      const matchesType   = typeFilter === "all" || a.type === typeFilter;
      const matchesUrgent = !urgentOnly || a.isUrgent;
      return matchesType && matchesUrgent;
    });
  }, [typeFilter, urgentOnly]);

  const urgentCount = MOCK_ADVISORIES.filter((a) => a.isUrgent).length;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar
        title="AI Advisories"
        subtitle="AI-generated dispatch advisories based on live disruption intelligence"
      />

      <div className="flex-1 overflow-auto">
        <div className="p-6 max-w-screen-xl mx-auto space-y-6">

          {/* Stat strip */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                <BrainCircuit size={18} className="text-brand-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Total Advisories</p>
                <p className="text-2xl font-bold text-slate-900 num">{MOCK_ADVISORIES.length}</p>
              </div>
            </div>
            <div className="bg-red-50 rounded-xl border border-red-200 shadow-sm p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                <Zap size={18} className="text-red-600" />
              </div>
              <div>
                <p className="text-xs text-red-600">Urgent Actions</p>
                <p className="text-2xl font-bold text-red-700 num">{urgentCount}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                <CheckCircle size={18} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Avg Confidence</p>
                <p className="text-2xl font-bold text-emerald-600 num">
                  {Math.round(MOCK_ADVISORIES.reduce((s, a) => s + a.confidence, 0) / MOCK_ADVISORIES.length)}%
                </p>
              </div>
            </div>
          </div>

          {/* Filters */}
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
                urgentOnly
                  ? "bg-red-600 text-white"
                  : "bg-white text-slate-600 border border-slate-200 hover:border-red-200"
              }`}
            >
              <Zap size={11} />
              Urgent Only
            </button>
            <span className="text-xs text-slate-400 ml-auto">{filtered.length} advisories</span>
          </div>

          {/* Urgent banner */}
          {urgentCount > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
              <Zap size={18} className="text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-red-800">
                  {urgentCount} advisory action{urgentCount > 1 ? "s" : ""} require immediate attention
                </p>
                <p className="text-xs text-red-600 mt-0.5">
                  Review urgent advisories below and take action before dispatch.
                </p>
              </div>
            </div>
          )}

          {/* Advisory grid */}
          <div className="grid lg:grid-cols-2 gap-4">
            {filtered.map((a) => <AdvisoryCard key={a.id} a={a} />)}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-16 text-slate-400">
              <Clock size={36} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">No advisories match your filters</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
