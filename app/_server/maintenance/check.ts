import { NextResponse } from "next/server";
import { applySecurityHeaders } from "@/app/_server/security/headers";

// 2026-05-15 07:00 IST = 01:30 UTC
const MAINTENANCE_START = new Date("2026-05-15T01:30:00Z");

/**
 * Returns a 503 response if scheduled maintenance is active, otherwise null.
 * Set MAINTENANCE_MODE=disabled in env to re-enable the endpoint after downtime.
 */
export function maintenanceCheck(): NextResponse | null {
  if (process.env.MAINTENANCE_MODE === "disabled") return null;
  if (new Date() < MAINTENANCE_START) return null;

  return applySecurityHeaders(
    NextResponse.json(
      {
        error: "Service temporarily unavailable",
        message: "Scheduled maintenance in progress. Please try again later.",
        retryAfter: "Contact your system administrator to re-enable the service.",
      },
      {
        status: 503,
        headers: { "Retry-After": "3600" },
      },
    ),
  );
}
