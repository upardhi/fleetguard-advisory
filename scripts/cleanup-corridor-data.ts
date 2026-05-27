/**
 * cleanup-corridor-data.ts
 *
 * Deletes all corridor records from the DB while leaving the table schema,
 * intelligence infrastructure, and disruption system untouched.
 *
 * Tables cleared (in dependency order to respect FK constraints):
 *   adv_corridor_events       — scheduled/ongoing corridor events
 *   adv_watched_segments      — per-segment scan results
 *   adv_news_items            — raw scraped news linked to routes
 *   adv_disruptions           — processed disruption records
 *   adv_route_segments        — geographic decomposition of routes
 *   adv_routes                — route options per trip
 *   adv_trips                 — planned trip records
 *   adv_watched_routes        — the corridor definitions themselves
 *
 * Everything else (adv_regions, adv_cities, adv_user_prefs,
 * adv_notifications, adv_advisories) is left intact.
 *
 * Run:  npx tsx scripts/cleanup-corridor-data.ts
 */

import postgres from "postgres";

const sql = postgres(process.env.SUPABASE_POOLER_URL!, {
  ssl: { rejectUnauthorized: false },
  prepare: false,
});

async function main() {
  console.log("▶ Cleaning up corridor data…\n");

  // Show counts before deletion
  const counts = await Promise.all([
    sql`SELECT COUNT(*)::int AS n FROM adv_corridor_events`.then((r) => ({ table: "adv_corridor_events",  n: r[0].n })),
    sql`SELECT COUNT(*)::int AS n FROM adv_watched_segments`.then((r) => ({ table: "adv_watched_segments", n: r[0].n })),
    sql`SELECT COUNT(*)::int AS n FROM adv_news_items`.then((r) => ({ table: "adv_news_items",            n: r[0].n })).catch(() => ({ table: "adv_news_items", n: "table missing" })),
    sql`SELECT COUNT(*)::int AS n FROM adv_disruptions`.then((r) => ({ table: "adv_disruptions",          n: r[0].n })).catch(() => ({ table: "adv_disruptions", n: "table missing" })),
    sql`SELECT COUNT(*)::int AS n FROM adv_route_segments`.then((r) => ({ table: "adv_route_segments",    n: r[0].n })).catch(() => ({ table: "adv_route_segments", n: "table missing" })),
    sql`SELECT COUNT(*)::int AS n FROM adv_routes`.then((r) => ({ table: "adv_routes",                    n: r[0].n })).catch(() => ({ table: "adv_routes", n: "table missing" })),
    sql`SELECT COUNT(*)::int AS n FROM adv_trips`.then((r) => ({ table: "adv_trips",                      n: r[0].n })).catch(() => ({ table: "adv_trips", n: "table missing" })),
    sql`SELECT COUNT(*)::int AS n FROM adv_watched_routes`.then((r) => ({ table: "adv_watched_routes",    n: r[0].n })),
  ]);

  console.log("  Current row counts:");
  counts.forEach(({ table, n }) => console.log(`    ${table.padEnd(28)} ${n}`));
  console.log();

  // Delete in FK-safe order
  const steps: Array<{ label: string; fn: () => Promise<unknown> }> = [
    { label: "adv_corridor_events",   fn: () => sql`DELETE FROM adv_corridor_events` },
    { label: "adv_watched_segments",  fn: () => sql`DELETE FROM adv_watched_segments` },
    {
      label: "adv_planned_dispatches",
      fn: () =>
        sql`DELETE FROM adv_planned_dispatches`.catch(() => {
          console.log("    (adv_planned_dispatches not found — skipping)");
        }),
    },
    {
      label: "adv_news_items",
      fn: () =>
        sql`DELETE FROM adv_news_items`.catch(() => {
          console.log("    (adv_news_items not found — skipping)");
        }),
    },
    {
      label: "adv_disruptions",
      fn: () =>
        sql`DELETE FROM adv_disruptions`.catch(() => {
          console.log("    (adv_disruptions not found — skipping)");
        }),
    },
    {
      label: "adv_route_segments",
      fn: () =>
        sql`DELETE FROM adv_route_segments`.catch(() => {
          console.log("    (adv_route_segments not found — skipping)");
        }),
    },
    {
      label: "adv_routes",
      fn: () =>
        sql`DELETE FROM adv_routes`.catch(() => {
          console.log("    (adv_routes not found — skipping)");
        }),
    },
    {
      label: "adv_trips",
      fn: () =>
        sql`DELETE FROM adv_trips`.catch(() => {
          console.log("    (adv_trips not found — skipping)");
        }),
    },
    { label: "adv_watched_routes",    fn: () => sql`DELETE FROM adv_watched_routes` },
  ];

  for (const step of steps) {
    process.stdout.write(`  Deleting ${step.label}… `);
    await step.fn();
    console.log("✓");
  }

  console.log("\n✅ Corridor data cleared.");
  console.log("   Tables adv_regions, adv_cities, adv_user_prefs, adv_notifications are untouched.");
  console.log("   Intelligence infrastructure (scan jobs, cron routes) remains available for reuse.\n");

  await sql.end();
}

main().catch((e) => {
  console.error("Cleanup failed:", e);
  process.exit(1);
});
