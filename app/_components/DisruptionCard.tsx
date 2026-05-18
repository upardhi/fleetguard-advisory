"use client";
import type { Disruption } from "@/app/_lib/types";
import { categoryIcon, timeAgo } from "@/app/_lib/utils";
import RiskBadge from "./RiskBadge";
import CategoryBadge from "./Badge";
import { MapPin, Clock, AlertCircle } from "lucide-react";

export default function DisruptionCard({
  d,
  selected,
  onClick,
}: {
  d: Disruption;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border p-4 cursor-pointer transition-all hover:shadow-md ${
        selected
          ? "border-brand-400 bg-brand-50 shadow-sm"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
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
  );
}
