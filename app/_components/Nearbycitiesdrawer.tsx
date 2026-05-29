"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  X, MapPin, AlertTriangle, ShieldCheck, Loader2,
  ExternalLink, ChevronDown, ChevronUp, RefreshCw,
  Radio, Navigation,
} from "lucide-react";
import RiskBadge from "@/app/_components/RiskBadge";
import type { RiskLevel } from "@/app/_lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────
interface EventSource {
  url: string;
  title: string;
  snippet: string;
  isRelevant: boolean;
  scrapedAt: string;
}

interface NearbyCityNews {
  id: string;
  name: string;
  state: string | null;
  lat: number | null;
  lng: number | null;
  distance_km: number;
  has_disruption: boolean;
  disruption_risk_level: string | null;
  disruption_title: string | null;
  disruption_summary: string | null;
  disruption_eta_hours: number | null;
  disruption_category: string | null;
  disruption_sources: EventSource[] | null;
  last_checked_at: string | null;
}

interface NearbyCitiesDrawerProps {
  cityId: string;
  cityName: string;
  open: boolean;
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const CATEGORY_ICON: Record<string, string> = {
  political: "🚫", weather: "🌩", traffic: "⛽", security: "🔒",
  infrastructure: "🛣", religious: "🎯", vvip: "🚨", natural_disaster: "🌊",
};

const RISK_COLOR: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-400",
  medium: "bg-amber-400",
  low: "bg-blue-400",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Nearby city row ───────────────────────────────────────────────────────────
function NearbyCityRow({ city }: { city: NearbyCityNews }) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const sources = (city.disruption_sources ?? []).filter((s) => s.isRelevant);
  const allSources = city.disruption_sources ?? [];

  const riskDot = city.disruption_risk_level
    ? RISK_COLOR[city.disruption_risk_level] ?? "bg-slate-300"
    : "bg-emerald-400";

