/**
 * Dashboard + reports stats — computes live from v2 API service functions.
 * Firestore cache removed; stats are computed fresh on each call.
 */

import {
  dwellDistribution,
  spVolumeLeaderboard,
  spRiskLeaderboard,
  complianceFunnel,
  managerROI,
  type DwellStats,
  type SpRisk,
} from "./dashboardAnalytics";
import { daysUntil } from "./utils";
import { getGateEventsForStats, getDriverEntryEvents, getTruckFlow, getEntryHeatmap } from "../_services/gateEventService";
import { getDriversByWarehouse } from "../_services/driverService";
import { getVehiclesByWarehouse } from "../_services/vehicleService";
import { getAllAlerts } from "../_services/alertService";
import { getIncidentsByWarehouse } from "../_services/incidentService";
import { getTripsForWarehouse } from "../_services/tripDataService";
import { translateDlResponse, validateDl } from "../_services/dlVerifyService";
import { translateCrimeCheckResponse } from "../_services/crimeCheckService";
import type { CrimeCase } from "../_services/crimeCheckService";
import type { FgGateEvent } from "../_services/gateEventService";
import { calculateVehicleComplianceStats } from "./vehicleCompliance";

// ── Serialisable stat shapes (Dates → ISO strings) ───────────────────────────

export interface FlowDay {
  label: string;
  dateStr: string; // ISO date e.g. "2026-04-10"
  entries: number;
  exits: number;
}

export interface ReportStats {
  drivers: {
    total: number;
    dlExpired: number;
    dlExpiring30: number;
    dlExpiring90: number;
    bgFlagged: number;
    bgPending: number;
    bgClear: number;
    urgentList: Array<{
      id: string;
      name: string;
      dlNumber: string;
      dlExpiryMs: number;
      dlStatus: string;
      bgStatus: string;
    }>;
  };
  vehicles: { total: number; expired: number; expiring30: number; expiring90: number };
  crime: {
    totalCases: number;
    civil: number;
    criminal: number;
    activeCivil: number;
    activeCriminal: number;
    invalidDl: number;
    invalidFakeDl: number;
    driversWithCases: number;
  };
  ops30d: {
    totalTrips: number;
    inTransit: number;
    completed: number;
    totalDeliveries: number;
    totalStops: number;
    totalGateEvents: number;
    visitors: number;
    gateByType: Record<string, number>;
  };
  alerts30d: {
    total: number;
    critical: number;
    warning: number;
    info: number;
    open: number;
    acknowledged: number;
    resolved: number;
  };
  incidents30d: {
    total: number;
    open: number;
    investigating: number;
    resolved: number;
    closed: number;
    typeCounts: Record<string, number>;
  };
  funnel: Array<{ label: string; value: number; sub: string }>;
  roiPartial: { invalidDlAtGate: number; criminalCaughtAtGate: number; blockedDLs: number };
}

export interface VehicleIntelItem {
  id: string;
  reg: string;
  type: string;
  ownerType: "owned" | "contractor";
  pucDays: number | null; // null = no date recorded
  rcDays: number | null;
  insDays: number | null;
  fitDays: number | null;
  worstDays: number | null; // minimum of the four (most urgent)
  worstDoc: "PUC" | "MV Tax" | "Insurance" | "Fitness" | null;
}

export interface VehicleIntel {
  total: number;
  pucExpired: number;
  pucExp30: number;
  pucExp90: number;
  rcExpired: number;
  rcExp30: number;
  insExpired: number;
  insExp30: number;
  fitExpired: number;
  fitExp30: number;
  anyExpired: number; // vehicles with at least one expired doc
  vehicles: VehicleIntelItem[]; // sorted: expired first, then by worst expiry asc
}

export interface DashboardStats {
  flow14d: FlowDay[];
  dwell: DwellStats;
  heatmap: { matrix: number[][]; rowLabels: string[]; colLabels: string[] };
  spVolume: { id: string; name: string; trucks: number; uniqueDrivers: number }[];
  spRisk: SpRisk[];
  reportStats: ReportStats;
  vehicleIntel: VehicleIntel;
  computedAt: Date;
}

