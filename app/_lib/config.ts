/**
 * FleetGuard — runtime configuration
 * Values mirror brief §6. Change via environment variables only.
 */

export type TripSourceMode = "mock" | "firestore" | "superprocure";

export const config = {
  /** Controls where trip data comes from */
  tripSource: (process.env.TRIP_SOURCE ?? process.env.NEXT_PUBLIC_TRIP_SOURCE  ?? "mock") as TripSourceMode,

  /** Face-match score thresholds (0–1, higher = more similar) */
  faceMatch: {
    /** Below this → mismatch alert */
    minScore: 0.72,
    /** Below this but above minScore → uncertain / manual review */
    uncertainThreshold: 0.85,
  },

  /** DL expiry warning window (days) */
  dlExpiry: {
    /** Yellow badge starts this many days before expiry */
    warningDays: 30,
  },

  /** Vehicle document expiry warning window (days) */
  vehicleExpiry: {
    warningDays: 30,
  },

  /** Contractor contract expiry warning window (days) */
  contractorExpiry: {
    warningDays: 60,
  },

  /** Alert escalation timing (minutes) */
  escalation: {
    /** Open critical alert escalated to CSO after this many minutes */
    criticalToCSO: 30,
    /** Open warning alert escalated after this many minutes */
    warningToManager: 120,
  },

  /** SLA windows for incidents (minutes) */
  incidentSla: {
    fraud_attempt: 60,
    face_mismatch: 60,
    fake_pod: 120,
    unauthorized_entry: 30,
    vehicle_noncompliance: 120,
    driver_noncompliance: 120,
    invoice_mismatch: 240,
    theft: 30,
    criminal_record: 60,
    identity_mismatch: 60,
    other: 480,
  },

  /** PIN lockout policy */
  pin: {
    /** Failed attempts before lockout */
    maxAttempts: 3,
    /** Lockout duration in minutes */
    lockoutMinutes: 30,
    /** PIN length */
    length: 6,
  },

  /** Visitor overstay threshold (minutes) */
  visitorOverstayMinutes: 480, // 8 hours

  /** Trip overdue — minutes after planned return before alert fires */
  tripOverdueMinutes: 60,
} as const;
