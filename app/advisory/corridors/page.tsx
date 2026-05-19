"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  MapPin, ArrowLeft, Bell, BellOff, RefreshCw, Plus,
  AlertTriangle, CheckCircle, Activity, Navigation,
  Trash2, X,
} from "lucide-react";
import { TopBar } from "@/app/_components/TopBar";
import { MOCK_CORRIDORS, MAJOR_CITIES } from "@/app/_lib/mockData";
import type { MonitoredCorridor, RiskLevel } from "@/app/_lib/types";

// ── Helpers ──────────────────────────────────────────────────────

const RISK_CONFIG: Record<RiskLevel, { label: string; cls: string; dot: string }> = {
  critical: { label: "Critical", cls: "bg-red-50 text-red-700 border border-red-200",    dot: "bg-red-500" },
  high:     { label: "High",     cls: "bg-orange-50 text-orange-700 border border-orange-200", dot: "bg-orange-500" },
  medium:   { label: "Medium",   cls: "bg-yellow-50 text-yellow-700 border border-yellow-200", dot: "bg-yellow-500" },
  low:      { label: "Low",      cls: "bg-blue-50 text-blue-700 border border-blue-200",  dot: "bg-blue-500" },
  safe:     { label: "Safe",     cls: "bg-green-50 text-green-700 border border-green-200", dot: "bg-green-500" },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

// ── Page ─────────────────────────────────────────────────────────

export default function CorridorsPage() {
  const [corridors, setCorridors] = useState<MonitoredCorridor[]>(MOCK_CORRIDORS);
  const [riskFilter, setRiskFilter] = useState<RiskLevel | "all">("all");
  const [showAdd, setShowAdd] = useState(false);
  const [newOrigin, setNewOrigin] = useState("");
  const [newDest, setNewDest] = useState("");
  const [newHighway, setNewHighway] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const filtered = useMemo(() =>
    corridors.filter((c) => riskFilter === "all" || c.riskLevel === riskFilter),
    [corridors, riskFilter]
  );

  const critical = corridors.filter((c) => c.riskLevel === "critical").length;
  const safe     = corridors.filter((c) => c.riskLevel === "safe").length;
  const alerted  = corridors.filter((c) => c.alertsEnabled).length;

  function toggleAlerts(id: string) {
    setCorridors((prev) => prev.map((c) => c.id === id ? { ...c, alertsEnabled: !c.alertsEnabled } : c));
  }

  function removeCorridor(id: string) {
    setCorridors((prev) => prev.filter((c) => c.id !== id));
  }

  async function refreshAll() {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 800));
    setCorridors((prev) => prev.map((c) => ({ ...c, lastChecked: new Date().toISOString() })));
    setRefreshing(false);
  }

  function addCorridor() {
    if (!newOrigin || !newDest) return;
    const corridor: MonitoredCorridor = {
      id: `cor_${Date.now()}`,
      name: `${newOrigin}–${newDest}`,
      origin: newOrigin,
      destination: newDest,
      highway: newHighway || "Unknown",
      distanceKm: 0,
      riskLevel: "safe",
      activeDisruptions: 0,
      lastChecked: new Date().toISOString(),
      alertsEnabled: true,
      tags: [],
    };
    setCorridors((prev) => [corridor, ...prev]);
    setNewOrigin(""); setNewDest(""); setNewHighway("");
    setShowAdd(false);
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar title="Corridor Watch" subtitle={`${corridors.length} monitored corridors`} />
      <div className="flex-1 overflow-auto p-6 bg-slate-50">
        <div className="max-w-5xl mx-auto space-y-5">

          <div className="flex items-center justify-between">
            <Link href="/advisory" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
              <ArrowLeft size={14} />Back to Control Tower
            </Link>
            <div className="flex items-center gap-2">
              <button
                onClick={refreshAll}
                disabled={refreshing}
                className="inline-flex items-center gap-1.5 text-sm text-slate-600 border border-slate-200 bg-white px-3 py-2 rounded-lg hover:bg-slate-50 transition disabled:opacity-60"
              >
                <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
                Refresh
              </button>
              <button
                onClick={() => setShowAdd(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 transition"
              >
                <Plus size={14} />Add Corridor
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4">
            <StatBox icon={Activity}       label="Monitored"   value={corridors.length} cls="bg-brand-50 text-brand-700" />
            <StatBox icon={AlertTriangle}  label="Critical"    value={critical}          cls="bg-red-50 text-red-700" />
            <StatBox icon={CheckCircle}    label="Safe"        value={safe}              cls="bg-green-50 text-green-700" />
            <StatBox icon={Bell}           label="Alerts On"   value={alerted}           cls="bg-purple-50 text-purple-700" />
          </div>

          {/* Risk filter */}
          <div className="flex flex-wrap gap-2">
            {(["all","critical","high","medium","low","safe"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRiskFilter(r)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
                  riskFilter === r
                    ? "bg-brand-700 text-white border-brand-700"
                    : "bg-white text-slate-600 border-slate-200 hover:border-brand-300"
                }`}
              >
                {r === "all" ? "All" : RISK_CONFIG[r].label}
                {r !== "all" && ` (${corridors.filter((c) => c.riskLevel === r).length})`}
              </button>
            ))}
          </div>

          {/* Corridor grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((corridor) => {
              const rc = RISK_CONFIG[corridor.riskLevel];
              return (
                <div key={corridor.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
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
                    <p className="text-xs text-slate-500 mt-1 pl-4">{corridor.highway}</p>
                  </div>

                  {/* Card body */}
                  <div className="px-4 py-3.5 space-y-2.5">
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <Navigation size={11} className="text-slate-400 shrink-0" />
                      <span>{corridor.origin}</span>
                      <span className="text-slate-300">→</span>
                      <span>{corridor.destination}</span>
                      {corridor.distanceKm > 0 && (
                        <span className="ml-auto text-slate-400 num">{corridor.distanceKm} km</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {corridor.activeDisruptions > 0 ? (
                          <AlertTriangle size={12} className="text-orange-500" />
                        ) : (
                          <CheckCircle size={12} className="text-green-500" />
                        )}
                        <span className="text-xs text-slate-600">
                          {corridor.activeDisruptions > 0
                            ? `${corridor.activeDisruptions} disruption${corridor.activeDisruptions > 1 ? "s" : ""} active`
                            : "No active disruptions"}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400">Checked {timeAgo(corridor.lastChecked)}</span>
                    </div>

                    {corridor.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {corridor.tags.map((t) => (
                          <span key={t} className="text-[10px] bg-slate-100 text-slate-500 rounded px-1.5 py-0.5">{t}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Card footer */}
                  <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-2">
                    <button
                      onClick={() => toggleAlerts(corridor.id)}
                      className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-md transition ${
                        corridor.alertsEnabled
                          ? "bg-purple-50 text-purple-700 hover:bg-purple-100"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      }`}
                    >
                      {corridor.alertsEnabled ? <Bell size={11} /> : <BellOff size={11} />}
                      {corridor.alertsEnabled ? "Alerts on" : "Alerts off"}
                    </button>
                    <div className="flex items-center gap-1">
                      <Link
                        href={`/advisory/planner`}
                        className="text-[11px] text-brand-600 font-semibold hover:underline px-2 py-1"
                      >
                        Plan dispatch
                      </Link>
                      <button
                        onClick={() => removeCorridor(corridor.id)}
                        className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition"
                        title="Remove corridor"
                      >
                        <Trash2 size={12} />
                      </button>
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
        </div>
      </div>

      {/* Add corridor modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Add Corridor to Watch</h3>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <Field label="Origin">
                <select value={newOrigin} onChange={(e) => setNewOrigin(e.target.value)} className={sel}>
                  <option value="">Select origin…</option>
                  {MAJOR_CITIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Destination">
                <select value={newDest} onChange={(e) => setNewDest(e.target.value)} className={sel}>
                  <option value="">Select destination…</option>
                  {MAJOR_CITIES.filter((c) => c !== newOrigin).map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Primary Highway (optional)">
                <input value={newHighway} onChange={(e) => setNewHighway(e.target.value)} placeholder="e.g. NH44" className={inp} />
              </Field>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
              <button onClick={() => setShowAdd(false)} className="text-sm text-slate-600 hover:text-slate-900">Cancel</button>
              <button
                onClick={addCorridor}
                disabled={!newOrigin || !newDest}
                className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-40 transition"
              >
                Add Corridor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatBox({ icon: Icon, label, value, cls }: { icon: React.ComponentType<{ size?: number }>; label: string; value: number; cls: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-4 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${cls}`}><Icon size={16} /></div>
      <div>
        <div className="text-xl font-bold text-slate-900 num">{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-slate-600">{label}</label>
      {children}
    </div>
  );
}

const sel = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-300";
const inp = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-300";
