// components/SegmentDetailsTable.tsx
import { ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, MapPin, Route, Building2 } from "lucide-react";
import { useState } from "react";

interface SegmentAnalysisItem {
  id: string;
  name: string;
  type: string;
  state: string | null;
  seq: number;
  hasDisruption: boolean;
  riskLevel: string;
  etaImpact: number;
  disruptions?: Array<{
    title: string;
    summary: string;
    risk: string;
    eta_impact_hours: number;
    category: string;
  }>;
}

export function SegmentDetailsTable({ segments, title }: { segments: SegmentAnalysisItem[]; title?: string }) {
  const [expandedSegments, setExpandedSegments] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const toggleSegment = (segmentId: string) => {
    const newExpanded = new Set(expandedSegments);
    if (newExpanded.has(segmentId)) {
      newExpanded.delete(segmentId);
    } else {
      newExpanded.add(segmentId);
    }
    setExpandedSegments(newExpanded);
  };

  const displayedSegments = showAll ? segments : segments.slice(0, 10);
  const disruptedCount = segments.filter(s => s.hasDisruption).length;
  const clearCount = segments.filter(s => !s.hasDisruption).length;

  const getRiskBadge = (riskLevel: string) => {
    const colors = {
      critical: "bg-red-100 text-red-800 border-red-200",
      high: "bg-orange-100 text-orange-800 border-orange-200",
      medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
      low: "bg-blue-100 text-blue-800 border-blue-200",
      safe: "bg-green-100 text-green-800 border-green-200",
    };
    return colors[riskLevel as keyof typeof colors] || colors.safe;
  };

  const getSegmentIcon = (type: string) => {
    if (type === 'national_highway' || type === 'state_highway') return <Route size={14} className="text-blue-500" />;
    if (type === 'district') return <Building2 size={14} className="text-purple-500" />;
    return <MapPin size={14} className="text-slate-500" />;
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{title || "Route Segments"}</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {segments.length} total segments • {disruptedCount} disrupted • {clearCount} clear
            </p>
          </div>
          {segments.length > 10 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="text-xs text-brand-600 hover:text-brand-700 font-medium"
            >
              {showAll ? "Show less" : `Show all ${segments.length} segments`}
            </button>
          )}
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {displayedSegments.map((segment) => (
          <div key={segment.id} className="hover:bg-slate-50 transition">
            <div 
              className="px-6 py-4 flex items-start gap-3 cursor-pointer"
              onClick={() => toggleSegment(segment.id)}
            >
              <div className="shrink-0 mt-0.5">
                {getSegmentIcon(segment.type)}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-medium text-slate-900 text-sm">
                    {segment.name}
                  </span>
                  {segment.state && (
                    <span className="text-xs text-slate-500">{segment.state}</span>
                  )}
                  <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                    {segment.type === 'national_highway' ? 'NH' : 
                     segment.type === 'state_highway' ? 'SH' :
                     segment.type === 'district' ? 'Dist' : 'Tehsil'}
                  </span>
                </div>
                
                <div className="flex items-center gap-3 text-xs">
                  {segment.hasDisruption ? (
                    <>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${getRiskBadge(segment.riskLevel)}`}>
                        <AlertTriangle size={10} />
                        {segment.riskLevel.toUpperCase()} RISK
                      </span>
                      {segment.etaImpact > 0 && (
                        <span className="text-orange-600 font-medium">
                          +{segment.etaImpact}h delay
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
            
            {expandedSegments.has(segment.id) && segment.disruptions && segment.disruptions.length > 0 && (
              <div className="px-6 pb-4 pl-14 space-y-2">
                <div className="text-xs font-semibold text-slate-700 mb-2">Disruption Details:</div>
                {segment.disruptions.map((disruption, idx) => (
                  <div key={idx} className="bg-red-50 rounded-lg p-3 border border-red-100">
                    <div className="font-semibold text-red-800 text-sm">{disruption.title}</div>
                    <p className="text-red-700 text-xs mt-1">{disruption.summary}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs">
                      <span className="text-red-600">Risk: {disruption.risk.toUpperCase()}</span>
                      {disruption.eta_impact_hours > 0 && (
                        <span className="text-orange-600">Delay: +{disruption.eta_impact_hours}h</span>
                      )}
                      <span className="text-slate-500">Category: {disruption.category}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {expandedSegments.has(segment.id) && (!segment.disruptions || segment.disruptions.length === 0) && (
              <div className="px-6 pb-4 pl-14">
                <div className="bg-green-50 rounded-lg p-3 border border-green-100 text-center">
                  <CheckCircle2 size={16} className="text-green-500 mx-auto mb-1" />
                  <p className="text-xs text-green-700">No active disruptions on this segment</p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}