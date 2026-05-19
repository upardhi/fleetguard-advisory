import { db } from "../app/_server/db/client";
type Row = Record<string, unknown>;
const ORG_ID = "019df10e-4a97-70b9-834a-47646365b491";

async function run() {
  const wh = await (db as unknown as (s: TemplateStringsArray) => Promise<Row[]>)`
    SELECT id FROM warehouses WHERE org_id = ${ORG_ID} AND name = 'TRICHY' LIMIT 1
  `;
  const warehouseId = wh[0].id as string;

  const ids = (await (db as unknown as (s: TemplateStringsArray) => Promise<Row[]>)`
    SELECT DISTINCT driver_id FROM gate_events
    WHERE warehouse_id = ${warehouseId} AND driver_id IS NOT NULL
  `).map(r => r.driver_id as string);

  const blocked = await (db as unknown as (s: TemplateStringsArray) => Promise<Row[]>)`
    SELECT d.full_name, d.dl_number, d.dl_status,
           ge.metadata #>> '{dlVerifyData,data,result,status}'           AS api_status,
           ge.metadata #>> '{dlVerifyData,data,result,statusCd}'         AS status_cd,
           ge.metadata #>> '{dlVerifyData,data,result,statusMessage}'    AS status_msg,
           ge.metadata #>> '{dlVerifyData,provider}'                     AS provider,
           ge.occurred_at
    FROM drivers d
    LEFT JOIN LATERAL (
      SELECT metadata, occurred_at FROM gate_events
      WHERE driver_id = d.id AND warehouse_id = ${warehouseId}
        AND metadata ? 'dlVerifyData'
      ORDER BY occurred_at DESC LIMIT 1
    ) ge ON true
    WHERE d.org_id = ${ORG_ID}
      AND d.id = ANY(${ids})
      AND d.dl_status = 'blocked'
    ORDER BY d.full_name
  `;

  console.log(`\nBlocked DL drivers (${blocked.length} total):\n`);
  for (const r of blocked) {
    console.log(`Name:           ${r.full_name}`);
    console.log(`DL Number:      ${r.dl_number}`);
    console.log(`dl_status:      ${r.dl_status}`);
    console.log(`API status:     ${r.api_status}`);
    console.log(`Status code:    ${r.status_cd}`);
    console.log(`Status msg:     ${r.status_msg}`);
    console.log(`Provider:       ${r.provider}`);
    console.log("---");
  }

  await (db as unknown as { end: () => Promise<void> }).end();
}
run().catch(console.error);