const INVALID_TRANSPORT_STATUSES = new Set(["invalid_personal_only"]);
const INVALID_FAKE_STATUSES = new Set([
  "invalid_no_record", "invalid_suspended", "invalid_learner_only", "invalid_state_unavailable",
]);

function worstExpiry(v: {
  rcExpiry: Date | null; insuranceExpiry: Date | null;
  fitnessExpiry: Date | null; pucExpiry: Date | null;
}): Date | null {
  const dates = [v.rcExpiry, v.insuranceExpiry, v.fitnessExpiry, v.pucExpiry].filter(
    (d): d is Date => d != null,
  );
  if (dates.length === 0) return null;
  return dates.reduce((a, b) => (a < b ? a : b));
}

function parseCrimeSummary(ev: FgGateEvent) {
  const cd = ev.crimeCheckData;
  if (!cd?.pollData || !cd.provider) return null;
  try {
    const result = translateCrimeCheckResponse(cd.provider, cd.pollData);
    const isActive = (c: CrimeCase) =>
      !c.decisionDate?.trim() ||
      c.caseStatus?.toLowerCase().includes("active") ||
      c.caseStatus?.toLowerCase().includes("pending");
    const civil = result.cases.filter((c) => c.caseCategory?.toLowerCase() === "civil");
    const criminal = result.cases.filter((c) => c.caseCategory?.toLowerCase() === "criminal");
    return {
      total: result.total,
      civil: civil.length,
      criminal: criminal.length,
      activeCivil: civil.filter(isActive).length,
      activeCriminal: criminal.filter(isActive).length,
    };
  } catch { return null; }
}

