// app/advisory/dispatches/page.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { TopBar } from "@/app/_components/TopBar";
import { 
  Loader2, AlertTriangle, CheckCircle2, Calendar, Clock, 
  MapPin, Route, Building2, Search, Filter, X,
  ChevronRight, Package, Truck, TrendingUp, Shield, ArrowLeft
} from "lucide-react";

interface Dispatch {
  id: string;
  name: string;
  origin: string;
  destination: string;
  cargo_type: string;
  vehicle_type: string;
  scheduled_date: string;
  route_variant: number;
  risk_score: number;
  risk_level: string;
  recommendation: string;
  eta_impact_hours: number;
  created_at: string;
  watched_route_id: string;
}

interface CorridorData {
  id: string;
  name: string;
  origin: string;
  destination: string;
  max_risk_level: string;
  disruption_count: number;
  last_intel_at: string;
}

export default function DispatchesListPage() {
  const searchParams = useSearchParams();
  const corridorId = searchParams.get("corridorId");
  
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [corridor, setCorridor] = useState<CorridorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (corridorId) {
      fetchCorridorAndDispatches();
    } else {
      setLoading(false);
    }
  }, [corridorId]);

  async function fetchCorridorAndDispatches() {
    setLoading(true);
    try {
      // Fetch corridor details
      const corridorRes = await fetch(`/api/advisory/v1/watched-routes/${corridorId}`, {
        credentials: "include",
      });
      if (corridorRes.ok) {
        const data = await corridorRes.json();
        setCorridor(data.route);
      }

      // Fetch dispatches for this specific corridor
      const dispatchesRes = await fetch(`/api/advisory/v1/planned-dispatches?watchedRouteId=${corridorId}`, {
        credentials: "include",
      });
      if (dispatchesRes.ok) {
        const data = await dispatchesRes.json();
        setDispatches(data.plannedDispatches || []);
      }
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  }

  const getRiskBadge = (riskLevel: string) => {
    const colors: Record<string, string> = {
      critical: "bg-red-100 text-red-800 border-red-200",
      high: "bg-orange-100 text-orange-800 border-orange-200",
      medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
      low: "bg-blue-100 text-blue-800 border-blue-200",
      safe: "bg-green-100 text-green-800 border-green-200",
    };
    return colors[riskLevel] || colors.safe;
  };

  const getRiskIcon = (riskLevel: string) => {
    if (riskLevel === "critical" || riskLevel === "high") return <AlertTriangle size={14} className="text-red-500" />;
    if (riskLevel === "medium") return <AlertTriangle size={14} className="text-yellow-500" />;
    return <CheckCircle2 size={14} className="text-green-500" />;
  };

  const getRecommendationBadge = (recommendation: string) => {
    const config: Record<string, { icon: string; color: string }> = {
      dispatch: { icon: "✅", color: "bg-green-100 text-green-800" },
      dispatch_early: { icon: "⏰", color: "bg-blue-100 text-blue-800" },
      delay: { icon: "⏰", color: "bg-yellow-100 text-yellow-800" },
      reroute: { icon: "🔄", color: "bg-purple-100 text-purple-800" },
      hold: { icon: "⏸️", color: "bg-red-100 text-red-800" },
    };
    const rec = config[recommendation] || { icon: "📋", color: "bg-slate-100 text-slate-800" };
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${rec.color}`}>
        {rec.icon} {recommendation.replace("_", " ")}
      </span>
    );
  };

  // Filter dispatches
  const filteredDispatches = dispatches.filter(dispatch => {
    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      return (
        dispatch.origin.toLowerCase().includes(searchLower) ||
        dispatch.destination.toLowerCase().includes(searchLower) ||
        dispatch.name?.toLowerCase().includes(searchLower)
      );
    }
    // Risk filter
    if (riskFilter !== "all" && dispatch.risk_level !== riskFilter) {
      return false;
    }
    return true;
  });

  const stats = {
    total: dispatches.length,
    highRisk: dispatches.filter(d => d.risk_level === "critical" || d.risk_level === "high").length,
    mediumRisk: dispatches.filter(d => d.risk_level === "medium").length,
    safe: dispatches.filter(d => d.risk_level === "safe" || d.risk_level === "low").length,
  };

  if (loading) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar title="Planned Dispatches" subtitle="Loading..." />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={40} className="animate-spin text-brand-600" />
        </div>
      </div>
    );
  }

  if (!corridorId) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar title="Planned Dispatches" subtitle="Select a corridor first" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <Route size={48} className="text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-700 mb-2">No Corridor Selected</h3>
            <p className="text-sm text-slate-500">
              Please select a corridor from the corridors page to view its planned dispatches.
            </p>
            <Link
              href="/advisory/planned"
              className="inline-block mt-4 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700"
            >
              View Corridors
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar 
        title={corridor?.name || "Planned Dispatches"}
        subtitle={`${dispatches.length} trip${dispatches.length !== 1 ? 's' : ''} planned for this corridor`}
      />

      <div className="flex-1 overflow-auto p-6 bg-slate-50">
        <div className="max-w-5xl mx-auto space-y-5">
          {/* Back Button */}
          <Link
            href="/advisory/planned"
            className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700"
          >
            <ArrowLeft size={16} />
            Back to Corridors
          </Link>

          {/* Corridor Info Card */}
          {corridor && (
            <div className="bg-gradient-to-r from-brand-50 to-blue-50 rounded-xl border border-brand-200 p-5">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Route size={18} className="text-brand-600" />
                    <h2 className="text-lg font-semibold text-slate-900">{corridor.name}</h2>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${getRiskBadge(corridor.max_risk_level)}`}>
                      {corridor.max_risk_level?.toUpperCase() || "UNKNOWN"} RISK
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600 mb-3">
                    <MapPin size={14} />
                    <span>{corridor.origin}</span>
                    <span>→</span>
                    <MapPin size={14} />
                    <span>{corridor.destination}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <AlertTriangle size={12} />
                      {corridor.disruption_count} active disruptions
                    </span>
                    {corridor.last_intel_at && (
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        Last intel: {new Date(corridor.last_intel_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <Link
                  href={`/advisory/planner?corridorId=${corridorId}`}
                  className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition"
                >
                  Plan New Dispatch
                </Link>
              </div>
            </div>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500">Total Trips</p>
                  <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center">
                  <Truck size={20} className="text-brand-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500">High Risk</p>
                  <p className="text-2xl font-bold text-red-600">{stats.highRisk}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertTriangle size={20} className="text-red-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500">Medium Risk</p>
                  <p className="text-2xl font-bold text-yellow-600">{stats.mediumRisk}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                  <TrendingUp size={20} className="text-yellow-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500">Safe/Low Risk</p>
                  <p className="text-2xl font-bold text-green-600">{stats.safe}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <Shield size={20} className="text-green-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Filters Bar */}
          {dispatches.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <Search size={16} className="text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by origin, destination..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-64 text-sm border-none focus:outline-none focus:ring-0 placeholder:text-slate-400"
                  />
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                  >
                    <Filter size={14} />
                    Filters
                    {(riskFilter !== "all") && (
                      <span className="ml-1 w-2 h-2 rounded-full bg-brand-500" />
                    )}
                  </button>
                  
                  {(riskFilter !== "all" || searchTerm) && (
                    <button
                      onClick={() => {
                        setRiskFilter("all");
                        setSearchTerm("");
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg text-slate-500 hover:bg-slate-50"
                    >
                      <X size={14} />
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {showFilters && (
                <div className="px-5 py-4 bg-slate-50/50">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Filter by Risk Level</label>
                    <select
                      value={riskFilter}
                      onChange={(e) => setRiskFilter(e.target.value)}
                      className="w-full md:w-64 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      <option value="all">All Risk Levels</option>
                      <option value="critical">Critical</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                      <option value="safe">Safe</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Dispatches List */}
          <div className="space-y-3">
            {filteredDispatches.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
                {dispatches.length === 0 ? (
                  <>
                    <Truck size={48} className="text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 mb-2">No planned dispatches for this corridor yet</p>
                    <Link 
                      href={`/advisory/planner?corridorId=${corridorId}`}
                      className="inline-block text-sm text-brand-600 hover:text-brand-700"
                    >
                      Plan your first dispatch →
                    </Link>
                  </>
                ) : (
                  <>
                    <Search size={48} className="text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500">No dispatches match your filters</p>
                    <button
                      onClick={() => {
                        setRiskFilter("all");
                        setSearchTerm("");
                      }}
                      className="inline-block mt-3 text-sm text-brand-600 hover:text-brand-700"
                    >
                      Clear filters
                    </button>
                  </>
                )}
              </div>
            ) : (
              filteredDispatches.map((dispatch) => (
                <Link
                  key={dispatch.id}
                  href={`/advisory/planned/dispatches/${dispatch.id}`}
                  className="block bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all hover:border-brand-200"
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between flex-wrap gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Header */}
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <h3 className="font-semibold text-slate-900">
                            {dispatch.name || `${dispatch.origin} → ${dispatch.destination}`}
                          </h3>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getRiskBadge(dispatch.risk_level)}`}>
                            {getRiskIcon(dispatch.risk_level)}
                            {dispatch.risk_level?.toUpperCase()}
                          </span>
                          {getRecommendationBadge(dispatch.recommendation)}
                        </div>

                        {/* Route Info */}
                        <div className="flex items-center gap-2 text-sm text-slate-600 mb-3">
                          <MapPin size={14} className="shrink-0" />
                          <span>{dispatch.origin}</span>
                          <ChevronRight size={14} className="text-slate-300" />
                          <MapPin size={14} className="shrink-0" />
                          <span>{dispatch.destination}</span>
                        </div>

                        {/* Details Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                          <div className="flex items-center gap-1.5 text-slate-500">
                            <Calendar size={12} />
                            <span>{new Date(dispatch.scheduled_date).toLocaleDateString()}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-slate-500">
                            <Clock size={12} />
                            <span>{new Date(dispatch.scheduled_date).toLocaleTimeString()}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-slate-500">
                            <Package size={12} />
                            <span>{dispatch.cargo_type || "N/A"}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-slate-500">
                            <Truck size={12} />
                            <span>{dispatch.vehicle_type || "N/A"}</span>
                          </div>
                        </div>

                        {/* Impact and Score */}
                        <div className="flex items-center gap-3 mt-3 text-xs">
                          {dispatch.eta_impact_hours > 0 && (
                            <span className="text-orange-600 font-medium flex items-center gap-1">
                              <Clock size={12} />
                              +{dispatch.eta_impact_hours}h delay
                            </span>
                          )}
                          <span className="text-slate-400 flex items-center gap-1">
                            <TrendingUp size={12} />
                            Risk Score: {dispatch.risk_score}
                          </span>
                          <span className="text-slate-400">
                            Route Variant: {dispatch.route_variant}
                          </span>
                          <span className="text-slate-400">
                            {new Date(dispatch.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0 text-slate-300">
                        <ChevronRight size={20} />
                      </div>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}