export type RiskLevel = "critical" | "high" | "medium" | "low" | "safe";

export type DisruptionCategory =
  | "political"
  | "weather"
  | "traffic"
  | "security"
  | "infrastructure"
  | "religious"
  | "vvip"
  | "natural_disaster";

export interface Disruption {
  id: string;
  title: string;
  category: DisruptionCategory;
  risk: RiskLevel;
  region: string;
  state: string;
  highway?: string;
  lat: number;
  lng: number;
  summary: string;
  detail: string;
  source: string;
  impact: string;
  eta_impact_hours: number;
  started_at: string;
  expected_clear_at?: string;
  verified: boolean;
  affectedRoutes: string[];
}

export interface RouteAnalysisInput {
  origin: string;
  destination: string;
  vehicleType: string;
  cargoType: string;
  dispatchTime: string;
  cargoValue?: string;
}

export interface RouteAnalysisResult {
  riskScore: number;
  riskLevel: RiskLevel;
  delayProbability: number;
  etaImpactHours: number;
  affectedSegments: {
    name: string;
    highway: string;
    riskLevel: RiskLevel;
    issue: string;
  }[];
  alternativeRoutes: {
    id: string;
    label: string;
    via: string;
    extraKm: number;
    extraHours: number;
    riskLevel: RiskLevel;
    riskScore: number;
  }[];
  safeDispatchWindow: {
    from: string;
    to: string;
    confidence: number;
  };
  aiNarrative: string;
  recommendation: "dispatch" | "delay" | "reroute" | "hold";
  activeDisruptions: Disruption[];
}

export interface Advisory {
  id: string;
  title: string;
  type: "delay" | "reroute" | "hold" | "dispatch_early" | "split_shipment" | "avoid_night";
  region: string;
  highway?: string;
  riskLevel: RiskLevel;
  confidence: number;
  narrative: string;
  validFrom: string;
  validUntil: string;
  affectedZones: string[];
  recommendedAction: string;
  isUrgent: boolean;
}

export interface RegionRisk {
  region: string;
  state: string;
  riskLevel: RiskLevel;
  activeDisruptions: number;
  keyIssue: string;
}

export interface ControlTowerStats {
  totalDisruptions: number;
  criticalAlerts: number;
  highRiskCorridors: number;
  safeCorriders: number;
  pendingAdvisories: number;
  regionsAffected: number;
}
