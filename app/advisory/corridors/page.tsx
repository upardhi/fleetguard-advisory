"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  MapPin, ArrowLeft, RefreshCw, Activity, Navigation,
  AlertTriangle, CheckCircle, Clock, Route, Settings,
  Loader2, Zap,
} from "lucide-react";
import { TopBar } from "@/app/_components/TopBar";
import type { RiskLevel } from "@/app/_lib/types";
import { Plus } from "lucide-react";

const RISK_CONFIG: Record<string, { label: string; cls: string; dot: string }> = {
  critical: { label: "Critical", cls: "bg-red-50 text-red-700 border border-red-200", dot: "bg-red-500" },
  high: { label: "High", cls: "bg-orange-50 text-orange-700 border border-orange-200", dot: "bg-orange-500" },
  medium: { label: "Medium", cls: "bg-yellow-50 text-yellow-700 border border-yellow-200", dot: "bg-yellow-500" },
  low: { label: "Low", cls: "bg-blue-50 text-blue-700 border border-blue-200", dot: "bg-blue-500" },
  safe: { label: "Safe", cls: "bg-green-50 text-green-700 border border-green-200", dot: "bg-green-500" },
};

interface Corridor {
  id: string;
  name: string;
  origin: string;
  destination: string;
  max_risk_level: string | null;
  disruption_count: number;
  last_intel_at: string | null;
  routes_fetched: boolean;
  region_id?: string | null;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "Never scanned";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

const REGIONS = [
  { id: "north", label: "North India", color: "bg-blue-100 text-blue-700" },
  { id: "east", label: "East India", color: "bg-orange-100 text-orange-700" },
  { id: "west", label: "West India", color: "bg-purple-100 text-purple-700" },
  { id: "south", label: "South India", color: "bg-emerald-100 text-emerald-700" },
];

export default function CorridorsPage() {
  const [corridors, setCorridors] = useState<Corridor[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [assigningRegion, setAssigningRegion] = useState<{ corridorId: string; name: string } | null>(null);
  const [assigningTo, setAssigningTo] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [label, setLabel] = useState("");
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [addingCorridor, setAddingCorridor] = useState(false);
  const [scheduleType, setScheduleType] = useState<"daily" | "once">("daily");
  const [scheduledDate, setScheduledDate] = useState("");
  const [showScheduleOptions, setShowScheduleOptions] = useState(false);


  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/advisory/v1/intelligence", { credentials: "include" });
      if (res.ok) {
        const d = await res.json();
        setCorridors(d.corridors ?? []);
      }
    } catch { /* keep last */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function scanNow() {
    setScanning(true);
    try {
      await fetch("/api/cron/run-intelligence", { method: "POST", credentials: "include" });
      await new Promise((r) => setTimeout(r, 1200));
      await load();
    } catch { /* ignore */ }
    finally { setScanning(false); }
  }

  async function assignRegion(corridorId: string, regionId: string | null) {
    try {
      const res = await fetch(`/api/advisory/v1/watched-routes/${corridorId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regionId }),
      });
      if (res.ok) {
        setAssigningRegion(null);
        setAssigningTo(null);
        await load();
      }
    } catch { /* error */ }
  }

  async function handleAddCorridor(e: React.FormEvent) {
    e.preventDefault();
    if (!origin.trim() || !destination.trim()) return;

    // Validate date for once schedule
    if (scheduleType === "once" && !scheduledDate) {
      alert("Please select a date for one-time schedule");
      return;
    }

    setAddingCorridor(true);
    try {
      const res = await fetch("/api/advisory/v1/watched-routes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: label || `${origin} - ${destination}`,
          origin: origin.trim(),
          destination: destination.trim(),
          region_id: selectedRegion || null,
          schedule_type: scheduleType,
          scheduled_date: scheduleType === "once" ? scheduledDate : undefined,
        }),
      });
      if (res.ok) {
        setOrigin("");
        setDestination("");
        setLabel("");
        setSelectedRegion(null);
        setScheduleType("daily");
        setScheduledDate("");
        setShowScheduleOptions(false);
        setShowAddModal(false);
        await load();
      } else {
        const error = await res.json();
        alert(error.error || "Failed to add corridor");
      }
    } catch (err) {
      console.error("Error adding corridor:", err);
      alert("Failed to add corridor");
    } finally {
      setAddingCorridor(false);
    }
  }

  const filtered = useMemo(() => {
    if (riskFilter === "all") return corridors;
    return corridors.filter((c) => (c.max_risk_level ?? "safe") === riskFilter);
  }, [corridors, riskFilter]);

  const critical = corridors.filter((c) => c.max_risk_level === "critical").length;
  const safe = corridors.filter((c) => !c.max_risk_level || c.max_risk_level === "safe").length;
  const withDisruption = corridors.filter((c) => (c.disruption_count ?? 0) > 0).length;

  if (loading) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar title="Corridor Watch" subtitle="Loading corridors…" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={28} className="animate-spin text-slate-300" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar
        title="Corridor Watch"
        subtitle={`${corridors.length} monitored corridor${corridors.length !== 1 ? "s" : ""}`}
      />
      <div className="flex-1 overflow-auto p-6 bg-slate-50">
        <div className="max-w-5xl mx-auto space-y-5">

          <div className="flex items-center justify-between">
            <Link
              href="/advisory"
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
            >
              <ArrowLeft size={14} />Back to Control Tower
            </Link>
            <div className="flex items-center gap-2">
              <button
                onClick={scanNow}
                disabled={scanning}
                className="inline-flex items-center gap-1.5 text-sm text-slate-600 border border-slate-200 bg-white px-3 py-2 rounded-lg hover:bg-slate-50 transition disabled:opacity-60"
              >
                <RefreshCw size={13} className={scanning ? "animate-spin" : ""} />
                {scanning ? "Scanning…" : "Scan Now"}
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-1.5 text-sm text-slate-600 border border-slate-200 bg-white px-3 py-2 rounded-lg hover:bg-slate-50 transition"
              >
                <Plus size={13} />Add Corridor
              </button>
              <Link
                href="/advisory/settings"
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 transition"
              >
                <Settings size={14} />Manage
              </Link>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4">
            <StatBox icon={Activity} label="Monitored" value={corridors.length} cls="bg-brand-50 text-brand-700" />
            <StatBox icon={AlertTriangle} label="Critical" value={critical} cls="bg-red-50 text-red-700" />
            <StatBox icon={CheckCircle} label="Safe" value={safe} cls="bg-green-50 text-green-700" />
            <StatBox icon={Zap} label="Disruptions" value={withDisruption} cls="bg-orange-50 text-orange-700" />
          </div>

          {/* Risk filter */}
          <div className="flex flex-wrap gap-2">
            {(["all", "critical", "high", "medium", "low", "safe"] as const).map((r) => {
              const count = r === "all"
                ? corridors.length
                : corridors.filter((c) => (c.max_risk_level ?? "safe") === r).length;
              return (
                <button
                  key={r}
                  onClick={() => setRiskFilter(r)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${riskFilter === r
                    ? "bg-brand-700 text-white border-brand-700"
                    : "bg-white text-slate-600 border-slate-200 hover:border-brand-300"
                    }`}
                >
                  {r === "all" ? "All" : RISK_CONFIG[r].label}
                  {r !== "all" && ` (${count})`}
                </button>
              );
            })}
          </div>