function computeReportStats(
  drivers: Awaited<ReturnType<typeof getDriversByWarehouse>>,
  vehicles: Awaited<ReturnType<typeof getVehiclesByWarehouse>>,
  trips: Awaited<ReturnType<typeof getTripsForWarehouse>>,
  alerts: Awaited<ReturnType<typeof getAllAlerts>>,
  incidents: Awaited<ReturnType<typeof getIncidentsByWarehouse>>,
  gateEvents30d: FgGateEvent[],
  entryEvents: FgGateEvent[],
): ReportStats {
  const now = Date.now();
  const since30d = now - 30 * 86400000;

  let dlExpired = 0, dlExpiring30 = 0, dlExpiring90 = 0, bgFlagged = 0, bgPending = 0, bgClear = 0;
  const urgentList: ReportStats["drivers"]["urgentList"] = [];
  for (const d of drivers) {
    const n = daysUntil(d.dlExpiry);
    if (n < 0) dlExpired++;
    else if (n <= 30) dlExpiring30++;
    else if (n <= 90) dlExpiring90++;
    if (d.bgStatus === "flagged") bgFlagged++;
    else if (d.bgStatus === "pending") bgPending++;
    else if (d.bgStatus === "clear") bgClear++;
    if (n <= 30) {
      urgentList.push({
        id: d.id, name: d.fullName, dlNumber: d.dlNumber ?? "",
        dlExpiryMs: d.dlExpiry.getTime(), dlStatus: d.dlStatus ?? "", bgStatus: d.bgStatus,
      });
    }
  }
  urgentList.sort((a, b) => a.dlExpiryMs - b.dlExpiryMs);

  let vExpired = 0, vDoc0_30 = 0, vDoc31_90 = 0;
  for (const v of vehicles) {
    const w = worstExpiry(v);
    if (!w) continue;
    const n = daysUntil(w);
    if (n < 0) vExpired++;
    else if (n <= 30) vDoc0_30++;
    else if (n <= 90) vDoc31_90++;
  }

  const metaByKey = new Map<string, { status: string | null; crime: ReturnType<typeof parseCrimeSummary> }>();
  for (const ev of entryEvents) {
    const key = ev.driverId ?? (ev.dlNumber ? ev.dlNumber.replace(/[\s\-]/g, "").toUpperCase() : null);
    if (!key || metaByKey.has(key)) continue;
    let status: string | null = null;
    if (ev.dlVerifyData?.provider && ev.dlVerifyData?.data) {
      try {
        status = validateDl(translateDlResponse(ev.dlVerifyData.provider, ev.dlVerifyData.data), "").status;
      } catch { /* unknown provider */ }
    }
    metaByKey.set(key, { status, crime: parseCrimeSummary(ev) });
  }

  let totalCases = 0, civil = 0, criminal = 0, activeCivil = 0, activeCriminal = 0, invalidDl = 0, invalidFakeDl = 0, driversWithCases = 0;
  for (const d of drivers) {
    const meta = metaByKey.get(d.id) ?? metaByKey.get(d.dlNumber);
    if (!meta) continue;
    if (meta.crime) {
      totalCases += meta.crime.total; civil += meta.crime.civil; criminal += meta.crime.criminal;
      activeCivil += meta.crime.activeCivil; activeCriminal += meta.crime.activeCriminal;
      if (meta.crime.total > 0) driversWithCases++;
    }
    if (meta.status) {
      if (INVALID_TRANSPORT_STATUSES.has(meta.status)) invalidDl++;
      if (INVALID_FAKE_STATUSES.has(meta.status)) invalidFakeDl++;
    }
  }

  const rangedTrips = trips.filter((t) => (t.departedAt?.getTime() ?? 0) >= since30d);
  const gateByType: Record<string, number> = {};
  for (const g of gateEvents30d) gateByType[g.eventType] = (gateByType[g.eventType] ?? 0) + 1;

  const rangedAlerts = alerts.filter((a) => a.createdAt.getTime() >= since30d);
  const alerts30d = {
    total: rangedAlerts.length,
    critical: rangedAlerts.filter((a) => a.severity === "critical").length,
    warning: rangedAlerts.filter((a) => a.severity === "warning").length,
    info: rangedAlerts.filter((a) => a.severity === "info").length,
    open: rangedAlerts.filter((a) => a.status === "open").length,
    acknowledged: 0,
    resolved: rangedAlerts.filter((a) => a.status === "resolved").length,
  };

  const rangedIncidents = incidents.filter((i) => i.createdAt.getTime() >= since30d);
  const typeCounts: Record<string, number> = {};
  for (const i of rangedIncidents) typeCounts[i.type] = (typeCounts[i.type] ?? 0) + 1;

  return {
    drivers: { total: drivers.length, dlExpired, dlExpiring30, dlExpiring90, bgFlagged, bgPending, bgClear, urgentList },
    vehicles: { total: vehicles.length, expired: vExpired, expiring30: vDoc0_30, expiring90: vDoc31_90 },
    crime: { totalCases, civil, criminal, activeCivil, activeCriminal, invalidDl, invalidFakeDl, driversWithCases },
    ops30d: {
      totalTrips: rangedTrips.length,
      inTransit: rangedTrips.filter((t) => t.status === "in_transit").length,
      completed: rangedTrips.filter((t) => t.status === "closed").length,
      totalDeliveries: rangedTrips.reduce((s, t) => s + t.confirmedStops, 0),
      totalStops: rangedTrips.reduce((s, t) => s + t.totalStops, 0),
      totalGateEvents: gateEvents30d.length,
      visitors: gateEvents30d.filter((g) => g.eventType.startsWith("visitor")).length,
      gateByType,
    },
    alerts30d,
    incidents30d: {
      total: rangedIncidents.length,
      open: rangedIncidents.filter((i) => i.status === "open").length,
      investigating: rangedIncidents.filter((i) => i.status === "investigating").length,
      resolved: rangedIncidents.filter((i) => i.status === "resolved").length,
      closed: rangedIncidents.filter((i) => i.status === "closed").length,
      typeCounts,
    },
    funnel: complianceFunnel(drivers, entryEvents),
    roiPartial: (({ criticalAlertsResolved: _c, ...rest }) => rest)(managerROI(drivers, entryEvents, [])),
  };
}

