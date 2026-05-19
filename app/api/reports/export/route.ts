/**
 * GET /api/reports/export
 *
 * Streams a CSV export of audit_events or gate_events from Supabase.
 *
 * Query params:
 *   type=audit|gate   (required)
 *   warehouseId=      (required)
 *   from=ISO-date     (optional, default: 7 days ago)
 *   to=ISO-date       (optional, default: now)
 */

import { NextRequest } from "next/server";
import { db } from "@/app/_server/db/client";

function escapeCsv(val: unknown): string {
  const str = val === null || val === undefined ? "" : String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n"))
    return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function rowToCsv(fields: unknown[]): string {
  return fields.map(escapeCsv).join(",") + "\r\n";
}

const PAGE_SIZE = 500;

export async function GET(req: NextRequest) {
  const url  = new URL(req.url);
  const type = url.searchParams.get("type") ?? "audit";
  const whId = url.searchParams.get("warehouseId");
  const from = url.searchParams.get("from");
  const to   = url.searchParams.get("to");

  if (!whId) return new Response("warehouseId is required", { status: 400 });

  const fromDate = from ? new Date(from) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const toDate   = to   ? new Date(to)   : new Date();

  const headers = type === "gate"
    ? ["id", "eventType", "vehicleReg", "personName", "guardName", "time", "status"]
    : ["id", "action", "actorRole", "resourceType", "resourceId", "warehouseId", "occurredAt"];

  const encoder = new TextEncoder();
  const stream  = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(rowToCsv(headers)));

      let offset = 0;
      while (true) {
        const rows = type === "gate"
          ? await db`
              SELECT id, event_type, vehicle_reg, person_name, guard_name, occurred_at, status
              FROM   gate_events
              WHERE  warehouse_id = ${whId}
                AND  occurred_at >= ${fromDate.toISOString()}
                AND  occurred_at <= ${toDate.toISOString()}
              ORDER  BY occurred_at DESC
              LIMIT  ${PAGE_SIZE} OFFSET ${offset}
            `
          : await db`
              SELECT id, action, actor_role, resource_type, resource_id, warehouse_id, occurred_at
              FROM   audit_events
              WHERE  warehouse_id = ${whId}
                AND  occurred_at >= ${fromDate.toISOString()}
                AND  occurred_at <= ${toDate.toISOString()}
              ORDER  BY occurred_at DESC
              LIMIT  ${PAGE_SIZE} OFFSET ${offset}
            `;

        if (!rows.length) break;

        for (const d of rows) {
          const row: unknown[] = type === "gate"
            ? [d.id, d.event_type, d.vehicle_reg, d.person_name, d.guard_name, d.occurred_at, d.status]
            : [d.id, d.action, d.actor_role, d.resource_type, d.resource_id, d.warehouse_id, d.occurred_at];
          controller.enqueue(encoder.encode(rowToCsv(row)));
        }

        if (rows.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }

      controller.close();
    },
  });

  const filename = `fleetguard_${type}_export_${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
