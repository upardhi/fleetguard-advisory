"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ListChecks, Navigation, ArrowLeft, Plus, MoreHorizontal,
  CheckCircle2, Clock, AlertTriangle, XCircle, Package,
  TrendingUp, Truck, Filter,
} from "lucide-react";
import { TopBar } from "@/app/_components/TopBar";
import { usePlanStore } from "@/app/_hooks/usePlanStore";
import type { DispatchPlan, DispatchStatus, RiskLevel } from "@/app/_lib/types";

// ── Config ───────────────────────────────────────────────────────

const STATUS_CONFIG: Record<DispatchStatus, { label: string; icon: React.ComponentType<{ size?: number; className?: string }>; cls: string }> = {
  draft:      { label: "Draft",      icon: Clock,         cls: "bg-slate-100 text-slate-600 border-slate-200" },
  approved:   { label: "Approved",   icon: CheckCircle2,  cls: "bg-green-50 text-green-700 border-green-200" },
  on_hold:    { label: "On Hold",    icon: AlertTriangle, cls: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  dispatched: { label: "Dispatched", icon: Truck,         cls: "bg-blue-50 text-blue-700 border-blue-200" },
  cancelled:  { label: "Cancelled",  icon: XCircle,       cls: "bg-red-50 text-red-600 border-red-200" },
};

const REC_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ size?: number }> }> = {
  dispatch:       { label: "Dispatch",      icon: CheckCircle2 },
  delay:          { label: "Delay",         icon: Clock },
  reroute:        { label: "Reroute",       icon: TrendingUp },
  hold:           { label: "Hold",          icon: AlertTriangle },
  dispatch_early: { label: "Early dispatch",icon: Navigation },
};

function riskBadge(r: RiskLevel) {
  const cls: Record<RiskLevel, string> = {
    critical: "bg-red-50 text-red-700 border-red-200",
    high:     "bg-orange-50 text-orange-700 border-orange-200",
    medium:   "bg-yellow-50 text-yellow-700 border-yellow-200",
    low:      "bg-blue-50 text-blue-700 border-blue-200",
    safe:     "bg-green-50 text-green-700 border-green-200",
  };
  return cls[r];
}

// ── Page ─────────────────────────────────────────────────────────

