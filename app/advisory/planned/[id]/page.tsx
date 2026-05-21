"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { use } from "react";
import Link from "next/link";
import {
  ArrowLeft, Loader2, AlertTriangle, CheckCircle2, XCircle,
  RefreshCw, MapPin, Navigation, Clock, Zap, TrendingUp,
  ChevronRight, X, Info, Route, BarChart3, ShieldCheck,
} from "lucide-react";
import { TopBar } from "@/app/_components/TopBar";

// ── Types ─────────────────────────────────────────────────────────

type RiskLevel = "critical" | "high" | "medium" | "low" | "safe";

interface WatchedRoute {
  id: string;
  name: string;
  origin: string;
  destination: string;
  routes_fetched: boolean;
  last_intel_at: string | null;
  max_risk_level: RiskLevel;
  disruption_count: number;
  updated_at: string;
}

interface WatchedSegment {
  id: string;
  watched_route_id: string;
  route_variant: number;
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

const RISK_ORDER: Record<string, number> = { critical: 5, high: 4, medium: 3, low: 2, safe: 1 };

function riskBadgeCls(r: RiskLevel): string {
  return {
    critical: "bg-red-50 text-red-700 border-red-200",
    high:     "bg-orange-50 text-orange-700 border-orange-200",
    medium:   "bg-yellow-50 text-yellow-700 border-yellow-200",
    low:      "bg-blue-50 text-blue-700 border-blue-200",
    safe:     "bg-green-50 text-green-700 border-green-200",
  }[r] ?? "bg-green-50 text-green-700 border-green-200";
}

function riskDotCls(r: RiskLevel): string {
  return {
    critical: "bg-red-500",
    high:     "bg-orange-500",
    medium:   "bg-yellow-500",
    low:      "bg-blue-400",
    safe:     "bg-green-500",
  }[r] ?? "bg-green-500";
}

function riskStripCls(r: RiskLevel | null): string {
  if (!r) return "bg-green-400";
  return {
    critical: "bg-red-500",
    high:     "bg-orange-500",
    medium:   "bg-yellow-400",
    low:      "bg-blue-400",
    safe:     "bg-green-400",
  }[r] ?? "bg-green-400";
}

function segmentIcon(type: WatchedSegment["segment_type"]): string {
  if (type === "national_highway" || type === "state_highway") return "🛣️";
  if (type === "district") return "🏙️";
  return "📍";
}

function typeLabel(type: WatchedSegment["segment_type"]): string {
  return {
    national_highway: "National Highway",
    state_highway:    "State Highway",
    district:         "District",
    tehsil:           "Tehsil",
  }[type];
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

function recommendedAction(maxRisk: RiskLevel) {
  if (maxRisk === "critical" || maxRisk === "high")
    return { label: "HOLD DISPATCH", cls: "text-red-700 bg-red-50 border-red-200", icon: XCircle };
  if (maxRisk === "medium")
    return { label: "PLAN ALTERNATE ROUTE", cls: "text-orange-700 bg-orange-50 border-orange-200", icon: TrendingUp };
  return { label: "SAFE TO DISPATCH", cls: "text-green-700 bg-green-50 border-green-200", icon: CheckCircle2 };
}

function variantLabel(idx: number): string {
  if (idx === 0) return "Primary Route";
  return `Alternative ${idx}`;
}

// ── Sub-components ────────────────────────────────────────────────

function SummaryCard({ label, value, sub, cls }: { label: string; value: string; sub?: string; cls: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-4">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold num ${cls}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

// Risk heatmap strip — one cell per segment
function RiskStrip({ segments }: { segments: WatchedSegment[] }) {
  const disrupted = segments.filter((s) => s.has_disruption).length;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BarChart3 size={14} className="text-slate-500" />
          <span className="text-xs font-semibold text-slate-700">Segment Risk Heatmap</span>
        </div>
        <span className="text-[11px] text-slate-400">
          {disrupted} of {segments.length} disrupted
        </span>
      </div>
      <div className="flex gap-0.5 rounded-lg overflow-hidden h-5">
        {segments.map((s) => (
          <div
            key={s.id}
            title={`${s.name}${s.has_disruption ? ` — ${s.disruption_risk_level?.toUpperCase()}` : " — Clear"}`}
            style={{ flex: 1 }}
            className={`transition-opacity hover:opacity-80 cursor-default ${
              s.has_disruption ? riskStripCls(s.disruption_risk_level) : "bg-green-400"
            }`}
          />
        ))}
      </div>
      <div className="flex items-center gap-4 mt-2">
        {[
          { cls: "bg-red-500",    label: "Critical" },
          { cls: "bg-orange-500", label: "High" },
          { cls: "bg-yellow-400", label: "Medium" },
          { cls: "bg-green-400",  label: "Clear" },
        ].map(({ cls, label }) => (
          <span key={label} className="flex items-center gap-1 text-[10px] text-slate-500">
            <span className={`w-2.5 h-2.5 rounded-sm ${cls}`} />{label}
          </span>
        ))}
      </div>
    </div>
  );
}

// Single segment row — clickable
function SegmentRow({
  seg,
  onClick,
  isSelected,
}: {
  seg: WatchedSegment;
  onClick: () => void;
  isSelected: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={`px-5 py-3.5 flex items-start gap-3 cursor-pointer transition-colors hover:bg-slate-50 ${
        isSelected ? "bg-brand-50/60 border-l-2 border-brand-500" : ""
      } ${seg.has_disruption ? "bg-red-50/30" : ""}`}
    >
      <div className="text-lg shrink-0 mt-0.5">{segmentIcon(seg.segment_type)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-900 text-sm">{seg.name}</span>
          {seg.state && (
            <span className="text-xs text-slate-500 flex items-center gap-0.5">
              <MapPin size={10} />{seg.state}
            </span>
          )}
          <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
            {typeLabel(seg.segment_type)}
          </span>
        </div>

        {seg.has_disruption && seg.disruption_risk_level && (
          <div className="mt-1.5 space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${riskBadgeCls(seg.disruption_risk_level)}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${riskDotCls(seg.disruption_risk_level)}`} />
                {seg.disruption_risk_level}
              </span>
              {(seg.disruption_eta_hours ?? 0) > 0 && (
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
              <p className="text-xs text-slate-500 leading-snug line-clamp-2">{seg.disruption_summary}</p>
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

      <div className="flex items-center gap-2 shrink-0 mt-1">
        {seg.has_disruption && seg.disruption_risk_level ? (
          <span className={`w-2.5 h-2.5 rounded-full block ${riskDotCls(seg.disruption_risk_level)}`} />
        ) : (
          <span className="w-2.5 h-2.5 rounded-full block bg-green-400" />
        )}
        <ChevronRight size={12} className="text-slate-300" />
      </div>
    </div>
  );
}

// Segment detail drawer
function SegmentDrawer({
  seg,
  onClose,
}: {
  seg: WatchedSegment;
  onClose: () => void;
}) {
  return (
    <div className="w-80 border-l border-slate-200 bg-white flex flex-col shrink-0 slide-in overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-lg">{segmentIcon(seg.segment_type)}</span>
          <span className="text-sm font-semibold text-slate-800 truncate">{seg.name}</span>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 shrink-0">
          <X size={15} />
        </button>
      </div>

      <div className="p-4 space-y-4 flex-1">
        {/* Type + location */}
        <div className="flex flex-wrap gap-2">
          <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
            {typeLabel(seg.segment_type)}
          </span>
          {seg.state && (
            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full flex items-center gap-1">
              <MapPin size={9} />{seg.state}
            </span>
          )}
        </div>

        {/* Risk status */}
        {seg.has_disruption && seg.disruption_risk_level ? (
          <div className="space-y-3">
            <div className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border uppercase ${riskBadgeCls(seg.disruption_risk_level)}`}>
              <span className={`w-2 h-2 rounded-full ${riskDotCls(seg.disruption_risk_level)}`} />
              {seg.disruption_risk_level} Risk
            </div>

            {(seg.disruption_eta_hours ?? 0) > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 flex items-center gap-2">
                <Clock size={14} className="text-orange-500 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-orange-700">+{seg.disruption_eta_hours}h ETA impact</div>
                  <div className="text-[10px] text-orange-500">Expected additional delay</div>
                </div>
              </div>
            )}

            {seg.disruption_title && (
              <div>
                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1">Disruption</div>
                <p className="text-xs font-semibold text-slate-800 leading-snug">{seg.disruption_title}</p>
              </div>
            )}

            {seg.disruption_summary && (
              <div>
                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1">Summary</div>
                <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 rounded-lg p-3 border border-slate-100">
                  {seg.disruption_summary}
                </p>
              </div>
            )}

            {seg.disruption_category && (
              <div className="flex items-center gap-2">
                <Info size={11} className="text-slate-400" />
                <span className="text-xs text-slate-500 capitalize">
                  Category: {seg.disruption_category.replace("_", " ")}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <CheckCircle2 size={20} className="text-green-500 mx-auto mb-1.5" />
            <p className="text-xs font-semibold text-green-700">Segment Clear</p>
            {seg.last_checked_at && (
              <p className="text-[10px] text-green-500 mt-0.5">Last checked {timeAgo(seg.last_checked_at)}</p>
            )}
          </div>
        )}

        {/* Coordinates */}
        {(seg.lat || seg.lng) && (
          <div className="pt-2 border-t border-slate-100">
            <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1">Location</div>
            <div className="text-[11px] text-slate-500 font-mono">
              {seg.lat}, {seg.lng}
            </div>
          </div>
        )}

        {/* Sequence */}
        <div className="text-[10px] text-slate-400">
          Segment #{seg.seq + 1} · {variantLabel(seg.route_variant)}
        </div>
      </div>
    </div>
  );
}

// ── Corridor Leaflet Map ───────────────────────────────────────────

const RISK_COLOR: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#22c55e",
  safe: "#4ade80",
};

function segColor(risk: RiskLevel | null, isActive: boolean): string {
  if (!isActive) return "#374151";
  if (!risk || risk === "safe") return "#4ade80";
  return RISK_COLOR[risk] ?? "#4ade80";
}

function renderCorridorLayers(
  L: typeof import("leaflet"),
  map: import("leaflet").Map,
  layersRef: React.MutableRefObject<import("leaflet").Layer[]>,
  segments: WatchedSegment[],
  variants: number[],
  activeVariant: number,
  onSegmentClick?: (seg: WatchedSegment) => void,
) {
  layersRef.current.forEach((l) => l.remove());
  layersRef.current = [];

  variants.forEach((v) => {
    const vSegs = segments
      .filter((s) => s.route_variant === v && s.lat && s.lng)
      .sort((a, b) => a.seq - b.seq);
    if (vSegs.length < 2) return;
    const isActive = v === activeVariant;

    vSegs.slice(0, -1).forEach((seg, i) => {
      const next = vSegs[i + 1];
      const color = segColor(seg.has_disruption ? seg.disruption_risk_level : null, isActive);
      const line = L.polyline(
        [
          [parseFloat(seg.lat!), parseFloat(seg.lng!)],
          [parseFloat(next.lat!), parseFloat(next.lng!)],
        ],
        {
          color,
          weight: isActive ? 4 : 2,
          opacity: isActive ? 0.9 : 0.3,
        },
      );
      if (isActive && onSegmentClick) {
        line.on("click", () => onSegmentClick(seg));
      }
      line.addTo(map);
      layersRef.current.push(line);
    });
  });

  // Disruption hotspots on active variant
  segments
    .filter((s) => s.route_variant === activeVariant && s.has_disruption && s.lat && s.lng)
    .forEach((seg) => {
      const color = RISK_COLOR[seg.disruption_risk_level ?? "high"] ?? "#f97316";
      const glow = L.circleMarker([parseFloat(seg.lat!), parseFloat(seg.lng!)], {
        radius: 14,
        color,
        fillColor: color,
        fillOpacity: 0.15,
        weight: 0,
      }).addTo(map);
      const dot = L.circleMarker([parseFloat(seg.lat!), parseFloat(seg.lng!)], {
        radius: 6,
        color,
        fillColor: color,
        fillOpacity: 0.9,
        weight: 2,
      });
      dot.bindPopup(
        `<div style="font-size:12px;line-height:1.5;min-width:160px">
          <strong>${seg.name}</strong><br/>
          Risk: <b style="color:${color}">${seg.disruption_risk_level ?? "high"}</b><br/>
          ${seg.disruption_title ? `<span style="color:#475569">${seg.disruption_title}</span>` : ""}
        </div>`,
        { maxWidth: 220 },
      );
      if (onSegmentClick) dot.on("click", () => onSegmentClick(seg));
      dot.addTo(map);
      layersRef.current.push(glow, dot);
    });

  // Origin / destination on active variant
  const primary = segments
    .filter((s) => s.route_variant === activeVariant && s.lat && s.lng)
    .sort((a, b) => a.seq - b.seq);
  if (primary.length >= 2) {
    const first = primary[0];
    const last = primary[primary.length - 1];
    const origin = L.circleMarker([parseFloat(first.lat!), parseFloat(first.lng!)], {
      radius: 7, color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 1, weight: 2,
    }).bindTooltip("Origin", { permanent: false });
    const dest = L.circleMarker([parseFloat(last.lat!), parseFloat(last.lng!)], {
      radius: 7, color: "#8b5cf6", fillColor: "#8b5cf6", fillOpacity: 1, weight: 2,
    }).bindTooltip("Destination", { permanent: false });
    origin.addTo(map);
    dest.addTo(map);
    layersRef.current.push(origin, dest);
  }
}

function CorridorLeafletMap({
  segments,
  variants,
  activeVariant,
  onSegmentClick,
}: {
  segments: WatchedSegment[];
  variants: number[];
  activeVariant: number;
  onSegmentClick?: (seg: WatchedSegment) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<import("leaflet").Map | null>(null);
  const layersRef = useRef<import("leaflet").Layer[]>([]);

  const withCoords = segments.filter((s) => s.lat && s.lng);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current || withCoords.length < 2) return;

    import("leaflet").then((L) => {
      // Fix default icon path issue with webpack
      delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;

      const lats = withCoords.map((s) => parseFloat(s.lat!));
      const lngs = withCoords.map((s) => parseFloat(s.lng!));
      const bounds = L.latLngBounds(
        [Math.min(...lats) - 0.5, Math.min(...lngs) - 0.5],
        [Math.max(...lats) + 0.5, Math.max(...lngs) + 0.5],
      );

      const map = L.map(mapRef.current!, { zoomControl: true, scrollWheelZoom: true });
      map.fitBounds(bounds, { padding: [24, 24] });
      mapInstanceRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 18,
      }).addTo(map);

      renderCorridorLayers(L, map, layersRef, segments, variants, activeVariant, onSegmentClick);
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render layers when active variant changes
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    import("leaflet").then((L) => {
      renderCorridorLayers(
        L, mapInstanceRef.current!, layersRef, segments, variants, activeVariant, onSegmentClick,
      );
    });
  }, [activeVariant, segments, variants, onSegmentClick]);

  if (withCoords.length < 2) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin size={14} className="text-slate-500" />
          <span className="text-xs font-semibold text-slate-700">Corridor Route Map</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-slate-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Critical</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />High</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />Medium</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" />Clear</span>
          <span className="flex items-center gap-1 ml-2"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Origin</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-500 inline-block" />Dest</span>
        </div>
      </div>
      <div ref={mapRef} style={{ height: 380, width: "100%" }} />
    </div>
  );
}

// Alternative route recommendation panel
function AltRecommendation({
  segments,
  variants,
}: {
  segments: WatchedSegment[];
  variants: number[];
}) {
  if (variants.length < 2) return null;

  const RISK_ORD: Record<string, number> = { critical: 5, high: 4, medium: 3, low: 2, safe: 1 };

  interface VA { variant: number; label: string; disrupted: number; total: number; eta: number; maxRisk: RiskLevel }

  const analyses: VA[] = variants.map((v) => {
    const vSegs = segments.filter((s) => s.route_variant === v);
    const dis = vSegs.filter((s) => s.has_disruption);
    const eta = dis.reduce((s, seg) => s + (seg.disruption_eta_hours ?? 0), 0);
    const maxRisk = dis.reduce<RiskLevel>((best, s) => {
      const sl = s.disruption_risk_level as RiskLevel;
      return (RISK_ORD[sl] ?? 0) > (RISK_ORD[best] ?? 0) ? sl : best;
    }, "safe");
    return { variant: v, label: v === 0 ? "Primary Route" : `Alternative ${v}`, disrupted: dis.length, total: vSegs.length, eta, maxRisk };
  });

  const primary = analyses.find((a) => a.variant === 0);
  if (!primary) return null;

  const best = analyses
    .filter((a) => a.variant !== 0)
    .reduce<VA | null>((b, a) => {
      if (!b) return a;
      if ((RISK_ORD[a.maxRisk] ?? 0) < (RISK_ORD[b.maxRisk] ?? 0)) return a;
      if ((RISK_ORD[a.maxRisk] ?? 0) === (RISK_ORD[b.maxRisk] ?? 0) && a.eta < b.eta) return a;
      return b;
    }, null);

  const hasBetterAlt = best && (RISK_ORD[best.maxRisk] ?? 0) < (RISK_ORD[primary.maxRisk] ?? 0);

  return (
    <div className={`rounded-2xl border shadow-sm overflow-hidden ${hasBetterAlt ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
      <div className={`px-5 py-3.5 border-b flex items-center gap-2 ${hasBetterAlt ? "border-emerald-200" : "border-slate-100"}`}>
        <ShieldCheck size={14} className={hasBetterAlt ? "text-emerald-600" : "text-slate-500"} />
        <h3 className={`text-sm font-semibold ${hasBetterAlt ? "text-emerald-800" : "text-slate-800"}`}>
          Alternative Route Recommendation
        </h3>
      </div>
      <div className="p-4 space-y-3">
        {hasBetterAlt && best && (
          <div className="bg-white rounded-xl border border-emerald-200 p-4 flex items-start gap-3">
            <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-emerald-800">
                Use {best.label} — {best.disrupted} disruption{best.disrupted !== 1 ? "s" : ""} vs {primary.disrupted} on primary
              </p>
              <p className="text-xs text-emerald-600 mt-0.5">
                +{best.eta}h ETA impact vs +{primary.eta}h on primary route
              </p>
            </div>
          </div>
        )}

        {!hasBetterAlt && (
          <div className="bg-white rounded-xl border border-slate-100 p-4 flex items-start gap-3">
            <TrendingUp size={16} className="text-slate-400 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-600">
              {primary.disrupted === 0
                ? "Primary route is clear — no need for an alternate."
                : "All variants have similar risk levels. Choose based on ETA preference."}
            </p>
          </div>
        )}

        {/* Side-by-side variant mini comparison */}
        <div className={`grid gap-3 ${analyses.length >= 3 ? "grid-cols-3" : "grid-cols-2"}`}>
          {analyses.map((a) => {
            const isBest = best?.variant === a.variant && hasBetterAlt;
            const dotColor = { critical: "bg-red-500", high: "bg-orange-500", medium: "bg-yellow-400", low: "bg-blue-400", safe: "bg-green-400" }[a.maxRisk] ?? "bg-green-400";
            return (
              <div key={a.variant} className={`rounded-xl border p-3 ${isBest ? "border-emerald-300 bg-emerald-50" : "border-slate-100 bg-slate-50"}`}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                  <span className="text-[10px] font-semibold text-slate-700">{a.label}</span>
                  {isBest && <span className="text-[9px] font-bold text-emerald-600 ml-auto">BEST</span>}
                </div>
                <p className="text-lg font-bold num text-slate-800">{a.disrupted}<span className="text-xs font-normal text-slate-400">/{a.total} segs</span></p>
                <p className={`text-[10px] font-semibold mt-0.5 ${a.eta > 0 ? "text-orange-600" : "text-green-600"}`}>
                  {a.eta > 0 ? `+${a.eta}h delay` : "No delay"}
                </p>
              </div>
            );
          })}
        </div>
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

  const [route, setRoute]                 = useState<WatchedRoute | null>(null);
  const [segments, setSegments]           = useState<WatchedSegment[]>([]);
  const [loading, setLoading]             = useState(true);
  const [fetchingRoute, setFetchingRoute] = useState(false);
  const [actionMsg, setActionMsg]         = useState<string | null>(null);
  const [activeVariant, setActiveVariant] = useState(0);
  const [selectedSeg, setSelectedSeg]     = useState<WatchedSegment | null>(null);

  // Job polling state
  const [jobId, setJobId]           = useState<string | null>(null);
  const [jobStatus, setJobStatus]   = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState(0);
  const [jobDone, setJobDone]       = useState(0);
  const [jobTotal, setJobTotal]     = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runningIntel = jobStatus === "pending" || jobStatus === "running";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/advisory/v1/watched-routes/${id}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json() as { route: WatchedRoute; segments: WatchedSegment[] };
        setRoute(data.route);
        setSegments(data.segments);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function handleFetchRoute() {
    setFetchingRoute(true);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/advisory/v1/watched-routes/${id}/fetch-route`, {
        method: "POST", credentials: "include",
      });
      const data = await res.json() as { ok?: boolean; segmentCount?: number; error?: string };
      setActionMsg(res.ok
        ? `Route mapped — ${data.segmentCount ?? 0} segments loaded.`
        : `Error: ${data.error ?? "Unknown"}`);
      if (res.ok) await load();
    } finally { setFetchingRoute(false); }
  }

  async function handleRunIntelligence() {
    setActionMsg(null);
    setJobStatus("pending");
    setJobProgress(0);
    setJobDone(0);

    // Create the async job
    const res = await fetch(`/api/advisory/v1/watched-routes/${id}/run-intelligence`, {
      method: "POST", credentials: "include",
    });
    const data = await res.json() as { ok?: boolean; jobId?: string; segmentsTotal?: number; error?: string };

    if (!res.ok || !data.jobId) {
      setJobStatus(null);
      setActionMsg(`Error: ${data.error ?? "Failed to create job"}`);
      return;
    }

    setJobId(data.jobId);
    setJobTotal(data.segmentsTotal ?? 0);
    setActionMsg(null);

    // Poll for progress every 4 seconds
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const pr = await fetch(`/api/advisory/v1/intelligence-jobs/${data.jobId}`, { credentials: "include" });
        const pdata = await pr.json() as {
          status: string; progress: number;
          segmentsDone: number; segmentsTotal: number; disruptionsFound: number; error?: string;
        };

        setJobStatus(pdata.status);
        setJobProgress(pdata.progress);
        setJobDone(pdata.segmentsDone);
        setJobTotal(pdata.segmentsTotal);

        if (pdata.status === "completed" || pdata.status === "done") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setActionMsg(`Intelligence complete — ${pdata.segmentsDone} segments checked, ${pdata.disruptionsFound} disruptions found.`);
          await load();
        } else if (pdata.status === "failed" || pdata.status === "cancelled" || pdata.status === "error") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setActionMsg(`Job ${pdata.status}${pdata.error ? `: ${pdata.error}` : ""}`);
        }
      } catch { /* network hiccup — continue polling */ }
    }, 4000);
  }

  // Clean up poll on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar title="Corridor Detail" subtitle="Loading…" />
        <div className="flex-1 flex items-center justify-center text-slate-400">
          <Loader2 size={28} className="animate-spin" />
        </div>
      </div>
    );
  }

  if (!route) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar title="Corridor Detail" subtitle="Not found" />
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
          <AlertTriangle size={32} className="mb-2 text-slate-300" />
          <p className="text-sm">Route not found.</p>
          <Link href="/advisory/planned" className="mt-2 text-xs text-brand-600 hover:underline">
            ← Back to Watched Corridors
          </Link>
        </div>
      </div>
    );
  }

  // Variant breakdown
  const variants = Array.from(new Set(segments.map((s) => s.route_variant))).sort();
  const variantSegments = segments.filter((s) => s.route_variant === activeVariant);

  // Stats across ALL variants
  const disruptedAll     = segments.filter((s) => s.has_disruption && s.disruption_risk_level);
  const disruptedCount   = disruptedAll.length;
  const totalEtaHours    = disruptedAll.reduce((sum, s) => sum + (s.disruption_eta_hours ?? 0), 0);
  const computedMaxRisk  = disruptedAll.reduce<RiskLevel>((best, s) => {
    const sl = s.disruption_risk_level as RiskLevel;
    return (RISK_ORDER[sl] ?? 0) > (RISK_ORDER[best] ?? 0) ? sl : best;
  }, "safe");

  // Stats for active variant only
  const variantDisrupted  = variantSegments.filter((s) => s.has_disruption);
  const variantEta        = variantDisrupted.reduce((s, v) => s + (v.disruption_eta_hours ?? 0), 0);
  const variantMaxRisk    = variantDisrupted.reduce<RiskLevel>((best, s) => {
    const sl = s.disruption_risk_level as RiskLevel;
    return (RISK_ORDER[sl] ?? 0) > (RISK_ORDER[best] ?? 0) ? sl : best;
  }, "safe");

  const rec      = recommendedAction(computedMaxRisk);
  const RecIcon  = rec.icon;
  const hasIntel = segments.some((s) => s.last_checked_at !== null);

  // Highways affected in current variant
  const highways = variantSegments
    .filter((s) => s.segment_type === "national_highway" || s.segment_type === "state_highway")
    .map((s) => s.name);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar
        title={route.name || `${route.origin} → ${route.destination}`}
        subtitle="Corridor Intelligence"
      />

      <div className="flex-1 overflow-hidden flex">
        {/* Main content */}
        <div className={`flex-1 overflow-auto p-6 bg-slate-50 ${selectedSeg ? "hidden md:block" : ""}`}>
          <div className="max-w-4xl mx-auto space-y-5">

            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <Link
                href="/advisory/planned"
                className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
              >
                <ArrowLeft size={14} />Back to Watched Corridors
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
                  {fetchingRoute ? <Loader2 size={13} className="animate-spin" /> : <Navigation size={13} />}
                  {fetchingRoute ? "Fetching…" : "Fetch Route"}
                </button>
                <button
                  onClick={() => void handleRunIntelligence()}
                  disabled={!route.routes_fetched || fetchingRoute || runningIntel}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-brand-700 text-white hover:bg-brand-800 disabled:opacity-50 transition"
                >
                  {runningIntel ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                  {runningIntel ? "Running…" : "Run Intelligence"}
                </button>
              </div>
            </div>

            {/* Job progress bar */}
            {runningIntel && (
              <div className="rounded-xl bg-brand-50 border border-brand-200 px-4 py-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-brand-800 flex items-center gap-1.5">
                    <Loader2 size={12} className="animate-spin" />
                    {jobStatus === "pending" ? "Queued — starting within 60s…" : `Analyzing segments… ${jobDone}/${jobTotal}`}
                  </span>
                  <span className="text-brand-600 font-bold num">{jobProgress}%</span>
                </div>
                <div className="h-1.5 bg-brand-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-600 rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(jobProgress, jobStatus === "pending" ? 2 : 5)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Action feedback */}
            {actionMsg && !runningIntel && (
              <div className={`rounded-lg px-4 py-2.5 text-sm flex items-center gap-2 ${
                actionMsg.startsWith("Error") || actionMsg.includes("failed") || actionMsg.includes("cancelled")
                  ? "bg-red-50 border border-red-200 text-red-800"
                  : "bg-blue-50 border border-blue-200 text-blue-800"
              }`}>
                <CheckCircle2 size={14} />{actionMsg}
              </div>
            )}

            {/* Route hero card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-5">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
                  <Route size={20} className="text-brand-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-900 text-lg leading-tight mb-1">
                    {route.origin}
                    <span className="mx-2 text-slate-400 font-normal">→</span>
                    {route.destination}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                    {variants.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Navigation size={11} />{variants.length} route variant{variants.length > 1 ? "s" : ""}
                      </span>
                    )}
                    {segments.length > 0 && (
                      <span className="flex items-center gap-1">
                        <MapPin size={11} />{segments.length} total segments
                      </span>
                    )}
                    {route.last_intel_at && (
                      <span className="flex items-center gap-1">
                        <Clock size={11} />Last scan: {timeAgo(route.last_intel_at)}
                      </span>
                    )}
                  </div>
                  {highways.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {highways.map((h) => (
                        <span key={h} className="text-[10px] font-semibold bg-brand-50 text-brand-700 border border-brand-200 px-2 py-0.5 rounded-full">
                          {h}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Not yet fetched */}
            {!route.routes_fetched && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl px-6 py-8 text-center">
                <Loader2 size={28} className="animate-spin mx-auto mb-3 text-amber-500" />
                <p className="text-sm font-semibold text-amber-800 mb-1">Fetching route segments…</p>
                <p className="text-xs text-amber-600 mb-4">
                  Google Directions is decomposing this corridor. This may take a moment.
                </p>
                <button
                  onClick={() => void handleFetchRoute()}
                  disabled={fetchingRoute}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition"
                >
                  {fetchingRoute ? <Loader2 size={13} className="animate-spin" /> : <Navigation size={13} />}
                  {fetchingRoute ? "Fetching…" : "Fetch Route Now"}
                </button>
              </div>
            )}

            {/* Fetched but intel not run */}
            {route.routes_fetched && !hasIntel && (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl px-6 py-8 text-center">
                <Zap size={28} className="mx-auto mb-3 text-blue-400" />
                <p className="text-sm font-semibold text-blue-800 mb-1">Intelligence not run yet</p>
                <p className="text-xs text-blue-600 mb-4">
                  {segments.length} segments ready. Run intelligence to check for disruptions across all route variants.
                </p>
                <button
                  onClick={() => void handleRunIntelligence()}
                  disabled={runningIntel}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-brand-700 text-white hover:bg-brand-800 disabled:opacity-50 transition"
                >
                  {runningIntel ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                  {runningIntel ? "Running…" : "Run Intelligence"}
                </button>
              </div>
            )}

            {/* Full intelligence view */}
            {route.routes_fetched && hasIntel && (
              <>
                {/* Summary stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <SummaryCard
                    label="Total Segments"
                    value={String(segments.length)}
                    sub={`${variants.length} route variant${variants.length !== 1 ? "s" : ""}`}
                    cls="text-slate-700"
                  />
                  <SummaryCard
                    label="Disrupted"
                    value={String(disruptedCount)}
                    sub={disruptedCount > 0 ? `${Math.round(disruptedCount / segments.length * 100)}% of corridor` : "All clear"}
                    cls={disruptedCount > 0 ? "text-red-700" : "text-green-700"}
                  />
                  <SummaryCard
                    label="Total ETA Impact"
                    value={totalEtaHours > 0 ? `+${totalEtaHours}h` : "None"}
                    sub={totalEtaHours > 0 ? "Combined delay across disruptions" : "On-time corridor"}
                    cls={totalEtaHours > 0 ? "text-orange-700" : "text-green-700"}
                  />
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-4">
                    <div className="text-xs text-slate-500 mb-1">Recommended Action</div>
                    <div className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${rec.cls}`}>
                      <RecIcon size={12} />{rec.label}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1.5">Based on max risk</div>
                  </div>
                </div>

                {/* Mini route map — plotted from segment coordinates */}
                <CorridorLeafletMap segments={segments} variants={variants} activeVariant={activeVariant} onSegmentClick={(seg) => setSelectedSeg(seg)} />

                {/* Risk heatmap strip for active variant */}
                {variantSegments.length > 0 && (
                  <RiskStrip segments={variantSegments} />
                )}

                {/* Alternative route recommendation (multiple variants only) */}
                {variants.length > 1 && (
                  <AltRecommendation segments={segments} variants={variants} />
                )}

                {/* Route variant tabs (only if multiple variants) */}
                {variants.length > 1 && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="flex border-b border-slate-100">
                      {variants.map((v) => {
                        const vSegs     = segments.filter((s) => s.route_variant === v);
                        const vDisrupted = vSegs.filter((s) => s.has_disruption).length;
                        const vMaxRisk  = vSegs
                          .filter((s) => s.has_disruption)
                          .reduce<RiskLevel>((best, s) => {
                            const sl = s.disruption_risk_level as RiskLevel;
                            return (RISK_ORDER[sl] ?? 0) > (RISK_ORDER[best] ?? 0) ? sl : best;
                          }, "safe");
                        const dotCls = vDisrupted > 0 ? riskDotCls(vMaxRisk) : "bg-green-400";
                        return (
                          <button
                            key={v}
                            onClick={() => { setActiveVariant(v); setSelectedSeg(null); }}
                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-xs font-semibold transition border-b-2 ${
                              activeVariant === v
                                ? "text-brand-700 border-brand-500 bg-brand-50/40"
                                : "text-slate-500 border-transparent hover:bg-slate-50"
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full shrink-0 ${dotCls}`} />
                            {variantLabel(v)}
                            <span className="text-[10px] font-normal text-slate-400">
                              {vSegs.length} segs
                              {vDisrupted > 0 ? ` · ${vDisrupted} disrupted` : ""}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Active variant summary */}
                    <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-6 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <MapPin size={11} />{variantSegments.length} segments
                      </span>
                      <span className="flex items-center gap-1 text-orange-600 font-medium">
                        {variantDisrupted.length > 0
                          ? `${variantDisrupted.length} disrupted · +${variantEta}h total`
                          : "✓ No disruptions on this variant"}
                      </span>
                      {variantDisrupted.length > 0 && (
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${riskBadgeCls(variantMaxRisk)}`}>
                          {variantMaxRisk}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Segment list */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
                      {variants.length > 1 ? variantLabel(activeVariant) : "Corridor Breakdown"}
                    </h2>
                    <span className="text-xs text-slate-400">
                      {variantSegments.length} segments · click any to inspect
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {variantSegments.length === 0 ? (
                      <div className="flex items-center justify-center h-24 text-slate-400 text-sm">
                        No segments for this variant.
                      </div>
                    ) : (
                      variantSegments.map((seg) => (
                        <SegmentRow
                          key={seg.id}
                          seg={seg}
                          isSelected={selectedSeg?.id === seg.id}
                          onClick={() => setSelectedSeg(selectedSeg?.id === seg.id ? null : seg)}
                        />
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Segment detail drawer */}
        {selectedSeg && (
          <SegmentDrawer
            seg={selectedSeg}
            onClose={() => setSelectedSeg(null)}
          />
        )}
      </div>
    </div>
  );
}
