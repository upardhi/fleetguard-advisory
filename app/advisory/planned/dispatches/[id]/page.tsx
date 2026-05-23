// app/advisory/dispatches/[id]/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { TopBar } from "@/app/_components/TopBar";
import { 
  Loader2, AlertTriangle, CheckCircle2, Calendar, Clock, 
  MapPin, Route, Building2, ChevronDown, ChevronUp, FileText,
  Package
} from "lucide-react";

interface Segment {
  id: string;
  name: string;
  segment_type: string;
  state: string | null;
  seq: number;
  has_disruption: boolean;
  risk_level: string;
  eta_impact_hours: number;
  disruption_details: Array<{
    title: string;
    summary: string;
    risk: string;
    eta_impact_hours: number;
    category: string;
  }>;
}

interface Dispatch {
  id: string;
  name: string;
  origin: string;
  destination: string;
  cargo_type: string;
  vehicle_type: string;
  scheduled_date: string;
  notes: string;
  route_variant: number;
  risk_score: number;
  risk_level: string;
  recommendation: string;
  eta_impact_hours: number;
  ai_narrative: string;
  created_at: string;
}

export default function TripDetailPage() {
  const params = useParams();
  const [dispatch, setDispatch] = useState<Dispatch | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSegments, setExpandedSegments] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function fetchTrip() {
      try {
        const response = await fetch(`/api/advisory/v1/planned-dispatches/${params.id}`, {
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          setDispatch(data.dispatch);
          setSegments(data.segments);
        }
      } catch (err) {
        console.error("Error fetching trip:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchTrip();
  }, [params.id]);

  const toggleSegment = (segmentId: string) => {
    const newExpanded = new Set(expandedSegments);
    if (newExpanded.has(segmentId)) {
      newExpanded.delete(segmentId);
    } else {
      newExpanded.add(segmentId);
    }
    setExpandedSegments(newExpanded);
  };

  const getRiskBadge = (riskLevel: string) => {
    const colors = {
      critical: "bg-red-100 text-red-800",
      high: "bg-orange-100 text-orange-800",
      medium: "bg-yellow-100 text-yellow-800",
      low: "bg-blue-100 text-blue-800",
      safe: "bg-green-100 text-green-800",
    };
    return colors[riskLevel as keyof typeof colors] || colors.safe;
  };

  const getRiskIcon = (riskLevel: string) => {
    if (riskLevel === "critical" || riskLevel === "high") return <AlertTriangle size={16} className="text-red-500" />;
    if (riskLevel === "medium") return <AlertTriangle size={16} className="text-yellow-500" />;
    return <CheckCircle2 size={16} className="text-green-500" />;
  };

  if (loading) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar title="Trip Details" subtitle="Loading..." />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={40} className="animate-spin text-brand-600" />
        </div>
      </div>
    );
  }

  if (!dispatch) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar title="Trip Details" subtitle="Not found" />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-slate-500">Trip not found</p>
        </div>
      </div>
    );
  }

  const disruptedCount = segments.filter(s => s.has_disruption).length;
  const clearCount = segments.filter(s => !s.has_disruption).length;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar 
        title={dispatch.name || `${dispatch.origin} → ${dispatch.destination}`}
        subtitle={`Trip ID: ${dispatch.id.slice(0, 8)}...`}
      />

      <div className="flex-1 overflow-auto p-6 bg-slate-50">
        <div className="max-w-4xl mx-auto space-y-5">
          {/* Trip Overview Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-brand-50 to-blue-50">
              <h2 className="text-lg font-semibold text-slate-900">Trip Overview</h2>
            </div>
            
            <div className="p-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin size={16} className="text-brand-600" />
                    <span className="font-medium">Route:</span>
                    <span>{dispatch.origin} → {dispatch.destination}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar size={16} className="text-brand-600" />
                    <span className="font-medium">Scheduled:</span>
                    <span>{new Date(dispatch.scheduled_date).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Route size={16} className="text-brand-600" />
                    <span className="font-medium">Selected Route:</span>
                    <span>Variant {dispatch.route_variant}</span>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Building2 size={16} className="text-brand-600" />
                    <span className="font-medium">Vehicle:</span>
                    <span>{dispatch.vehicle_type || "Not specified"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Package size={16} className="text-brand-600" />
                    <span className="font-medium">Cargo:</span>
                    <span>{dispatch.cargo_type || "Not specified"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock size={16} className="text-brand-600" />
                    <span className="font-medium">Created:</span>
                    <span>{new Date(dispatch.created_at).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Risk Assessment Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900">Risk Assessment</h3>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="text-center p-3 bg-slate-50 rounded-xl">
                  <div className="text-2xl font-bold">{dispatch.risk_score || 0}</div>
                  <div className="text-xs text-slate-500">Risk Score</div>
                </div>
                <div className="text-center p-3 bg-slate-50 rounded-xl">
                  <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${getRiskBadge(dispatch.risk_level)}`}>
                    {getRiskIcon(dispatch.risk_level)}
                    {dispatch.risk_level?.toUpperCase() || "UNKNOWN"}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">Risk Level</div>
                </div>
                <div className="text-center p-3 bg-slate-50 rounded-xl">
                  <div className="text-2xl font-bold text-amber-600">
                    {dispatch.eta_impact_hours > 0 ? `+${dispatch.eta_impact_hours}h` : "0h"}
                  </div>
                  <div className="text-xs text-slate-500">ETA Impact</div>
                </div>
                <div className="text-center p-3 bg-slate-50 rounded-xl">
                  <div className="text-sm font-semibold">
                    {dispatch.recommendation === "hold" && "⏸️ Hold Dispatch"}
                    {dispatch.recommendation === "delay" && "⏰ Delay"}
                    {dispatch.recommendation === "dispatch_early" && "⏰ Dispatch Early"}
                    {dispatch.recommendation === "reroute" && "🔄 Reroute"}
                    {dispatch.recommendation === "dispatch" && "✅ Dispatch"}
                  </div>
                  <div className="text-xs text-slate-500">Recommendation</div>
                </div>
              </div>

              {dispatch.ai_narrative && (
                <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                  <p className="text-sm text-blue-800">{dispatch.ai_narrative}</p>
                </div>
              )}
            </div>
          </div>

          {/* Segment Details */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Route Segments</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {segments.length} total • {disruptedCount} disrupted • {clearCount} clear
                  </p>
                </div>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {segments.map((segment) => (
                <div key={segment.id} className="hover:bg-slate-50 transition">
                  <div 
                    className="px-6 py-4 flex items-start gap-3 cursor-pointer"
                    onClick={() => toggleSegment(segment.id)}
                  >
                    <div className="shrink-0 mt-0.5">
                      {segment.segment_type === 'national_highway' || segment.segment_type === 'state_highway' 
                        ? <Route size={16} className="text-blue-500" />
                        : segment.segment_type === 'district'
                        ? <Building2 size={16} className="text-purple-500" />
                        : <MapPin size={16} className="text-slate-500" />
                      }
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-medium text-slate-900">
                          {segment.name}
                        </span>
                        {segment.state && (
                          <span className="text-xs text-slate-500">{segment.state}</span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-3 text-xs">
                        {segment.has_disruption ? (
                          <>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${getRiskBadge(segment.risk_level)}`}>
                              <AlertTriangle size={10} />
                              {segment.risk_level?.toUpperCase()} RISK
                            </span>
                            {segment.eta_impact_hours > 0 && (
                              <span className="text-orange-600 font-medium">
                                +{segment.eta_impact_hours}h delay
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-green-600">
                            <CheckCircle2 size={12} />
                            Clear
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="shrink-0 text-slate-400">
                      {expandedSegments.has(segment.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>
                  
                  {expandedSegments.has(segment.id) && segment.disruption_details && segment.disruption_details.length > 0 && (
                    <div className="px-6 pb-4 pl-14 space-y-2">
                      <div className="text-xs font-semibold text-slate-700 mb-2">Disruption Details:</div>
                      {segment.disruption_details.map((disruption, idx) => (
                        <div key={idx} className="bg-red-50 rounded-lg p-3 border border-red-100">
                          <div className="font-semibold text-red-800 text-sm">{disruption.title}</div>
                          <p className="text-red-700 text-xs mt-1">{disruption.summary}</p>
                          <div className="flex items-center gap-3 mt-2 text-xs">
                            <span className="text-red-600">Risk: {disruption.risk.toUpperCase()}</span>
                            {disruption.eta_impact_hours > 0 && (
                              <span className="text-orange-600">Delay: +{disruption.eta_impact_hours}h</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Additional Notes */}
          {dispatch.notes && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-brand-600" />
                  <h3 className="text-sm font-semibold text-slate-900">Additional Notes</h3>
                </div>
              </div>
              <div className="p-6">
                <pre className="text-sm text-slate-600 whitespace-pre-wrap font-sans">
                  {dispatch.notes}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}