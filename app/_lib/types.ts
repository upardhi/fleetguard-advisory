/**
 * FleetGuard — core domain types (subset used by the POC UI)
 * Mirrors section 4 of the Delivery Brief.
 */

export type UserRole =
  | "guard"
  | "wh_manager"
  | "regional_manager"
  | "cso"
  | "company_admin"
  | "super_admin";

export type CheckStatus =
  | "clear"
  | "expiring"
  | "expired"
  | "blocked"
  // RC-verify failure modes (added 0016_check_status_rc_failures.sql):
  | "not_found"      // RTO replied but RC isn't in the registry (id_not_found)
  | "verify_failed"; // RTO source down / unreachable / any other verify miss
export type BGStatus = "pending" | "clear" | "flagged" | "failed";
/** Advisory risk scale — used by disruptions, advisories, route analysis */
export type RiskLevel = "critical" | "high" | "medium" | "low" | "safe";

/** Warehouse-level status (legacy gate-management palette) */
export type WarehouseStatus = "green" | "amber" | "red";

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
  category: DisruptionCategory;
  title: string;
  summary: string;
  detail: string;
  impact: string;
  risk: RiskLevel;
  region: string;
  state: string;
  highway?: string;
  affectedRoutes: string[];
  eta_impact_hours: number;
  verified: boolean;
  source: string;
  started_at: string;
  expected_clear_at?: string;
}

export interface Advisory {
  id: string;
  type: "delay" | "reroute" | "hold" | "dispatch_early" | "split_shipment" | "avoid_night";
  title: string;
  narrative: string;
  recommendedAction: string;
  region: string;
  riskLevel: RiskLevel;
  confidence: number;
  isUrgent: boolean;
  validUntil: string;
  disruptionIds: string[];
}

export interface RegionRisk {
  region: string;
  state: string;
  riskLevel: RiskLevel;
  activeDisruptions: number;
  keyIssue: string;
}
export type DeliveryMode = "simple" | "secure";
export type FaceMatchResult = "match" | "uncertain" | "mismatch";

export type TripStatus = "planned" | "loading" | "in_transit" | "returning" | "closed";

export type StopStatus =
  | "pending"
  | "confirmed"
  | "undelivered"
  | "returned"
  | "disputed"
  | "rescheduled";

export type GateEventType =
  | "inbound_entry"
  | "inbound_exit"
  | "outbound_entry"
  | "outbound_exit"
  | "visitor_entry"
  | "visitor_exit"
  | "contractor_entry"
  | "contractor_exit";

export type AlertType =
  | "dl_expired"
  | "dl_expiring"
  | "dl_not_found"
  | "bg_flagged"
  | "bg_pending"
  | "vehicle_expired"
  | "pin_locked"
  | "trip_overdue"
  | "delivery_overdue"
  | "visitor_overdue"
  | "contract_expiring"
  | "face_mismatch"
  | "dl_mismatch_at_exit"
  | "vehicle_mismatch_at_exit"
  | "invoice_mismatch"
  | "incident_sla"
  | "duplicate_vehicle_entry"
  | "duplicate_driver_entry"
  | "duplicate_visitor_entry";

export type AlertSeverity = "info" | "warning" | "critical";
export type AlertStatus = "open" | "acknowledged" | "resolved";

export interface Warehouse {
  id: string;
  name: string;
  city: string;
  state: string;
  region: string;
  activeTrips: number;
  openAlerts: number;
  status: WarehouseStatus;
}

export interface Driver {
  id: string;
  fullName: string;
  mobile: string;
  dlNumber: string;
  dlExpiry: Date;
  dlStatus: CheckStatus;
  bgStatus: BGStatus;
  facePhotoUrl: string | null;
  registeredAt: Date;
}

export interface Vehicle {
  id: string;
  registrationNumber: string;
  vehicleType: string;
  ownerType: "owned" | "contractor";
  contractorId: string | null;
  rcExpiry: Date;
  insuranceExpiry: Date;
  fitnessExpiry: Date;
  pucExpiry: Date;
  status: CheckStatus;
}

export interface Contractor {
  id: string;
  name: string;
  contactName: string;
  contactMobile: string;
  contractEnd: Date | null;
  activeDrivers: number;
  activeVehicles: number;
  isComplete: boolean;
}

