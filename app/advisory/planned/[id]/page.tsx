"use client";

import { useState, useEffect, useCallback } from "react";
import { use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  MapPin,
  Navigation,
  Package,
  Clock,
  Zap,
  TrendingUp,
} from "lucide-react";
import { TopBar } from "@/app/_components/TopBar";

// ── Types ─────────────────────────────────────────────────────────

type RiskLevel = "critical" | "high" | "medium" | "low" | "safe";

interface PlannedRoute {
  id: string;
  name: string;
  origin: string;
  destination: string;
  cargo_type: string | null;
  vehicle_type: string | null;
  routes_fetched: boolean;
  last_intel_at: string | null;
  max_risk_level: RiskLevel;
  disruption_count: number;
  updated_at: string;
}

interface PlannedSegment {
  id: string;
  planned_route_id: string;
  segment_type: "district" | "tehsil" | "national_highway" | "state_highway";
  name: string;
  state: string | null;
  seq: number;
  lat: string | null;
  lng: string | null;
  has_disruption: boolean;
  disruption_risk_level: RiskLevel | null;
  disruption_title: string | null;
  disruption_summary: string | null;
  disruption_eta_hours: number | null;
  disruption_category: string | null;
  last_checked_at: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────

function riskBadgeCls(r: RiskLevel): string {
  const map: Record<RiskLevel, string> = {
    critical: "bg-red-50 text-red-700 border-red-200",
    high:     "bg-orange-50 text-orange-700 border-orange-200",
    medium:   "bg-yellow-50 text-yellow-700 border-yellow-200",
    low:      "bg-blue-50 text-blue-700 border-blue-200",
    safe:     "bg-green-50 text-green-700 border-green-200",
  };
  return map[r] ?? map.safe;
}

function riskDotCls(r: RiskLevel): string {
  const map: Record<RiskLevel, string> = {
    critical: "bg-red-500",
    high:     "bg-orange-500",
    medium:   "bg-yellow-500",
    low:      "bg-blue-400",
    safe:     "bg-green-500",
  };
  return map[r] ?? map.safe;
}

function segmentIcon(type: PlannedSegment["segment_type"]): string {
  if (type === "national_highway" || type === "state_highway") return "🛣️";
  if (type === "district") return "🏙️";
  return "📍";
}

function typeLabel(type: PlannedSegment["segment_type"]): string {
  const map: Record<PlannedSegment["segment_type"], string> = {
    national_highway: "National Highway",
    state_highway:    "State Highway",
    district:         "District",
    tehsil:           "Tehsil",
  };
  return map[type];
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function recommendedAction(maxRisk: RiskLevel): {
  label: string;
  cls: string;
  icon: React.ComponentType<{ size?: number }>;
} {
  if (maxRisk === "critical" || maxRisk === "high") {
    return { label: "HOLD DISPATCH", cls: "text-red-700 bg-red-50 border-red-200", icon: XCircle };
  }
  if (maxRisk === "medium") {
    return {
      label: "PLAN ALTERNATE ROUTE",
      cls: "text-orange-700 bg-orange-50 border-orange-200",
      icon: TrendingUp,
    };
  }
  return {
    label: "SAFE TO DISPATCH",
    cls: "text-green-700 bg-green-50 border-green-200",
    icon: CheckCircle2,
  };
}

// ── Sub-components ────────────────────────────────────────────────

function SummaryCard({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-4">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold num ${cls}`}>{value}</div>
    </div>
  );
}

function SegmentRow({ seg }: { seg: PlannedSegment }) {
  return (
    <div className={`px-5 py-4 flex items-start gap-3 ${seg.has_disruption ? "bg-red-50/30" : ""}`}>
      <div className="text-xl shrink-0 mt-0.5">{segmentIcon(seg.segment_type)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-900 text-sm">{seg.name}</span>
          {seg.state && (
            <span className="text-xs text-slate-500 flex items-center gap-0.5">
              <MapPin size={10} />
              {seg.state}
            </span>
          )}
          <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
            {typeLabel(seg.segment_type)}
          </span>
        </div>

        {seg.has_disruption && seg.disruption_risk_level && (
          <div className="mt-1.5 space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${riskBadgeCls(seg.disruption_risk_level)}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${riskDotCls(seg.disruption_risk_level)}`} />
                {seg.disruption_risk_level}
              </span>
              {seg.disruption_eta_hours != null && seg.disruption_eta_hours > 0 && (
                <span className="text-xs text-orange-600 font-semibold num">
                  +{seg.disruption_eta_hours}h delay
                </span>
              )}
              {seg.disruption_category && (
                <span className="text-[10px] text-slate-500 capitalize">
                  {seg.disruption_category.replace("_", " ")}
                </span>
              )}
            </div>
            {seg.disruption_title && (
              <p className="text-xs font-medium text-slate-800 leading-snug">{seg.disruption_title}</p>
            )}
            {seg.disruption_summary && (
              <p className="text-xs text-slate-500 leading-snug line-clamp-2">
                {seg.disruption_summary}
              </p>
            )}
          </div>
        )}

        {!seg.has_disruption && seg.last_checked_at && (
          <div className="mt-1 flex items-center gap-1 text-xs text-green-600">
            <CheckCircle2 size={11} />
            <span>Clear — last checked {timeAgo(seg.last_checked_at)}</span>
          </div>
        )}
      </div>

      {/* Risk dot */}
      <div className="shrink-0 mt-1">
        {seg.has_disruption && seg.disruption_risk_level ? (
          <span className={`w-2.5 h-2.5 rounded-full block ${riskDotCls(seg.disruption_risk_level)}`} />
        ) : (
          <span className="w-2.5 h-2.5 rounded-full block bg-green-400" />
        )}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────

export default function PlannedRouteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [route, setRoute]               = useState<PlannedRoute | null>(null);
  const [segments, setSegments]         = useState<PlannedSegment[]>([]);
  const [loading, setLoading]           = useState(true);
  const [fetchingRoute, setFetchingRoute] = useState(false);
  const [runningIntel, setRunningIntel]   = useState(false);
  const [actionMsg, setActionMsg]         = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/advisory/v1/watched-routes/${id}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = (await res.json()) as {
          route: PlannedRoute;
          segments: PlannedSegment[];
        };
        setRoute(data.route);
        setSegments(data.segments);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleFetchRoute() {
    setFetchingRoute(true);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/advisory/v1/watched-routes/${id}/fetch-route`, {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as { ok?: boolean; segmentCount?: number; error?: string };
      if (res.ok) {
        setActionMsg(`Route mapped — ${data.segmentCount ?? 0} segments loaded.`);
        await load();
      } else {
        setActionMsg(`Error: ${data.error ?? "Unknown"}`);
      }
    } finally {
      setFetchingRoute(false);
    }
  }

  async function handleRunIntelligence() {
    setRunningIntel(true);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/advisory/v1/watched-routes/${id}/run-intelligence`, {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        segmentsChecked?: number;
        disruptionsFound?: number;
        error?: string;
      };
      if (res.ok) {
        setActionMsg(
          `Intelligence complete — ${data.segmentsChecked ?? 0} segments checked, ${data.disruptionsFound ?? 0} disruptions found.`,
        );
        await load();
      } else {
        setActionMsg(`Error: ${data.error ?? "Unknown"}`);
      }
    } finally {
      setRunningIntel(false);
    }
  }

  // ── Loading state ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar title="Route Detail" subtitle="Loading…" />
        <div className="flex-1 flex items-center justify-center text-slate-400">
          <Loader2 size={28} className="animate-spin" />
        </div>
      </div>
    );
  }

  if (!route) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar title="Route Detail" subtitle="Not found" />
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
          <AlertTriangle size={32} className="mb-2 text-slate-300" />
          <p className="text-sm">Route not found.</p>
          <Link href="/advisory/planned" className="mt-2 text-xs text-brand-600 hover:underline">
            ← Back to planned routes
          </Link>
        </div>
      </div>
    );
  }

  const totalEtaHours = segments
    .filter((s) => s.has_disruption && s.disruption_eta_hours)
    .reduce((sum, s) => sum + (s.disruption_eta_hours ?? 0), 0);

  const rec = recommendedAction(route.max_risk_level);
  const RecIcon = rec.icon;
  const hasIntelRun = segments.some((s) => s.last_checked_at !== null);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar
        title={route.name || `${route.origin} → ${route.destination}`}
        subtitle="Corridor Intelligence"
      />

      <div className="flex-1 overflow-auto p-6 bg-slate-50">
        <div className="max-w-5xl mx-auto space-y-5">

          {/* Header bar */}
          <div className="flex items-center justify-between">
            <Link
              href="/advisory/planned"
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
            >
              <ArrowLeft size={14} />Back to Planned Routes
            </Link>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void load()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition"
              >
                <RefreshCw size={13} />Refresh
              </button>
              <button
                onClick={() => void handleFetchRoute()}
                disabled={fetchingRoute || runningIntel}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 font-medium hover:bg-slate-50 disabled:opacity-50 transition"
              >
                {fetchingRoute ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Navigation size={13} />
                )}
                {fetchingRoute ? "Fetching…" : "Fetch Route"}
              </button>
              <button
                onClick={() => void handleRunIntelligence()}
                disabled={!route.routes_fetched || fetchingRoute || runningIntel}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-brand-700 text-white hover:bg-brand-800 disabled:opacity-50 transition"
              >
                {runningIntel ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Zap size={13} />
                )}
                {runningIntel ? "Running…" : "Run Intelligence"}
              </button>
            </div>
          </div>

          {/* Action feedback */}
          {actionMsg && (
            <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-2.5 text-sm text-blue-800 flex items-center gap-2">
              <CheckCircle2 size={14} />
              {actionMsg}
            </div>
          )}

          {/* Route meta card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
                <Navigation size={18} className="text-brand-600" />
              </div>
              <div>
                <div className="font-semibold text-slate-900 text-base">
                  {route.origin} → {route.destination}
                </div>
                <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-3 flex-wrap">
                  {route.cargo_type && (
                    <span className="flex items-center gap-1">
                      <Package size={11} />Cargo: {route.cargo_type}
                    </span>
                  )}
                  {route.vehicle_type && (
                    <span className="flex items-center gap-1">
                      <Navigation size={11} />Vehicle: {route.vehicle_type}
                    </span>
                  )}
                  {route.last_intel_at && (
                    <span className="flex items-center gap-1">
                      <Clock size={11} />Last scan: {timeAgo(route.last_intel_at)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Not yet fetched state */}
          {!route.routes_fetched && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-6 py-8 text-center">
              <Loader2 size={28} className="animate-spin mx-auto mb-3 text-amber-500" />
              <p className="text-sm font-semibold text-amber-800 mb-1">
                Fetching route segments…
              </p>
              <p className="text-xs text-amber-600 mb-4">
                Google Directions is being called to decompose this corridor. This may take a moment.
              </p>
              <button
                onClick={() => void handleFetchRoute()}
                disabled={fetchingRoute}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition"
              >
                {fetchingRoute ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Navigation size={13} />
                )}
                {fetchingRoute ? "Fetching…" : "Fetch Route Now"}
              </button>
            </div>
          )}

          {/* Fetched but intel not run */}
          {route.routes_fetched && !hasIntelRun && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl px-6 py-8 text-center">
              <Zap size={28} className="mx-auto mb-3 text-blue-400" />
              <p className="text-sm font-semibold text-blue-800 mb-1">Intelligence not run yet</p>
              <p className="text-xs text-blue-600 mb-4">
                {segments.length} segments are ready. Run intelligence to check for disruptions.
              </p>
              <button
                onClick={() => void handleRunIntelligence()}
                disabled={runningIntel}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-brand-700 text-white hover:bg-brand-800 disabled:opacity-50 transition"
              >
                {runningIntel ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Zap size={13} />
                )}
                {runningIntel ? "Running…" : "Run Intelligence"}
              </button>
            </div>
          )}

          {/* Summary + Segments when intel has been run */}
          {route.routes_fetched && hasIntelRun && (
            <>
              {/* Summary panel */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <SummaryCard
                  label="Total Segments"
                  value={String(segments.length)}
                  cls="text-slate-700"
                />
                <SummaryCard
                  label="Disrupted"
                  value={String(route.disruption_count)}
                  cls={route.disruption_count > 0 ? "text-red-700" : "text-green-700"}
                />
                <SummaryCard
                  label="Total ETA Impact"
                  value={totalEtaHours > 0 ? `+${totalEtaHours}h` : "None"}
                  cls={totalEtaHours > 0 ? "text-orange-700" : "text-green-700"}
                />
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-4">
                  <div className="text-xs text-slate-500 mb-1">Recommended Action</div>
                  <div
                    className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${rec.cls}`}
                  >
                    <RecIcon size={12} />
                    {rec.label}
                  </div>
                </div>
              </div>

              {/* Corridor breakdown */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50">
                  <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
                    Corridor Breakdown
                  </h2>
                </div>
                <div className="divide-y divide-slate-100">
                  {segments.length === 0 ? (
                    <div className="flex items-center justify-center h-24 text-slate-400 text-sm">
                      No segments loaded yet.
                    </div>
                  ) : (
                    segments.map((seg) => <SegmentRow key={seg.id} seg={seg} />)
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
