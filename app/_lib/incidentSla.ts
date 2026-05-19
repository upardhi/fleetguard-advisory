/**
 * Incident SLA window calculation.
 *
 * Critical types (theft, unauthorized_entry, fraud_attempt, face_mismatch) are
 * 24/7 — the SLA clock starts at created_at.
 *
 * Non-critical types (driver_noncompliance, vehicle_noncompliance,
 * invoice_mismatch, fake_pod, other) only tick during business hours
 * (9am–6pm IST) and skip the org's paused weekdays. If raised outside that
 * window, slaStartAt is shifted to the next business-hours opening so
 * managers aren't paged at night or on off days.
 *
 * Per-org overrides live in `sla_config` (see migration 0013). Use
 * `computeSlaWindowForOrg(orgId, type)` whenever you have an orgId — it
 * applies the overrides + paused-day list. The default-only `computeSlaWindow`
 * is kept for code paths that don't have an org context.
 */

import { db } from "@/app/_server/db/client";

export type IncidentTypeForSla =
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

export const SLA_MINUTES: Record<IncidentTypeForSla, number> = {
  fraud_attempt:         60,
  fake_pod:              120,
  face_mismatch:         60,
  unauthorized_entry:    30,
  vehicle_noncompliance: 240,
  driver_noncompliance:  240,
  invoice_mismatch:      120,
  theft:                 30,
  criminal_record:       60,
  identity_mismatch:     60,
  other:                 480,
};

const CRITICAL_24_7: ReadonlySet<IncidentTypeForSla> = new Set([
  "theft",
  "unauthorized_entry",
  "fraud_attempt",
  "face_mismatch",
  "criminal_record",
  "identity_mismatch",
]);

const IST_OFFSET_MS      = 5.5 * 60 * 60 * 1000;
const BIZ_OPEN_HOUR_IST  = 9;
const BIZ_CLOSE_HOUR_IST = 18;
const SUNDAY             = 0;  // getUTCDay(): 0=Sun, 1=Mon, ..., 6=Sat
const DEFAULT_PAUSED_DAYS: ReadonlySet<number> = new Set([SUNDAY]);

export interface SlaWindow {
  slaStartAt:  Date;
  slaDeadline: Date;
  slaMinutes:  number;
  deferred:    boolean;
}

/**
 * Effective per-org config — what `computeSlaWindowForOrg` actually uses
 * after merging the DB row (if any) with the in-code defaults.
 */
export interface OrgSlaConfig {
  /** Effective SLA minutes per incident type (overrides + defaults). */
  slaMinutes: Record<IncidentTypeForSla, number>;
  /** Weekday codes (0=Sun…6=Sat) on which the clock is paused. */
  pausedDays: ReadonlySet<number>;
}

/**
 * Find the next moment at which the SLA clock should be running:
 *   - inside business hours (9–18 IST), AND
 *   - not on a paused weekday.
 *
 * Returns `now` unchanged when both conditions already hold.
 */
function nextBusinessHoursStart(now: Date, pausedDays: ReadonlySet<number>): Date {
  const istNow  = new Date(now.getTime() + IST_OFFSET_MS);
  const istHour = istNow.getUTCHours();
  const istDay  = istNow.getUTCDay();

  const withinHours = istHour >= BIZ_OPEN_HOUR_IST && istHour < BIZ_CLOSE_HOUR_IST;
  if (withinHours && !pausedDays.has(istDay)) {
    return now;
  }

  // Walk forward to the next 9am IST, then skip paused days. Bound the loop
  // at 7 iterations because there's always at least one open day per week
  // (the constraint enforces paused_days ⊂ [0..6] but never *all* of them
  // would be configured in practice; the loop bound stops a bug-driven loop
  // too).
  const istNext = new Date(istNow);
  if (istHour >= BIZ_CLOSE_HOUR_IST) {
    istNext.setUTCDate(istNext.getUTCDate() + 1);
  }
  istNext.setUTCHours(BIZ_OPEN_HOUR_IST, 0, 0, 0);
  for (let i = 0; i < 7 && pausedDays.has(istNext.getUTCDay()); i++) {
    istNext.setUTCDate(istNext.getUTCDate() + 1);
  }

  return new Date(istNext.getTime() - IST_OFFSET_MS);
}

