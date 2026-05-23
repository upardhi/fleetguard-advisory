// app/advisory/planner/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  Navigation, AlertTriangle, CheckCircle2, TrendingUp,
  Loader2, ChevronDown, ChevronUp,
  MapPin, Route, Building2, AlertCircle, Save, Calendar,
  Clock, Truck, Package, FileText, Info, Radio, CheckCircle, Shield
} from "lucide-react";
import { TopBar } from "@/app/_components/TopBar";
import { usePlanStore } from "@/app/_hooks/usePlanStore";
import { VEHICLE_TYPES, CARGO_TYPES } from "@/app/_lib/mockData";
import type { DispatchPlan, RiskLevel, AlternativeRoute } from "@/app/_lib/types";
import { SegmentDetailsTable } from "./SegmentDetailsTable";

// ── Types based on actual API response ───────────────────────────

interface CorridorSegment {
  id: string;
  route_variant: number;
  segment_type: string;
  name: string;
  state: string | null;
  seq: number;
  lat: string | null;
  lng: string | null;
  has_disruption: boolean;
  disruption_risk_level: string | null;
  disruption_title: string | null;
  disruption_summary: string | null;
  disruption_eta_hours: number | null;
  disruption_category: string | null;
  last_checked_at: string | null;
}

interface CorridorData {
  route: {
    id: string;
    org_id: string;
    name: string;
    origin: string;
    destination: string;
    is_active: boolean;
    routes_fetched: boolean;
    last_intel_at: string | null;
    max_risk_level: string;
    disruption_count: number;
    created_at: string;
  };
  segments: CorridorSegment[];
}

interface LiveDisruptionItem {
  id: string;
  title: string;
  summary: string;
  risk: string;
  eta_impact_hours: number;
  category: string;
  region: string;
  affectedRoutes: string[];
}

interface RouteOption {
  id: string;
  name: string;
  description: string;
  segments: CorridorSegment[];
  totalSegments: number;
  highwayCount: number;
  disruptedCount: number;
  riskLevel: RiskLevel;
  totalEtaHours: number;
  isActive: boolean;
  variant: number;
}

interface Analysis {
  riskScore: number;
  riskLevel: RiskLevel;
  recommendation: "dispatch" | "delay" | "reroute" | "hold" | "dispatch_early";
  etaImpactHours: number;
  safeWindowFrom: string;
  safeWindowTo: string;
  alternativeRoutes: AlternativeRoute[];
  aiNarrative: string;
  liveDisruptions: LiveDisruptionItem[];
  matchedCorridors: { id: string; name: string }[];
  dataSource: "live" | "no_corridor_match";
  selectedRoute?: {
    name: string;
    variant: number;
    segments: CorridorSegment[];
  };
  segmentAnalysis?: Array<{
    id: string;
    name: string;
    type: string;
    state: string | null;
    seq: number;
    hasDisruption: boolean;
    riskLevel: string;
    etaImpact: number;
    disruptions: Array<{
      title: string;
      summary: string;
      risk: string;
      eta_impact_hours: number;
      category: string;
    }>;
  }>;
}

function getUniqueVariants(segments: CorridorSegment[]): number[] {
  const variantSet = new Set<number>();
  segments.forEach(segment => {
    variantSet.add(segment.route_variant);
  });
  return Array.from(variantSet).sort();
}

function analyzeVariant(segments: CorridorSegment[]): {
  riskLevel: RiskLevel;
  disruptedCount: number;
  totalEtaHours: number;
  disruptions: CorridorSegment[];
} {
  const disruptions = segments.filter(s => s.has_disruption && s.disruption_risk_level);
  const disruptedCount = disruptions.length;
  const totalEtaHours = disruptions.reduce((sum, s) => sum + (s.disruption_eta_hours || 0), 0);

  let maxRiskScore = 0;
  disruptions.forEach(segment => {
    const riskLevel = segment.disruption_risk_level;
    if (riskLevel) {
      const riskScore =
        riskLevel === 'critical' ? 4 :
          riskLevel === 'high' ? 3 :
            riskLevel === 'medium' ? 2 :
              riskLevel === 'low' ? 1 : 0;
      maxRiskScore = Math.max(maxRiskScore, riskScore);
    }
  });

  const riskLevel =
    maxRiskScore >= 4 ? "critical" :
      maxRiskScore >= 3 ? "high" :
        maxRiskScore >= 2 ? "medium" :
          maxRiskScore >= 1 ? "low" : "safe";

  return { riskLevel, disruptedCount, totalEtaHours, disruptions };
}