export default function PlannedDispatchesPage() {
  const { plans, updatePlan, deletePlan } = usePlanStore();
  const [statusFilter, setStatusFilter] = useState<DispatchStatus | "all">("all");
  const [riskFilter, setRiskFilter]     = useState<RiskLevel | "all">("all");
  const [openMenu, setOpenMenu]         = useState<string | null>(null);

  const filtered = useMemo(() =>
    plans.filter((p) =>
      (statusFilter === "all" || p.status === statusFilter) &&
      (riskFilter   === "all" || p.riskLevel === riskFilter)
    ),
    [plans, statusFilter, riskFilter]
  );

  // Stats
  const total      = plans.length;
  const active     = plans.filter((p) => p.status === "draft" || p.status === "approved" || p.status === "on_hold").length;
  const dispatched = plans.filter((p) => p.status === "dispatched").length;
  const critical   = plans.filter((p) => p.riskLevel === "critical" || p.riskLevel === "high").length;

  function changeStatus(id: string, status: DispatchStatus) {
    updatePlan(id, { status });
    setOpenMenu(null);
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar title="Planned Dispatches" subtitle={`${total} dispatch plans`} />
      <div className="flex-1 overflow-auto p-6 bg-slate-50">
        <div className="max-w-5xl mx-auto space-y-5">

          <div className="flex items-center justify-between">
            <Link href="/advisory" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
              <ArrowLeft size={14} />Back to Control Tower
            </Link>
            <Link
              href="/advisory/planner"
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 transition"
            >
              <Plus size={14} />New Plan
            </Link>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4">
            <StatBox label="Total Plans"  value={total}      icon={ListChecks} cls="bg-brand-50 text-brand-700" />
            <StatBox label="Active"       value={active}     icon={Clock}      cls="bg-yellow-50 text-yellow-700" />
            <StatBox label="Dispatched"   value={dispatched} icon={Truck}      cls="bg-blue-50 text-blue-700" />
            <StatBox label="High Risk"    value={critical}   icon={AlertTriangle} cls="bg-red-50 text-red-700" />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <Filter size={14} className="text-slate-400" />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as DispatchStatus | "all")} className={sel}>
              <option value="all">All statuses</option>
              {(Object.keys(STATUS_CONFIG) as DispatchStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
              ))}
            </select>
            <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value as RiskLevel | "all")} className={sel}>
              <option value="all">All risk levels</option>
              {(["critical","high","medium","low","safe"] as RiskLevel[]).map((r) => (
                <option key={r} value={r} className="capitalize">{r}</option>
              ))}
            </select>
            {(statusFilter !== "all" || riskFilter !== "all") && (
              <button onClick={() => { setStatusFilter("all"); setRiskFilter("all"); }} className="text-xs text-brand-600 font-medium hover:underline">
                Clear filters
              </button>
            )}
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-52 text-slate-400">
                <Package size={32} className="mb-2 text-slate-200" />
                <p className="text-sm">No dispatch plans match your filters</p>
                <Link href="/advisory/planner" className="mt-2 text-xs text-brand-600 hover:underline">
                  Create a new plan →
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Route</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Date / Time</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Risk</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Recommendation</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">ETA Impact</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((plan) => {
                      const sc = STATUS_CONFIG[plan.status];
                      const rc = REC_CONFIG[plan.recommendation] ?? REC_CONFIG.dispatch;
                      const SIcon = sc.icon;
                      const RIcon = rc.icon;
                      return (
                        <tr key={plan.id} className="hover:bg-slate-50/60 transition">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2 font-semibold text-slate-900">
                              <Navigation size={13} className="text-brand-500 shrink-0" />
                              {plan.origin} → {plan.destination}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">{plan.vehicleType} · {plan.cargoType}</div>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="num text-slate-700">{plan.plannedDate}</div>
                            <div className="num text-xs text-slate-500">{plan.plannedTime}</div>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${riskBadge(plan.riskLevel)}`}>
                              {plan.riskLevel}
                            </span>
                            <div className="num text-xs text-slate-400 mt-0.5">Score: {plan.riskScore}</div>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1.5 text-slate-700">
                              <RIcon size={12} />
                              <span className="text-xs">{rc.label}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${sc.cls}`}>
                              <SIcon size={10} />
                              {sc.label}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            {plan.etaImpactHours > 0 ? (
                              <span className="num text-xs text-orange-600 font-semibold">+{plan.etaImpactHours}h</span>
                            ) : (
                              <span className="text-xs text-green-600 font-semibold">None</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 relative">
                            <button
                              onClick={() => setOpenMenu(openMenu === plan.id ? null : plan.id)}
                              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                            >
                              <MoreHorizontal size={14} />
                            </button>
                            {openMenu === plan.id && (
                              <div className="absolute right-4 top-10 z-20 w-44 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
                                {(["draft","approved","on_hold","dispatched","cancelled"] as DispatchStatus[]).map((s) => {
                                  if (s === plan.status) return null;
                                  const cfg = STATUS_CONFIG[s];
                                  const Icon = cfg.icon;
                                  return (
                                    <button
                                      key={s}
                                      onClick={() => changeStatus(plan.id, s)}
                                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-xs text-slate-700 hover:bg-slate-50 transition"
                                    >
                                      <Icon size={12} />
                                      Mark as {cfg.label}
                                    </button>
                                  );
                                })}
                                <div className="border-t border-slate-100">
                                  <button
                                    onClick={() => { deletePlan(plan.id); setOpenMenu(null); }}
                                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-xs text-red-600 hover:bg-red-50 transition"
                                  >
                                    <XCircle size={12} />Delete plan
                                  </button>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, icon: Icon, cls }: { label: string; value: number; icon: React.ComponentType<{ size?: number }>; cls: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${cls}`}>
        <Icon size={18} />
      </div>
      <div>
        <div className="text-2xl font-bold text-slate-900 num">{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </div>
  );
}

const sel = "px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-300";
