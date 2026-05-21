"use client";
import { useState, useEffect, useMemo } from "react";
import { TopBar } from "@/app/_components/TopBar";
import RiskBadge from "@/app/_components/RiskBadge";
import CategoryBadge from "@/app/_components/Badge";
import { categoryIcon, categoryLabel, timeAgo } from "@/app/_lib/utils";
import type { CorridorEvent, DisruptionCategory, RiskLevel } from "@/app/_lib/types";
import {
  Calendar, Clock, Route, Loader2, Filter, ChevronDown,
  ChevronUp, ExternalLink, CheckCircle2, XCircle, AlertCircle,
  MapPin, Activity, ClipboardList,
} from "lucide-react";

type EventTypeFilter = "all" | "ongoing" | "scheduled" | "historical";
type TabKey = "scheduled" | "ongoing" | "historical";

const RISK_COLOR: Record<string, string> = {
  critical: "border-l-red-500 bg-red-50",
  high:     "border-l-orange-400 bg-orange-50",
  medium:   "border-l-yellow-400 bg-yellow-50",
  low:      "border-l-blue-400 bg-blue-50",
  safe:     "border-l-green-400 bg-green-50",
};

const RISK_DOT: Record<string, string> = {
  critical: "bg-red-500",
  high:     "bg-orange-400",
  medium:   "bg-yellow-400",
  low:      "bg-blue-400",
  safe:     "bg-green-400",
};

function formatEventDate(iso: string | null): string {
  if (!iso) return "Date TBD";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function daysFromNow(iso: string | null): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

function DaysChip({ days }: { days: number | null }) {
  if (days === null) return null;
  if (days < 0) return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-500">{Math.abs(days)}d ago</span>
  );
  if (days === 0) return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 animate-pulse">TODAY</span>
  );
  if (days <= 3) return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">in {days}d</span>
  );
  if (days <= 7) return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700">in {days}d</span>
  );
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">in {days}d</span>
  );
}