// ── UI Components ────────────────────────────────────────────────

function RouteSelector({
  segments,
  selectedVariant,
  onSelectVariant,
  onAnalyze,
  canAnalyze,
  isAnalyzing
}: {
  segments: CorridorSegment[];
  selectedVariant: number;
  onSelectVariant: (variant: number) => void;
  onAnalyze: () => void;
  canAnalyze: boolean;
  isAnalyzing: boolean;
}) {
  // Group and analyze segments by route variant
  const routeVariants = segments.reduce((acc, segment) => {
    const variant = segment.route_variant;
    if (!acc[variant]) {
      acc[variant] = {
        id: `variant-${variant}`,
        variant: variant,
        name: variant === 0 ? "Primary Route" : `Alternative Route ${variant}`,
        description: variant === 0 ? "Default corridor route" : "Alternative corridor route",
        segments: [],
        totalSegments: 0,
        highwayCount: 0,
        disruptedCount: 0,
        riskLevel: "safe" as RiskLevel,
        totalEtaHours: 0,
        isActive: true
      };
    }
    acc[variant].segments.push(segment);
    if (segment.segment_type === 'national_highway' || segment.segment_type === 'state_highway') {
      acc[variant].highwayCount++;
    }
    return acc;
  }, {} as Record<number, RouteOption>);

  const routes = Object.values(routeVariants);

  // Analyze each route variant
  routes.forEach(route => {
    route.totalSegments = route.segments.length;
    const analysis = analyzeVariant(route.segments);
    route.riskLevel = analysis.riskLevel;
    route.disruptedCount = analysis.disruptedCount;
    route.totalEtaHours = analysis.totalEtaHours;
    route.isActive = route.disruptedCount === 0;
  });

  const getRiskBadgeColor = (risk: string) => {
    const colorMap: Record<string, string> = {
      'safe': 'bg-green-100 text-green-700 border-green-200',
      'low': 'bg-blue-100 text-blue-700 border-blue-200',
      'medium': 'bg-yellow-100 text-yellow-700 border-yellow-200',
      'high': 'bg-orange-100 text-orange-700 border-orange-200',
      'critical': 'bg-red-100 text-red-700 border-red-200',
    };
    return colorMap[risk] || 'bg-slate-100 text-slate-700 border-slate-200';
  };

  const getRiskDotColor = (risk: string) => {
    const colorMap: Record<string, string> = {
      'safe': 'bg-green-500',
      'low': 'bg-blue-500',
      'medium': 'bg-yellow-500',
      'high': 'bg-orange-500',
      'critical': 'bg-red-500',
    };
    return colorMap[risk] || 'bg-green-500';
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-purple-50 to-brand-50">
        <div className="flex items-center gap-2">
          <Radio size={18} className="text-brand-600" />
          <h3 className="text-base font-semibold text-slate-900">Select Route Variant</h3>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Choose which route variant to analyze for this dispatch
        </p>
      </div>

      <div className="p-6">
        <div className="grid gap-4">
          {routes.map((route) => (
            <div
              key={route.id}
              className={`relative rounded-xl border-2 transition-all cursor-pointer ${selectedVariant === route.variant
                ? 'border-brand-500 bg-brand-50/30 shadow-md'
                : 'border-slate-200 hover:border-brand-300 hover:bg-slate-50'
                }`}
              onClick={() => onSelectVariant(route.variant)}
            >
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      {selectedVariant === route.variant && (
                        <CheckCircle size={18} className="text-brand-600" />
                      )}
                      <h4 className="font-semibold text-slate-900">{route.name}</h4>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${getRiskBadgeColor(route.riskLevel)}`}>
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${getRiskDotColor(route.riskLevel)} mr-1`} />
                        {route.riskLevel.toUpperCase()} RISK
                      </span>
                      {route.disruptedCount > 0 && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                          {route.disruptedCount} Disruption{route.disruptedCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mb-3">{route.description}</p>

                    <div className="flex flex-wrap gap-3 text-xs">
                      <span className="flex items-center gap-1 text-slate-600">
                        <Route size={12} />
                        {route.totalSegments} segments
                      </span>
                      <span className="flex items-center gap-1 text-slate-600">
                        <Building2 size={12} />
                        {route.highwayCount} highways
                      </span>
                      {route.totalEtaHours > 0 && (
                        <span className="flex items-center gap-1 text-orange-600 font-medium">
                          <Clock size={12} />
                          +{route.totalEtaHours}h estimated delay
                        </span>
                      )}
                    </div>
                  </div>

                  {selectedVariant === route.variant && (
                    <div className="shrink-0">
                      <div className="w-6 h-6 rounded-full bg-brand-600 flex items-center justify-center">
                        <CheckCircle size={14} className="text-white" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Quick stats for selected route */}
                {selectedVariant === route.variant && route.disruptedCount > 0 && (
                  <div className="mt-3 pt-3 border-t border-red-100">
                    <div className="text-xs font-medium text-red-700 mb-2 flex items-center gap-1">
                      <AlertTriangle size={12} />
                      Active disruptions on this route:
                    </div>
                    <div className="space-y-1">
                      {route.segments.filter(s => s.has_disruption).slice(0, 3).map((segment) => (
                        <div key={segment.id} className="text-xs text-red-600 bg-red-50 p-1.5 rounded">
                          <span className="font-medium">{segment.name}</span>: {segment.disruption_title?.slice(0, 60)}
                        </div>
                      ))}
                      {route.disruptedCount > 3 && (
                        <div className="text-xs text-slate-500">
                          +{route.disruptedCount - 3} more disruptions
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Segment preview for selected route */}
                {selectedVariant === route.variant && route.segments.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <div className="text-xs font-medium text-slate-700 mb-2">Key segments:</div>
                    <div className="flex flex-wrap gap-2">
                      {route.segments.filter(s => s.segment_type === 'national_highway' || s.segment_type === 'state_highway').slice(0, 4).map((segment) => (
                        <span key={segment.id} className="text-xs px-2 py-1 bg-slate-100 rounded-md text-slate-600">
                          {segment.name}
                        </span>
                      ))}
                      {route.segments.filter(s => s.segment_type === 'district' || s.segment_type === 'tehsil').slice(0, 3).map((segment) => (
                        <span key={segment.id} className="text-xs px-2 py-1 bg-blue-50 rounded-md text-blue-600">
                          {segment.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={onAnalyze}
          disabled={!canAnalyze || isAnalyzing}
          className="mt-6 w-full flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm"
        >
          {isAnalyzing ? (
            <><Loader2 size={16} className="animate-spin" /> Analyzing Selected Route…</>
          ) : (
            <><Navigation size={16} /> Analyze Selected Route</>
          )}
        </button>

        {!canAnalyze && (
          <p className="mt-2 text-xs text-amber-600 text-center">
            ⚠️ Please select vehicle type and cargo type in the form above
          </p>
        )}
      </div>
    </div>
  );
}

function CorridorInfoBanner({ corridor }: { corridor: CorridorData }) {
  const riskColors = {
    safe: "bg-green-100 text-green-800 border-green-200",
    low: "bg-blue-100 text-blue-800 border-blue-200",
    medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
    high: "bg-orange-100 text-orange-800 border-orange-200",
    critical: "bg-red-100 text-red-800 border-red-200"
  };

  const riskColor = riskColors[corridor.route.max_risk_level as keyof typeof riskColors] || riskColors.safe;
  const highwayCount = corridor.segments.filter(s => s.segment_type === 'national_highway' || s.segment_type === 'state_highway').length;
  const districtCount = corridor.segments.filter(s => s.segment_type === 'district').length;
  const tehsilCount = corridor.segments.filter(s => s.segment_type === 'tehsil').length;

  const variants = getUniqueVariants(corridor.segments);
  const hasMultipleVariants = variants.length > 1;

  return (
    <div className="bg-gradient-to-r from-brand-50 to-blue-50 rounded-xl border border-brand-200 p-5 mb-4">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Route size={18} className="text-brand-600" />
            <h3 className="text-base font-semibold text-slate-900">{corridor.route.name}</h3>
            <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${riskColor}`}>
              {corridor.route.max_risk_level.toUpperCase()} RISK
            </span>
            {hasMultipleVariants && (
              <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                {variants.length} Route Variants Available
              </span>
            )}
            {corridor.route.disruption_count > 0 && (
              <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                {corridor.route.disruption_count} Active Issues
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-sm text-slate-700 mb-3">
            <MapPin size={14} className="text-brand-600 shrink-0" />
            <span className="font-medium">{corridor.route.origin}</span>
            <ArrowRightIcon className="text-slate-400" />
            <MapPin size={14} className="text-brand-600 shrink-0" />
            <span className="font-medium">{corridor.route.destination}</span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
            <span className="flex items-center gap-1.5">
              <Building2 size={14} />
              {highwayCount} Highways
            </span>
            {districtCount > 0 && (
              <span className="flex items-center gap-1.5">
                <MapPin size={14} />
                {districtCount} Districts
              </span>
            )}
            {tehsilCount > 0 && (
              <span className="flex items-center gap-1.5">
                <AlertCircle size={14} />
                {tehsilCount} Tehsils
              </span>
            )}
            <span className="flex items-center gap-1.5 text-green-600">
              <CheckCircle2 size={14} />
              Route Active
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function AnalysisResults({ analysis, onSave, isSaving, isSaved }: {
  analysis: Analysis;
  onSave: () => void;
  isSaving: boolean;
  isSaved: boolean;
}) {
  const gauge = riskGauge(analysis.riskScore);

  const getRecommendationIcon = () => {
    switch (analysis.recommendation) {
      case "dispatch": return "✅";
      case "dispatch_early": return "⏰";
      case "delay": return "⏰";
      case "reroute": return "🔄";
      case "hold": return "⏸️";
      default: return "📋";
    }
  };

  const getRecommendationText = () => {
    switch (analysis.recommendation) {
      case "dispatch": return "Dispatch as Planned";
      case "dispatch_early": return "Dispatch Early";
      case "delay": return "Consider Delay";
      case "reroute": return "Reroute Recommended";
      case "hold": return "Hold Dispatch";
      default: return "Review Required";
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-green-50 to-brand-50">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Shield size={18} className="text-brand-600" />
                Risk Assessment Results
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                AI-powered analysis for {analysis.selectedRoute?.name || "selected route"}
              </p>
            </div>
            <button
              onClick={onSave}
              disabled={isSaved || isSaving}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {isSaving ? "Saving..." : isSaved ? "Saved ✓" : "Save Dispatch"}
            </button>
          </div>
        </div>

        <div className="p-6">
          {analysis.selectedRoute && (
            <div className="mb-4 p-3 bg-purple-50 rounded-lg border border-purple-100">
              <div className="flex items-center gap-2 text-sm text-purple-800">
                <Radio size={14} />
                <span className="font-semibold">Selected Route:</span>
                <span>{analysis.selectedRoute.name}</span>
                <span className="text-xs text-purple-600">
                  ({analysis.selectedRoute.segments?.length || 0} segments)
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-3 bg-slate-50 rounded-xl">
              <div className="text-3xl font-bold" style={{ color: gauge.color }}>
                {analysis.riskScore}
              </div>
              <div className="text-xs text-slate-500 mt-1">Risk Score</div>
            </div>
            <div className="text-center p-3 bg-slate-50 rounded-xl">
              <div className="text-3xl font-bold" style={{ color: gauge.color }}>
                {gauge.label}
              </div>
              <div className="text-xs text-slate-500 mt-1">Risk Level</div>
            </div>
            <div className="text-center p-3 bg-slate-50 rounded-xl">
              <div className="text-3xl font-bold text-amber-600">
                {analysis.etaImpactHours > 0 ? `+${analysis.etaImpactHours}h` : "0h"}
              </div>
              <div className="text-xs text-slate-500 mt-1">ETA Impact</div>
            </div>
            <div className="text-center p-3 bg-slate-50 rounded-xl">
              <div className="text-lg font-semibold text-slate-700">
                {getRecommendationIcon()} {getRecommendationText()}
              </div>
              <div className="text-xs text-slate-500 mt-1">Recommendation</div>
            </div>
          </div>

          {analysis.aiNarrative && (
            <div className="mb-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
              <div className="flex items-start gap-2">
                <Info size={16} className="text-blue-600 mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-sm font-semibold text-blue-900 mb-1">AI Analysis</h4>
                  <p className="text-sm text-blue-800">{analysis.aiNarrative}</p>
                </div>
              </div>
            </div>
          )}

          {(analysis.safeWindowFrom || analysis.safeWindowTo) && (
            <div className="mb-6 p-3 bg-green-50 rounded-lg border border-green-100">
              <div className="flex items-center gap-2 text-sm text-green-800">
                <Calendar size={14} />
                <span className="font-semibold">Optimal Dispatch Window:</span>
                <span>
                  {new Date(analysis.safeWindowFrom).toLocaleString()} — {new Date(analysis.safeWindowTo).toLocaleString()}
                </span>
              </div>
            </div>
          )}

          {analysis.liveDisruptions.length > 0 && (
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-500" />
                Active Disruptions ({analysis.liveDisruptions.length})
              </h4>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {analysis.liveDisruptions.map((d) => (
                  <div key={d.id} className="text-sm p-3 bg-red-50 rounded-xl border border-red-100">
                    <div className="font-semibold text-red-800 flex items-center gap-2">
                      <AlertTriangle size={12} />
                      {d.title}
                    </div>
                    <div className="text-red-700 mt-1 text-xs">{d.summary}</div>
                    {d.eta_impact_hours > 0 && (
                      <div className="text-red-600 mt-2 text-xs font-medium">
                        ⏱️ Estimated delay: +{d.eta_impact_hours} hour{d.eta_impact_hours !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {analysis.alternativeRoutes.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <Route size={16} className="text-brand-600" />
                Alternative Routes to Consider ({analysis.alternativeRoutes.length})
              </h4>
              <div className="space-y-2">
                {analysis.alternativeRoutes.map((route, idx) => (
                  <div key={idx} className="text-sm p-3 bg-blue-50 rounded-xl border border-blue-100">
                    <div className="font-semibold text-blue-800">
                      {route.label || `Alternative ${idx + 1}`}
                    </div>
                    <div className="text-blue-700 mt-1 text-xs">
                      {route.via && <span>Via: {route.via} • </span>}
                      Risk Level: {route.riskLevel}
                      {route.extraHours > 0 && (
                        <span className="ml-2">• +{route.extraHours}h detour</span>
                      )}
                      {route.extraKm > 0 && (
                        <span className="ml-2">• +{route.extraKm}km</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {analysis.segmentAnalysis && analysis.segmentAnalysis.length > 0 && (
            <div className="mt-6">
              <SegmentDetailsTable
                segments={analysis.segmentAnalysis}
                title="Detailed Segment Analysis"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page Component ──────────────────────────────────────────

export default function DispatchPlannerPage() {
  const searchParams = useSearchParams();
  const { addPlan } = usePlanStore();

  const corridorIdParam = searchParams.get("corridorId");

  const [corridorData, setCorridorData] = useState<CorridorData | null>(null);
  const [loadingCorridor, setLoadingCorridor] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<number>(0);

  const [form, setForm] = useState({
    vehicleType: "",
    cargoType: "",
    plannedDate: new Date().toISOString().slice(0, 10),
    plannedTime: "08:00",
    notes: "",
  });

  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function fetchCorridor() {
      if (!corridorIdParam) return;

      setLoadingCorridor(true);
      setError(null);

      try {
        const response = await fetch(`/api/advisory/v1/watched-routes/${corridorIdParam}`, {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch corridor: ${response.status}`);
        }

        const data = await response.json();
        setCorridorData(data);

        const variants = getUniqueVariants(data.segments);
        if (variants.length > 0) {
          setSelectedVariant(variants[0]);
        }
      } catch (err) {
        console.error("Error fetching corridor:", err);
        setError(err instanceof Error ? err.message : "Could not load corridor data. Please try again.");
      } finally {
        setLoadingCorridor(false);
      }
    }

    fetchCorridor();
  }, [corridorIdParam]);

  function setField(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    setAnalysis(null);
    setError(null);
    setIsSaved(false);
  }

  const analyze = useCallback(async () => {
    if (!corridorData || !corridorIdParam) return;
    if (!form.vehicleType || !form.cargoType) {
      setError("Please select vehicle type and cargo type to analyze");
      return;
    }

    // Get selected route segments
    const selectedSegments = corridorData.segments.filter(s => s.route_variant === selectedVariant);
    const routeName = selectedVariant === 0 ? "Primary Route" : `Alternative Route ${selectedVariant}`;
    const routeAnalysis = analyzeVariant(selectedSegments);

    setAnalyzing(true);
    setAnalysis(null);
    setError(null);

    try {
      // Call analyze-trip with selected variant
      const res = await fetch("/api/advisory/v1/analyze-trip", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routeId: corridorIdParam,
          routeVariant: selectedVariant,
          origin: corridorData.route.origin,
          destination: corridorData.route.destination,
          vehicleType: form.vehicleType,
          cargoType: form.cargoType,
          plannedDate: form.plannedDate,
          plannedTime: form.plannedTime,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Analysis failed (${res.status})`);
      }

      const result = await res.json();

      // Build alternative routes from other variants
      const allVariants = getUniqueVariants(corridorData.segments);
      const otherVariants = allVariants.filter(v => v !== selectedVariant);
      const alternativeRoutesList: AlternativeRoute[] = otherVariants.map(v => {
        const variantSegments = corridorData.segments.filter(s => s.route_variant === v);
        const variantAnalysis = analyzeVariant(variantSegments);
        const variantName = v === 0 ? "Primary Route" : `Alternative Route ${v}`;

        return {
          label: variantName,
          via: `Route variant ${v}`,
          extraKm: 0,
          extraHours: Math.max(0, variantAnalysis.totalEtaHours - routeAnalysis.totalEtaHours),
          riskLevel: variantAnalysis.riskLevel,
          riskScore: variantAnalysis.riskLevel === "critical" ? 80 :
            variantAnalysis.riskLevel === "high" ? 60 :
              variantAnalysis.riskLevel === "medium" ? 40 :
                variantAnalysis.riskLevel === "low" ? 20 : 0,
        };
      });

      const segmentAnalysisData = result.segmentAnalysis?.map((seg: any) => ({
        id: seg.id,
        name: seg.name,
        type: seg.type,
        state: seg.state,
        seq: seg.seq,
        hasDisruption: seg.hasDisruption,
        riskLevel: seg.riskLevel,
        etaImpact: seg.etaImpact,
        disruptions: seg.disruptions || [],
      })) || [];

      // Transform the response
      setAnalysis({
        riskScore: result.riskScore || (routeAnalysis.riskLevel === "critical" ? 80 :
          routeAnalysis.riskLevel === "high" ? 60 :
            routeAnalysis.riskLevel === "medium" ? 40 :
              routeAnalysis.riskLevel === "low" ? 20 : 10),
        riskLevel: routeAnalysis.riskLevel,
        recommendation: routeAnalysis.riskLevel === "critical" ? "hold" :
          routeAnalysis.riskLevel === "high" ? "delay" :
            routeAnalysis.riskLevel === "medium" ? "dispatch_early" : "dispatch",
        etaImpactHours: routeAnalysis.totalEtaHours,
        safeWindowFrom: result.safeWindowFrom || new Date().toISOString(),
        safeWindowTo: result.safeWindowTo || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        alternativeRoutes: alternativeRoutesList,
        aiNarrative: result.aiNarrative || generateNarrative(routeAnalysis, routeName),
        liveDisruptions: routeAnalysis.disruptions.map(d => ({
          id: d.id,
          title: d.disruption_title || `Disruption on ${d.name}`,
          summary: d.disruption_summary || "Active disruption detected",
          risk: d.disruption_risk_level || "medium",
          eta_impact_hours: d.disruption_eta_hours || 2,
          category: d.disruption_category || "unknown",
          region: d.state || "Unknown",
          affectedRoutes: [d.name],
        })),
        matchedCorridors: [{ id: corridorIdParam, name: corridorData.route.name }],
        dataSource: "live",
        selectedRoute: {
          name: routeName,
          variant: selectedVariant,
          segments: selectedSegments,
        },
        segmentAnalysis: segmentAnalysisData,
      });
    } catch (err) {
      console.error("Analysis error:", err);
      setError(err instanceof Error ? err.message : "Analysis failed. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  }, [corridorData, form, corridorIdParam, selectedVariant]);

  function generateNarrative(analysis: ReturnType<typeof analyzeVariant>, routeName: string): string {
    if (analysis.disruptedCount === 0) {
      return `✅ ${routeName} appears clear with no active disruptions. Estimated on-time arrival. Recommended to proceed with dispatch as planned.`;
    } else if (analysis.riskLevel === "critical" || analysis.riskLevel === "high") {
      return `⚠️ ${routeName} has ${analysis.disruptedCount} active disruption${analysis.disruptedCount !== 1 ? 's' : ''} with ${analysis.totalEtaHours}h estimated delay. High risk detected. Consider alternative routes or delaying dispatch.`;
    } else if (analysis.riskLevel === "medium") {
      return `⚠️ ${routeName} has ${analysis.disruptedCount} disruption${analysis.disruptedCount !== 1 ? 's' : ''} causing ${analysis.totalEtaHours}h delay. Consider dispatching early or using alternative route.`;
    } else {
      return `ℹ️ ${routeName} has minor disruptions (${analysis.disruptedCount} issue${analysis.disruptedCount !== 1 ? 's' : ''}) with ${analysis.totalEtaHours}h impact. Monitor conditions and dispatch with caution.`;
    }
  }

 const saveDispatch = useCallback(async () => {
  if (!analysis || !corridorData) return;

  setIsSaving(true);
  setError(null);

  try {
    const scheduledDateTime = `${form.plannedDate}T${form.plannedTime}:00`;
    const selectedSegments = analysis.selectedRoute?.segments || [];

    // Prepare segment analysis data
    const segmentAnalysisData = analysis.segmentAnalysis || selectedSegments.map(segment => {
      const segmentDisruptions = analysis.liveDisruptions.filter(d => d.id === segment.id);
      return {
        id: segment.id,
        name: segment.name,
        type: segment.segment_type,
        state: segment.state,
        seq: segment.seq,
        hasDisruption: segmentDisruptions.length > 0,
        riskLevel: segmentDisruptions.length > 0 ? segmentDisruptions[0].risk : "safe",
        etaImpact: segmentDisruptions.reduce((sum, d) => sum + (d.eta_impact_hours || 0), 0),
        disruptions: segmentDisruptions.map(d => ({
          title: d.title,
          summary: d.summary,
          risk: d.risk,
          eta_impact_hours: d.eta_impact_hours,
          category: d.category,
        })),
      };
    });

    const response = await fetch("/api/advisory/v1/planned-dispatches", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `${corridorData.route.origin}→${corridorData.route.destination}${analysis.selectedRoute ? ` (${analysis.selectedRoute.name})` : ''}`,
        watchedRouteId: corridorIdParam, // Changed from corridorId to watchedRouteId
        origin: corridorData.route.origin,
        destination: corridorData.route.destination,
        cargoType: form.cargoType,
        vehicleType: form.vehicleType,
        scheduledDate: scheduledDateTime,
        notes: form.notes,
        routeVariant: analysis.selectedRoute?.variant,
        segmentAnalysis: segmentAnalysisData,
        analysisData: {
          riskScore: analysis.riskScore,
          riskLevel: analysis.riskLevel,
          recommendation: analysis.recommendation,
          etaImpactHours: analysis.etaImpactHours,
          safeWindowFrom: analysis.safeWindowFrom,
          safeWindowTo: analysis.safeWindowTo,
          aiNarrative: analysis.aiNarrative,
          selectedRouteName: analysis.selectedRoute?.name,
          selectedRouteVariant: analysis.selectedRoute?.variant,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to save dispatch");
    }

    const data = await response.json();
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
    
  } catch (err) {
    console.error("Error saving dispatch:", err);
    setError(err instanceof Error ? err.message : "Failed to save dispatch. Please try again.");
  } finally {
    setIsSaving(false);
  }
}, [analysis, corridorData, form, corridorIdParam]);

  if (loadingCorridor) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar title="Dispatch Planner" subtitle="Loading corridor intelligence..." />
        <div className="flex-1 flex items-center justify-center bg-slate-50">
          <div className="text-center">
            <Loader2 size={40} className="animate-spin text-brand-600 mx-auto mb-4" />
            <p className="text-slate-600">Loading corridor data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!corridorIdParam) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar title="Dispatch Planner" subtitle="Select a corridor to start planning" />
        <div className="flex-1 flex items-center justify-center bg-slate-50">
          <div className="text-center max-w-md">
            <Route size={48} className="text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-700 mb-2">No Corridor Selected</h3>
            <p className="text-sm text-slate-500">
              Please select a corridor from the Corridors page to start planning a dispatch.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const variants = corridorData ? getUniqueVariants(corridorData.segments) : [];
  const hasMultipleVariants = variants.length > 1;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar
        title="Dispatch Planner"
        subtitle={`Planning dispatch on ${corridorData?.route.name || 'selected corridor'}`}
      />

      <div className="flex-1 overflow-auto p-6 bg-slate-50">
        <div className="max-w-4xl mx-auto space-y-5">
          {corridorData && <CorridorInfoBanner corridor={corridorData} />}

          {/* Dispatch Details Form */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-white">
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Navigation size={18} className="text-brand-600" />
                Dispatch Details
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Enter vehicle, cargo, and schedule information for this dispatch
              </p>
            </div>

            <div className="p-6">
              <div className="grid md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                    <Truck size={12} /> Vehicle Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.vehicleType}
                    onChange={(e) => setField("vehicleType", e.target.value)}
                    className={selectCls}
                  >
                    <option value="">Select vehicle type…</option>
                    {VEHICLE_TYPES.map((v) => <option key={v}>{v}</option>)}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                    <Package size={12} /> Cargo Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.cargoType}
                    onChange={(e) => setField("cargoType", e.target.value)}
                    className={selectCls}
                  >
                    <option value="">Select cargo type…</option>
                    {CARGO_TYPES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                    <Calendar size={12} /> Departure Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={form.plannedDate}
                    onChange={(e) => setField("plannedDate", e.target.value)}
                    className={inputCls}
                    min={new Date().toISOString().slice(0, 10)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                    <Clock size={12} /> Departure Time <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="time"
                    value={form.plannedTime}
                    onChange={(e) => setField("plannedTime", e.target.value)}
                    className={inputCls}
                  />
                </div>

                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                    <FileText size={12} /> Additional Notes
                  </label>
                  <textarea
                    value={form.notes}
                    rows={2}
                    onChange={(e) => setField("notes", e.target.value)}
                    className={inputCls + " resize-none"}
                    placeholder="Any special instructions or requirements for this dispatch..."
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Route Selector or Analyze Button */}
          {hasMultipleVariants && corridorData ? (
            <RouteSelector
              segments={corridorData.segments}
              selectedVariant={selectedVariant}
              onSelectVariant={setSelectedVariant}
              onAnalyze={analyze}
              canAnalyze={!!(form.vehicleType && form.cargoType)}
              isAnalyzing={analyzing}
            />
          ) : (
            <div className="flex justify-center">
              <button
                onClick={analyze}
                disabled={!form.vehicleType || !form.cargoType || analyzing}
                className="flex items-center gap-2 rounded-lg bg-brand-600 px-8 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm"
              >
                {analyzing ? (
                  <><Loader2 size={16} className="animate-spin" /> Analyzing Route…</>
                ) : (
                  <><Navigation size={16} /> Analyze Route Risk</>
                )}
              </button>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-4">
              <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-700">Error</p>
                <p className="text-xs text-red-600 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {isSaved && (
            <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 px-5 py-4 animate-in fade-in duration-300">
              <CheckCircle2 size={16} className="text-green-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-700">Dispatch Saved!</p>
                <p className="text-xs text-green-600 mt-0.5">The dispatch has been added to your planned dispatches.</p>
              </div>
            </div>
          )}

          {analysis && (
            <AnalysisResults
              analysis={analysis}
              onSave={saveDispatch}
              isSaving={isSaving}
              isSaved={isSaved}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Helper Functions
function riskGauge(score: number) {
  if (score >= 80) return { label: "Critical", color: "#dc2626" };
  if (score >= 60) return { label: "High", color: "#ea580c" };
  if (score >= 40) return { label: "Medium", color: "#ca8a04" };
  if (score >= 20) return { label: "Low", color: "#2563eb" };
  return { label: "Safe", color: "#16a34a" };
}

function ArrowRightIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
    </svg>
  );
}

const selectCls = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-300 transition";
const inputCls = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-300 transition";