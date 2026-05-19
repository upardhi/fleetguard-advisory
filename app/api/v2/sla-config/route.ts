/**
 * Per-org SLA config — read by anyone authed in the org, write by CSO only.
 *
 * GET  /api/v2/sla-config        → returns the effective config (overrides
 *                                   merged with code defaults). Always
 *                                   returns a payload, even when no row
 *                                   exists in `sla_config`.
 * PUT  /api/v2/sla-config        → upsert the row. CSO role required.
 *                                   Only validates + persists; returns the
 *                                   re-loaded effective config.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { requireUser } from "@/app/_server/auth/getUser";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";
import {
  loadOrgSlaConfig,
  SLA_MINUTES,
  type IncidentTypeForSla,
} from "@/app/_lib/incidentSla";

const TYPE_KEYS: ReadonlyArray<IncidentTypeForSla> = [
  "fraud_attempt", "fake_pod", "face_mismatch", "unauthorized_entry",
  "vehicle_noncompliance", "driver_noncompliance", "invoice_mismatch",
  "theft", "other",
];

// Operational bounds — anything outside this window is almost certainly a typo.
//   Lower bound: 5 min — sub-5-minute SLA is unrealistic for incident response.
//   Upper bound: 1440 min (24 h) — longer than a day no longer behaves like an SLA.
// Kept here so client + server agree.
export const SLA_MIN_MINUTES = 5;
export const SLA_MAX_MINUTES = 24 * 60;

// All values optional — CSO can override only the types they care about.
const SlaMinutesSchema = z.object(
  Object.fromEntries(
    TYPE_KEYS.map((k) => [
      k,
      z.number().int().min(SLA_MIN_MINUTES).max(SLA_MAX_MINUTES).optional(),
    ]),
  ) as Record<IncidentTypeForSla, z.ZodOptional<z.ZodNumber>>,
).strict();

const PausedDaysSchema = z.array(z.number().int().min(0).max(6)).max(7);

const PutSchema = z.object({
  slaMinutes: SlaMinutesSchema.optional(),
  pausedDays: PausedDaysSchema.optional(),
});

function serialiseConfig(cfg: { slaMinutes: Record<IncidentTypeForSla, number>; pausedDays: ReadonlySet<number> }) {
  return {
    slaMinutes:        cfg.slaMinutes,
    pausedDays:        [...cfg.pausedDays].sort((a, b) => a - b),
    defaultsSlaMinutes: SLA_MINUTES,
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const cfg = await loadOrgSlaConfig(actor.org ?? "");
  return applySecurityHeaders(NextResponse.json(serialiseConfig(cfg)));
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  // Only CSO can change company-wide SLA. Other roles see the config but
  // can't edit it.
  if (actor.role !== "cso") {
    return applySecurityHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }
  if (!actor.org) {
    return applySecurityHeaders(NextResponse.json({ error: "No org" }, { status: 400 }));
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }

  const slaMinutes = parsed.data.slaMinutes ?? {};
  // Default Sunday-only paused if caller doesn't specify; explicit empty
  // array means "no paused days" (24/7 ops).
  const pausedDays = parsed.data.pausedDays ?? [0];

  await db`
    INSERT INTO sla_config (org_id, sla_minutes, paused_days, updated_by, updated_at)
    VALUES (
      ${actor.org}, ${db.json(slaMinutes as Parameters<typeof db.json>[0])},
      ${pausedDays}, ${actor.sub}, now()
    )
    ON CONFLICT (org_id) DO UPDATE
    SET sla_minutes = EXCLUDED.sla_minutes,
        paused_days = EXCLUDED.paused_days,
        updated_by  = EXCLUDED.updated_by,
        updated_at  = now()
  `;

  await writeAuditEvent({
    orgId:        actor.org, actorId: actor.sub, actorRole: actor.role,
    action:       "sla_config.updated",
    resourceType: "sla_config",
    resourceId:   actor.org,
    payload:      { slaMinutes, pausedDays },
  });

  const cfg = await loadOrgSlaConfig(actor.org);
  return applySecurityHeaders(NextResponse.json(serialiseConfig(cfg)));
}
