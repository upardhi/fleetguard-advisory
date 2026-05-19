"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Calendar, ArrowLeft, ChevronLeft, ChevronRight,
  AlertTriangle, Navigation,
} from "lucide-react";
import { TopBar } from "@/app/_components/TopBar";
import { MOCK_CALENDAR_EVENTS } from "@/app/_lib/mockData";
import { categoryIcon, categoryLabel } from "@/app/_lib/utils";
import type { CalendarEvent, RiskLevel, DisruptionCategory } from "@/app/_lib/types";

// ── Config ───────────────────────────────────────────────────────

const RISK_CONFIG: Record<RiskLevel, { cls: string; dot: string }> = {
  critical: { cls: "bg-red-100 border-red-300 text-red-800",    dot: "bg-red-500" },
  high:     { cls: "bg-orange-100 border-orange-300 text-orange-800", dot: "bg-orange-500" },
  medium:   { cls: "bg-yellow-100 border-yellow-200 text-yellow-800", dot: "bg-yellow-500" },
  low:      { cls: "bg-blue-100 border-blue-200 text-blue-800",  dot: "bg-blue-400" },
  safe:     { cls: "bg-green-100 border-green-200 text-green-800", dot: "bg-green-500" },
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// ── Helpers ──────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── Page ─────────────────────────────────────────────────────────

export default function CalendarPage() {
  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [catFilter, setCatFilter] = useState<DisruptionCategory | "all">("all");

  // Build calendar grid
  const firstDay  = new Date(year, month, 1);
  const lastDay   = new Date(year, month + 1, 0);
  const startPad  = firstDay.getDay(); // 0=Sun
  const totalDays = lastDay.getDate();

  const allDays: Array<Date | null> = [
    ...Array(startPad).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => new Date(year, month, i + 1)),
  ];

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    MOCK_CALENDAR_EVENTS
      .filter((e) => catFilter === "all" || e.category === catFilter)
      .forEach((e) => {
        (map[e.date] ??= []).push(e);
      });
    return map;
  }, [catFilter]);

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }

  const todayStr = toDateStr(today);

  // Upcoming events (next 30 days) sorted by date
  const upcoming = useMemo(() => {
    const cutoff = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    return MOCK_CALENDAR_EVENTS
      .filter((e) =>
        e.date >= todayStr &&
        e.date <= cutoff &&
        (catFilter === "all" || e.category === catFilter)
      )
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [catFilter, todayStr]);

  // Recurring events
  const recurring = MOCK_CALENDAR_EVENTS.filter((e) => e.isRecurring);

  // Unique categories
  const categories = Array.from(new Set(MOCK_CALENDAR_EVENTS.map((e) => e.category))) as DisruptionCategory[];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar title="Events Calendar" subtitle="Upcoming disruptions & seasonal risks" />
      <div className="flex-1 overflow-auto p-6 bg-slate-50">
        <div className="max-w-6xl mx-auto space-y-5">

          <div className="flex items-center justify-between">
            <Link href="/advisory" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
              <ArrowLeft size={14} />Back to Control Tower
            </Link>
            <select
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value as DisruptionCategory | "all")}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
            >
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{categoryIcon(c)} {categoryLabel(c)}</option>
              ))}
            </select>
          </div>

          <div className="grid lg:grid-cols-3 gap-5">
            {/* Calendar */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Month nav */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <button onClick={prevMonth} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
                  <ChevronLeft size={16} />
                </button>
                <h2 className="text-sm font-bold text-slate-900">{MONTHS[month]} {year}</h2>
                <button onClick={nextMonth} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
                  <ChevronRight size={16} />
                </button>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 border-b border-slate-100">
                {DAYS.map((d) => (
                  <div key={d} className="py-2 text-center text-[11px] font-semibold text-slate-400">{d}</div>
                ))}
              </div>

              {/* Cells */}
              <div className="grid grid-cols-7">
                {allDays.map((day, i) => {
                  if (!day) return <div key={`empty-${i}`} className="h-20 border-b border-r border-slate-50" />;
                  const dateStr = toDateStr(day);
                  const events  = eventsByDate[dateStr] ?? [];
                  const isToday = dateStr === todayStr;
                  const isPast  = dateStr < todayStr;

                  return (
                    <div
                      key={dateStr}
                      className={`h-20 border-b border-r border-slate-50 p-1.5 cursor-pointer hover:bg-slate-50/80 transition ${
                        isPast ? "opacity-50" : ""
                      }`}
                    >
                      <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold mb-1 ${
                        isToday ? "bg-brand-700 text-white" : "text-slate-600"
                      }`}>
                        {day.getDate()}
                      </div>
                      <div className="space-y-0.5 overflow-hidden">
                        {events.slice(0, 2).map((e) => {
                          const rc = RISK_CONFIG[e.predictedRisk];
                          return (
                            <button
                              key={e.id}
                              onClick={() => setSelected(e)}
                              className={`w-full text-left text-[9px] font-semibold px-1 py-0.5 rounded truncate border leading-tight ${rc.cls}`}
                            >
                              {categoryIcon(e.category)} {e.title}
                            </button>
                          );
                        })}
                        {events.length > 2 && (
                          <p className="text-[9px] text-slate-400 pl-1">+{events.length - 2} more</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap items-center gap-3">
                <span className="text-[10px] text-slate-400 font-medium">Risk:</span>
                {(["critical","high","medium","low","safe"] as RiskLevel[]).map((r) => (
                  <span key={r} className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${RISK_CONFIG[r].dot}`} />
                    <span className="text-[10px] text-slate-500 capitalize">{r}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Right panel */}
            <div className="space-y-4">
              {/* Event detail */}
              {selected ? (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs text-slate-400 mb-1">{categoryIcon(selected.category)} {categoryLabel(selected.category)}</p>
                      <h3 className="text-sm font-bold text-slate-900 leading-snug">{selected.title}</h3>
                    </div>
                    <button onClick={() => setSelected(null)} className="text-slate-300 hover:text-slate-500 shrink-0">✕</button>
                  </div>
                  <div className="px-5 py-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Calendar size={12} className="text-slate-400" />
                      <span className="text-xs text-slate-600">{new Date(selected.date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={12} className="text-orange-400" />
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${RISK_CONFIG[selected.predictedRisk].cls}`}>
                        Predicted risk: {selected.predictedRisk}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{selected.description}</p>
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">States affected</p>
                      <p className="text-xs text-slate-700">{selected.states.join(", ")}</p>
                    </div>
                    {selected.affectedHighways.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Highways</p>
                        <p className="text-xs text-slate-700">{selected.affectedHighways.join(", ")}</p>
                      </div>
                    )}
                    {selected.isRecurring && selected.recurrenceNote && (
                      <p className="text-[10px] text-blue-600 bg-blue-50 px-2 py-1.5 rounded-lg">
                        🔁 {selected.recurrenceNote}
                      </p>
                    )}
                    <Link
                      href="/advisory/planner"
                      className="mt-1 flex items-center gap-1.5 text-xs text-brand-700 font-semibold hover:text-brand-900"
                    >
                      <Navigation size={11} />
                      Plan dispatch around this event
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 text-center">
                  <Calendar size={28} className="mx-auto mb-2 text-slate-200" />
                  <p className="text-sm text-slate-400">Click an event to see details</p>
                </div>
              )}

              {/* Upcoming in 30 days */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3.5 border-b border-slate-100">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Next 30 Days</p>
                </div>
                <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
                  {upcoming.length === 0 ? (
                    <p className="px-4 py-6 text-xs text-center text-slate-400">No upcoming events in this period</p>
                  ) : upcoming.map((e) => {
                    const rc = RISK_CONFIG[e.predictedRisk];
                    const daysLeft = Math.round((new Date(e.date).getTime() - Date.now()) / 86400000);
                    return (
                      <button
                        key={e.id}
                        onClick={() => setSelected(e)}
                        className="w-full text-left px-4 py-3 hover:bg-slate-50 transition"
                      >
                        <div className="flex items-start gap-2.5">
                          <div className="text-center shrink-0 w-8">
                            <div className="text-xs font-bold text-slate-700 num">{new Date(e.date).getDate()}</div>
                            <div className="text-[9px] text-slate-400">{MONTHS[new Date(e.date).getMonth()].slice(0,3)}</div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-900 truncate leading-tight">{e.title}</p>
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${rc.cls}`}>{e.predictedRisk}</span>
                              <span className="text-[9px] text-slate-400">{daysLeft === 0 ? "Today" : `In ${daysLeft}d`}</span>
                            </div>
                          </div>
                          <span className="text-sm shrink-0">{categoryIcon(e.category)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Recurring patterns */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3.5 border-b border-slate-100">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">🔁 Known Recurring Patterns</p>
                </div>
                <div className="divide-y divide-slate-100">
                  {recurring.map((e) => (
                    <div key={e.id} className="px-4 py-3">
                      <p className="text-xs font-semibold text-slate-900">{categoryIcon(e.category)} {e.title}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{e.recurrenceNote}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