function computeVehicleIntel(
  vehicles: Awaited<ReturnType<typeof getVehiclesByWarehouse>>,
): VehicleIntel {

  const vehicleStats =
    calculateVehicleComplianceStats(vehicles);

  const items: VehicleIntelItem[] = vehicles.map((v) => {

    const pucDays =
      v.pucExpiry ? daysUntil(v.pucExpiry) : null;

    const rcDays =
      v.rcExpiry ? daysUntil(v.rcExpiry) : null;

    const insDays =
      v.insuranceExpiry
        ? daysUntil(v.insuranceExpiry)
        : null;

    const fitDays =
      v.fitnessExpiry
        ? daysUntil(v.fitnessExpiry)
        : null;

    const pairs: [
      number | null,
      "PUC" | "MV Tax" | "Insurance" | "Fitness"
    ][] = [
      [pucDays, "PUC"],
      [rcDays, "MV Tax"],
      [insDays, "Insurance"],
      [fitDays, "Fitness"],
    ];

    const valid = pairs.filter(
      (p): p is [
        number,
        "PUC" | "MV Tax" | "Insurance" | "Fitness"
      ] => p[0] !== null
    );

    const worst =
      valid.length
        ? valid.reduce((a, b) =>
            a[0] < b[0] ? a : b
          )
        : null;

    return {
      id: v.id,
      reg: v.registrationNumber,
      type: v.vehicleType,
      ownerType: v.ownerType,

      pucDays,
      rcDays,
      insDays,
      fitDays,

      worstDays: worst ? worst[0] : null,
      worstDoc: worst ? worst[1] : null,
    };
  });

  items.sort((a, b) => {
    const aw = a.worstDays ?? Infinity;
    const bw = b.worstDays ?? Infinity;

    return aw - bw;
  });

  return {
    total: vehicleStats.total,

    pucExpired: vehicleStats.pucExpired,
    pucExp30: vehicleStats.pucExp30,
    pucExp90: vehicleStats.pucExp90,

    rcExpired: vehicleStats.rcExpired,
    rcExp30: vehicleStats.rcExp30,

    insExpired: vehicleStats.insExpired,
    insExp30: vehicleStats.insExp30,

    fitExpired: vehicleStats.fitExpired,
    fitExp30: vehicleStats.fitExp30,

    anyExpired: vehicleStats.anyExpired,

    vehicles: items,
  };
}

export async function loadDashboardStats(warehouseId: string): Promise<DashboardStats> {
  // Truck-flow buckets come pre-aggregated from the server so the chart isn't
  // bounded by the gate-events row cap. Other charts still read the raw event
  // list (capped, but adequate for their windows).
  const [eventsRaw, drivers, vehicles, trips, alerts, incidents, entryEventsRaw, flowRaw, heatmapRaw] = await Promise.all([
    getGateEventsForStats(warehouseId, 30),
    getDriversByWarehouse(warehouseId),
    getVehiclesByWarehouse(warehouseId),
    getTripsForWarehouse(warehouseId),
    getAllAlerts(warehouseId, 500),
    getIncidentsByWarehouse(warehouseId, 500),
    getDriverEntryEvents(warehouseId),
    getTruckFlow(warehouseId, 14),
    getEntryHeatmap(warehouseId, 30),
  ]);

  // Belt-and-suspenders: drop any rows that don't belong to the requested
  // warehouse. The API enforces this server-side, but a stale assignment or
  // missing scope check would otherwise leak other-warehouse SPs into the
  // leaderboard. Events with an empty warehouseId (older API responses that
  // didn't SELECT warehouse_id) are kept so legacy data still renders.
  const sameWarehouse = (e: { warehouseId: string }) => !e.warehouseId || e.warehouseId === warehouseId;
  const events = eventsRaw.filter(sameWarehouse);
  const entryEvents = entryEventsRaw.filter(sameWarehouse);

  const entryEventsForChart = events.filter((e) => e.eventType.endsWith("_entry"));
  const flow14d: FlowDay[] = flowRaw.map((d) => ({
    label: d.label,
    dateStr: d.dateStr,
    entries: d.entries,
    exits: d.exits,
  }));

  return {
    flow14d,
    dwell: dwellDistribution(events),
    heatmap: {
      matrix: heatmapRaw.matrix,
      rowLabels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      colLabels: Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")),
    },
    spVolume: spVolumeLeaderboard(events, 30),
    spRisk: spRiskLeaderboard(entryEventsForChart, drivers),
    reportStats: computeReportStats(drivers, vehicles, trips, alerts, incidents, events, entryEvents),
    vehicleIntel: computeVehicleIntel(vehicles),
    computedAt: new Date(),
  };
}

export function invalidateDashboardCache(_warehouseId: string): void {
  // no-op — cache removed; stats are always computed fresh
}
