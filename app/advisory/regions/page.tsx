"use client";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { TopBar } from "@/app/_components/TopBar";
import RiskBadge from "@/app/_components/RiskBadge";
import { LiveIndicator } from "@/app/_components/LiveIndicator";
import type { RiskLevel } from "@/app/_lib/types";
import {
  AlertTriangle, ShieldCheck, Zap, Building2, Route,
  Users, ArrowRight, Loader2, Clock, RefreshCw, Map as MapPinIcon,
} from "lucide-react";
import type { CityEntry, RegionMapData } from "@/app/_components/IndiaRegionsMap";

// Leaflet requires the browser — disable SSR
const IndiaRegionsMap = dynamic(
  () => import("@/app/_components/IndiaRegionsMap"),
  { ssr: false, loading: () => (
    <div className="flex items-center justify-center h-full text-slate-300">
      <Loader2 size={24} className="animate-spin" />
    </div>
  )},
);

interface RegionIssue {
  title:     string;
  state:     string | null;
  riskLevel: string;
  category:  string | null;
}

interface RegionStat {
  id:          string;
  label:       string;
  color:       string;
  disruptions: number;
  critical:    number;
  high:        number;
  worstRisk:   string;
  topIssues:   RegionIssue[];
  corridors:   number;
  cities:      number;
  cityList:    CityEntry[];
  teamMembers: number;
  lastIntelAt: string | null;
}

const REGION_PALETTE: Record<string, { bg: string; border: string; text: string; hdr: string }> = {
  north: { bg: "bg-blue-50",    border: "border-blue-200",   text: "text-blue-700",    hdr: "bg-blue-600"    },
  east:  { bg: "bg-orange-50",  border: "border-orange-200", text: "text-orange-700",  hdr: "bg-orange-500"  },
  west:  { bg: "bg-purple-50",  border: "border-purple-200", text: "text-purple-700",  hdr: "bg-purple-600"  },
  south: { bg: "bg-emerald-50", border: "border-emerald-200",text: "text-emerald-700", hdr: "bg-emerald-600" },
};

const CATEGORY_ICON: Record<string, string> = {
  political: "🚫", weather: "🌩", traffic: "⛽",
  security: "🔒", infrastructure: "🛣", religious: "🎯",
  vvip: "🚨", natural_disaster: "🌊",
};

function fmtIst(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short",
  });
}