export interface TripStop {
  id: string;
  stopOrder: number;
  dealerName: string;
  city: string;
  invoiceCount: number;
  invoiceNumbers: string[];
  deliveryMode: DeliveryMode;
  status: StopStatus;
  confirmedAt: Date | null;
  dwellMinutes: number | null;
}

export interface Trip {
  id: string;
  tripCode: string;
  vehicleId: string;
  vehicleReg: string;
  driverId: string;
  driverName: string;
  contractorId: string;
  contractorName: string;
  status: TripStatus;
  warehouseId: string;
  warehouseName: string;
  totalStops: number;
  confirmedStops: number;
  departedAt: Date | null;
  plannedReturn: Date | null;
  stops: TripStop[];
}

export interface GateEvent {
  id: string;
  eventType: GateEventType;
  vehicleReg: string | null;
  personName: string | null;
  contractor: string | null;
  guardName: string;
  time: Date;
  status: "inside" | "exited" | "denied";
  warehouseId: string;
  photoUrl: string | null;
}

export interface VisitorEntry {
  id: string;
  visitorType: "visitor" | "contractor" | "auditor" | "maintenance" | "other";
  fullName: string;
  hostName: string;
  purpose: string;
  passNumber: string;
  entryTime: Date;
  expectedExit: Date | null;
  vehicleNumber: string | null;
}

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  message: string;
  warehouseName: string;
  entityType: string;
  entityId: string;
  createdAt: Date;
  acknowledgedAt: Date | null;
}

export interface Incident {
  id: string;
  type:
    | "fraud_attempt"
    | "fake_pod"
    | "face_mismatch"
    | "unauthorized_entry"
    | "vehicle_noncompliance"
    | "driver_noncompliance"
    | "invoice_mismatch"
    | "theft"
    | "criminal_record"
    | "identity_mismatch"
    | "other";
  description: string;
  warehouseName: string;
  status: "open" | "investigating" | "resolved" | "closed";
  assignedTo: string | null;
  slaDeadline: Date;
  raisedBy: string;
  createdAt: Date;
  linkedTripCode?: string | null;
  linkedAlertId?: string | null;
  linkedGateEventId?: string | null;
  evidenceCount?: number;
  resolutionNote?: string | null;
  closedAt?: Date | null;
}

// ── Pre-planning types ───────────────────────────────────────────────────────

export type DispatchStatus = "draft" | "approved" | "on_hold" | "dispatched" | "cancelled";

export interface AlternativeRoute {
  label: string;
  via: string;
  extraKm: number;
  extraHours: number;
  riskLevel: RiskLevel;
  riskScore: number;
}

export interface DispatchPlan {
  id: string;
  origin: string;
  destination: string;
  vehicleType: string;
  cargoType: string;
  plannedDate: string;
  plannedTime: string;
  notes?: string;
  riskScore: number;
  riskLevel: RiskLevel;
  recommendation: "dispatch" | "delay" | "reroute" | "hold" | "dispatch_early";
  etaImpactHours: number;
  safeWindowFrom: string;
  safeWindowTo: string;
  affectedDisruptionIds: string[];
  alternativeRoutes: AlternativeRoute[];
  aiNarrative: string;
  status: DispatchStatus;
  createdAt: string;
  approvedBy?: string;
}

export interface MonitoredCorridor {
  id: string;
  name: string;
  origin: string;
  destination: string;
  highway: string;
  distanceKm: number;
  riskLevel: RiskLevel;
  activeDisruptions: number;
  lastChecked: string;
  alertsEnabled: boolean;
  tags: string[];
}

export interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  category: DisruptionCategory;
  region: string;
  states: string[];
  predictedRisk: RiskLevel;
  affectedHighways: string[];
  description: string;
  isRecurring: boolean;
  recurrenceNote?: string;
}

export interface ComplianceBucket {
  dl_0_30: number;
  dl_31_60: number;
  dl_61_90: number;
  vehicle_0_30: number;
  vehicle_31_60: number;
  vehicle_61_90: number;
  contractor_0_30: number;
  contractor_31_60: number;
  contractor_61_90: number;
}
