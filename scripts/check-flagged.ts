import { db } from "../app/_server/db/client";
type Row = Record<string, unknown>;

const ORG_ID = "019df10e-4a97-70b9-834a-47646365b491";
const WH_ID_Q = `SELECT id FROM warehouses WHERE org_id = '${ORG_ID}' AND name = 'TRICHY' LIMIT 1`;

async function run() {
  const wh = await (db as unknown as (s: TemplateStringsArray) => Promise<Row[]>)`
    SELECT id FROM warehouses WHERE org_id = ${ORG_ID} AND name = 'TRICHY' LIMIT 1
  `;
  const warehouseId = wh[0].id as string;
  console.log("warehouseId:", warehouseId);

  // 1. Unique driver IDs in this warehouse
  const driverIds = await (db as unknown as (s: TemplateStringsArray) => Promise<Row[]>)`
    SELECT DISTINCT driver_id FROM gate_events
    WHERE warehouse_id = ${warehouseId} AND driver_id IS NOT NULL
  `;
  const ids = driverIds.map(r => r.driver_id as string);
  console.log("Unique drivers in warehouse:", ids.length);

  // 2. Flagged drivers in this warehouse
  const flagged = await (db as unknown as (s: TemplateStringsArray) => Promise<Row[]>)`
    SELECT id, full_name FROM drivers
    WHERE org_id = ${ORG_ID} AND id = ANY(${ids}) AND bg_status = 'flagged'
    ORDER BY full_name
  `;
  console.log("Flagged drivers:", flagged.length);

  // 3. Case counts per flagged driver
  const flaggedIds = flagged.map(r => r.id as string);
  const cases = await (db as unknown as (s: TemplateStringsArray) => Promise<Row[]>)`
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
    FROM gate_events
    WHERE driver_id = ANY(${flaggedIds})
      AND metadata ? 'crimeCheckData'
      AND jsonb_typeof(metadata -> 'crimeCheckData') <> 'null'
    ORDER BY driver_id, occurred_at DESC
  `;

  console.log("\nCase data found for flagged drivers:", cases.length);
  console.log("Flagged drivers with NO case data:", flaggedIds.length - cases.length);

  // Count tiers with new logic
  let vh = 0, high = 0, avg = 0, low = 0, totalCases = 0;
  const caseMap = new Map(cases.map(r => [r.driver_id as string, { cases: Number(r.total_cases) || 0, rt: (r.risk_type as string || "").toLowerCase().trim() }]));

  for (const d of flagged) {
    const m = caseMap.get(d.id as string) ?? { cases: 0, rt: "" };
    totalCases += m.cases;
    if (m.cases >= 5 || m.rt === "very high risk") vh++;
    else if (m.cases >= 3 || m.rt === "high risk") high++;
    else if (m.cases >= 1 || m.rt === "average risk") avg++;
    else low++;
  }

  console.log("\nRisk breakdown (new logic):");
  console.log("  Very High Risk:", vh);
  console.log("  High Risk:     ", high);
  console.log("  Average Risk:  ", avg);
  console.log("  Low Risk:      ", low);
  console.log("  Total Cases:   ", totalCases);
  console.log("  Sum check:     ", vh + high + avg + low, "(should =", flagged.length, ")");

  await (db as unknown as { end: () => Promise<void> }).end();
}
run().catch(console.error);
