#!/usr/bin/env tsx
/**
 * One-time backfill: populate incidents.linked_gate_event_id for rows that
 * predate the 0015 migration (which added the column).
 *
 * Strategy per incident:
 *   1. Load the triggering alert (linked_alert_id).
 *   2. Resolve the driver id:
 *        • alert.entity_type = 'driver'  → alert.entity_id
 *        • alert.entity_type = 'incident' → alert.metadata.sourceEntityId
 *   3. Find the gate_events row for that driver in the same warehouse whose
 *      occurred_at is closest to the incident's created_at (within ±10 min).
 *   4. UPDATE incidents SET linked_gate_event_id = that event's id.
 *
 * Safe to re-run — skips incidents that already have a linked_gate_event_id.
 *
 * Usage:
 *   npm run backfill:gate-events
 */

import postgres from "postgres";
import * as fs from "fs";
import * as path from "path";

// ── Load .env.local ──────────────────────────────────────────────────────────
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

const DB_URL = process.env.SUPABASE_POOLER_URL;
if (!DB_URL) {
  console.error("❌  SUPABASE_POOLER_URL is not set in .env.local");
  process.exit(1);
}

const db = postgres(DB_URL, { ssl: { rejectUnauthorized: false }, max: 3 });

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║  FleetGuard — Backfill incident linked_gate_event_id  ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  // 1. All unlinked incidents that have a triggering alert
  const incidents = await db`
    SELECT i.id, i.warehouse_id, i.created_at, i.linked_alert_id,
           a.entity_type, a.entity_id,
           a.metadata->>'sourceEntityId' AS source_entity_id
    FROM   incidents i
    JOIN   alerts a ON a.id = i.linked_alert_id
    WHERE  i.linked_gate_event_id IS NULL
    ORDER  BY i.created_at DESC
  `;

  console.log(`Found ${incidents.length} incident(s) to backfill.\n`);

  let updated = 0;
  let skipped = 0;

  for (const inc of incidents) {
    // 2. Resolve driver id
    const driverId: string | null =
      inc.entity_type === "driver"
        ? (inc.entity_id as string)
        : (inc.source_entity_id as string | null);

    if (!driverId || !inc.warehouse_id) {
      console.log(`  skip  ${inc.id}  — no driver or warehouse`);
      skipped++;
      continue;
    }

    // 3. Nearest entry-type gate event for this driver in the same warehouse
    //    within ±10 minutes of when the incident was raised.
    const [ev] = await db`
      SELECT id, event_type, occurred_at,
             ABS(EXTRACT(EPOCH FROM (occurred_at - ${inc.created_at as Date}))) AS diff_secs
      FROM   gate_events
      WHERE  driver_id    = ${driverId}
        AND  warehouse_id = ${inc.warehouse_id as string}
        AND  event_type IN ('contractor_entry','inbound_entry','outbound_entry')
        AND  occurred_at BETWEEN ${inc.created_at as Date} - INTERVAL '10 minutes'
                              AND ${inc.created_at as Date} + INTERVAL '10 minutes'
      ORDER  BY diff_secs ASC
      LIMIT  1
    `;

    if (!ev) {
      console.log(`  skip  ${inc.id}  — no matching gate event (driver ${driverId})`);
      skipped++;
      continue;
    }

    // 4. Update
    await db`
      UPDATE incidents
      SET    linked_gate_event_id = ${ev.id as string}
      WHERE  id = ${inc.id as string}
    `;

    console.log(
      `  link  ${inc.id}  →  gate_event ${ev.id as string}  ` +
      `(Δ${Math.round(ev.diff_secs as number)}s, ${ev.event_type as string})`,
    );
    updated++;
  }

  console.log(`\n✅  Done — ${updated} linked, ${skipped} skipped.`);
  await db.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