/**
 * Default-only SLA window. Use when you don't have an orgId in context
 * (rare — most callers should use `computeSlaWindowForOrg`).
 */
export function computeSlaWindow(
  type: IncidentTypeForSla | string,
  now: Date = new Date(),
): SlaWindow {
  return computeSlaWindowWith(
    { slaMinutes: SLA_MINUTES, pausedDays: DEFAULT_PAUSED_DAYS },
    type,
    now,
  );
}

/**
 * Org-aware SLA window. Reads any override row from `sla_config` and merges
 * with the in-code defaults. Returns the same `SlaWindow` shape as the
 * default-only variant so call sites are interchangeable.
 */
export async function computeSlaWindowForOrg(
  orgId: string,
  type: IncidentTypeForSla | string,
  now: Date = new Date(),
): Promise<SlaWindow> {
  const cfg = await loadOrgSlaConfig(orgId);
  return computeSlaWindowWith(cfg, type, now);
}

function computeSlaWindowWith(
  cfg: OrgSlaConfig,
  type: IncidentTypeForSla | string,
  now: Date,
): SlaWindow {
  const slaMinutes = cfg.slaMinutes[type as IncidentTypeForSla] ?? 480;

  if (CRITICAL_24_7.has(type as IncidentTypeForSla)) {
    return {
      slaStartAt:  now,
      slaDeadline: new Date(now.getTime() + slaMinutes * 60_000),
      slaMinutes,
      deferred:    false,
    };
  }

  const slaStartAt = nextBusinessHoursStart(now, cfg.pausedDays);
  return {
    slaStartAt,
    slaDeadline: new Date(slaStartAt.getTime() + slaMinutes * 60_000),
    slaMinutes,
    deferred:    slaStartAt.getTime() !== now.getTime(),
  };
}

/**
 * Load an org's effective SLA config. Returns merged values: any field in
 * the DB row's `sla_minutes` JSONB overrides the in-code default; missing
 * fields fall back. `paused_days` falls back to `{0}` (Sunday) when no row
 * exists, which matches the previous hardcoded behaviour.
 */
export async function loadOrgSlaConfig(orgId: string): Promise<OrgSlaConfig> {
  if (!orgId) {
    return { slaMinutes: SLA_MINUTES, pausedDays: DEFAULT_PAUSED_DAYS };
  }
  const [row] = await db<Array<{
    sla_minutes: Record<string, number> | null;
    paused_days: number[] | null;
  }>>`
    SELECT sla_minutes, paused_days FROM sla_config WHERE org_id = ${orgId} LIMIT 1
  `;
  if (!row) {
    return { slaMinutes: SLA_MINUTES, pausedDays: DEFAULT_PAUSED_DAYS };
  }

  // Merge: code defaults form the base; any DB-side values override.
  const merged = { ...SLA_MINUTES };
  const overrides = row.sla_minutes ?? {};
  for (const k of Object.keys(SLA_MINUTES) as IncidentTypeForSla[]) {
    const v = overrides[k];
    if (typeof v === "number" && v > 0 && Number.isFinite(v)) {
      merged[k] = Math.floor(v);
    }
  }

  const days = Array.isArray(row.paused_days) ? row.paused_days : [SUNDAY];
  return {
    slaMinutes: merged,
    pausedDays: new Set(days.filter((d) => d >= 0 && d <= 6)),
  };
}

/** True when `now` falls on one of the org's paused weekdays (in IST). */
export function isPausedToday(pausedDays: ReadonlySet<number>, now: Date = new Date()): boolean {
  const istDay = new Date(now.getTime() + IST_OFFSET_MS).getUTCDay();
  return pausedDays.has(istDay);
}