          {/* Empty state */}
          {corridors.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 bg-white rounded-2xl border border-slate-200">
              <Route size={32} className="text-slate-200 mb-2" />
              <p className="text-sm font-semibold text-slate-500">No watched corridors yet</p>
              <p className="text-xs text-slate-400 mt-1">Add corridors in Settings to start monitoring</p>
              <Link
                href="/advisory/settings"
                className="mt-4 text-xs font-semibold text-brand-600 hover:underline"
              >
                Go to Settings →
              </Link>
            </div>
          )}

          {/* Corridor grid */}
          {corridors.length > 0 && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((corridor) => {
                const riskKey = (corridor.max_risk_level ?? "safe") as RiskLevel;
                const rc = RISK_CONFIG[riskKey] ?? RISK_CONFIG.safe;
                const disruptCount = corridor.disruption_count ?? 0;
                return (
                  <div
                    key={corridor.id}
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow"
                  >
                    {/* Card header */}
                    <div className="px-4 py-3.5 border-b border-slate-100">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${rc.dot}`} />
                          <p className="text-sm font-bold text-slate-900 truncate">{corridor.name}</p>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${rc.cls}`}>
                          {rc.label}
                        </span>
                      </div>
                    </div>

                    {/* Card body */}
                    <div className="px-4 py-3.5 space-y-2.5">
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        <Navigation size={11} className="text-slate-400 shrink-0" />
                        <span className="truncate">{corridor.origin}</span>
                        <span className="text-slate-300 shrink-0">→</span>
                        <span className="truncate">{corridor.destination}</span>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {disruptCount > 0 ? (
                            <AlertTriangle size={12} className="text-orange-500" />
                          ) : (
                            <CheckCircle size={12} className="text-green-500" />
                          )}
                          <span className="text-xs text-slate-600">
                            {disruptCount > 0
                              ? `${disruptCount} disruption${disruptCount > 1 ? "s" : ""}`
                              : "No active disruptions"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-slate-400">
                          <Clock size={10} />
                          {timeAgo(corridor.last_intel_at)}
                        </div>
                      </div>

                      {!corridor.routes_fetched && (
                        <div className="flex items-center gap-1.5 text-[11px] text-amber-600 bg-amber-50 rounded-md px-2 py-1">
                          <AlertTriangle size={10} />
                          Route not yet mapped
                        </div>
                      )}
                    </div>

                    {/* Card footer */}
                    <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                      {corridor.region_id && (
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${REGIONS.find(r => r.id === corridor.region_id)?.color || "bg-slate-100 text-slate-700"
                          }`}>
                          {REGIONS.find(r => r.id === corridor.region_id)?.label || "No Region"}
                        </span>
                      )}
                      {!corridor.region_id && (
                        <span className="text-[10px] text-slate-400 font-medium">No region assigned</span>
                      )}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setAssigningRegion({ corridorId: corridor.id, name: corridor.name })}
                          className="text-[11px] text-slate-500 hover:text-slate-700 font-semibold px-2 py-1"
                        >
                          Assign Region
                        </button>
                        <Link
                          href={`/advisory/planned/dispatches?corridorId=${corridor.id}`}
                          className="text-[11px] text-brand-600 font-semibold hover:underline px-2 py-1"
                        >
                          Trips
                        </Link>
                        <Link
                          href={`/advisory/planner?corridorId=${corridor.id}`}
                          className="text-[11px] text-brand-600 font-semibold hover:underline px-2 py-1"
                        >
                          Plan →
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}

              {filtered.length === 0 && (
                <div className="sm:col-span-2 lg:col-span-3 flex flex-col items-center justify-center h-48 bg-white rounded-2xl border border-slate-200">
                  <MapPin size={32} className="text-slate-200 mb-2" />
                  <p className="text-sm text-slate-400">No corridors match this filter</p>
                </div>
              )}
            </div>
          )}

          {/* Add Corridor Modal */}
          {showAddModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900">Add Corridor</h3>
                  <button
                    onClick={() => {
                      setShowAddModal(false);
                      setShowScheduleOptions(false);
                      setScheduleType("daily");
                      setScheduledDate("");
                    }}
                    className="text-slate-400 hover:text-slate-600 text-lg"
                  >
                    ×
                  </button>
                </div>

                <p className="text-sm text-slate-600">
                  Enter any route your trucks use. We will map every district and monitor for disruptions automatically.
                </p>

                <form onSubmit={(e) => void handleAddCorridor(e)} className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-slate-700 block mb-1">Origin *</label>
                    <input
                      type="text"
                      placeholder="e.g. Mumbai"
                      value={origin}
                      onChange={(e) => setOrigin(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700 block mb-1">Destination *</label>
                    <input
                      type="text"
                      placeholder="e.g. Nagpur"
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700 block mb-1">Label (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Daily Mumbai-Nagpur run"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700 block mb-1">Region (Optional)</label>
                    <select
                      value={selectedRegion || ""}
                      onChange={(e) => setSelectedRegion(e.target.value || null)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="">No Region</option>
                      {REGIONS.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Schedule Options Toggle */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowScheduleOptions(!showScheduleOptions)}
                      className="text-sm text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1"
                    >
                      {showScheduleOptions ? "▼" : "▶"} Schedule Options (Optional)
                    </button>
                  </div>

                  {showScheduleOptions && (
                    <div className="space-y-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div>
                        <label className="text-sm font-medium text-slate-700 block mb-1">Schedule Type</label>
                        <div className="flex gap-4">
                          <label className="flex items-center gap-2">
                            <input
                              type="radio"
                              value="daily"
                              checked={scheduleType === "daily"}
                              onChange={(e) => setScheduleType(e.target.value as "daily")}
                              className="w-4 h-4 text-brand-600"
                            />
                            <span className="text-sm text-slate-700">Daily (Default)</span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="radio"
                              value="once"
                              checked={scheduleType === "once"}
                              onChange={(e) => setScheduleType(e.target.value as "once")}
                              className="w-4 h-4 text-brand-600"
                            />
                            <span className="text-sm text-slate-700">One-time</span>
                          </label>
                        </div>
                      </div>

                      {scheduleType === "once" && (
                        <div>
                          <label className="text-sm font-medium text-slate-700 block mb-1">Run Date *</label>
                          <input
                            type="date"
                            value={scheduledDate}
                            onChange={(e) => setScheduledDate(e.target.value)}
                            min={new Date().toISOString().slice(0, 10)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                            required
                          />
                          <p className="text-xs text-slate-500 mt-1">
                            Intelligence will run once on this date and then stop automatically.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button
                      type="submit"
                      disabled={addingCorridor || !origin.trim() || !destination.trim()}
                      className="flex-1 px-4 py-2 rounded-lg bg-brand-700 text-white font-medium hover:bg-brand-800 transition disabled:opacity-60"
                    >
                      {addingCorridor ? "Adding…" : "Add Corridor"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddModal(false);
                        setShowScheduleOptions(false);
                        setScheduleType("daily");
                        setScheduledDate("");
                      }}
                      className="flex-1 px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-medium hover:bg-slate-50 transition"
                    >
                      Cancel
                    </button>
                  </div>
                </form>

                <div className="text-xs text-slate-400 border-t border-slate-100 pt-3 mt-2">
                  <p>💡 <strong>Daily:</strong> Intelligence runs every day automatically</p>
                  <p>🎯 <strong>One-time:</strong> Intelligence runs only on the selected date</p>
                </div>
              </div>
            </div>
          )}


          {/* Region Assignment Modal */}
          {assigningRegion && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
                <h3 className="text-lg font-bold text-slate-900">Assign Region</h3>
                <p className="text-sm text-slate-600">
                  Select region for <span className="font-semibold">{assigningRegion.name}</span>
                </p>
                <div className="space-y-2">
                  {REGIONS.map((region) => (
                    <button
                      key={region.id}
                      onClick={() => void assignRegion(assigningRegion.corridorId, region.id)}
                      disabled={assigningTo === region.id}
                      className={`w-full text-left px-4 py-3 rounded-lg font-medium transition ${assigningTo === region.id
                        ? "bg-slate-100 text-slate-400 cursor-wait"
                        : `${region.color} hover:opacity-90`
                        }`}
                    >
                      {region.label}
                    </button>
                  ))}
                  <button
                    onClick={() => void assignRegion(assigningRegion.corridorId, null)}
                    disabled={assigningTo === "none"}
                    className={`w-full text-left px-4 py-3 rounded-lg font-medium transition ${assigningTo === "none"
                      ? "bg-slate-100 text-slate-400 cursor-wait"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                  >
                    None (Implicit Matching Only)
                  </button>
                </div>
                <button
                  onClick={() => setAssigningRegion(null)}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-medium hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatBox({
  icon: Icon, label, value, cls,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  value: number;
  cls: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-4 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${cls}`}>
        <Icon size={16} />
      </div>
      <div>
        <div className="text-xl font-bold text-slate-900 num">{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </div>
  );
}