  return (
    <div className={`rounded-xl border transition-all ${
      city.disruption_risk_level === "critical"
        ? "border-red-200 bg-red-50/30"
        : city.disruption_risk_level === "high"
        ? "border-orange-200 bg-orange-50/20"
        : city.has_disruption
        ? "border-amber-200 bg-amber-50/10"
        : "border-slate-200 bg-white"
    }`}>
      {/* City header */}
      <div className="flex items-start gap-3 px-4 py-3">
        {/* Distance + dot */}
        <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
          <span className={`w-2 h-2 rounded-full ${riskDot}`} />
          <span className="text-[9px] text-slate-400 font-mono tabular-nums">{city.distance_km.toFixed(0)}km</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-[13px] font-semibold text-slate-800">{city.name}</span>
              {city.state && (
                <span className="ml-1.5 text-[10px] text-slate-400">{city.state}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {city.disruption_eta_hours && city.disruption_eta_hours > 0 && (
                <span className="text-[9px] font-bold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded-full">
                  +{city.disruption_eta_hours}h
                </span>
              )}
              {city.disruption_risk_level ? (
                <RiskBadge level={city.disruption_risk_level as RiskLevel} size="xs" pulse={city.disruption_risk_level === "critical"} />
              ) : (
                <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                  <ShieldCheck size={10} /> Clear
                </span>
              )}
            </div>
          </div>

          {/* Disruption content */}
          {city.disruption_title && (
            <p className="text-[11.5px] font-semibold text-slate-700 mt-1 leading-snug">
              {city.disruption_title}
            </p>
          )}
          {city.disruption_summary && (
            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed line-clamp-2">
              {city.disruption_summary}
            </p>
          )}

          {/* Meta tags row */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {city.disruption_category && (
              <span className="text-[9.5px] bg-white border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded-full">
                {CATEGORY_ICON[city.disruption_category] ?? "⚠"} {city.disruption_category}
              </span>
            )}
            {city.last_checked_at && (
              <span className="text-[9.5px] text-slate-400">
                🔍 {timeAgo(city.last_checked_at)}
              </span>
            )}
            {allSources.length > 0 && (
              <button
                onClick={() => setSourcesOpen((v) => !v)}
                className="inline-flex items-center gap-0.5 text-[9.5px] text-brand-600 font-semibold hover:text-brand-800 ml-auto"
              >
                {sources.length > 0 ? `${sources.length} source${sources.length > 1 ? "s" : ""}` : `${allSources.length} scanned`}
                {sourcesOpen ? <ChevronUp size={8} /> : <ChevronDown size={8} />}
              </button>
            )}
          </div>

          {/* Sources list */}
          {sourcesOpen && allSources.length > 0 && (
            <div className="mt-2 space-y-1">
              {allSources.map((src, i) => (
                <a
                  key={i}
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-start gap-2 p-2 rounded-lg border transition group ${
                    src.isRelevant
                      ? "border-brand-100 bg-white hover:bg-brand-50"
                      : "border-slate-100 bg-slate-50/50 hover:bg-slate-100 opacity-60"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold text-brand-800 group-hover:underline line-clamp-1">{src.title}</p>
                    {src.snippet && (
                      <p className="text-[9px] text-slate-400 mt-0.5 line-clamp-1">{src.snippet}</p>
                    )}
                  </div>
                  <ExternalLink size={9} className="shrink-0 mt-0.5 text-slate-400" />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Drawer ────────────────────────────────────────────────────────────────────
export function NearbyCitiesDrawer({ cityId, cityName, open, onClose }: NearbyCitiesDrawerProps) {
  const [nearby, setNearby] = useState<NearbyCityNews[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await fetch(`/api/advisory/v1/cities/${cityId}/nearby`, { credentials: "include" });
      if (res.ok) {
        const d = await res.json() as { nearby: NearbyCityNews[] };
        setNearby(d.nearby ?? []);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoaded(true);
    }
  }, [cityId]);

  // Load data when drawer opens
  useEffect(() => {
    if (open && !loaded) load();
  }, [open, loaded, load]);

  // Reset when city changes
  useEffect(() => {
    setLoaded(false);
    setNearby([]);
  }, [cityId]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const disrupted = nearby.filter((c) => c.has_disruption);
  const clear = nearby.filter((c) => !c.has_disruption);
  const criticalCount = nearby.filter((c) => c.disruption_risk_level === "critical").length;
  const unscanned = nearby.filter((c) => !c.last_checked_at).length;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[2px] transition-opacity duration-200 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        className={`fixed right-0 top-0 bottom-0 z-50 w-[420px] max-w-[100vw] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Navigation size={14} className="text-brand-600 shrink-0" />
              <h2 className="text-[15px] font-bold text-slate-900 truncate">
                Nearby Cities
              </h2>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
              Within 40 km of <span className="font-semibold text-slate-700">{cityName}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => load(true)}
              disabled={loading || refreshing}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Stats strip */}
        {loaded && nearby.length > 0 && (
          <div className="flex items-center gap-px bg-slate-100 shrink-0">
            {[
              { label: "Total", value: nearby.length, cls: "text-slate-700" },
              { label: "Disrupted", value: disrupted.length, cls: disrupted.length > 0 ? "text-orange-600" : "text-slate-400" },
              { label: "Critical", value: criticalCount, cls: criticalCount > 0 ? "text-red-600 font-bold" : "text-slate-400" },
              { label: "Clear", value: clear.length, cls: "text-emerald-600" },
              ...(unscanned > 0 ? [{ label: "Unscanned", value: unscanned, cls: "text-slate-400" }] : []),
            ].map((stat) => (
              <div key={stat.label} className="flex-1 bg-white flex flex-col items-center py-2.5">
                <span className={`text-[15px] font-bold num ${stat.cls}`}>{stat.value}</span>
                <span className="text-[8.5px] text-slate-400 uppercase tracking-wider">{stat.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Loader2 size={22} className="animate-spin text-slate-300" />
              <p className="text-xs text-slate-400">Loading nearby cities…</p>
            </div>
          ) : !loaded ? null : nearby.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 px-8 text-center">
              <MapPin size={32} className="text-slate-200" />
              <p className="text-sm font-semibold text-slate-600">No nearby cities found</p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Discovery runs automatically. Check back after the next cron cycle.
              </p>
            </div>
          ) : (
            <div className="p-4 space-y-5">

              {/* Disrupted cities */}
              {disrupted.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle size={12} className="text-orange-500" />
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Active Disruptions ({disrupted.length})
                    </h3>
                    {criticalCount > 0 && (
                      <span className="flex items-center gap-1 ml-auto text-[9px] font-bold text-red-600 animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        {criticalCount} critical
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {disrupted.map((city) => (
                      <NearbyCityRow key={city.id} city={city} />
                    ))}
                  </div>
                </section>
              )}

              {/* Clear cities */}
              {clear.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <ShieldCheck size={12} className="text-emerald-500" />
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Clear ({clear.length})
                    </h3>
                  </div>
                  <div className="space-y-1.5">
                    {clear.map((city) => (
                      <NearbyCityRow key={city.id} city={city} />
                    ))}
                  </div>
                </section>
              )}

            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 shrink-0 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <Radio size={10} />
            Intelligence scans every 24h
          </div>
          {loaded && unscanned > 0 && (
            <span className="text-[10px] text-amber-600 font-medium">
              {unscanned} city{unscanned > 1 ? "ies" : ""} pending first scan
            </span>
          )}
        </div>
      </div>
    </>
  );
}