"use client";
import { useState, useEffect, use, useMemo, useCallback } from "react";
import Link from "next/link";
import { TopBar } from "@/app/_components/TopBar";
import RiskBadge from "@/app/_components/RiskBadge";
import { LiveIndicator } from "@/app/_components/LiveIndicator";
import type { RiskLevel, DisruptionCategory, Advisory, CorridorEvent } from "@/app/_lib/types";
import {
  AlertTriangle, ShieldCheck, Building2, Route,
  Users, ArrowLeft, ArrowRight, ExternalLink,
  ChevronDown, ChevronUp, Loader2, MapPin,
  Search, RefreshCw, ChevronRight,
  Calendar, BrainCircuit, BarChart3,
  Clock, Zap, CheckCircle2, Plus,
} from "lucide-react";
import type { Disruption } from "@/app/_lib/types";

// ── Region palette ────────────────────────────────────────────────────────────
const PAL: Record<string, {
  bg: string; border: string; text: string; hdr: string; badge: string; ring: string;
}> = {
  north: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", hdr: "bg-blue-600", badge: "bg-blue-100 text-blue-700", ring: "ring-blue-300" },
  east: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", hdr: "bg-orange-500", badge: "bg-orange-100 text-orange-700", ring: "ring-orange-300" },
  west: { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700", hdr: "bg-purple-600", badge: "bg-purple-100 text-purple-700", ring: "ring-purple-300" },
  south: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", hdr: "bg-emerald-600", badge: "bg-emerald-100 text-emerald-700", ring: "ring-emerald-300" },
};

const CATEGORY_ICON: Record<string, string> = {
  political: "🚫", weather: "🌩", traffic: "⛽", security: "🔒",
  infrastructure: "🛣", religious: "🎯", vvip: "🚨", natural_disaster: "🌊",
};
const ROLE_LABELS: Record<string, string> = {
  guard: "Guard", wh_manager: "WH Mgr", regional_manager: "Reg. Mgr",
  cso: "CSO", company_admin: "Admin", super_admin: "Super Admin",
};
const ADVISORY_TYPE: Record<string, { label: string; color: string }> = {
  hold: { label: "Hold Vehicle", color: "bg-red-100 text-red-700" },
  reroute: { label: "Reroute Required", color: "bg-orange-100 text-orange-700" },
  delay: { label: "Delay Recommended", color: "bg-amber-100 text-amber-700" },
  dispatch_early: { label: "Dispatch Early", color: "bg-blue-100 text-blue-700" },
  split_shipment: { label: "Split Shipment", color: "bg-purple-100 text-purple-700" },
  avoid_night: { label: "Avoid Night Travel", color: "bg-slate-100 text-slate-600" },
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface EventSource { url: string; title: string; snippet: string; isRelevant?: boolean }

interface SegmentDisruption {
  id: string; segmentName: string; title: string; summary: string;
  riskLevel: RiskLevel; etaImpactHours: number; category: DisruptionCategory;
  routeId: string; routeName: string; lastCheckedAt: string | null;
  firstSeenAt: string | null;
  sources: EventSource[];
}
interface StateGroup { state: string; disruptions: SegmentDisruption[] }
interface CorridorRow {
  id: string; name: string; origin: string; destination: string;
  max_risk_level: string | null; disruption_count: number;
  last_intel_at: string | null; routes_fetched: boolean; region_id: string | null;
}
interface CityRow {
  id: string;
  name: string;
  state: string | null;
  is_depot: boolean;
  // new fields from adv_city_news
  has_disruption?: boolean;
  disruption_risk_level?: string | null;
  disruption_title?: string | null;
  disruption_summary?: string | null;
  disruption_eta_hours?: number | null;
  disruption_category?: string | null;
  disruption_sources?: EventSource[] | null;
  last_checked_at?: string | null;
}

interface TeamMember { id: string; full_name: string; email: string; role: string; city_name: string | null }
interface RegionDetail {
  region: { id: string; label: string; color: string; states: string[] };
  stats: { disruptions: number; critical: number; high: number; statesHit: number; worstRisk: string; corridors: number; cities: number; teamMembers: number; lastIntelAt: string | null };
  stateGroups: StateGroup[];
  corridors: CorridorRow[];
  cities: CityRow[];
  teamMembers: TeamMember[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
}
function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function daysFromNow(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

// ── Small shared components ───────────────────────────────────────────────────
function SectionEmpty({ icon: Icon, title, sub }: { icon: React.ElementType; title: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-2xl border border-slate-200">
      <Icon size={36} className="text-slate-200 mb-3" />
      <p className="text-sm font-semibold text-slate-600">{title}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

function TabBtn({ id, label, icon: Icon, count, active, onClick }: {
  id: string; label: string; icon: React.ElementType;
  count?: number; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12.5px] font-semibold transition-all whitespace-nowrap ${active
        ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
        : "text-slate-500 hover:text-slate-700 hover:bg-white/60"
        }`}
    >
      <Icon size={13} />
      {label}
      {count !== undefined && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold min-w-[20px] text-center ${active ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-500"
          }`}>
          {count}
        </span>
      )}
    </button>
  );
}

// ── Disruption item (reused across tabs) ──────────────────────────────────────
function DisruptionItem({ d, showRoute = true }: { d: SegmentDisruption; showRoute?: boolean }) {
  const [open, setOpen] = useState(false);
  const sources = (d.sources ?? []).filter((s) => s.isRelevant !== false);
  return (
    <div className={`rounded-xl border p-3.5 ${d.riskLevel === "critical" ? "border-red-200 bg-red-50/40" : "border-orange-200 bg-orange-50/30"}`}>
      <div className="flex items-start gap-2.5">
        <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${d.riskLevel === "critical" ? "bg-red-500" : "bg-orange-400"}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <p className="text-[13px] font-semibold text-slate-800 leading-snug flex-1">{d.title}</p>
            <div className="flex items-center gap-1.5 shrink-0">
              {d.etaImpactHours > 0 && (
                <span className="text-[10px] text-orange-600 font-bold bg-orange-100 px-1.5 py-0.5 rounded-full">+{d.etaImpactHours}h</span>
              )}
              <RiskBadge level={d.riskLevel} size="xs" />
            </div>
          </div>
          {d.summary && <p className="text-[12px] text-slate-500 mt-1 leading-relaxed">{d.summary}</p>}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {showRoute && (
              <Link href={`/advisory/planned/${d.routeId}`} className="inline-flex items-center gap-1 text-[10px] bg-brand-50 text-brand-600 border border-brand-100 px-2 py-0.5 rounded-full font-medium hover:bg-brand-100 transition" onClick={(e) => e.stopPropagation()}>
                🛣 {d.routeName} <ArrowRight size={8} />
              </Link>
            )}
            <span className="text-[10px] bg-white text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full">
              {CATEGORY_ICON[d.category] ?? "⚠"} {d.category}
            </span>
            {/* How long disruption has been active */}
            {d.firstSeenAt && (
              <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full" title={`First detected: ${fmtDate(d.firstSeenAt)}`}>
                🕐 ongoing {timeAgo(d.firstSeenAt)}
              </span>
            )}
            {/* How fresh the underlying scan data is */}
            {d.lastCheckedAt && (
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full ${Date.now() - new Date(d.lastCheckedAt).getTime() > 20 * 3600 * 1000
                  ? "bg-amber-50 text-amber-600 border border-amber-200"
                  : "bg-slate-100 text-slate-400"
                  }`}
                title={`Scanned: ${fmtDate(d.lastCheckedAt)}`}
              >
                🔍 scanned {timeAgo(d.lastCheckedAt)}
              </span>
            )}
            {sources.length > 0 && (
              <button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-0.5 text-[10px] text-brand-600 font-semibold hover:text-brand-800">
                {sources.length} source{sources.length > 1 ? "s" : ""} {open ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
              </button>
            )}
          </div>
          {open && sources.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {sources.map((src, i) => (
                <a key={i} href={src.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 p-2 rounded-lg border border-brand-100 bg-white hover:bg-brand-50 transition group" onClick={(e) => e.stopPropagation()}>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-brand-800 group-hover:underline line-clamp-1">{src.title}</p>
                    {src.snippet && <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{src.snippet}</p>}
                  </div>
                  <ExternalLink size={10} className="shrink-0 mt-0.5 text-brand-400" />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── TAB 1: Cities & Alerts ────────────────────────────────────────────────────
function CitiesTab({
  cities, stateGroups, corridors, teamMembers, pal, regionId,
}: {
  cities: CityRow[]; stateGroups: StateGroup[]; corridors: CorridorRow[];
  teamMembers: TeamMember[]; pal: typeof PAL[string]; regionId: string;
}) {
  const [search, setSearch] = useState("");
  const [riskFilter, setFilter] = useState<"all" | "alerts" | "clear">("all");

  // Flat list of ALL disruptions across all states in this region
  const allDisps = useMemo(() => stateGroups.flatMap((g) => g.disruptions), [stateGroups]);

  const corridorDisps = useMemo(() => stateGroups.flatMap((g) => g.disruptions), [stateGroups]);

  const cityView = useMemo(() => cities.map((city) => {
    const cityLower = city.name.toLowerCase().trim();

    const corrs = corridors.filter((c) =>
      `${c.origin} ${c.destination} ${c.name}`.toLowerCase().includes(cityLower)
    );
    const servingRouteIds = new Set(corrs.map((c) => c.id));

    const corridorMatched = corridorDisps.filter((d) => {
      if (d.riskLevel !== "critical" && d.riskLevel !== "high") return false;
      const segLow = d.segmentName.toLowerCase();
      const titLow = d.title.toLowerCase();
      const sumLow = (d.summary ?? "").toLowerCase();
      const onServingCorridor = servingRouteIds.has(d.routeId);
      const segMatchesCity = segLow.includes(cityLower) || cityLower.includes(segLow);
      const contentMentionsCity = titLow.includes(cityLower) || sumLow.includes(cityLower);
      return onServingCorridor || segMatchesCity || contentMentionsCity;
    });

    const team = teamMembers.filter((m) => m.city_name === city.name);

    // City-level direct news from adv_city_news
    const cityNewsDisp: SegmentDisruption[] = [];
    if (city.has_disruption && city.disruption_risk_level) {
      cityNewsDisp.push({
        id: `city-${city.id}`,
        segmentName: city.name,
        title: city.disruption_title ?? `Disruption in ${city.name}`,
        summary: city.disruption_summary ?? "",
        riskLevel: city.disruption_risk_level as RiskLevel,
        etaImpactHours: city.disruption_eta_hours ?? 0,
        category: (city.disruption_category ?? "traffic") as DisruptionCategory,
        routeId: "",
        routeName: "",
        lastCheckedAt: city.last_checked_at ?? null,
        firstSeenAt: null,
        sources: Array.isArray(city.disruption_sources) ? city.disruption_sources : [],
      });
    }

    // Merge city news + corridor disruptions, deduplicate by title
    const mergedDisps = [...cityNewsDisp, ...corridorMatched].filter((d, i, arr) =>
      arr.findIndex((x) => x.title === d.title) === i
    );

    return { city, disps: mergedDisps, corrs, team };
  }), [cities, corridorDisps, corridors, teamMembers]);


  const filtered = useMemo(() => {
    let list = cityView;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(({ city, disps }) =>
        city.name.toLowerCase().includes(q) ||
        (city.state ?? "").toLowerCase().includes(q) ||
        disps.some((d) => d.title.toLowerCase().includes(q))
      );
    }
    if (riskFilter === "alerts") list = list.filter(({ disps }) => disps.length > 0);
    if (riskFilter === "clear") list = list.filter(({ disps }) => disps.length === 0);
    return [...list].sort((a, b) => {
      const aCrit = a.disps.filter((d) => d.riskLevel === "critical").length;
      const bCrit = b.disps.filter((d) => d.riskLevel === "critical").length;
      if (aCrit !== bCrit) return bCrit - aCrit;
      return b.disps.length - a.disps.length;
    });
  }, [cityView, search, riskFilter]);

  const alertCount = cityView.filter(({ disps }) => disps.length > 0).length;

  // Region summary stats derived from the city view
  const totalAlertsAcrossCities = cityView.reduce((n, { disps }) => n + disps.length, 0);
  const citiesWithAlerts = cityView.filter(({ disps }) => disps.length > 0);
  const criticalCities = citiesWithAlerts.filter(({ disps }) => disps.some((d) => d.riskLevel === "critical"));

  return (
    <div className="space-y-4">

      {/* ── Regional summary strip ──────────────────────────────────────────── */}
      <div className={`rounded-2xl border ${pal.border} ${pal.bg} px-5 py-4`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className={`text-[11px] font-bold uppercase tracking-widest ${pal.text} mb-1`}>Region Summary</p>
            {totalAlertsAcrossCities === 0 ? (
              <p className="text-sm font-semibold text-emerald-700 flex items-center gap-1.5">
                <ShieldCheck size={14} /> All {cities.length} depot cities clear — no active disruptions on serving corridors
              </p>
            ) : (
              <p className="text-sm font-semibold text-slate-800">
                {citiesWithAlerts.length} of {cities.length} depot cities affected by active corridor disruptions
              </p>
            )}
            {criticalCities.length > 0 && (
              <p className="text-[12px] text-red-700 font-semibold mt-1 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
                Critical hold required at: {criticalCities.map(({ city }) => city.name).join(", ")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-4 shrink-0 flex-wrap">
            {citiesWithAlerts.length > 0 && (
              <div className="text-center">
                <div className="text-xl font-bold text-slate-800 num">{totalAlertsAcrossCities}</div>
                <div className="text-[9px] text-slate-500 uppercase tracking-wider">Active Alerts</div>
              </div>
            )}
            <div className="text-center">
              <div className={`text-xl font-bold num ${pal.text}`}>{citiesWithAlerts.length}</div>
              <div className="text-[9px] text-slate-500 uppercase tracking-wider">Cities Hit</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-emerald-600 num">{cities.length - citiesWithAlerts.length}</div>
              <div className="text-[9px] text-slate-500 uppercase tracking-wider">Cities Clear</div>
            </div>
          </div>
        </div>

        {/* Top alerts across region */}
        {totalAlertsAcrossCities > 0 && (
          <div className="mt-3 pt-3 border-t border-white/40 space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Top Alerts Affecting Depots</p>
            {cityView
              .filter(({ disps }) => disps.length > 0)
              .sort((a, b) => {
                const aCrit = a.disps.filter((d) => d.riskLevel === "critical").length;
                const bCrit = b.disps.filter((d) => d.riskLevel === "critical").length;
                return bCrit - aCrit || b.disps.length - a.disps.length;
              })
              .slice(0, 4)
              .map(({ city, disps }) => {
                const worst = disps.find((d) => d.riskLevel === "critical") ?? disps[0];
                return (
                  <div key={city.id} className="flex items-start gap-2 bg-white/60 rounded-xl px-3 py-2">
                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${worst.riskLevel === "critical" ? "bg-red-500" : "bg-orange-400"}`} />
                    <div className="flex-1 min-w-0">
                      <span className="text-[12px] font-semibold text-slate-800">{city.name}</span>
                      <span className="text-[10px] text-slate-400 ml-2">{city.state}</span>
                      <p className="text-[11px] text-slate-600 truncate mt-0.5">{worst.title}</p>
                    </div>
                    <div className="shrink-0 flex items-center gap-1.5">
                      {disps.length > 1 && <span className="text-[10px] text-slate-400">+{disps.length - 1} more</span>}
                      <RiskBadge level={worst.riskLevel} size="xs" pulse={worst.riskLevel === "critical"} />
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search cities, states or alerts…" className="w-full pl-8 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-300" />
        </div>
        {(["all", "alerts", "clear"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`text-[12px] px-3 py-1.5 rounded-full border font-semibold transition ${riskFilter === f ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}>
            {f === "all" ? `All (${cities.length})` : f === "alerts" ? `⚠ Alerts (${alertCount})` : `✓ Clear (${cities.length - alertCount})`}
          </button>
        ))}
      </div>

      {filtered.length === 0
        ? <SectionEmpty icon={ShieldCheck} title="No matching cities" sub="Try a different filter or search term." />
        : filtered.map(({ city, disps, corrs, team }) => (
          <CityCard key={city.id} city={city} disps={disps} corrs={corrs} team={team} pal={pal} />
        ))
      }
    </div>
  );
}

// ── TAB 2: Corridors ──────────────────────────────────────────────────────────
function CorridorsTab({ corridors, regionId }: { corridors: CorridorRow[]; regionId: string }) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return !q ? corridors : corridors.filter((c) =>
      c.name.toLowerCase().includes(q) || c.origin.toLowerCase().includes(q) || c.destination.toLowerCase().includes(q)
    );
  }, [corridors, search]);

  const risky = filtered.filter((c) => c.disruption_count > 0).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search corridors…" className="w-full pl-8 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-300" />
        </div>
        {risky > 0 && <span className="text-[12px] text-orange-600 font-semibold bg-orange-50 border border-orange-200 px-3 py-1.5 rounded-full">{risky} with active alerts</span>}
        <Link href="/advisory/planned" className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold bg-brand-700 text-white rounded-xl hover:bg-brand-800 transition">
          <Plus size={13} /> Add Corridor
        </Link>
      </div>

      {filtered.length === 0
        ? <SectionEmpty icon={Route} title="No corridors found" sub="Add a watched corridor to start receiving intelligence." />
        : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="grid grid-cols-12 px-5 py-2.5 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
              <div className="col-span-4">Corridor</div>
              <div className="col-span-3">Route</div>
              <div className="col-span-2 text-center">Risk</div>
              <div className="col-span-1 text-center">Alerts</div>
              <div className="col-span-2 text-right">Last Scan</div>
            </div>
            <div className="divide-y divide-slate-100">
              {filtered.map((c) => (
                <Link key={c.id} href={`/advisory/planned/${c.id}`} className="grid grid-cols-12 px-5 py-3.5 items-center hover:bg-slate-50 transition group">
                  <div className="col-span-4 flex items-center gap-2.5">
                    <div className={`w-1.5 h-8 rounded-full shrink-0 ${c.disruption_count > 0 ? (c.max_risk_level === "critical" ? "bg-red-500" : "bg-orange-400") : "bg-emerald-400"}`} />
                    <div>
                      <p className="text-sm font-semibold text-slate-800 group-hover:text-brand-700 transition">{c.name}</p>
                      <p className="text-[10px] text-slate-400">{c.routes_fetched ? "Route mapped" : "Pending route"}</p>
                    </div>
                  </div>
                  <div className="col-span-3">
                    <p className="text-xs text-slate-600 truncate">{c.origin}</p>
                    <p className="text-[10px] text-slate-400 truncate">→ {c.destination}</p>
                  </div>
                  <div className="col-span-2 flex justify-center">
                    {c.max_risk_level && c.max_risk_level !== "safe" ? <RiskBadge level={c.max_risk_level as RiskLevel} size="xs" /> : <span className="text-[10px] text-emerald-500 font-medium">Clear</span>}
                  </div>
                  <div className="col-span-1 text-center">
                    <span className={`text-sm font-bold num ${c.disruption_count > 0 ? "text-orange-600" : "text-slate-200"}`}>
                      {c.disruption_count > 0 ? c.disruption_count : "—"}
                    </span>
                  </div>
                  <div className="col-span-2 text-right text-[10px] text-slate-400">{timeAgo(c.last_intel_at)}</div>
                </Link>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}

// ── TAB 3: Disruptions ────────────────────────────────────────────────────────
function DisruptionsTab({ regionId }: { regionId: string }) {
  const [disruptions, setDisruptions] = useState<Disruption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [riskFilter, setRisk] = useState<string>("all");
  const [catFilter, setCat] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/advisory/v1/intelligence?regionId=${regionId}`, { credentials: "include" });
      if (res.ok) {
        const d = await res.json() as { disruptions: Disruption[] };
        setDisruptions(d.disruptions ?? []);
      }
    } finally { setLoading(false); setLoaded(true); }
  }, [regionId]);

  useEffect(() => { if (!loaded) load(); }, [loaded, load]);

  const filtered = useMemo(() => disruptions.filter((d) => {
    const q = search.toLowerCase();
    const matchQ = !q || d.title.toLowerCase().includes(q) || d.state.toLowerCase().includes(q) || (d.affectedRoutes[0] ?? "").toLowerCase().includes(q);
    const matchRisk = riskFilter === "all" || d.risk === riskFilter;
    const matchCat = catFilter === "all" || d.category === catFilter;
    return matchQ && matchRisk && matchCat;
  }), [disruptions, search, riskFilter, catFilter]);

  const cats = useMemo(() => [...new Set(disruptions.map((d) => d.category))], [disruptions]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-slate-300" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search disruptions…" className="w-full pl-8 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-300" />
        </div>
        <select value={riskFilter} onChange={(e) => setRisk(e.target.value)} className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-300">
          <option value="all">All Risk Levels</option>
          {["critical", "high", "medium", "low"].map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
        </select>
        <select value={catFilter} onChange={(e) => setCat(e.target.value)} className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-300">
          <option value="all">All Categories</option>
          {cats.map((c) => <option key={c} value={c}>{CATEGORY_ICON[c] ?? "⚠"} {c}</option>)}
        </select>
        <span className="text-[12px] text-slate-500 ml-auto">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {filtered.length === 0
        ? <SectionEmpty icon={ShieldCheck} title="No disruptions in this region" sub="All corridors are operating normally." />
        : (
          <div className="space-y-2">
            {filtered.map((d) => {
              const seg: SegmentDisruption = {
                id: d.id, segmentName: d.state, title: d.title, summary: d.summary,
                riskLevel: d.risk, etaImpactHours: d.eta_impact_hours ?? 0,
                category: d.category,
                routeId: d.affectedRoutes[0] ?? "", routeName: d.affectedRoutes[0] ?? "",
                lastCheckedAt: d.last_checked_at ?? null,
                firstSeenAt: d.started_at ?? null,
                sources: (d.sources as EventSource[] | undefined) ?? [],
              };
              return <DisruptionItem key={d.id} d={seg} />;
            })}
          </div>
        )}
    </div>
  );
}

// ── TAB 4: Fleet Events ───────────────────────────────────────────────────────
function EventsTab({ regionId }: { regionId: string }) {
  const [events, setEvents] = useState<CorridorEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"scheduled" | "ongoing" | "historical">("scheduled");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/advisory/v1/corridor-events?regionId=${regionId}&limit=100`, { credentials: "include" });
      if (res.ok) {
        const d = await res.json() as { events: CorridorEvent[] };
        setEvents(d.events ?? []);
      }
    } finally { setLoading(false); setLoaded(true); }
  }, [regionId]);

  useEffect(() => { if (!loaded) load(); }, [loaded, load]);

  const byTab = useMemo(() => events.filter((e) => e.event_type === tab), [events, tab]);
  const counts = useMemo(() => ({
    scheduled: events.filter((e) => e.event_type === "scheduled").length,
    ongoing: events.filter((e) => e.event_type === "ongoing").length,
    historical: events.filter((e) => e.event_type === "historical").length,
  }), [events]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-slate-300" /></div>;

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {(["scheduled", "ongoing", "historical"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            {t === "scheduled" ? <Calendar size={12} /> : t === "ongoing" ? <Zap size={12} /> : <Clock size={12} />}
            {t.charAt(0).toUpperCase() + t.slice(1)} ({counts[t]})
          </button>
        ))}
      </div>

      {byTab.length === 0
        ? <SectionEmpty icon={Calendar} title={`No ${tab} events`} sub="Fleet events appear here after intelligence scans." />
        : (
          <div className="space-y-3">
            {byTab.map((e) => {
              const days = daysFromNow(e.event_start_at);
              return (
                <div key={e.id} className={`rounded-2xl border bg-white shadow-sm overflow-hidden ${e.risk_level === "critical" ? "border-red-200" : e.risk_level === "high" ? "border-orange-200" : "border-slate-200"}`}>
                  <div className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <RiskBadge level={e.risk_level as RiskLevel} size="xs" />
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                            {CATEGORY_ICON[e.category] ?? "⚠"} {e.category}
                          </span>
                          {days !== null && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${days === 0 ? "bg-red-100 text-red-700 animate-pulse" : days <= 3 ? "bg-red-100 text-red-600" : days <= 7 ? "bg-orange-100 text-orange-600" : days < 0 ? "bg-slate-100 text-slate-500" : "bg-blue-100 text-blue-600"}`}>
                              {days === 0 ? "TODAY" : days < 0 ? `${Math.abs(days)}d ago` : `in ${days}d`}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-slate-800 leading-snug">{e.title}</p>
                        {e.summary && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{e.summary}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        {e.eta_impact_hours > 0 && <p className="text-[11px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">+{e.eta_impact_hours}h delay</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100 flex-wrap">
                      <Link href={`/advisory/planned/${e.watched_route_id}`} className="inline-flex items-center gap-1 text-[10px] bg-brand-50 text-brand-600 border border-brand-100 px-2 py-0.5 rounded-full font-medium hover:bg-brand-100 transition">
                        🛣 {e.corridor_name} <ArrowRight size={8} />
                      </Link>
                      <span className="text-[10px] text-slate-400">{e.corridor_origin} → {e.corridor_destination}</span>
                      {e.event_start_at && <span className="text-[10px] text-slate-400 ml-auto flex items-center gap-1"><Calendar size={9} /> {fmtDate(e.event_start_at)}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}

// ── TAB 5: AI Advisories ──────────────────────────────────────────────────────
function AdvisoriesTab({ regionId }: { regionId: string }) {
  const [advisories, setAdvisories] = useState<Advisory[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/advisory/v1/intelligence?regionId=${regionId}`, { credentials: "include" });
      if (res.ok) {
        const d = await res.json() as { advisories: Advisory[] };
        setAdvisories(d.advisories ?? []);
      }
    } finally { setLoading(false); setLoaded(true); }
  }, [regionId]);

  useEffect(() => { if (!loaded) load(); }, [loaded, load]);

  const types = useMemo(() => [...new Set(advisories.map((a) => a.type))], [advisories]);
  const filtered = useMemo(() => {
    const list = filter === "all" ? advisories : advisories.filter((a) => a.type === filter);
    return [...list].sort((a, b) => {
      if (a.isUrgent && !b.isUrgent) return -1;
      if (!a.isUrgent && b.isUrgent) return 1;
      return 0;
    });
  }, [advisories, filter]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-slate-300" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 flex-wrap">
          <button onClick={() => setFilter("all")} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${filter === "all" ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"}`}>All ({advisories.length})</button>
          {types.map((t) => (
            <button key={t} onClick={() => setFilter(t)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${filter === t ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"}`}>
              {ADVISORY_TYPE[t]?.label ?? t}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0
        ? <SectionEmpty icon={BrainCircuit} title="No advisories for this region" sub="Advisories are generated after intelligence scans complete." />
        : (
          <div className="space-y-3">
            {filtered.map((a) => {
              const cfg = ADVISORY_TYPE[a.type];
              return (
                <div key={a.id} className={`rounded-2xl bg-white border shadow-sm overflow-hidden ${a.isUrgent ? (a.riskLevel === "critical" ? "border-red-200" : "border-orange-200") : "border-slate-200"}`}>
                  <div className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          {cfg && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>}
                          <RiskBadge level={a.riskLevel} size="xs" />
                          {a.isUrgent && <span className="text-[10px] font-bold text-red-600 animate-pulse">URGENT</span>}
                        </div>
                        <p className="text-[13px] font-semibold text-slate-800 leading-snug">{a.title}</p>
                        {a.narrative && <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{a.narrative}</p>}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[10px] text-slate-400">Confidence</p>
                        <p className={`text-lg font-bold num ${a.confidence >= 85 ? "text-emerald-600" : a.confidence >= 70 ? "text-amber-600" : "text-slate-400"}`}>{a.confidence}%</p>
                      </div>
                    </div>
                    {a.recommendedAction && (
                      <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Recommended Action</p>
                        <p className="text-[12px] text-slate-700 leading-relaxed">{a.recommendedAction}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}

// ── TAB 6: Team ───────────────────────────────────────────────────────────────
function TeamTab({ teamMembers, pal }: { teamMembers: TeamMember[]; pal: typeof PAL[string] }) {
  if (teamMembers.length === 0) {
    return (
      <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-5">
        <div>
          <p className="text-sm font-semibold text-slate-700">No team assigned to this region yet</p>
          <p className="text-xs text-slate-400 mt-0.5">Assign members from the Team page — they'll receive alerts for this region.</p>
        </div>
        <Link href="/advisory/team" className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-brand-700 text-white rounded-xl hover:bg-brand-800 transition shrink-0">
          Manage Team <ArrowRight size={13} />
        </Link>
      </div>
    );
  }

  // Group by city
  const byCityMap = new Map<string, TeamMember[]>();
  for (const m of teamMembers) {
    const key = m.city_name ?? "__region__";
    if (!byCityMap.has(key)) byCityMap.set(key, []);
    byCityMap.get(key)!.push(m);
  }
  const groups = Array.from(byCityMap.entries()).sort((a, b) => {
    if (a[0] === "__region__") return 1;
    if (b[0] === "__region__") return -1;
    return a[0].localeCompare(b[0]);
  });

  return (
    <div className="space-y-3">
      {groups.map(([cityKey, members]) => (
        <div key={cityKey} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 bg-slate-50/70">
            <MapPin size={12} className="text-slate-400" />
            <span className="text-[12px] font-semibold text-slate-700">
              {cityKey === "__region__" ? "Region-wide (no specific city)" : cityKey}
            </span>
            <span className="ml-auto text-[10px] text-slate-400">{members.length} member{members.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="divide-y divide-slate-100">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-4 px-5 py-3">
                <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-bold shrink-0">{m.full_name.charAt(0)}</div>
                <div className="flex-1">
                  <p className="text-[13px] font-semibold text-slate-800">{m.full_name}</p>
                  <p className="text-[11px] text-slate-400">{m.email}</p>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${pal.badge}`}>{ROLE_LABELS[m.role] ?? m.role}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="flex justify-end">
        <Link href="/advisory/team" className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-brand-700 bg-white border border-brand-200 rounded-xl hover:bg-brand-50 transition">
          Manage Team assignments <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
type TabId = "cities" | "corridors" | "disruptions" | "events" | "advisories" | "team";

export default function RegionDetailPage({ params }: { params: Promise<{ regionId: string }> }) {
  const { regionId } = use(params);
  const [data, setData] = useState<RegionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setTab] = useState<TabId>("cities");
  const pal = PAL[regionId] ?? PAL.north;

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await fetch(`/api/advisory/v1/regions/${regionId}`, { credentials: "include" });
      if (res.ok) setData(await res.json() as RegionDetail);
    } finally { setLoading(false); setRefreshing(false); }
  }
  useEffect(() => { load(); }, [regionId]);

  if (loading) return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar title="Region" subtitle="Loading…" />
      <div className="flex-1 flex items-center justify-center"><Loader2 size={28} className="animate-spin text-slate-300" /></div>
    </div>
  );
  if (!data) return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar title="Region" subtitle="Not found" />
      <div className="flex-1 flex items-center justify-center"><p className="text-sm text-slate-400">Region not found.</p></div>
    </div>
  );

  const { region, stats, stateGroups, corridors, cities, teamMembers } = data;
  const citiesAffected = stateGroups.length;

  const TABS: { id: TabId; label: string; icon: React.ElementType; count?: number }[] = [
    { id: "cities", label: "Cities & Alerts", icon: Building2, count: cities.length },
    { id: "corridors", label: "Corridors", icon: Route, count: stats.corridors },
    { id: "disruptions", label: "Disruptions", icon: AlertTriangle, count: stats.disruptions },
    { id: "events", label: "Fleet Events", icon: Calendar },
    { id: "advisories", label: "AI Advisories", icon: BrainCircuit },
    { id: "team", label: "Team", icon: Users, count: stats.teamMembers },
  ];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar
        title={`${region.label} Region`}
        subtitle={`${stats.disruptions} alert${stats.disruptions !== 1 ? "s" : ""} · ${citiesAffected} cit${citiesAffected !== 1 ? "ies" : "y"} affected · ${stats.corridors} corridors`}
      />

      <div className="flex-1 overflow-auto">
        <div className="p-6 max-w-screen-xl mx-auto space-y-5">

          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm">
            <Link href="/advisory/regions" className="flex items-center gap-1 text-slate-500 hover:text-slate-800 transition">
              <ArrowLeft size={14} /> Regions
            </Link>
            <span className="text-slate-300">/</span>
            <span className={`font-semibold ${pal.text}`}>{region.label}</span>
          </div>

          {/* ── Region header card ────────────────────────────────────────── */}
          <div className={`rounded-2xl border ${pal.border} overflow-hidden shadow-sm`}>
            <div className={`${pal.hdr} px-6 py-5`}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-xl font-bold text-white">{region.label} Region</h1>
                    <RiskBadge level={stats.worstRisk as RiskLevel} size="sm" pulse={stats.worstRisk === "critical"} />
                  </div>
                  <p className="text-sm text-white/70 mt-1">
                    {stats.statesHit} state{stats.statesHit !== 1 ? "s" : ""} with alerts · {stats.cities} depot cities · {stats.corridors} corridors
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <LiveIndicator />
                  <button onClick={() => load(true)} disabled={refreshing} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white/80 bg-white/10 border border-white/20 rounded-lg hover:bg-white/20 transition disabled:opacity-50">
                    <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} /> Refresh
                  </button>
                </div>
              </div>

              {/* KPI row */}
              <div className="flex items-end gap-6 mt-5 flex-wrap">
                {[
                  { label: "Critical", value: stats.critical, cls: "text-red-200", show: stats.critical > 0 },
                  { label: "High", value: stats.high, cls: "text-orange-200", show: stats.high > 0 },
                  { label: "Disruptions", value: stats.disruptions, cls: "text-white", show: true },
                  { label: "Cities hit", value: citiesAffected, cls: "text-white/80", show: true },
                  { label: "Corridors", value: stats.corridors, cls: "text-white/60", show: true },
                  { label: "Team", value: stats.teamMembers, cls: "text-white/50", show: true },
                ].map(({ label, value, cls, show }) => show && (
                  <div key={label} className="text-center">
                    <div className={`text-2xl font-bold num ${cls}`}>{value}</div>
                    <div className="text-[10px] text-white/40 uppercase tracking-wider">{label}</div>
                  </div>
                ))}
                <div className="ml-auto text-right">
                  <p className="text-[10px] text-white/40 uppercase tracking-wider">Last Intel</p>
                  <p className="text-sm text-white/80 font-semibold">{fmtDate(stats.lastIntelAt)}</p>
                  <p className="text-[10px] text-white/30">{timeAgo(stats.lastIntelAt)}</p>
                </div>
              </div>

              {/* States row */}
              <div className="flex items-center gap-2 mt-4 flex-wrap">
                <MapPin size={11} className="text-white/40 shrink-0" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/30 mr-1">Coverage</span>
                {region.states.map((s) => (
                  <span key={s} className={`text-[11px] px-2 py-0.5 rounded-full ${pal.badge} font-medium`}>{s}</span>
                ))}
              </div>
            </div>
          </div>

          {/* ── Tab bar ───────────────────────────────────────────────────── */}
          <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-2xl overflow-x-auto">
            {TABS.map((t) => (
              <TabBtn key={t.id} id={t.id} label={t.label} icon={t.icon} count={t.count} active={activeTab === t.id} onClick={() => setTab(t.id)} />
            ))}
          </div>

          {/* ── Tab content ───────────────────────────────────────────────── */}
          {activeTab === "cities" && (
            <CitiesTab cities={cities} stateGroups={stateGroups} corridors={corridors} teamMembers={teamMembers} pal={pal} regionId={regionId} />
          )}
          {activeTab === "corridors" && (
            <CorridorsTab corridors={corridors} regionId={regionId} />
          )}
          {activeTab === "disruptions" && (
            <DisruptionsTab regionId={regionId} />
          )}
          {activeTab === "events" && (
            <EventsTab regionId={regionId} />
          )}
          {activeTab === "advisories" && (
            <AdvisoriesTab regionId={regionId} />
          )}
          {activeTab === "team" && (
            <TeamTab teamMembers={teamMembers} pal={pal} />
          )}

        </div>
      </div>
    </div>
  );
}


function CityCard({
  city, disps, corrs, team, pal,
}: {
  city: CityRow;
  disps: SegmentDisruption[];
  corrs: CorridorRow[];
  team: TeamMember[];
  pal: typeof PAL[string];
}) {
  const [expanded, setExpanded] = useState(disps.length > 0);
  const critical = disps.filter((d) => d.riskLevel === "critical").length;
  const high = disps.filter((d) => d.riskLevel === "high").length;

  return (
    <div className={`rounded-2xl border shadow-sm overflow-hidden ${critical > 0 ? "border-red-200" : high > 0 ? "border-orange-200" : "border-slate-200"}`}>
      {/* City header */}
      <button type="button" onClick={() => setExpanded((v) => !v)} className="w-full flex items-center gap-3 px-5 py-4 bg-white hover:bg-slate-50/60 text-left transition group">
        <div className={`w-1 self-stretch rounded-full shrink-0 ${critical > 0 ? "bg-red-500" : high > 0 ? "bg-orange-400" : "bg-emerald-400"}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[15px] font-bold text-slate-800">{city.name}</span>
            {city.is_depot && <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${pal.badge}`}>Depot</span>}
            <span className="text-[11px] text-slate-400">{city.state}</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {disps.length > 0 ? (
              <>
                {critical > 0 && <span className="flex items-center gap-1 text-[11px] font-semibold text-red-600"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />{critical} critical</span>}
                {high > 0 && <span className="flex items-center gap-1 text-[11px] font-semibold text-orange-600"><span className="w-1.5 h-1.5 rounded-full bg-orange-400" />{high} high</span>}
              </>
            ) : (
              <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-semibold"><ShieldCheck size={11} /> Clear</span>
            )}
            {corrs.length > 0 && <span className="text-[10px] text-slate-400">{corrs.length} corridor{corrs.length !== 1 ? "s" : ""}</span>}
            {team.length > 0 && <span className="text-[10px] text-slate-400">{team.length} team</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {disps.length > 0 && <RiskBadge level={(critical > 0 ? "critical" : "high") as RiskLevel} size="xs" pulse={critical > 0} />}
          <ChevronRight size={14} className={`text-slate-300 group-hover:text-slate-500 transition-all ${expanded ? "rotate-90" : ""}`} />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/50 divide-y divide-slate-100">
          {disps.length > 0 && (
            <div className="px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                <AlertTriangle size={11} className="text-orange-500" /> Active Alerts ({disps.length})
              </p>
              <div className="space-y-2">{disps.map((d) => <DisruptionItem key={d.id} d={d} />)}</div>
            </div>
          )}
          {corrs.length > 0 && (
            <div className="px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                <Route size={11} className="text-slate-400" /> Corridors ({corrs.length})
              </p>
              <div className="space-y-1.5">
                {corrs.map((c) => (
                  <Link key={c.id} href={`/advisory/planned/${c.id}`} className="flex items-center gap-3 px-3 py-2.5 bg-white rounded-xl border border-slate-200 hover:border-brand-300 hover:bg-brand-50/30 transition group">
                    <Route size={12} className="text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-semibold text-slate-700 group-hover:text-brand-700 truncate">{c.name}</p>
                      <p className="text-[10px] text-slate-400 truncate">{c.origin} → {c.destination}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {c.max_risk_level && c.max_risk_level !== "safe" ? <RiskBadge level={c.max_risk_level as RiskLevel} size="xs" /> : <span className="text-[10px] text-emerald-500 font-medium">Clear</span>}
                    </div>
                    <ArrowRight size={11} className="text-slate-300 group-hover:text-brand-400" />
                  </Link>
                ))}
              </div>
            </div>
          )}
          {team.length > 0 && (
            <div className="px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                <Users size={11} className="text-slate-400" /> Team ({team.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {team.map((m) => (
                  <div key={m.id} className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
                    <div className="w-5 h-5 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-[9px] font-bold">{m.full_name.charAt(0)}</div>
                    <div>
                      <p className="text-[11px] font-semibold text-slate-700 leading-none">{m.full_name}</p>
                      <p className="text-[9.5px] text-slate-400">{ROLE_LABELS[m.role] ?? m.role}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {disps.length === 0 && corrs.length === 0 && team.length === 0 && (
            <div className="px-5 py-5 text-center space-y-1">
              <p className="text-[12px] text-slate-400">No corridors with <span className="font-semibold">{city.name}</span> as origin or destination.</p>
              <p className="text-[11px] text-slate-300">Add a watched corridor with {city.name} as an endpoint to start receiving city-level intelligence.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
