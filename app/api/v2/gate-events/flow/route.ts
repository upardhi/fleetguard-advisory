/**
 * GET /api/v2/gate-events/flow
 *
 * Server-side aggregation for the dashboard "Truck flow — N days" chart.
 *
 * Replaces the old approach of fetching the last 200 raw events and
 * client-side bucketing them — at busy warehouses 200 rows fit inside the
 * last 24 hours and earlier days were silently dropped, making the chart
 * look like it was showing "1 day only".
 *
 * Query params:
 *   warehouseId  required for non-wh_manager (wh_manager scope is forced)
 *   days         number of days back from today, default 14, max 90
 *
 * Returns { days: [{ dateStr, label, entries, exits }, ...] } — one row per
 * calendar day in IST (Asia/Kolkata), oldest first, including zero-count days.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/_server/db/client";
import { requireUser } from "@/app/_server/auth/getUser";
import { applySecurityHeaders } from "@/app/_server/security/headers";

const TRUCK_ENTRY_TYPES = [
  "inbound_entry",
  "outbound_entry",
  "contractor_entry",
];
const TRUCK_EXIT_TYPES = [
  "inbound_exit",
  "outbound_exit",
  "contractor_exit",
];

const MAX_DAYS = 90;
const TZ = "Asia/Kolkata";

export async function GET(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { searchParams } = new URL(req.url);
  const warehouseId = searchParams.get("warehouseId");
  const daysParam   = Number(searchParams.get("days") ?? 14);
  const days = Math.max(1, Math.min(MAX_DAYS, Number.isFinite(daysParam) ? Math.floor(daysParam) : 14));

  // wh_manager is locked to their assigned warehouse.
  const effectiveWarehouse = actor.role === "wh_manager"
    ? (await db`SELECT warehouse_id FROM users WHERE id = ${actor.sub} LIMIT 1`)[0]?.warehouse_id
    : warehouseId;

  if (actor.role === "wh_manager" && !effectiveWarehouse) {
    return applySecurityHeaders(NextResponse.json({ days: [] }));
  }

  // Aggregate in Postgres so we don't ship every row to the browser.
  // The IST date_trunc keeps the buckets aligned with how Indian users see
  // their day; gate_events.occurred_at is stored as timestamptz.
  const rows = await db`
    SELECT
      (date_trunc('day', occurred_at AT TIME ZONE ${TZ}))::date AS day,
      SUM(CASE WHEN event_type = ANY(${TRUCK_ENTRY_TYPES}) THEN 1 ELSE 0 END)::int AS entries,
      SUM(CASE WHEN event_type = ANY(${TRUCK_EXIT_TYPES})  THEN 1 ELSE 0 END)::int AS exits
    FROM   gate_events
    WHERE  org_id = ${actor.org}
      ${effectiveWarehouse ? db`AND warehouse_id = ${effectiveWarehouse}` : db``}
      AND  event_type = ANY(${[...TRUCK_ENTRY_TYPES, ...TRUCK_EXIT_TYPES]})
      AND  occurred_at >= (date_trunc('day', NOW() AT TIME ZONE ${TZ}) - (${days - 1} || ' days')::interval) AT TIME ZONE ${TZ}
    GROUP  BY day
    ORDER  BY day ASC
  `;

  // Build the full day window so missing days render as 0 instead of being absent.
  const byDay = new Map<string, { entries: number; exits: number }>();
  for (const r of rows as unknown as Array<{ day: Date | string; entries: number; exits: number }>) {
    const key = typeof r.day === "string" ? r.day.slice(0, 10) : r.day.toISOString().slice(0, 10);
    byDay.set(key, { entries: r.entries, exits: r.exits });
  }

  // Anchor on today in IST so labels match what the user sees.
  const todayIst = new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
  todayIst.setHours(0, 0, 0, 0);

  const out: Array<{ dateStr: string; label: string; entries: number; exits: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(todayIst);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const counts  = byDay.get(dateStr) ?? { entries: 0, exits: 0 };
    out.push({
      dateStr,
      label: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: TZ }),
      entries: counts.entries,
      exits:   counts.exits,
    });
  }

  return applySecurityHeaders(NextResponse.json({ days: out }));
}
