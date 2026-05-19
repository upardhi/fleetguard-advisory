import { db } from "../app/_server/db/client";
type Row = Record<string, unknown>;
const ORG_ID = "019df10e-4a97-70b9-834a-47646365b491";

async function run() {
  const q = db as unknown as (s: TemplateStringsArray, ...v: unknown[]) => Promise<Row[]>;
  const wh = await q`SELECT id FROM warehouses WHERE org_id = ${ORG_ID} AND name = 'TRICHY' LIMIT 1`;
  const warehouseId = wh[0].id as string;

  const ids = (await q`
    SELECT DISTINCT driver_id FROM gate_events
    WHERE warehouse_id = ${warehouseId} AND driver_id IS NOT NULL
  `).map(r => r.driver_id as string);

  // Gate events
  const ge = await q`
    SELECT
      COUNT(*) FILTER (WHERE event_type::text LIKE '%_entry')::int AS entries,
      COUNT(*) FILTER (WHERE event_type::text LIKE '%_exit')::int  AS exits,
      COUNT(*)::int AS total
    FROM gate_events WHERE warehouse_id = ${warehouseId}
  `;
  console.log("Gate events:", JSON.stringify(ge[0]));

  // DL expired
  const dl = await q`
    SELECT
      COUNT(*) FILTER (WHERE dl_expiry IS NOT NULL AND dl_expiry::date < CURRENT_DATE)::int AS expired,
      COUNT(*) FILTER (WHERE dl_expiry IS NOT NULL AND dl_expiry::date >= CURRENT_DATE AND dl_expiry::date <= CURRENT_DATE + INTERVAL '30 days')::int AS expiring,
      COUNT(*) FILTER (WHERE dl_status = 'blocked')::int AS blocked
    FROM drivers WHERE org_id = ${ORG_ID} AND id = ANY(${ids})
  `;
  console.log("DL status:", JSON.stringify(dl[0]));

  // DL mismatch at exit
  const mm = await q`
    WITH ex AS (
      SELECT metadata->>'dlNumber' AS dl_number, metadata->>'entryEventId' AS entry_event_id
      FROM gate_events
      WHERE warehouse_id = ${warehouseId} AND event_type::text LIKE '%_exit'
    ), en AS (
      SELECT id, metadata->>'dlNumber' AS dl_number
      FROM gate_events
      WHERE warehouse_id = ${warehouseId} AND event_type::text LIKE '%_entry'
    )
    SELECT COUNT(*)::int AS mismatches
    FROM ex JOIN en ON en.id = ex.entry_event_id
    WHERE en.dl_number IS NOT NULL AND ex.dl_number IS NOT NULL
      AND en.dl_number <> ex.dl_number
  `;
  console.log("DL mismatch at exit:", JSON.stringify(mm[0]));

  // Vehicle compliance
  const vc = await q`
    WITH wh_regs AS (
      SELECT DISTINCT upper(regexp_replace(vehicle_reg, '[^A-Z0-9]', '', 'g')) AS norm_reg
      FROM gate_events WHERE warehouse_id = ${warehouseId} AND vehicle_reg IS NOT NULL
    )
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE v.rc_expiry::date < CURRENT_DATE)::int AS rc_expired,
      COUNT(*) FILTER (WHERE v.puc_expiry::date < CURRENT_DATE)::int AS puc_expired,
      COUNT(*) FILTER (WHERE v.insurance_expiry::date < CURRENT_DATE)::int AS ins_expired,
      COUNT(*) FILTER (WHERE v.fitness_expiry::date < CURRENT_DATE)::int AS fit_expired
    FROM wh_regs r
    LEFT JOIN vehicles v ON upper(regexp_replace(v.registration_number, '[^A-Z0-9]', '', 'g')) = r.norm_reg AND v.org_id = ${ORG_ID}
  `;
  console.log("Vehicle compliance:", JSON.stringify(vc[0]));

  // Contractors
  const ct = await q`SELECT COUNT(*)::int AS n FROM contractors WHERE org_id = ${ORG_ID} AND is_active = true`;
  console.log("Active contractors:", JSON.stringify(ct[0]));

  // Alerts + incidents
  const al = await q`
    SELECT COUNT(*)::int AS n FROM alerts WHERE org_id = ${ORG_ID}
      AND (warehouse_id = ${warehouseId} OR warehouse_id IS NULL)
  `;
  console.log("Alerts raised:", JSON.stringify(al[0]));

  await (db as unknown as { end: () => Promise<void> }).end();
}
run().catch(console.error);