function EventCard({ event }: { event: CorridorEvent }) {
  const [showSources, setShowSources] = useState(false);
  const days = daysFromNow(event.event_start_at);
  const relevantSources = event.sources.filter((s) => s.isRelevant);

  return (
    <div className={`rounded-xl border-l-4 border border-slate-200 overflow-hidden ${RISK_COLOR[event.risk_level] ?? "bg-white"}`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-start gap-2 min-w-0">
            <span className="text-lg shrink-0 mt-0.5">{categoryIcon(event.category)}</span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900 leading-tight">{event.title}</h3>
              <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                <Route size={9} />
                {event.corridor_name ?? `${event.corridor_origin} → ${event.corridor_destination}`}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <RiskBadge level={event.risk_level as RiskLevel} pulse={event.risk_level === "critical" && days !== null && days <= 3} />
            <DaysChip days={days} />
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-2">
          <CategoryBadge category={event.category} />
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
            event.event_type === "ongoing"    ? "bg-red-100 text-red-700 border-red-200" :
            event.event_type === "scheduled"  ? "bg-blue-100 text-blue-700 border-blue-200" :
            "bg-slate-100 text-slate-500 border-slate-200"
          }`}>
            {event.event_type === "ongoing" ? "🔴 Active" : event.event_type === "scheduled" ? "📅 Scheduled" : "✓ Past"}
          </span>
          {event.rescan_count > 1 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-violet-100 text-violet-700 border border-violet-200">
              Seen {event.rescan_count}×
            </span>
          )}
        </div>

        {event.summary && (
          <p className="text-xs text-slate-600 leading-relaxed line-clamp-2 mb-2">{event.summary}</p>
        )}

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
          {event.event_start_at && (
            <span className="flex items-center gap-1 font-medium text-slate-600">
              <Calendar size={10} />
              {formatEventDate(event.event_start_at)}
              {event.duration_days > 1 && <span className="text-slate-400"> ({event.duration_days}d)</span>}
            </span>
          )}
          {event.eta_impact_hours > 0 && (
            <span className="flex items-center gap-1 text-orange-600 font-medium">
              <AlertCircle size={10} />
              +{event.eta_impact_hours}h ETA
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock size={10} />
            Detected {timeAgo(event.detected_at)}
          </span>
        </div>
      </div>

      {/* Sources toggle */}
      {event.sources.length > 0 && (
        <>
          <button
            onClick={() => setShowSources((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2 border-t border-black/5 text-[11px] text-slate-500 hover:bg-black/5 transition"
          >
            <span className="font-medium">
              {relevantSources.length} source{relevantSources.length !== 1 ? "s" : ""} used · {event.sources.length} checked
            </span>
            {showSources ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {showSources && (
            <div className="border-t border-black/5 px-4 pb-4 pt-2 space-y-2">
              {event.sources.map((src, i) => (
                <div key={i} className={`flex items-start gap-2 p-2 rounded-lg text-[11px] ${src.isRelevant ? "bg-green-50 border border-green-100" : "bg-white border border-slate-100"}`}>
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
                    {src.snippet && <p className="text-slate-400 mt-0.5 line-clamp-2">{src.snippet}</p>}
                  </div>
                </div>
              ))}
              <p className="text-[10px] text-slate-400 text-right pt-1">Powered by Firecrawl + OpenAI</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "scheduled", label: "Upcoming",  icon: <Calendar size={13} /> },
  { key: "ongoing",   label: "Active Now", icon: <Activity size={13} /> },
  { key: "historical",label: "Past",       icon: <ClipboardList size={13} /> },
];

export default function FleetEventsPage() {
  const [events, setEvents]   = useState<CorridorEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<TabKey>("scheduled");
  const [riskFilter, setRiskFilter] = useState<RiskLevel | "all">("all");

  useEffect(() => {
    fetch("/api/advisory/v1/corridor-events?eventType=all&limit=200", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { events: CorridorEvent[] }) => setEvents(d.events ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const byTab = useMemo(() => {
    return events.filter((e) => e.event_type === tab && (riskFilter === "all" || e.risk_level === riskFilter));
  }, [events, tab, riskFilter]);

  const counts = useMemo(() => ({
    scheduled: events.filter((e) => e.event_type === "scheduled").length,
    ongoing:   events.filter((e) => e.event_type === "ongoing").length,
    historical: events.filter((e) => e.event_type === "historical").length,
  }), [events]);

  const urgentCount = events.filter((e) => {
    if (e.event_type !== "scheduled") return false;
    const d = daysFromNow(e.event_start_at);
    return d !== null && d >= 0 && d <= 7;
  }).length;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar
        title="Fleet Events"
        subtitle={
          loading ? "Loading…" :
          events.length === 0 ? "No corridor events detected yet" :
          `${counts.scheduled} upcoming · ${counts.ongoing} active · ${counts.historical} past${urgentCount > 0 ? ` · ⚠️ ${urgentCount} within 7 days` : ""}`
        }
      />

      <div className="flex-1 overflow-y-auto">
        {/* Urgency banner */}
        {urgentCount > 0 && !loading && (
          <div className="bg-orange-50 border-b border-orange-200 px-5 py-3 flex items-center gap-2">
            <AlertCircle size={14} className="text-orange-600 shrink-0" />
            <p className="text-xs font-semibold text-orange-800">
              {urgentCount} scheduled event{urgentCount !== 1 ? "s" : ""} within the next 7 days — plan your fleet dispatches accordingly.
            </p>
          </div>
        )}

        <div className="p-5 max-w-4xl mx-auto space-y-4">
          {/* Tabs */}
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            {TABS.map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition ${
                  tab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {icon}
                {label}
                {counts[key] > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${tab === key ? "bg-brand-100 text-brand-700" : "bg-slate-200 text-slate-500"}`}>
                    {counts[key]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Risk filter */}
          <div className="flex items-center gap-1.5">
            <Filter size={11} className="text-slate-400 shrink-0" />
            {(["all", "critical", "high", "medium", "low"] as (RiskLevel | "all")[]).map((r) => (
              <button
                key={r}
                onClick={() => setRiskFilter(r)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition border ${
                  riskFilter === r
                    ? "bg-slate-800 text-white border-slate-800"
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                }`}
              >
                {r === "all" ? "All Risk" : r.charAt(0).toUpperCase() + r.slice(1)}
              </button>
            ))}
            <span className="ml-auto text-xs text-slate-400">{byTab.length} event{byTab.length !== 1 ? "s" : ""}</span>
          </div>

          {/* Event list */}
          {loading ? (
            <div className="flex flex-col items-center py-20 gap-3 text-slate-400">
              <Loader2 size={28} className="animate-spin" />
              <p className="text-sm">Loading corridor events…</p>
            </div>
          ) : byTab.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <Calendar size={36} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">
                {tab === "scheduled" ? "No upcoming events detected" :
                 tab === "ongoing"   ? "No active events right now" :
                 "No past events recorded"}
              </p>
              <p className="text-xs mt-1 text-slate-400">
                {tab === "scheduled"
                  ? "Future events (PM visits, bandh, elections) will appear here once corridors are scanned."
                  : "Run intelligence on watched corridors to populate events."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {byTab.map((ev) => <EventCard key={ev.id} event={ev} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
