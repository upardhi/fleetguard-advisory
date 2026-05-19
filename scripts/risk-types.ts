import { db } from "../app/_server/db/client";
type Row = Record<string, unknown>;

async function run() {
  const rows = await (db as unknown as (s: TemplateStringsArray) => Promise<Row[]>)`
    SELECT DISTINCT
      metadata #>> '{crimeCheckData,pollData,riskType}' AS risk_type,
      COALESCE(
        NULLIF(jsonb_array_length(metadata #> '{crimeCheckData,pollData,caseDetails}'), 0),
        (metadata #>> '{crimeCheckData,pollData,totalCases}')::int,
        (metadata #>> '{crimeCheckData,pollData,numberOfCases}')::int,
        0
      ) AS sample_cases,
      COUNT(DISTINCT driver_id)::int AS drivers
    FROM gate_events
    WHERE metadata ? 'crimeCheckData'
      AND jsonb_typeof(metadata -> 'crimeCheckData') <> 'null'
    GROUP BY risk_type, sample_cases
    ORDER BY drivers DESC
    LIMIT 30
  `;
  console.log(JSON.stringify(rows, null, 2));
  await (db as unknown as { end: () => Promise<void> }).end();
}
run().catch(console.error);
