/**
 * Dashboard analytics — pure derivations from already-fetched data.
 * No network I/O. Keeps the manager + CSO pages readable.
 */

import type { FgGateEvent } from "../_services/gateEventService";
import type { FgDriver } from "../_services/driverService";
import type { FgAlert } from "../_services/alertService";
import type { FgIncident } from "../_services/incidentService";
import type { FgWarehouse } from "../_services/warehouseService";
import { translateCrimeCheckResponse } from "../_services/crimeCheckService";
import { translateDlResponse, validateDl } from "../_services/dlVerifyService";
import { daysUntil } from "./utils";

// ── Truck flow: last N days of entry/exit counts ─────────────────────────────

const TRUCK_EVENT_TYPES = new Set([
  "inbound_entry",
  "inbound_exit",
  "outbound_entry",
  "outbound_exit",
  "contractor_entry",
  "contractor_exit",
]);

export function truckFlowByDay(events: FgGateEvent[], days = 14) {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  const buckets: { label: string; date: Date; entries: number; exits: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    buckets.push({
      label: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      date: d,
      entries: 0,
      exits: 0,
    });
  }
  const startMs = buckets[0]!.date.getTime();

  for (const ev of events) {
    if (!TRUCK_EVENT_TYPES.has(ev.eventType)) continue;
    const ms = (ev.createdAt ?? ev.time).getTime();
    if (ms < startMs) continue;
    const idx = Math.floor((ms - startMs) / (24 * 3600 * 1000));
    if (idx < 0 || idx >= days) continue;
    const b = buckets[idx]!;
    if (ev.eventType.endsWith("_entry")) b.entries++;
    else if (ev.eventType.endsWith("_exit")) b.exits++;
  }
  return buckets;
}

// ── Dwell time distribution ──────────────────────────────────────────────────

export interface DwellStats {
  bins: { label: string; value: number }[];
  sampleCount: number;
  avgMinutes: number;
  p50Minutes: number;
  p95Minutes: number;
}

export const DWELL_BINS: { label: string; maxMinutes: number }[] = [
  { label: "<30m", maxMinutes: 30 },
  { label: "30–60m", maxMinutes: 60 },
  { label: "1–2h", maxMinutes: 120 },
  { label: "2–4h", maxMinutes: 240 },
  { label: ">4h", maxMinutes: Infinity },
];

export function dwellDistribution(events: FgGateEvent[]): DwellStats {
  // Match exits to entries via entryEventId (new events) or same vehicleReg (fallback).
  const entriesById = new Map<string, FgGateEvent>();
  const entriesByVeh: Map<string, FgGateEvent[]> = new Map();
  for (const ev of events) {
    if (!ev.eventType.endsWith("_entry")) continue;
    if (!TRUCK_EVENT_TYPES.has(ev.eventType)) continue;
    entriesById.set(ev.id, ev);
    if (ev.vehicleReg) {
      const key = ev.vehicleReg.toUpperCase().replace(/[\s\-]/g, "");
      const list = entriesByVeh.get(key) ?? [];
      list.push(ev);
      entriesByVeh.set(key, list);
    }
  }

  const durations: number[] = [];
  for (const ev of events) {
    if (!ev.eventType.endsWith("_exit")) continue;
    if (!TRUCK_EVENT_TYPES.has(ev.eventType)) continue;
    let entry: FgGateEvent | undefined;
    if (ev.entryEventId) entry = entriesById.get(ev.entryEventId);
    if (!entry && ev.vehicleReg) {
      const key = ev.vehicleReg.toUpperCase().replace(/[\s\-]/g, "");
      const candidates = entriesByVeh.get(key) ?? [];
      // pick the most recent entry before this exit
      const before = candidates.filter((c) => c.time.getTime() <= ev.time.getTime());
      entry = before.sort((a, b) => b.time.getTime() - a.time.getTime())[0];
    }
    if (!entry) continue;
    const mins = Math.floor((ev.time.getTime() - entry.time.getTime()) / 60000);
    if (mins <= 0 || mins > 24 * 60) continue; // drop silly outliers
    durations.push(mins);
  }

  const bins = DWELL_BINS.map((b) => ({ label: b.label, value: 0 }));
  for (const d of durations) {
    const idx = DWELL_BINS.findIndex((b) => d <= b.maxMinutes);
    if (idx >= 0) bins[idx]!.value++;
  }

  const sorted = [...durations].sort((a, b) => a - b);
  const pct = (p: number) => sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))]!;
  const avg = sorted.length === 0 ? 0 : Math.round(sorted.reduce((s, v) => s + v, 0) / sorted.length);

  return {
    bins,
    sampleCount: sorted.length,
    avgMinutes: avg,
    p50Minutes: pct(0.5),
    p95Minutes: pct(0.95),
  };
}

