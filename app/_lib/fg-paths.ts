/**
 * FleetGuard — Firestore collection name constants + runtime safety assertion
 *
 * Every service file MUST import collection names from here.
 * Never write a bare "fg_*" string literal directly in a service.
 * Never write a non-fg_* string under any circumstances (safety rule S1/S3).
 */

// ── Collection constants ────────────────────────────────────────────────────

export const FG_ORGANISATIONS = "fg_organisations" as const;
export const FG_VERIFICATION_REQUESTS = "fg_organisations" as const;
export const FG_WAREHOUSES = "fg_warehouses" as const;
export const FG_USERS = "fg_users" as const;
export const FG_CONTRACTORS = "fg_contractors" as const;
export const FG_DRIVERS = "fg_drivers" as const;
export const FG_DRIVER_BACKGROUND = "fg_driver_background" as const;
export const FG_VEHICLES = "fg_vehicles" as const;
export const FG_GATE_EVENTS = "fg_gate_events" as const;
export const FG_INBOUND_ENTRIES = "fg_inbound_entries" as const;
export const FG_VISITOR_ENTRIES = "fg_visitor_entries" as const;
export const FG_TRIPS = "fg_trips" as const;
export const FG_TRIP_STOPS = "fg_trip_stops" as const; // subcollection
export const FG_COMPLIANCE_CHECKS = "fg_compliance_checks" as const;
export const FG_ALERTS = "fg_alerts" as const;
export const FG_INCIDENTS = "fg_incidents" as const;
export const FG_AUDIT_EVENTS = "fg_audit_events" as const;
export const FG_BG_SCREENING = "fg_bg_screening_requests" as const;
export const FG_DEALERS = "fg_dealers" as const;
export const FG_WAREHOUSE_GATES = "fg_warehouse_gates" as const;
export const FG_SERVICE_PROVIDERS = "fg_service_providers" as const;
export const FG_VISITOR_CONFIG = "fg_visitor_config" as const;
export const FG_OCR = "fg_ocr" as const;
export const FG_VERIFY_ATTEMPTS = "fg_verify_attempts" as const;
export const FG_SUPPORT_TICKETS = "fg_support_tickets" as const;
export const FG_DASHBOARD_CACHE = "fg_dashboard_cache" as const;

// ── Runtime safety assertion ─────────────────────────────────────────────────

/**
 * Throws if the given collection path does not start with "fg_".
 * Call this at the top of every service function that references a collection.
 *
 * @example
 *   const col = assertFgPath(FG_DRIVERS); // returns "fg_drivers"
 *   const colRef = collection(db, col);
 */
export function assertFgPath(path: string): string {
  if (!path.startsWith("fg_")) {
    throw new Error(
      `REFUSED: "${path}" is not an fg_* Firestore path. ` +
        "FleetGuard safety rule S1/S3 — all collections must be prefixed fg_."
    );
  }
  return path;
}

// ── Type helpers ─────────────────────────────────────────────────────────────

export type FgCollection =
  | typeof FG_ORGANISATIONS
  | typeof FG_WAREHOUSES
  | typeof FG_USERS
  | typeof FG_CONTRACTORS
  | typeof FG_DRIVERS
  | typeof FG_DRIVER_BACKGROUND
  | typeof FG_VEHICLES
  | typeof FG_GATE_EVENTS
  | typeof FG_INBOUND_ENTRIES
  | typeof FG_VISITOR_ENTRIES
  | typeof FG_TRIPS
  | typeof FG_TRIP_STOPS
  | typeof FG_COMPLIANCE_CHECKS
  | typeof FG_ALERTS
  | typeof FG_INCIDENTS
  | typeof FG_AUDIT_EVENTS
  | typeof FG_BG_SCREENING
  | typeof FG_DEALERS
  | typeof FG_WAREHOUSE_GATES
  | typeof FG_SERVICE_PROVIDERS
  | typeof FG_VISITOR_CONFIG
  | typeof FG_SUPPORT_TICKETS;
