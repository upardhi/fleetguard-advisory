"use client";
import type { Advisory } from "@/app/_lib/types";
import RiskBadge from "./RiskBadge";
import { Clock, MapPin, CheckCircle, Zap } from "lucide-react";

const TYPE_CONFIG = {
  delay:          { label: "Delay Dispatch",    color: "bg-amber-500",   icon: "⏸" },
  reroute:        { label: "Reroute",           color: "bg-orange-500",  icon: "↪" },
  hold:           { label: "Hold Vehicle",      color: "bg-red-500",     icon: "✋" },
  dispatch_early: { label: "Dispatch Early",    color: "bg-green-500",   icon: "⚡" },
  split_shipment: { label: "Split Shipment",    color: "bg-purple-500",  icon: "✂" },
  avoid_night:    { label: "Avoid Night Travel",color: "bg-slate-500",   icon: "🌙" },
};

export default function AdvisoryCard({ a, compact }: { a: Advisory; compact?: boolean }) {
  const cfg = TYPE_CONFIG[a.type];
  const timeLeft = Math.max(0, Math.floor((new Date(a.validUntil).getTime() - Date.now()) / 60000));
  const hrsLeft  = Math.floor(timeLeft / 60);
  const minsLeft = timeLeft % 60;

  return (
    <div className={`rounded-xl border bg-white overflow-hidden shadow-sm hover:shadow-md transition-all ${
      a.isUrgent ? "border-red-200" : "border-slate-200"
    }`}>
      {/* Top accent bar */}
      <div className={`h-1 ${cfg.color}`} />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-white text-sm shrink-0 ${cfg.color}`}>
              {cfg.icon}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{cfg.label}</span>
                {a.isUrgent && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-100 text-red-600 text-[9px] font-bold tracking-wide">
                    <Zap size={8} /> URGENT
                  </span>
                )}
              </div>
              <h3 className="text-sm font-semibold text-slate-900 leading-tight mt-0.5">{a.title}</h3>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <RiskBadge level={a.riskLevel} />
            <span className="text-[10px] font-semibold text-slate-400">{a.confidence}% confidence</span>
          </div>
        </div>

        {!compact && (
          <>
            {/* Narrative */}
            <p className="text-xs text-slate-600 leading-relaxed mb-3 bg-slate-50 rounded-lg p-3 border border-slate-100">
              {a.narrative}
            </p>

            {/* Recommended action */}
            <div className="flex items-start gap-2 mb-3 bg-brand-50 rounded-lg p-2.5 border border-brand-100">
              <CheckCircle size={13} className="text-brand-600 shrink-0 mt-0.5" />
              <p className="text-xs text-brand-800 font-medium">{a.recommendedAction}</p>
            </div>
          </>
        )}

        {/* Footer */}
        <div className="flex items-center gap-4 text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <MapPin size={10} />
            {a.region}
          </span>
          {timeLeft > 0 ? (
            <span className="flex items-center gap-1 text-amber-600 font-medium">
              <Clock size={10} />
              Valid for {hrsLeft > 0 ? `${hrsLeft}h ` : ""}{minsLeft}m
            </span>
          ) : (
            <span className="text-slate-300">Expired</span>
          )}
        </div>
      </div>
    </div>
  );
}
