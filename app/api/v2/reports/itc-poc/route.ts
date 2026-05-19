/**
 * Public, READ-ONLY POC report endpoint for the ITC Trichy DC POC report
 * (public/itc-report-poc2.html). Performs SELECT queries only — never writes,
 * updates, or deletes anything. Org and warehouse are pinned so this route
 * cannot be repurposed to dump arbitrary tenant data.
 *
 * Returns every aggregate, list, and time-series the static HTML used to
 * embed, so the page can render purely from this single payload.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/_server/db/client";
import { applySecurityHeaders } from "@/app/_server/security/headers";
import { translateDlResponse, validateDl } from "@/app/_services/dlVerifyService";

const ORG_ID = "019df10e-4a97-70b9-834a-47646365b491";   // ITC LIMITED
const WH_NAME = "TRICHY";

function unauthorized(): NextResponse {
  return applySecurityHeaders(
    NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  );
}

function expired(): NextResponse {
  return applySecurityHeaders(
    NextResponse.json({ error: "This report link has expired." }, { status: 410 }),
  );
}

function checkToken(req: NextRequest): "ok" | "unauthorized" | "expired" {
  const secret  = process.env.REPORT_ITC_POC_TOKEN;
  const expiry  = process.env.REPORT_ITC_POC_EXPIRES; // ISO date e.g. "2026-05-12"
  if (!secret) return "unauthorized";
  if (req.nextUrl.searchParams.get("token") !== secret) return "unauthorized";
  if (expiry && new Date() > new Date(expiry)) return "expired";
  return "ok";
}

type Row = Record<string, unknown>;

function asNum(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtDayLabel(d: Date): string {
  // "08 May" → matches existing chart axis style
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = checkToken(req);
  if (auth === "expired")      return expired();
  if (auth !== "ok")           return unauthorized();

  // Optional date-range filter for all sections.
  // Treated as IST (UTC+5:30) day boundaries.
  const fromParam = req.nextUrl.searchParams.get("from"); // "YYYY-MM-DD"
  const toParam   = req.nextUrl.searchParams.get("to");   // "YYYY-MM-DD"
  const dateFrom  = fromParam ? new Date(fromParam + "T00:00:00+05:30") : null;
  const dateTo    = toParam   ? new Date(toParam   + "T23:59:59+05:30") : null;
  // ── Org / warehouse ───────────────────────────────────────────────────────
  const orgRows = await db<Row[]>`
    SELECT id, name, short_code, city, state
    FROM   orgs
    WHERE  id = ${ORG_ID}
    LIMIT  1
  `;
  if (orgRows.length === 0) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Org not found" }, { status: 404 }),
    );
  }
  const org = orgRows[0];

  const whRows = await db<Row[]>`
    SELECT id, name, code, city, state, region
    FROM   warehouses
    WHERE  org_id = ${ORG_ID} AND name = ${WH_NAME}
    LIMIT  1
  `;
  if (whRows.length === 0) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Warehouse not found" }, { status: 404 }),
    );
  }
  const warehouse = whRows[0];
  const warehouseId = warehouse.id as string;

  // ── Window: derived from gate_events MIN/MAX so the report is always
  //    pegged to the actual data captured for this warehouse. ───────────────
  const windowRows = await db<Row[]>`
    SELECT MIN(occurred_at)::timestamptz AS first_event,
           MAX(occurred_at)::timestamptz AS last_event,
           COUNT(*)::int                  AS total_events
    FROM   gate_events
    WHERE  warehouse_id = ${warehouseId}
  `;
  const firstEvent = windowRows[0].first_event ? new Date(windowRows[0].first_event as string) : new Date();
  const lastEvent  = windowRows[0].last_event  ? new Date(windowRows[0].last_event  as string) : new Date();

  // Resolve filter bounds — fall back to the full data window when not supplied.
  const filterFrom = dateFrom ?? firstEvent;
  const filterTo   = dateTo   ?? lastEvent;

  // ── Gate event aggregates ────────────────────────────────────────────────
  const eventBreakdown = await db<Row[]>`
    SELECT event_type, status, COUNT(*)::int AS n
    FROM   gate_events
    WHERE  warehouse_id = ${warehouseId}
      AND  occurred_at >= ${filterFrom}
      AND  occurred_at <= ${filterTo}
    GROUP  BY event_type, status
  `;

  let totalEntries = 0, totalExits = 0, insideNow = 0;
  for (const r of eventBreakdown) {
    const n = asNum(r.n);
    const t = String(r.event_type);
    if (t.endsWith("_entry")) totalEntries += n;
    if (t.endsWith("_exit"))  totalExits   += n;
    if (r.status === "inside") insideNow += n;
  }

  const uniqRows = await db<Row[]>`
    SELECT
      COUNT(DISTINCT vehicle_reg) FILTER (WHERE vehicle_reg IS NOT NULL)::int AS uniq_vehicles,
      COUNT(DISTINCT driver_id)   FILTER (WHERE driver_id   IS NOT NULL)::int AS uniq_drivers,
      COUNT(DISTINCT (metadata->>'dlNumber'))
        FILTER (WHERE metadata->>'dlNumber' IS NOT NULL)::int                  AS uniq_dls
    FROM gate_events
    WHERE warehouse_id = ${warehouseId}
      AND occurred_at >= ${filterFrom}
      AND occurred_at <= ${filterTo}
  `;
  const uniqVehicles = asNum(uniqRows[0].uniq_vehicles);
  const uniqDrivers  = asNum(uniqRows[0].uniq_drivers);
  const uniqDls      = asNum(uniqRows[0].uniq_dls);

  // ── Unique driver IDs seen in this warehouse (date-filtered) ─────────────
  // Scopes all driver KPIs to match the manager-page warehouse view.
  const warehouseDriverIdsRows = await db<Row[]>`
    SELECT DISTINCT driver_id
    FROM   gate_events
    WHERE  warehouse_id = ${warehouseId}
      AND  driver_id IS NOT NULL
      AND  occurred_at >= ${filterFrom}
      AND  occurred_at <= ${filterTo}
  `;
  const warehouseDriverIds = warehouseDriverIdsRows.map(r => r.driver_id as string);

  // ── Daily entry/exit time series (covers the full window) ────────────────
  const dailyRows = await db<Row[]>`
    SELECT date_trunc('day', occurred_at AT TIME ZONE 'Asia/Kolkata')::date AS day,
           SUM(CASE WHEN event_type::text LIKE '%_entry' THEN 1 ELSE 0 END)::int AS entries,
           SUM(CASE WHEN event_type::text LIKE '%_exit'  THEN 1 ELSE 0 END)::int AS exits
    FROM   gate_events
    WHERE  warehouse_id = ${warehouseId}
      AND  occurred_at >= ${filterFrom}
      AND  occurred_at <= ${filterTo}
    GROUP  BY day
    ORDER  BY day
  `;
  // Fill any gap days with zeros so the chart x-axis is contiguous.
  const dayMap = new Map<string, { entries: number; exits: number }>();
  for (const r of dailyRows) {
    dayMap.set(isoDate(new Date(r.day as string)), {
      entries: asNum(r.entries),
      exits:   asNum(r.exits),
    });
  }
  const daily: Array<{ date: string; label: string; entries: number; exits: number }> = [];
  if (dailyRows.length > 0) {
    const start = new Date(firstEvent); start.setUTCHours(0, 0, 0, 0);
    const end   = new Date(lastEvent);  end.setUTCHours(0, 0, 0, 0);
    for (let d = new Date(start); d.getTime() <= end.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
      const k = isoDate(d);
      const row = dayMap.get(k) ?? { entries: 0, exits: 0 };
      daily.push({ date: k, label: fmtDayLabel(d), entries: row.entries, exits: row.exits });
    }
  }

  // ── Dwell-time buckets: pair each exit with the matching prior entry on
  //    the same vehicle_reg (uppercased, stripped of separators), within 24h. ─
  const dwellRows = await db<Row[]>`
    WITH norm AS (
      SELECT id, event_type, occurred_at,
             upper(regexp_replace(coalesce(vehicle_reg, ''), '[^A-Z0-9]', '', 'g')) AS reg
      FROM   gate_events
      WHERE  warehouse_id = ${warehouseId}
        AND  vehicle_reg IS NOT NULL
        AND  occurred_at >= ${filterFrom}
        AND  occurred_at <= ${filterTo}
    ),
    paired AS (
      SELECT x.occurred_at AS exit_at,
             (SELECT MAX(e.occurred_at)
                FROM norm e
               WHERE e.reg = x.reg
                 AND e.event_type::text LIKE '%_entry'
                 AND e.occurred_at <= x.occurred_at) AS entry_at
      FROM   norm x
      WHERE  x.event_type::text LIKE '%_exit'
    )
    SELECT EXTRACT(EPOCH FROM (exit_at - entry_at))/60.0 AS mins
    FROM   paired
    WHERE  entry_at IS NOT NULL
      AND  exit_at - entry_at BETWEEN INTERVAL '0' AND INTERVAL '24 hours'
  `;
  const buckets = { lt1h: 0, h1_4: 0, h4_8: 0, h8_12: 0, gt12h: 0 };
  let dwellSum = 0; let dwellCount = 0;
  const dwellMins: number[] = [];
  for (const r of dwellRows) {
    const m = asNum(r.mins);
    if (m <= 0) continue;
    dwellSum += m; dwellCount += 1; dwellMins.push(m);
    if (m < 60) buckets.lt1h++;
    else if (m < 240) buckets.h1_4++;
    else if (m < 480) buckets.h4_8++;
    else if (m < 720) buckets.h8_12++;
    else buckets.gt12h++;
  }
  dwellMins.sort((a, b) => a - b);
  const avgDwellMin    = dwellCount ? dwellSum / dwellCount : 0;
  const medianDwellMin = dwellCount ? dwellMins[Math.floor(dwellMins.length / 2)] : 0;

  // ── Driver / vehicle / contractor totals + breakdowns ────────────────────
  // All driver KPIs are scoped to drivers seen in this warehouse so they
  // match what the manager-page shows (warehouse-intersection, not org-wide).
  const totalDrivers = warehouseDriverIds.length;

  // Compute expired/expiring from the actual dl_expiry date so numbers match
  // the manager page (which also computes live via daysUntil(d.dlExpiry)).
  // `blocked` (no-transport, fake, suspended) stays from dl_status.
  const dlBreakdown = warehouseDriverIds.length > 0 ? await db<Row[]>`
    SELECT
      COUNT(*) FILTER (
        WHERE dl_expiry IS NOT NULL AND dl_expiry::date < CURRENT_DATE
      )::int AS expired,
      COUNT(*) FILTER (
        WHERE dl_expiry IS NOT NULL
          AND dl_expiry::date >= CURRENT_DATE
          AND dl_expiry::date <= CURRENT_DATE + INTERVAL '30 days'
      )::int AS expiring,
      COUNT(*) FILTER (WHERE dl_status = 'blocked')::int AS blocked,
      COUNT(*) FILTER (
        WHERE dl_status <> 'blocked'
          AND (dl_expiry IS NULL OR dl_expiry::date > CURRENT_DATE + INTERVAL '30 days')
      )::int AS clear
    FROM drivers
    WHERE org_id = ${ORG_ID}
      AND id = ANY(${warehouseDriverIds})
  ` : [];
  const dl = { clear: 0, expiring: 0, expired: 0, blocked: 0 };
  if (dlBreakdown.length > 0) {
    dl.expired  = asNum(dlBreakdown[0].expired);
    dl.expiring = asNum(dlBreakdown[0].expiring);
    dl.blocked  = asNum(dlBreakdown[0].blocked);
    dl.clear    = asNum(dlBreakdown[0].clear);
  }

  const bgBreakdown = warehouseDriverIds.length > 0 ? await db<Row[]>`
    SELECT bg_status, COUNT(*)::int AS n
    FROM   drivers
    WHERE  org_id = ${ORG_ID}
      AND  id = ANY(${warehouseDriverIds})
    GROUP  BY bg_status
  ` : [];
  const bg = { clear: 0, pending: 0, flagged: 0, recheck_required: 0, failed: 0 };
  for (const r of bgBreakdown) {
    (bg as Record<string, number>)[String(r.bg_status)] = asNum(r.n);
  }

  // Non-Transport DL: run the same validateDl() logic used by the manager page
  // so the count here always matches what managers see in /manager/drivers.
  const dlEventRows = await db<Row[]>`
    SELECT DISTINCT ON (ge.driver_id)
      ge.driver_id,
      ge.metadata -> 'dlVerifyData' AS dl_verify_data
    FROM gate_events ge
    WHERE ge.warehouse_id = ${warehouseId}
      AND ge.driver_id    IS NOT NULL
      AND ge.metadata     ? 'dlVerifyData'
      AND ge.occurred_at  >= ${filterFrom}
      AND ge.occurred_at  <= ${filterTo}
    ORDER BY ge.driver_id, ge.occurred_at DESC
  `;
  let nonTransportDl = 0;
  for (const row of dlEventRows) {
    try {
      const dvd = row.dl_verify_data as { provider?: string; data?: Record<string, unknown> } | null;
      if (!dvd?.provider || !dvd?.data) continue;
      const normalized = translateDlResponse(dvd.provider, dvd.data);
      const validation = validateDl(normalized, "");
      if (validation.status === "invalid_personal_only") nonTransportDl++;
    } catch {
      // unknown provider — skip
    }
  }

  // totalVehicles is resolved after vehicleCompliance query below; placeholder here.
  // Will be set from vehicleCompliance.total to match manager page's "Total fleet".
  let totalVehicles = uniqVehicles; // updated below after vehicleCompliance query

  const totalContractorsRow = await db<Row[]>`SELECT COUNT(*)::int AS n FROM contractors WHERE org_id = ${ORG_ID} AND is_active = true`;
  const totalContractors = asNum(totalContractorsRow[0].n);

  // ── Alerts: distribution by type + severity, plus a recent sample list ───
  const alertDist = await db<Row[]>`
    SELECT type, severity, COUNT(*)::int AS n
    FROM   alerts
    WHERE  org_id = ${ORG_ID}
      AND  (warehouse_id = ${warehouseId} OR warehouse_id IS NULL)
      AND  created_at >= ${filterFrom}
      AND  created_at <= ${filterTo}
    GROUP  BY type, severity
    ORDER  BY n DESC
  `;

  // ── DL Mismatch at Exit: pair every exit event back to its entry event
  //    and surface rows where the DL number on entry ≠ DL number on exit. ──
  const dlMismatchRows = await db<Row[]>`
    WITH ex AS (
      SELECT id, occurred_at, vehicle_reg, person_name,
             metadata->>'dlNumber'      AS dl_number,
             metadata->>'entryEventId'  AS entry_event_id
      FROM   gate_events
      WHERE  warehouse_id = ${warehouseId}
        AND  event_type::text LIKE '%_exit'
        AND  occurred_at >= ${filterFrom}
        AND  occurred_at <= ${filterTo}
    ),
    en AS (
      SELECT id, occurred_at, vehicle_reg, person_name,
             metadata->>'dlNumber' AS dl_number
      FROM   gate_events
      WHERE  warehouse_id = ${warehouseId}
        AND  event_type::text LIKE '%_entry'
        AND  occurred_at >= ${filterFrom}
        AND  occurred_at <= ${filterTo}
    )
    SELECT
      en.occurred_at      AS in_at,
      ex.occurred_at      AS out_at,
      en.person_name      AS in_name,
      ex.person_name      AS out_name,
      en.dl_number        AS in_dl,
      ex.dl_number        AS out_dl,
      COALESCE(ex.vehicle_reg, en.vehicle_reg) AS vehicle_reg
    FROM ex
    JOIN en ON en.id = ex.entry_event_id
    WHERE en.dl_number IS NOT NULL
      AND ex.dl_number IS NOT NULL
      AND en.dl_number <> ex.dl_number
    ORDER BY ex.occurred_at DESC
    LIMIT 50
  `;
  const fmtTs = (d: Date): string => {
    const day = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
    const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
    return `${day} · ${time}`;
  };
  const dlMismatches = dlMismatchRows.map((r) => ({
    inAt:    r.in_at  ? fmtTs(new Date(r.in_at  as string)) : "—",
    outAt:   r.out_at ? fmtTs(new Date(r.out_at as string)) : "—",
    name:    (r.out_name as string) || (r.in_name as string) || "—",
    inDL:    (r.in_dl  as string) || "—",
    outDL:   (r.out_dl as string) || "—",
    vehicle: (r.vehicle_reg as string) || "—",
  }));

  const recentAlerts = await db<Row[]>`
    SELECT id, type, severity, status, message, entity_type, entity_id,
           metadata, created_at
    FROM   alerts
    WHERE  org_id = ${ORG_ID}
      AND  (warehouse_id = ${warehouseId} OR warehouse_id IS NULL)
      AND  created_at >= ${filterFrom}
      AND  created_at <= ${filterTo}
    ORDER  BY created_at DESC
    LIMIT  20
  `;

  // ── Driver risk list — drivers with bg_status='flagged' enriched with
  //    case counts (best-effort) extracted from the most recent gate_event
  //    metadata.crimeCheckData for that driver. ──────────────────────────
  const flaggedDrivers = warehouseDriverIds.length > 0 ? await db<Row[]>`
    SELECT d.id, d.full_name, d.dl_number, d.contractor_id,
           c.name AS contractor_name
    FROM   drivers d
    LEFT   JOIN contractors c ON c.id = d.contractor_id
    WHERE  d.org_id    = ${ORG_ID}
      AND  d.id        = ANY(${warehouseDriverIds})
      AND  d.bg_status = 'flagged'
    ORDER  BY d.full_name
  ` : [];

  const driverRisk: Array<{ name: string; dl: string; provider: string; cases: number; risk: string }> = [];
  if (flaggedDrivers.length > 0) {
    const driverIds = flaggedDrivers.map((r) => r.id as string);
    // Look across ALL warehouses for the most-recent gate event that has
    // actual crimeCheckData (not JSON null). Drivers are re-screened on every
    // entry so the crime data lives on whichever event triggered the check —
    // not necessarily the most recent TRICHY event.
    const caseRows = await db<Row[]>`
      SELECT DISTINCT ON (driver_id)
             driver_id,
             COALESCE(
               NULLIF(jsonb_array_length(metadata #> '{crimeCheckData,pollData,caseDetails}'), 0),
               (metadata #>> '{crimeCheckData,pollData,totalCases}')::int,
               (metadata #>> '{crimeCheckData,pollData,numberOfCases}')::int,
               (metadata #>> '{crimeCheckData,pollData,total}')::int,
               0
             ) AS total_cases,
             metadata #>> '{crimeCheckData,pollData,riskType}' AS risk_type
      FROM   gate_events
      WHERE  driver_id = ANY(${driverIds})
        AND  metadata ? 'crimeCheckData'
        AND  jsonb_typeof(metadata -> 'crimeCheckData') <> 'null'
      ORDER  BY driver_id, occurred_at DESC
    `;
    const caseMap = new Map<string, { cases: number; riskType: string | null }>();
    for (const r of caseRows) {
      caseMap.set(String(r.driver_id), {
        cases: asNum(r.total_cases),
        riskType: (r.risk_type as string | null) ?? null,
      });
    }
    const rank = (cases: number, rt: string | null): { risk: string; weight: number } => {
      const t = (rt || "").toLowerCase().trim();
      // Use case count as primary tier signal; riskType only escalates when explicit.
      // t.includes("high") was wrong — it matched "high risk" AND "very high risk" both
      // into Very High Risk, inflating the count.
      if (cases >= 5 || t === "very high risk") return { risk: "Very High Risk", weight: 0 };
      if (cases >= 3 || t === "high risk")      return { risk: "High Risk",      weight: 1 };
      if (cases >= 1 || t === "average risk")   return { risk: "Average Risk",   weight: 2 };
      return { risk: "Low Risk", weight: 3 };
    };
    for (const d of flaggedDrivers) {
      const meta = caseMap.get(d.id as string) ?? { cases: 0, riskType: null };
      const { risk } = rank(meta.cases, meta.riskType);
      driverRisk.push({
        name: String(d.full_name),
        dl: String(d.dl_number),
        provider: (d.contractor_name as string | null) ?? "Not Available",
        cases: meta.cases,
        risk,
      });
    }
    // Sort by cases descending — drivers with most court cases appear first.
    // Risk level is a secondary tiebreaker only when cases are equal.
    driverRisk.sort((a, b) => {
      if (b.cases !== a.cases) return b.cases - a.cases;
      const order = ["Very High Risk", "High Risk", "Average Risk", "Low Risk"];
      return order.indexOf(a.risk) - order.indexOf(b.risk);
    });
  }

  // ── Contractor mix: entries / drivers / vehicles per contractor (from
  //    gate_events) — joined with drivers-table flag counts grouped by
  //    contractor_id (from drivers). Non-transport DL is detected by
  //    inspecting metadata.dlVerifyData for absence of a TRANS / LMV-TR
  //    cov entry on the most recent gate_event for each driver. ─────────
  const contractorMix = await db<Row[]>`
    WITH
    -- Build a map of every merged contractor: old_id → new (active) id.
    -- This lets us transparently remap gate events that still carry a
    -- soft-deleted contractor ID (from before the merge was run or before
    -- the gate-event patch ran).
    contractor_map AS (
      SELECT
        resource_id                  AS old_id,
        payload->>'targetId'         AS new_id
      FROM audit_events
      WHERE action = 'contractor.merged'
    ),
    -- Attach a canonical contractor ID to every gate event.
    -- Priority: merge-map > metadata.contractorIds[0] > NULL (untagged).
    norm_ge AS (
      SELECT
        ge.event_type,
        ge.driver_id,
        ge.vehicle_reg,
        ge.contractor_name,
        COALESCE(
          cm.new_id,
          (ge.metadata #>> '{contractorIds,0}')::text
        ) AS contractor_id
      FROM gate_events ge
      LEFT JOIN contractor_map cm
        ON cm.old_id = (ge.metadata #>> '{contractorIds,0}')::text
      WHERE ge.warehouse_id = ${warehouseId}
        AND ge.occurred_at >= ${filterFrom}
        AND ge.occurred_at <= ${filterTo}
    ),
    ge_mix AS (
      SELECT
        contractor_id,
        mode() WITHIN GROUP (ORDER BY contractor_name)            AS fallback_name,
        COUNT(*) FILTER (WHERE event_type::text LIKE '%_entry')::int AS entries,
        COUNT(DISTINCT driver_id)::int                            AS drivers,
        COUNT(DISTINCT vehicle_reg)::int                          AS vehicles
      FROM norm_ge
      GROUP BY
        contractor_id,
        -- For untagged events (no ID) keep names separate so distinct
        -- providers don't collapse into one anonymous bucket.
        CASE WHEN contractor_id IS NULL THEN contractor_name ELSE NULL END
    ),
    driver_flags AS (
      SELECT
        d.contractor_id,
        COUNT(*) FILTER (WHERE d.bg_status = 'flagged')::int AS court_flagged,
        COUNT(*) FILTER (WHERE d.dl_status = 'expired')::int AS expired_dl,
        COUNT(*) FILTER (WHERE d.dl_status = 'blocked')::int AS invalid_dl,
        COUNT(*) FILTER (WHERE d.dl_status = 'expiring')::int AS expiring_dl
      FROM drivers d
      WHERE d.org_id = ${ORG_ID} AND d.contractor_id IS NOT NULL
      GROUP BY d.contractor_id
    ),
    -- non-transport DL: most-recent gate event per driver where the DL
    -- has NO transport-validity expiry on file (i.e. licence never carried
    -- a transport endorsement; expired transport DLs are in their own
    -- bucket). Group by drivers.contractor_id so the count is reliable
    -- even when metadata.contractorIds[0] is null on the latest event.
    last_dl AS (
      SELECT DISTINCT ON (ge.driver_id)
        ge.driver_id,
        ge.metadata #>> '{dlVerifyData,data,result,dlValidity,transport,to}'         AS t_to_parivahan,
        ge.metadata #>> '{dlVerifyData,data,result,source_output,t_validity_to}'      AS t_to_idfy
      FROM gate_events ge
      WHERE ge.warehouse_id = ${warehouseId}
        AND  ge.driver_id IS NOT NULL
        AND  ge.occurred_at >= ${filterFrom}
        AND  ge.occurred_at <= ${filterTo}
      ORDER BY ge.driver_id, ge.occurred_at DESC
    ),
    non_trans AS (
      SELECT
        d.contractor_id,
        COUNT(*) FILTER (
          WHERE COALESCE(NULLIF(TRIM(l.t_to_parivahan), ''), NULLIF(TRIM(l.t_to_idfy), '')) IS NULL
        )::int AS non_transport_dl
      FROM last_dl l
      JOIN drivers d ON d.id = l.driver_id
      WHERE d.org_id = ${ORG_ID} AND d.contractor_id IS NOT NULL
      GROUP BY d.contractor_id
    )
    SELECT
      COALESCE(c.name, m.fallback_name)                    AS provider,
      m.contractor_id                                       AS contractor_id,
      c.created_at                                          AS created_at,
      m.entries                                             AS entries,
      m.drivers                                             AS drivers,
      m.vehicles                                            AS vehicles,
      COALESCE(f.court_flagged,    0)                       AS court_flagged,
      COALESCE(f.expired_dl,       0)                       AS expired_dl,
      COALESCE(f.invalid_dl,       0)                       AS invalid_dl,
      COALESCE(f.expiring_dl,      0)                       AS expiring_dl,
      COALESCE(n.non_transport_dl, 0)                       AS non_transport_dl
    FROM ge_mix m
    LEFT JOIN contractors c   ON c.id = m.contractor_id
    LEFT JOIN driver_flags f  ON f.contractor_id = m.contractor_id
    LEFT JOIN non_trans n     ON n.contractor_id = m.contractor_id
    -- Skip rows with no contractor mapping at all (i.e. truly untagged
    -- entries) so the report never surfaces an "(Untagged)" provider.
    WHERE COALESCE(c.name, m.fallback_name) IS NOT NULL
      AND COALESCE(c.name, m.fallback_name) <> ''
    ORDER BY m.entries DESC
    LIMIT 60
  `;
  const contractorList = contractorMix.map((r) => ({
    name:             String(r.provider),
    contractor_id:    (r.contractor_id as string | null) ?? null,
    created_at:       (r.created_at as string | null) ?? null,
    is_new:           r.created_at
                        ? new Date(r.created_at as string) >= firstEvent
                        : false,
    entries:          asNum(r.entries),
    drivers:          asNum(r.drivers),
    vehicles:         asNum(r.vehicles),
    court_flagged:    asNum(r.court_flagged),
    expired_dl:       asNum(r.expired_dl),
    invalid_dl:       asNum(r.invalid_dl),
    expiring_dl:      asNum(r.expiring_dl),
    non_transport_dl: asNum(r.non_transport_dl),
  }));

  // ── Vehicle Intel — per-vehicle entry count, RC status, last-seen ─────────
  const vehicleIntelRows = await db<Row[]>`
    WITH ge_agg AS (
      SELECT
        upper(regexp_replace(vehicle_reg, '[^A-Z0-9]', '', 'g')) AS norm_reg,
        -- pick the most-frequent raw form as the display reg
        mode() WITHIN GROUP (ORDER BY vehicle_reg)               AS raw_reg,
        COUNT(*) FILTER (WHERE event_type::text LIKE '%_entry')::int AS entries,
        COUNT(*) FILTER (WHERE event_type::text LIKE '%_exit')::int  AS exits,
        MAX(occurred_at)                                              AS last_seen,
        mode() WITHIN GROUP (ORDER BY contractor_name)               AS contractor_name
      FROM gate_events
      WHERE warehouse_id = ${warehouseId}
        AND vehicle_reg IS NOT NULL
        AND occurred_at >= ${filterFrom}
        AND occurred_at <= ${filterTo}
      GROUP BY norm_reg
    )
    SELECT
      COALESCE(v.registration_number, g.raw_reg)  AS registration,
      v.vehicle_type                               AS vehicle_type,
      v.owner_type                                 AS owner_type,
      v.rc_expiry                                  AS rc_expiry,
      v.insurance_expiry                           AS insurance_expiry,
      v.fitness_expiry                             AS fitness_expiry,
      v.puc_expiry                                 AS puc_expiry,
      g.entries,
      g.exits,
      g.last_seen,
      g.contractor_name
    FROM ge_agg g
    LEFT JOIN vehicles v
      ON upper(regexp_replace(v.registration_number, '[^A-Z0-9]', '', 'g')) = g.norm_reg
      AND v.org_id = ${ORG_ID}
    ORDER BY g.entries DESC
    LIMIT 200
  `;

  const flagDate = (d: unknown): string => {
    if (!d) return "unknown";
    const days = Math.floor((new Date(d as string).getTime() - Date.now()) / 86400000);
    if (days < 0) return "expired";
    if (days <= 30) return "expiring";
    return "valid";
  };

  const vehicleIntel = vehicleIntelRows.map((r) => {
    const rcExpiry  = r.rc_expiry ? new Date(r.rc_expiry as string) : null;
    const lastSeen  = r.last_seen ? new Date(r.last_seen as string) : null;
    const rcFlag    = flagDate(r.rc_expiry);
    const insFlag   = flagDate(r.insurance_expiry);
    const fitFlag   = flagDate(r.fitness_expiry);
    const pucFlag   = flagDate(r.puc_expiry);
    // Worst-of: rc / insurance / fitness / puc — surface the most severe
    const worstOrder = ["expired", "expiring", "valid", "unknown"];
    const worstFlag = [rcFlag, insFlag, fitFlag, pucFlag].sort(
      (a, b) => worstOrder.indexOf(a) - worstOrder.indexOf(b)
    )[0];
    return {
      registration:      String(r.registration),
      vehicle_type:      (r.vehicle_type as string | null) ?? null,
      owner_type:        (r.owner_type   as string | null) ?? null,
      rc_expiry:         rcExpiry ? isoDate(rcExpiry) : null,
      rc_flag:           rcFlag,
      ins_flag:          insFlag,
      puc_flag:          pucFlag,
      fit_flag:          fitFlag,
      compliance_flag:   worstFlag,
      entries:           asNum(r.entries),
      exits:             asNum(r.exits),
      last_seen:         lastSeen ? isoDate(lastSeen) : null,
      provider:          (r.contractor_name as string | null) ?? null,
    };
  });

  // RC status summary (MV Tax)
  const rcSummary = { valid: 0, expiring: 0, expired: 0, unknown: 0 };
  for (const v of vehicleIntel) {
    (rcSummary as Record<string, number>)[v.rc_flag] =
      ((rcSummary as Record<string, number>)[v.rc_flag] ?? 0) + 1;
  }

  // ── Vehicle compliance stats: ALL vehicles ever seen at this warehouse ───
  // Mirrors getVehiclesByWarehouse() + calculateVehicleComplianceStats() so
  // numbers match the manager/vehicles page exactly. No date-window filter —
  // the vehicle registry is not time-scoped. No LIMIT — we need every vehicle.
  const vehicleComplianceRow = await db<Row[]>`
    WITH wh_regs AS (
      SELECT DISTINCT
        upper(regexp_replace(vehicle_reg, '[^A-Z0-9]', '', 'g')) AS norm_reg
      FROM gate_events
      WHERE warehouse_id = ${warehouseId}
        AND vehicle_reg  IS NOT NULL
    )
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE v.rc_expiry        IS NOT NULL AND v.rc_expiry::date        < CURRENT_DATE)::int AS rc_expired,
      COUNT(*) FILTER (WHERE v.rc_expiry        IS NOT NULL AND v.rc_expiry::date        >= CURRENT_DATE
                                                            AND v.rc_expiry::date        <= CURRENT_DATE + INTERVAL '30 days')::int AS rc_exp30,
      COUNT(*) FILTER (WHERE v.puc_expiry       IS NOT NULL AND v.puc_expiry::date       < CURRENT_DATE)::int AS puc_expired,
      COUNT(*) FILTER (WHERE v.puc_expiry       IS NOT NULL AND v.puc_expiry::date       >= CURRENT_DATE
                                                            AND v.puc_expiry::date       <= CURRENT_DATE + INTERVAL '30 days')::int AS puc_exp30,
      COUNT(*) FILTER (WHERE v.insurance_expiry IS NOT NULL AND v.insurance_expiry::date < CURRENT_DATE)::int AS ins_expired,
      COUNT(*) FILTER (WHERE v.insurance_expiry IS NOT NULL AND v.insurance_expiry::date >= CURRENT_DATE
                                                            AND v.insurance_expiry::date <= CURRENT_DATE + INTERVAL '30 days')::int AS ins_exp30,
      COUNT(*) FILTER (WHERE v.fitness_expiry   IS NOT NULL AND v.fitness_expiry::date   < CURRENT_DATE)::int AS fit_expired,
      COUNT(*) FILTER (WHERE v.fitness_expiry   IS NOT NULL AND v.fitness_expiry::date   >= CURRENT_DATE
                                                            AND v.fitness_expiry::date   <= CURRENT_DATE + INTERVAL '30 days')::int AS fit_exp30
    FROM wh_regs r
    LEFT JOIN vehicles v
      ON  upper(regexp_replace(v.registration_number, '[^A-Z0-9]', '', 'g')) = r.norm_reg
      AND v.org_id = ${ORG_ID}
  `;
  const vc = vehicleComplianceRow[0] ?? {};
  const vehicleCompliance = {
    total:       asNum(vc.total),
    rc_expired:  asNum(vc.rc_expired),
    rc_exp30:    asNum(vc.rc_exp30),
    puc_expired: asNum(vc.puc_expired),
    puc_exp30:   asNum(vc.puc_exp30),
    ins_expired: asNum(vc.ins_expired),
    ins_exp30:   asNum(vc.ins_exp30),
    fit_expired: asNum(vc.fit_expired),
    fit_exp30:   asNum(vc.fit_exp30),
  };
  // Now that we have the all-time fleet count, update totalVehicles to match
  // the manager page's "Total fleet" stat (vehicles.length from getVehiclesByWarehouse).
  totalVehicles = vehicleCompliance.total;

  // ── Compliance summary (DL valid / invalid / expired) ────────────────────
  const compliance = {
    valid:    dl.clear,
    invalid:  dl.blocked,
    expiring: dl.expiring,
    expired:  dl.expired,
  };

  // Compliance matrix bars: derived percentages from live data
  const dlValidPct      = totalDrivers ? (dl.clear / totalDrivers) * 100 : 0;
  const bgClearPct      = totalDrivers ? (bg.clear / totalDrivers) * 100 : 0;
  const exitCoveragePct = totalEntries ? (totalExits / totalEntries) * 100 : 0;
  // Vehicle docs coverage: derived from vehicleIntel (already warehouse-scoped)
  const vehicleDocsTotal = vehicleIntel.length;
  const vehicleDocsValid = vehicleIntel.filter(v => v.rc_flag === "valid").length;
  const vehicleDocsPct   = vehicleDocsTotal ? (vehicleDocsValid / vehicleDocsTotal) * 100 : 0;
  const contractorTagRow = await db<Row[]>`
    SELECT
      SUM(CASE WHEN metadata ? 'contractorIds'
                 AND jsonb_typeof(metadata->'contractorIds') = 'array'
                 AND jsonb_array_length(metadata->'contractorIds') > 0
              THEN 1 ELSE 0 END)::int AS tagged,
      COUNT(*)::int                    AS total
    FROM gate_events
    WHERE warehouse_id = ${warehouseId}
      AND event_type::text LIKE '%_entry'
      AND occurred_at >= ${filterFrom}
      AND occurred_at <= ${filterTo}
  `;
  const contractorTagPct = asNum(contractorTagRow[0].total)
    ? (asNum(contractorTagRow[0].tagged) / asNum(contractorTagRow[0].total)) * 100
    : 0;
  const faceMatchRow = warehouseDriverIds.length > 0 ? await db<Row[]>`
    SELECT COUNT(*) FILTER (WHERE face_photo_url IS NOT NULL)::int AS with_photo,
           COUNT(*)::int                                            AS total
    FROM   drivers
    WHERE  org_id = ${ORG_ID}
      AND  id = ANY(${warehouseDriverIds})
  ` : [{ with_photo: 0, total: 0 }];
  const faceMatchPct = asNum(faceMatchRow[0].total)
    ? (asNum(faceMatchRow[0].with_photo) / asNum(faceMatchRow[0].total)) * 100
    : 0;

  // ── Incidents totals ─────────────────────────────────────────────────────
  const incRow = await db<Row[]>`
    SELECT
      COUNT(*)                                                ::int AS total,
      COUNT(*) FILTER (WHERE status IN ('open','investigating'))::int AS open,
      COUNT(*) FILTER (WHERE status IN ('resolved','closed'))::int    AS closed
    FROM incidents
    WHERE org_id = ${ORG_ID}
      AND (warehouse_id = ${warehouseId} OR warehouse_id IS NULL)
      AND created_at >= ${filterFrom}
      AND created_at <= ${filterTo}
  `;

  // ── Efficiency time series: per-day exit-rate (exits/entries) % ─────────
  const efficiency = daily.map((d) => ({
    label: d.label,
    pct: d.entries > 0 ? Math.round((d.exits / d.entries) * 100) : 0,
    violations: 0, // placeholder — alerts are filed against incidents, not days
  }));
  // Violations per day from alerts.created_at
  const violationsRows = await db<Row[]>`
    SELECT date_trunc('day', created_at AT TIME ZONE 'Asia/Kolkata')::date AS day,
           COUNT(*)::int AS n
    FROM   alerts
    WHERE  org_id = ${ORG_ID}
      AND  (warehouse_id = ${warehouseId} OR warehouse_id IS NULL)
      AND  created_at >= ${filterFrom}
      AND  created_at <= ${filterTo}
    GROUP  BY day
  `;
  const vMap = new Map<string, number>();
  for (const r of violationsRows) vMap.set(isoDate(new Date(r.day as string)), asNum(r.n));
  for (let i = 0; i < efficiency.length; i++) {
    efficiency[i].violations = vMap.get(daily[i].date) ?? 0;
  }

  // ── Counts derived for the hero cards ────────────────────────────────────
  const courtRecordCount = bg.flagged;
  // Headline count of unique flagged drivers. Excludes bg.failed
  // (failed-verification rows are noise in this report — they almost
  // always represent provider-side BG-check errors, not actual driver
  // risk).
  const flaggedDriverCount = dl.blocked + dl.expired + bg.flagged + nonTransportDl;
  const screenedCount = uniqDrivers || totalDrivers;
  const flaggedPct = screenedCount ? (flaggedDriverCount / screenedCount) * 100 : 0;

  // ── Top 10 most-frequent drivers at this warehouse ───────────────────────
  const topDriverRows = await db<Row[]>`
    SELECT
      d.full_name                                            AS name,
      d.dl_number                                            AS dl,
      c.name                                                 AS contractor_name,
      COUNT(*) FILTER (WHERE ge.event_type::text LIKE '%_entry')::int AS visits
    FROM gate_events ge
    JOIN drivers d ON d.id = ge.driver_id
    LEFT JOIN contractors c ON c.id = d.contractor_id
    WHERE ge.warehouse_id = ${warehouseId}
      AND ge.driver_id    IS NOT NULL
      AND ge.occurred_at  >= ${filterFrom}
      AND ge.occurred_at  <= ${filterTo}
    GROUP BY d.id, d.full_name, d.dl_number, c.name
    ORDER BY visits DESC
    LIMIT 10
  `;
  const topDrivers = topDriverRows.map(r => ({
    name:     String(r.name),
    dl:       String(r.dl),
    provider: (r.contractor_name as string | null) ?? "Not Available",
    visits:   asNum(r.visits),
  }));

  const payload = {
    generated_at: new Date().toISOString(),
    org: {
      id: org.id,
      name: org.name,
      short_code: org.short_code,
      city: org.city,
      state: org.state,
    },
    warehouse: {
      id: warehouse.id,
      name: warehouse.name,
      code: warehouse.code,
      city: warehouse.city,
      state: warehouse.state,
      region: warehouse.region,
    },
    window: (() => {
      // IST = UTC+5:30. Format last-event time as a friendly 12-hour
      // string ("10:23 AM IST") that non-technical readers grok at a glance.
      const istOffsetMs = 5.5 * 60 * 60 * 1000;
      const istLast = new Date(lastEvent.getTime() + istOffsetMs);
      const h24 = istLast.getUTCHours();
      const mm  = String(istLast.getUTCMinutes()).padStart(2, "0");
      const ampm = h24 >= 12 ? "PM" : "AM";
      const h12 = ((h24 + 11) % 12) + 1;
      const lastEventLabel = `${h12}:${mm} ${ampm} IST`;
      const updatedLabel   = `Updated ${lastEventLabel}`;
      // When a date filter is active, show filtered range; otherwise show live window.
      const isFiltered = fromParam || toParam;
      const labelFrom  = isFiltered ? filterFrom : firstEvent;
      const labelTo    = isFiltered ? filterTo   : lastEvent;
      const labelPrefix = isFiltered ? "Filtered ·" : "Live ·";
      return {
        first_event: firstEvent.toISOString(),
        last_event:  lastEvent.toISOString(),
        label: dailyRows.length
          ? `${labelPrefix} ${fmtDayLabel(labelFrom)} – ${fmtDayLabel(labelTo)} ${labelTo.getUTCFullYear()} · updated ${lastEventLabel}`
          : "No data yet",
        last_event_label: lastEventLabel,
        updated_label:    updatedLabel,
        days: daily.length,
      };
    })(),
    kpis: {
      gate_events_total: totalEntries + totalExits,
      total_entries:     totalEntries,
      total_exits:       totalExits,
      inside_now:        insideNow,
      unique_vehicles:   uniqVehicles,
      unique_drivers:    uniqDrivers,
      unique_dls:        uniqDls,
      total_drivers:     totalDrivers,
      total_vehicles:    totalVehicles,
      total_contractors: totalContractors,
      dl: { ...dl, non_transport: nonTransportDl },
      bg,
      compliance,
      court_records:        courtRecordCount,
      flagged_drivers:      flaggedDriverCount,
      screened_count:       screenedCount,
      flagged_pct:          Number(flaggedPct.toFixed(1)),
      avg_dwell_minutes:    Math.round(avgDwellMin),
      median_dwell_minutes: Math.round(medianDwellMin),
      dwell_paired_count:   dwellCount,
      incidents: {
        total:  asNum(incRow[0].total),
        open:   asNum(incRow[0].open),
        closed: asNum(incRow[0].closed),
      },
    },
    daily,
    delay_buckets: [
      { label: "< 1 h",  count: buckets.lt1h  },
      { label: "1–4 h",  count: buckets.h1_4  },
      { label: "4–8 h",  count: buckets.h4_8  },
      { label: "8–12 h", count: buckets.h8_12 },
      { label: "> 12 h", count: buckets.gt12h },
    ],
    compliance_matrix: {
      dl_validity_pct:        Number(dlValidPct.toFixed(1)),
      bg_coverage_pct:        Number(bgClearPct.toFixed(1)),
      vehicle_docs_pct:       Number(vehicleDocsPct.toFixed(1)),
      contractor_tagging_pct: Number(contractorTagPct.toFixed(1)),
      exit_capture_pct:       Number(exitCoveragePct.toFixed(1)),
      face_match_ready_pct:   Number(faceMatchPct.toFixed(1)),
    },
    efficiency,
    alert_distribution: alertDist.map((r) => ({
      type:     String(r.type),
      severity: String(r.severity),
      count:    asNum(r.n),
    })),
    recent_alerts: recentAlerts.map((r) => ({
      id:          r.id,
      type:        r.type,
      severity:    r.severity,
      status:      r.status,
      message:     r.message,
      entity_type: r.entity_type,
      created_at:  r.created_at,
      metadata:    r.metadata,
    })),
    driver_risk: driverRisk,
    contractors: contractorList,
    top_drivers: topDrivers,
    dl_mismatches: dlMismatches,
    vehicle_intel: vehicleIntel,
    vehicle_rc_summary: rcSummary,
    vehicle_compliance: vehicleCompliance,
  };

  const res = NextResponse.json(payload, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
  return applySecurityHeaders(res);
}
