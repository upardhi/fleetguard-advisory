import { db } from "../app/_server/db/client";
type Row = Record<string, unknown>;

const ORG_ID = "019df10e-4a97-70b9-834a-47646365b491";

async function run() {
  const wh = await (db as unknown as (s: TemplateStringsArray) => Promise<Row[]>)`
    SELECT id FROM warehouses WHERE org_id = ${ORG_ID} AND name = 'TRICHY' LIMIT 1
  `;
  const warehouseId = wh[0].id as string;

  // What the manager/drivers page shows
  const managerDrivers = await (db as unknown as (s: TemplateStringsArray) => Promise<Row[]>)`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE bg_status = 'flagged')::int AS flagged,
           COUNT(*) FILTER (WHERE bg_status = 'pending')::int AS pending,
           COUNT(*) FILTER (WHERE bg_status = 'clear')::int   AS clear
    FROM drivers d
    WHERE org_id = ${ORG_ID}
      AND id IN (
        SELECT DISTINCT driver_id FROM gate_events
        WHERE warehouse_id = ${warehouseId} AND driver_id IS NOT NULL
      )
  `;
  console.log("Manager page driver counts (all-time warehouse scope):");
  console.log(JSON.stringify(managerDrivers[0], null, 2));

  // What the report shows (date-filtered warehouseDriverIds)
  const window = await (db as unknown as (s: TemplateStringsArray) => Promise<Row[]>)`
    SELECT MIN(occurred_at) AS first_event, MAX(occurred_at) AS last_event
    FROM gate_events WHERE warehouse_id = ${warehouseId}
  `;
  const filterFrom = new Date(window[0].first_event as string);
  const filterTo   = new Date(window[0].last_event  as string);

  const reportDriverIds = await (db as unknown as (s: TemplateStringsArray) => Promise<Row[]>)`
    SELECT DISTINCT driver_id FROM gate_events
    WHERE warehouse_id = ${warehouseId}
      AND driver_id IS NOT NULL
      AND occurred_at >= ${filterFrom}
      AND occurred_at <= ${filterTo}
  `;
  const ids = reportDriverIds.map(r => r.driver_id as string);

  const reportCounts = await (db as unknown as (s: TemplateStringsArray) => Promise<Row[]>)`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE bg_status = 'flagged')::int AS flagged
    FROM drivers
    WHERE org_id = ${ORG_ID} AND id = ANY(${ids})
  `;
  console.log("\nReport API driver counts (date-filtered):");
  console.log("  warehouseDriverIds:", ids.length);
  console.log(JSON.stringify(reportCounts[0], null, 2));

  // Unique distinct driver_ids in gate_events (uniqDrivers)
  const uniqDls = await (db as unknown as (s: TemplateStringsArray) => Promise<Row[]>)`
    SELECT COUNT(DISTINCT driver_id)::int AS uniq_drivers,
           COUNT(DISTINCT metadata->>'dlNumber')::int AS uniq_dls
    FROM gate_events
    WHERE warehouse_id = ${warehouseId}
      AND occurred_at >= ${filterFrom}
      AND occurred_at <= ${filterTo}
  `;
  console.log("\nGate events unique counts:");
  console.log(JSON.stringify(uniqDls[0], null, 2));

  await (db as unknown as { end: () => Promise<void> }).end();
}
run().catch(console.error);
