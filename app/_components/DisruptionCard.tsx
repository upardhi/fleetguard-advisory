"use client";
import { useState } from "react";
import type { Disruption } from "@/app/_lib/types";
import { categoryIcon, timeAgo } from "@/app/_lib/utils";
import RiskBadge from "./RiskBadge";
import CategoryBadge from "./Badge";
import { MapPin, Clock, AlertCircle, ChevronDown, ChevronUp, ExternalLink, CheckCircle2, XCircle } from "lucide-react";

export default function DisruptionCard({
  d,
  selected,
  onClick,
}: {
  d: Disruption;
  selected?: boolean;
  onClick?: () => void;
}) {
  const [showSources, setShowSources] = useState(false);
  const hasSources = d.sources && d.sources.length > 0;
  const relevantCount = d.sources?.filter((s) => s.isRelevant).length ?? 0;

  return (
    <div
      className={`rounded-xl border transition-all hover:shadow-md ${
        selected
          ? "border-brand-400 bg-brand-50 shadow-sm"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <div className="p-4 cursor-pointer" onClick={onClick}>
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-start gap-2 min-w-0">
            <span className="text-lg shrink-0 mt-0.5">{categoryIcon(d.category)}</span>
            <h3 className="text-sm font-semibold text-slate-900 leading-tight">{d.title}</h3>
          </div>
          <RiskBadge level={d.risk} pulse={d.risk === "critical"} />
        </div>

        {/* Meta */}
        <div className="flex flex-wrap gap-2 mb-2">
          <CategoryBadge category={d.category} />
          {d.highway && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold border border-slate-200">
              {d.highway}
            </span>
          )}
        </div>

        {/* Summary */}
        <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">{d.summary}</p>

        {/* Footer */}
        <div className="flex items-center gap-4 mt-3 text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <MapPin size={10} />
            {d.region}, {d.state}
          </span>
          <span className="flex items-center gap-1">
            <Clock size={10} />
            {timeAgo(d.started_at)}
          </span>
          {d.eta_impact_hours > 0 && (
            <span className="flex items-center gap-1 text-orange-500 font-medium">
              <AlertCircle size={10} />
              +{d.eta_impact_hours}h ETA impact
            </span>
          )}
        </div>
      </div>

      {/* Sources toggle */}
      {hasSources && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); setShowSources((v) => !v); }}
            className="w-full flex items-center justify-between px-4 py-2 border-t border-slate-100 text-[11px] text-slate-500 hover:bg-slate-50 transition rounded-b-xl"
          >
            <span className="font-medium">
              {relevantCount} source{relevantCount !== 1 ? "s" : ""} used · {d.sources!.length} checked
            </span>
            {showSources ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          {showSources && (
            <div className="border-t border-slate-100 px-4 pb-4 pt-2 space-y-2">
              {d.sources!.map((src, i) => (
                <div key={i} className={`flex items-start gap-2 p-2 rounded-lg text-[11px] ${src.isRelevant ? "bg-green-50 border border-green-100" : "bg-slate-50 border border-slate-100"}`}>
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
                      onClick={(e) => e.stopPropagation()}
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
              <p className="text-[10px] text-slate-400 pt-1 text-right">Powered by Firecrawl + OpenAI</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
