/**
 * Bridge: which alert types should auto-create an incident, and what type.
 *
 * Every alert that survives is mapped to an incident — alerts and incidents
 * are 1:1. Types listed in DROPPED never become alerts (and therefore never
 * become incidents either). Types prefixed `incident_` are artifacts of an
 * existing incident (escalation/reminder rows from older flows) and must
 * not loop back into a new incident.
 *
 * The mapping is severity-aware: an alert below the rule's `minSeverity`
 * threshold is dropped at the gate.
 */

export type IncidentTypeForAlert =
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

export interface AlertTriggerInput {
  alertType: string;
  severity:  string;        // 'info' | 'warning' | 'critical'
}

interface BridgeRule {
  /** Minimum severity needed for this alert to become an incident. */
  minSeverity: "info" | "warning" | "critical";
  incidentType: IncidentTypeForAlert;
}

/**
 * Alert types that are dropped entirely — they never become alerts and never
 * become incidents. Driver/vehicle expiry and BG-pending are operational
 * nudges that flooded the alerts table without any human action attached.
 */
const DROPPED: ReadonlySet<string> = new Set([
  "dl_expired",
  "dl_expiring",
  "vehicle_expired",
  "bg_pending",
  "contract_expiring",
  "duplicate_vehicle_entry",
  "duplicate_driver_entry",
  "duplicate_visitor_entry",
]);

const BRIDGE: Record<string, BridgeRule> = {
  // ── Driver-side fraud signals ────────────────────────────────────────────
  bg_flagged:               { minSeverity: "critical", incidentType: "criminal_record"    },
  dl_mismatch_at_exit:      { minSeverity: "critical", incidentType: "identity_mismatch"  },
  vehicle_mismatch_at_exit: { minSeverity: "critical", incidentType: "identity_mismatch"  },
  face_mismatch:            { minSeverity: "critical", incidentType: "face_mismatch"      },

  // ── Compliance failures that block entry ─────────────────────────────────
  dl_not_found:             { minSeverity: "critical", incidentType: "unauthorized_entry" },

  // ── Document/finance mismatches ──────────────────────────────────────────
  invoice_mismatch:         { minSeverity: "critical", incidentType: "invoice_mismatch"   },

  // ── Operational SLA misses (now incidents with a longer window) ──────────
  pin_locked:               { minSeverity: "warning",  incidentType: "other"              },
  trip_overdue:             { minSeverity: "warning",  incidentType: "other"              },
  delivery_overdue:         { minSeverity: "warning",  incidentType: "other"              },
  visitor_overdue:          { minSeverity: "warning",  incidentType: "other"              },

  // Note: duplicate_vehicle_entry / duplicate_driver_entry /
  // duplicate_visitor_entry are intentionally in DROPPED above. The gate
  // already blocks the duplicate at entry time; we don't want a permanent
  // incident record for every retry.
};

const SEVERITY_RANK: Record<string, number> = { info: 0, warning: 1, critical: 2 };

/**
 * True when the alert type is in the drop list, or is an `incident_*`
 * artifact from the older escalation flow that should never loop into a
 * fresh incident.
 */
export function isDroppedAlertType(alertType: string): boolean {
  if (DROPPED.has(alertType)) return true;
  if (alertType.startsWith("incident_")) return true;  // incident_raised / incident_reminder / incident_escalated_*
  if (alertType === "incident_sla")     return true;
  return false;
}

/**
 * Returns the incident type to auto-create, or null if the alert should be
 * skipped (either because it's in the drop list, has no bridge rule, or
 * falls below the rule's severity threshold).
 */
export function incidentTypeForAlert(input: AlertTriggerInput): IncidentTypeForAlert | null {
  if (isDroppedAlertType(input.alertType)) return null;
  const rule = BRIDGE[input.alertType];
  if (!rule) return null;
  const incomingRank = SEVERITY_RANK[input.severity] ?? 0;
  const requiredRank = SEVERITY_RANK[rule.minSeverity] ?? 0;
  return incomingRank >= requiredRank ? rule.incidentType : null;
}