// ── Hourly heatmap (7 days × 24 hours) ───────────────────────────────────────

export function hourlyEntryHeatmap(events: FgGateEvent[]) {
  // 7 rows (Mon..Sun), 24 cols
  const matrix: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const ev of events) {
    if (!TRUCK_EVENT_TYPES.has(ev.eventType) || !ev.eventType.endsWith("_entry")) continue;
    const d = ev.time;
    // JS: Sun=0 .. Sat=6. Convert to Mon=0..Sun=6
    const dow = (d.getDay() + 6) % 7;
    const hr = d.getHours();
    matrix[dow]![hr]!++;
  }
  return {
    matrix,
    rowLabels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    colLabels: Array.from({ length: 24 }, (_, i) => (i < 10 ? `0${i}` : `${i}`)),
  };
}

// ── Top service providers by truck volume (last 30 days) ─────────────────────

export function spVolumeLeaderboard(events: FgGateEvent[], days = 30) {
  const cutoff = Date.now() - days * 24 * 3600 * 1000;
  const counts = new Map<string, { id: string; name: string; trucks: number; drivers: Set<string> }>();
  for (const ev of events) {
    if (!TRUCK_EVENT_TYPES.has(ev.eventType) || !ev.eventType.endsWith("_entry")) continue;
    if (ev.time.getTime() < cutoff) continue;
    const id = ev.contractorId;
    const name = ev.contractorName;
    if (!id || !name) continue;
    const entry = counts.get(id) ?? { id, name, trucks: 0, drivers: new Set<string>() };
    entry.trucks++;
    if (ev.driverId) entry.drivers.add(ev.driverId);
    counts.set(id, entry);
  }
  return [...counts.values()]
    .map((c) => ({ id: c.id, name: c.name, trucks: c.trucks, uniqueDrivers: c.drivers.size }))
    .sort((a, b) => b.trucks - a.trucks);
}

// Personal-only commercial DL — driver lacks a transport endorsement.
// Same set used by /manager/drivers to compute "No Transport Endorsement".
const INVALID_TRANSPORT_STATUSES = new Set([
  "invalid_personal_only",
]);

// Expired transport / non-transport endorsement.
const EXPIRED_STATUSES = new Set([
  "invalid_transport_expired",
  "invalid_nt_expired",
]);

// "Fake" / hard-invalid: govt record missing, suspended, learner-only, etc.
// Same set used by /manager/drivers to compute "Invalid / Fake".
const INVALID_FAKE_STATUSES = new Set([
  "invalid_no_record",
  "invalid_suspended",
  "invalid_learner_only",
  "invalid_state_unavailable",
]);

// ── SP risk leaderboard ──────────────────────────────────────────────────────

export interface SpRisk {
  id: string;
  name: string;
  drivers: number;
  /** Drivers with bgStatus === "flagged" (matches /manager/drivers "BG check flagged"). */
  flaggedDrivers: number;
  /** Drivers whose DL is personal-only (matches /manager/drivers "No Transport Endorsement"). */
  invalidDlDrivers: number;
  /** Drivers whose DL is expired (matches /manager/drivers "DL expired"). */
  expiredDlDrivers: number;
  /** Drivers whose DL is fake / no record (matches /manager/drivers "Invalid / Fake"). */
  invalidFakeDrivers: number;
  /** Sum of criminalCases on each driver record. */
  criminalCases: number;
  /** Sum of activeCriminalCases on each driver record. */
  activeCriminal: number;
  riskScore: number;
}

/**
 * Service-provider risk leaderboard — every count is sourced from the drivers
 * table so the rows always agree with the /manager/drivers stats. Entry
 * events are used only for SP attribution: each driver is associated with
 * the SP from their most recent entry. When `drivers` is omitted the
 * function falls back to deriving rows from event-attached payloads.
 */