export default function RegionsPage() {
  const [regions, setRegions] = useState<RegionStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await fetch("/api/advisory/v1/regions", { credentials: "include" });
      if (res.ok) {
        const d = await res.json() as { regions: RegionStat[] };
        setRegions(d.regions);
      }
    } catch { /* keep last */ }
    finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { load(); }, []);

  const totalDisruptions = regions.reduce((a, r) => a + r.disruptions, 0);
  const totalCritical    = regions.reduce((a, r) => a + r.critical,    0);
  const totalHigh        = regions.reduce((a, r) => a + r.high,        0);
  const affectedRegions  = regions.filter((r) => r.disruptions > 0).length;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar title="Regions" subtitle="ITC Ops Regions — North · East · West · South" />

      <div className="flex-1 overflow-auto">
        <div className="p-6 max-w-screen-2xl mx-auto space-y-6">

          {/* Summary strip */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 shadow-sm">
              <AlertTriangle size={15} className="text-orange-500" />
              <span className="text-sm font-bold text-slate-800 num">{totalDisruptions}</span>
              <span className="text-xs text-slate-500">Total Disruptions</span>
            </div>
            {totalCritical > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 border border-red-200 shadow-sm">
                <Zap size={15} className="text-red-500" />
                <span className="text-sm font-bold text-red-700 num">{totalCritical}</span>
                <span className="text-xs text-red-600">Critical</span>
              </div>
            )}
            {totalHigh > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-50 border border-orange-200 shadow-sm">
                <AlertTriangle size={15} className="text-orange-500" />
                <span className="text-sm font-bold text-orange-700 num">{totalHigh}</span>
                <span className="text-xs text-orange-600">High Risk</span>
              </div>
            )}
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 shadow-sm">
              <ShieldCheck size={15} className="text-emerald-500" />
              <span className="text-sm font-bold text-slate-800 num">{4 - affectedRegions}</span>
              <span className="text-xs text-slate-500">Regions Clear</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <LiveIndicator />
              <button
                onClick={() => load(true)}
                disabled={refreshing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition disabled:opacity-50"
              >
                <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
                Refresh
              </button>
            </div>
          </div>

          {/* India Map */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPinIcon size={15} className="text-brand-600" />
                <h2 className="text-sm font-semibold text-slate-800">Region & City Map</h2>
                <span className="text-xs text-slate-400">— Click any region bubble for details</span>
              </div>
              {!loading && (
                <span className="text-[11px] text-slate-400">
                  {regions.reduce((a, r) => a + r.cities, 0)} depot cities mapped
                </span>
              )}
            </div>
            <div style={{ height: 460 }}>
              {loading ? (
                <div className="flex items-center justify-center h-full text-slate-300">
                  <Loader2 size={24} className="animate-spin" />
                </div>
              ) : (
                <IndiaRegionsMap
                  regions={regions.map((r): RegionMapData => ({
                    id:          r.id,
                    label:       r.label,
                    worstRisk:   r.worstRisk,
                    disruptions: r.disruptions,
                    critical:    r.critical,
                    high:        r.high,
                    corridors:   r.corridors,
                    cities:      r.cities,
                    cityList:    r.cityList ?? [],
                  }))}
                />
              )}
            </div>
          </div>

          {/* Region top-table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">ITC Operations Regions</h2>
              <span className="text-xs text-slate-400">Click any region to drill down →</span>
            </div>

            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 size={24} className="animate-spin text-slate-300" />
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {/* Table header */}
                <div className="grid grid-cols-12 px-5 py-2 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <div className="col-span-2">Region</div>
                  <div className="col-span-1 text-center">Risk</div>
                  <div className="col-span-1 text-center">Critical</div>
                  <div className="col-span-1 text-center">High</div>
                  <div className="col-span-1 text-center">Total</div>
                  <div className="col-span-2">Top Issue</div>
                  <div className="col-span-1 text-center">Corridors</div>
                  <div className="col-span-1 text-center">Cities</div>
                  <div className="col-span-1 text-center">Team</div>
                  <div className="col-span-1 text-right">Last Scan</div>
                </div>

                {regions.map((r) => {
                  const pal = REGION_PALETTE[r.id] ?? REGION_PALETTE.north;
                  const topIssue = r.topIssues[0];
                  return (
                    <Link
                      key={r.id}
                      href={`/advisory/regions/${r.id}`}
                      className="grid grid-cols-12 px-5 py-4 items-center hover:bg-slate-50/80 transition-colors group"
                    >
                      {/* Region name */}
                      <div className="col-span-2 flex items-center gap-3">
                        <div className={`w-2.5 h-10 rounded-full ${pal.hdr}`} />
                        <div>
                          <p className={`text-sm font-bold ${pal.text}`}>{r.label}</p>
                          <p className="text-[10px] text-slate-400">{r.cities} depot cities</p>
                        </div>
                      </div>

                      {/* Risk badge */}
                      <div className="col-span-1 flex justify-center">
                        <RiskBadge level={r.worstRisk as RiskLevel} size="xs" pulse={r.worstRisk === "critical"} />
                      </div>

                      {/* Critical count */}
                      <div className="col-span-1 text-center">
                        {r.critical > 0 ? (
                          <span className="inline-block text-sm font-bold text-red-600 num">{r.critical}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </div>

                      {/* High count */}
                      <div className="col-span-1 text-center">
                        {r.high > 0 ? (
                          <span className="inline-block text-sm font-bold text-orange-500 num">{r.high}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </div>

                      {/* Total */}
                      <div className="col-span-1 text-center">
                        <span className={`text-sm font-semibold num ${r.disruptions > 0 ? "text-slate-800" : "text-slate-300"}`}>
                          {r.disruptions > 0 ? r.disruptions : "✓"}
                        </span>
                      </div>

                      {/* Top issue */}
                      <div className="col-span-2 min-w-0 pr-2">
                        {topIssue ? (
                          <div>
                            <p className="text-[11px] text-slate-700 font-medium leading-snug line-clamp-2">
                              {CATEGORY_ICON[topIssue.category ?? ""] ?? "⚠"} {topIssue.title}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-0.5">{topIssue.state}</p>
                          </div>
                        ) : (
                          <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                            <ShieldCheck size={11} /> All clear
                          </span>
                        )}
                      </div>

                      {/* Corridors */}
                      <div className="col-span-1 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Route size={11} className="text-slate-400" />
                          <span className="text-xs font-semibold text-slate-700 num">{r.corridors}</span>
                        </div>
                      </div>

                      {/* Cities */}
                      <div className="col-span-1 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Building2 size={11} className="text-slate-400" />
                          <span className="text-xs font-semibold text-slate-700 num">{r.cities}</span>
                        </div>
                      </div>

                      {/* Team */}
                      <div className="col-span-1 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Users size={11} className="text-slate-400" />
                          <span className="text-xs font-semibold text-slate-700 num">{r.teamMembers}</span>
                        </div>
                      </div>

                      {/* Last scan */}
                      <div className="col-span-1 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Clock size={10} className="text-slate-300 shrink-0" />
                          <span className="text-[10px] text-slate-400 leading-tight text-right">{fmtIst(r.lastIntelAt)}</span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Region cards grid — quick visual summary */}
          {!loading && (
            <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {regions.map((r) => {
                const pal = REGION_PALETTE[r.id] ?? REGION_PALETTE.north;
                return (
                  <Link
                    key={r.id}
                    href={`/advisory/regions/${r.id}`}
                    className={`rounded-2xl border ${pal.border} bg-white shadow-sm hover:shadow-md transition-all overflow-hidden group`}
                  >
                    {/* Colour header */}
                    <div className={`${pal.hdr} px-4 py-3 flex items-center justify-between`}>
                      <span className="text-white font-bold text-sm tracking-wide">{r.label} Region</span>
                      <ArrowRight size={14} className="text-white/60 group-hover:text-white group-hover:translate-x-1 transition-all" />
                    </div>

                    <div className="p-4 space-y-3">
                      {/* Counts */}
                      <div className="flex items-center gap-3">
                        {r.critical > 0 && (
                          <div className="flex items-center gap-1.5 bg-red-50 rounded-lg px-2.5 py-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                            <span className="text-xs font-bold text-red-700 num">{r.critical} Critical</span>
                          </div>
                        )}
                        {r.high > 0 && (
                          <div className="flex items-center gap-1.5 bg-orange-50 rounded-lg px-2.5 py-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                            <span className="text-xs font-bold text-orange-700 num">{r.high} High</span>
                          </div>
                        )}
                        {r.disruptions === 0 && (
                          <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                            <ShieldCheck size={12} /> All clear
                          </span>
                        )}
                      </div>

                      {/* Top issues */}
                      <div className="space-y-1.5">
                        {r.topIssues.slice(0, 2).map((issue, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <span className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${issue.riskLevel === "critical" ? "bg-red-500" : "bg-orange-400"}`} />
                            <p className="text-[11px] text-slate-600 leading-snug line-clamp-1">{issue.title}</p>
                          </div>
                        ))}
                        {r.disruptions === 0 && (
                          <p className="text-[11px] text-slate-400 italic">No active disruptions</p>
                        )}
                      </div>

                      {/* Footer */}
                      <div className={`flex items-center justify-between pt-2 border-t ${pal.border}`}>
                        <div className="flex items-center gap-3 text-[10px] text-slate-400">
                          <span><Route size={10} className="inline mr-0.5" />{r.corridors} corridors</span>
                          <span><Building2 size={10} className="inline mr-0.5" />{r.cities} cities</span>
                        </div>
                        <span className={`text-[10px] font-semibold ${pal.text}`}>View →</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