export function spRiskLeaderboard(
  entryEvents: FgGateEvent[],
  drivers?: FgDriver[],
): SpRisk[] {
  // Without driver records there's nothing to aggregate — return empty rather
  // than fall back to event-based derivation, which produced misleading
  // counts that diverged from the drivers page.
  if (!drivers || drivers.length === 0) return [];

  const normalizeDl = (s: string | null | undefined) =>
    (s ?? "").replace(/[\s\-]/g, "").toUpperCase();

  // Single pass over events sorted descending: pick each driver's most
  // recent SP and most recent DL-verify payload. The drivers page derives
  // its DL stats from the latest gate event's dlVerifyData, so we mirror
  // that here to keep the leaderboard agreement exact.
  type SpRef = { id: string; name: string };
  type DlRef = { provider: string; data: Record<string, unknown> };
  const spByDriverId = new Map<string, SpRef>();
  const spByDl = new Map<string, SpRef>();
  const dlByDriverId = new Map<string, DlRef>();
  const dlByDl = new Map<string, DlRef>();
  const sortedEvents = [...entryEvents].sort(
    (a, b) => (b.time?.getTime() ?? 0) - (a.time?.getTime() ?? 0),
  );
  for (const ev of sortedEvents) {
    const dlKey = normalizeDl(ev.dlNumber);
    if (ev.contractorId && ev.contractorName) {
      const ref: SpRef = { id: ev.contractorId, name: ev.contractorName };
      if (ev.driverId && !spByDriverId.has(ev.driverId)) spByDriverId.set(ev.driverId, ref);
      if (dlKey && !spByDl.has(dlKey)) spByDl.set(dlKey, ref);
    }
    if (ev.dlVerifyData?.provider && ev.dlVerifyData.data) {
      const dl: DlRef = { provider: ev.dlVerifyData.provider, data: ev.dlVerifyData.data };
      if (ev.driverId && !dlByDriverId.has(ev.driverId)) dlByDriverId.set(ev.driverId, dl);
      if (dlKey && !dlByDl.has(dlKey)) dlByDl.set(dlKey, dl);
    }
  }

  const map = new Map<string, SpRisk>();
  for (const d of drivers) {
    const ref = spByDriverId.get(d.id) ?? spByDl.get(normalizeDl(d.dlNumber));
    if (!ref) continue; // driver hasn't entered this warehouse with a known SP

    const sp = map.get(ref.id) ?? {
      id: ref.id,
      name: ref.name,
      drivers: 0,
      flaggedDrivers: 0,
      invalidDlDrivers: 0,
      expiredDlDrivers: 0,
      invalidFakeDrivers: 0,
      criminalCases: 0,
      activeCriminal: 0,
      riskScore: 0,
    };
    sp.drivers++;

    if (d.bgStatus === "flagged") sp.flaggedDrivers++;

    // DL bucket — derived from the driver's latest gate event dlVerifyData
    // via validateDl(), exactly as /manager/drivers does. dlExpiry on the
    // driver record is used as an additional fallback for "expired" so we
    // don't miss drivers whose endorsement lapsed after their last entry.
    let dlBucket: "personal" | "expired" | "fake" | null = null;
    const dlRef = dlByDriverId.get(d.id) ?? dlByDl.get(normalizeDl(d.dlNumber));
    if (dlRef) {
      try {
        const n = translateDlResponse(dlRef.provider, dlRef.data);
        const v = validateDl(n, "");
        if (INVALID_TRANSPORT_STATUSES.has(v.status)) dlBucket = "personal";
        else if (EXPIRED_STATUSES.has(v.status)) dlBucket = "expired";
        else if (INVALID_FAKE_STATUSES.has(v.status)) dlBucket = "fake";
      } catch { /* unknown provider — fall through */ }
    }
    if (dlBucket === "personal") sp.invalidDlDrivers++;
    else if (dlBucket === "expired") sp.expiredDlDrivers++;
    else if (dlBucket === "fake") sp.invalidFakeDrivers++;
    else if (daysUntil(d.dlExpiry) < 0) sp.expiredDlDrivers++;

    const ev = sortedEvents.find(
      (e) =>
        e.driverId === d.id ||
        normalizeDl(e.dlNumber) === normalizeDl(d.dlNumber)
    );

    if (ev?.crimeCheckData?.pollData && ev.crimeCheckData.provider) {
      try {
        const result = translateCrimeCheckResponse(
          ev.crimeCheckData.provider,
          ev.crimeCheckData.pollData
        );

        const activeCases = result.cases.filter(
          (c) =>
            !c.decisionDate?.trim() ||
            c.caseStatus?.toLowerCase().includes("active") ||
            c.caseStatus?.toLowerCase().includes("pending")
        );

        sp.criminalCases += result.cases.filter(
          (c) => c.caseCategory?.toLowerCase() === "criminal"
        ).length;

        sp.activeCriminal += activeCases.filter(
          (c) => c.caseCategory?.toLowerCase() === "criminal"
        ).length;

      } catch { }
    }

    map.set(ref.id, sp);
  }

  // Composite risk score: weighted mix
  // criminal × 5 + flagged × 3 + invalid/fake × 4 + expired × 3 + personal-only × 2
  const rows = [...map.values()].map((sp) => ({
    ...sp,
    riskScore:
      sp.criminalCases * 5 +
      sp.flaggedDrivers * 3 +
      sp.invalidFakeDrivers * 4 +
      sp.expiredDlDrivers * 3 +
      sp.invalidDlDrivers * 2,
  }));
  return rows.sort((a, b) => b.riskScore - a.riskScore);
}

// ── Compliance funnel ────────────────────────────────────────────────────────

export function complianceFunnel(drivers: FgDriver[], entryEvents: FgGateEvent[]) {
  const screened = drivers.length;
  const dlValid = drivers.filter((d) => daysUntil(d.dlExpiry) >= 0 && d.dlStatus !== "blocked").length;
  const bgCleared = drivers.filter(
    (d) => d.bgStatus !== "flagged" && daysUntil(d.dlExpiry) >= 0 && d.dlStatus !== "blocked"
  ).length;
  const activelyDispatched = new Set<string>();
  for (const ev of entryEvents) if (ev.driverId) activelyDispatched.add(ev.driverId);
  return [
    { label: "Drivers screened", value: screened, sub: "Registered in system" },
    { label: "DL verified & valid", value: dlValid, sub: "Expiry > 0 days, not blocked" },
    { label: "Background cleared", value: bgCleared, sub: "No BG flag + DL ok" },
    { label: "Dispatched via FleetGuard", value: activelyDispatched.size, sub: "Entered gate in the period" },
  ];
}

// ── Manager ROI strip ────────────────────────────────────────────────────────

export function managerROI(
  drivers: FgDriver[],
  entryEvents: FgGateEvent[],
  alerts: FgAlert[]
) {
  const blockedDLs = drivers.filter((d) => d.dlStatus === "blocked" || daysUntil(d.dlExpiry) < 0).length;
  let invalidDlAtGate = 0;
  let criminalCaughtAtGate = 0;
  for (const ev of entryEvents) {
    if (ev.dlVerifyData?.provider && ev.dlVerifyData?.data) {
      try {
        const n = translateDlResponse(ev.dlVerifyData.provider, ev.dlVerifyData.data);
        const v = validateDl(n, "");
        if (INVALID_TRANSPORT_STATUSES.has(v.status)) invalidDlAtGate++;
      } catch { /* */ }
    }
    if (ev.crimeCheckData?.pollData && ev.crimeCheckData.provider) {
      try {
        const r = translateCrimeCheckResponse(ev.crimeCheckData.provider, ev.crimeCheckData.pollData);
        if (r.total > 0) criminalCaughtAtGate++;
      } catch { /* */ }
    }
  }
  const criticalAlertsResolved = alerts.filter((a) => a.severity === "critical" && a.status === "resolved").length;
  return { blockedDLs, invalidDlAtGate, criminalCaughtAtGate, criticalAlertsResolved };
}

// ── CSO: warehouse risk matrix ───────────────────────────────────────────────

export function warehouseRiskPoints(
  warehouses: FgWarehouse[],
  alerts: FgAlert[],
  incidents: FgIncident[]
) {
  const byWh = new Map<string, { alerts: number; critical: number; incidents: number }>();
  for (const w of warehouses) byWh.set(w.id, { alerts: 0, critical: 0, incidents: 0 });
  for (const a of alerts) {
    if (!a.warehouseId) continue;
    const e = byWh.get(a.warehouseId);
    if (!e) continue;
    if (a.status === "open") {
      e.alerts++;
      if (a.severity === "critical") e.critical++;
    }
  }
  for (const inc of incidents) {
    if (!inc.warehouseId) continue;
    const e = byWh.get(inc.warehouseId);
    if (!e) continue;
    if (inc.status === "open" || inc.status === "investigating") e.incidents++;
  }
  return warehouses.map((w) => {
    const e = byWh.get(w.id) ?? { alerts: 0, critical: 0, incidents: 0 };
    return {
      label: w.name,
      x: e.alerts,                 // open alerts
      y: e.incidents + e.critical, // severity load
      r: Math.max(5, Math.min(14, 5 + e.critical * 2)),
      color: e.critical > 0 ? "#e11d48" : e.alerts > 3 ? "#f59e0b" : "#10b981",
    };
  });
}

// ── CSO: alert trend last N days, stacked by severity ───────────────────────

export function alertTrendBySeverity(alerts: FgAlert[], days = 30) {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  const labels: string[] = [];
  const critical: number[] = [];
  const warning: number[] = [];
  const info: number[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    labels.push(d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }));
    critical.push(0);
    warning.push(0);
    info.push(0);
  }
  const startMs = (() => {
    const d = new Date(now);
    d.setDate(d.getDate() - (days - 1));
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();
  for (const a of alerts) {
    const ms = a.createdAt?.getTime?.() ?? 0;
    if (ms < startMs) continue;
    const idx = Math.floor((ms - startMs) / (24 * 3600 * 1000));
    if (idx < 0 || idx >= days) continue;
    const sev = a.severity;
    if (sev === "critical") critical[idx]!++;
    else if (sev === "warning") warning[idx]!++;
    else info[idx]!++;
  }
  return {
    labels,
    series: [
      { name: "Info", color: "#84adda", values: info },
      { name: "Warning", color: "#f59e0b", values: warning },
      { name: "Critical", color: "#e11d48", values: critical },
    ],
  };
}
