/**
 * update-all-city-coords.ts
 *
 * Sets lat/lng on every adv_cities row for all 4 regions (42 cities total).
 * Also checks the adv_disruptions schema so the geofence API can be tuned.
 *
 * Run:  npx tsx --env-file=.env.local scripts/update-all-city-coords.ts
 */

import postgres from "postgres";

const sql = postgres(process.env.SUPABASE_POOLER_URL!, {
  ssl: { rejectUnauthorized: false },
  prepare: false,
});

// All 42 ITC depot cities with accurate coordinates
const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  // ── EAST ──────────────────────────────────────────────────────────────────
  "Agartala":       { lat: 23.8315, lng: 91.2868 },
  "Andal":          { lat: 23.6060, lng: 87.2011 },
  "Chandaka":       { lat: 20.3372, lng: 85.7380 },
  "Cuttack":        { lat: 20.4625, lng: 85.8828 },
  "Dhulagarh New":  { lat: 22.5448, lng: 88.2356 },
  "Jamshedpur New": { lat: 22.8046, lng: 86.2029 },
  "Jorhat":         { lat: 26.7500, lng: 94.2167 },
  "Madanpur":       { lat: 22.4177, lng: 88.3668 },
  "Panchla New":    { lat: 22.4845, lng: 88.1567 },
  "Patna":          { lat: 25.5941, lng: 85.1376 },
  "Sambalpur":      { lat: 21.4669, lng: 83.9756 },
  "Siliguri New":   { lat: 26.7271, lng: 88.3953 },
  "Vijayawada PC":  { lat: 16.5062, lng: 80.6480 },
  "Vizag 2":        { lat: 17.6868, lng: 83.2185 },

  // ── NORTH ─────────────────────────────────────────────────────────────────
  "Delhi New":      { lat: 28.6139, lng: 77.2090 },
  "Ghaziabad":      { lat: 28.6692, lng: 77.4538 },
  "Haridwar":       { lat: 29.9457, lng: 78.1642 },
  "Hassangarh":     { lat: 28.9178, lng: 76.7697 },
  "Jaipur":         { lat: 26.9124, lng: 75.7873 },
  "Jammu":          { lat: 32.7266, lng: 74.8570 },
  "Jodhpur":        { lat: 26.2389, lng: 73.0243 },
  "Kanpur":         { lat: 26.4499, lng: 80.3319 },
  "Kapurthala":     { lat: 31.3849, lng: 75.3804 },
  "Lucknow":        { lat: 26.8467, lng: 80.9462 },
  "Srinagar":       { lat: 34.0837, lng: 74.7973 },
  "Varanasi":       { lat: 25.3176, lng: 82.9739 },

  // ── SOUTH ─────────────────────────────────────────────────────────────────
  "Chennai":        { lat: 13.0827, lng: 80.2707 },
  "Cochin":         { lat: 9.9312,  lng: 76.2673 },
  "Coimbatore":     { lat: 11.0168, lng: 76.9558 },
  "Dabaspet":       { lat: 13.1140, lng: 77.2060 },
  "Hubli":          { lat: 15.3647, lng: 75.1240 },
  "Hyderabad":      { lat: 17.3850, lng: 78.4867 },
  "Kakancherry":    { lat: 10.7867, lng: 76.4500 },
  "Malur":          { lat: 13.0069, lng: 77.9365 },
  "Trichy":         { lat: 10.7905, lng: 78.7047 },

  // ── WEST ──────────────────────────────────────────────────────────────────
  "Ahmedabad":      { lat: 23.0225, lng: 72.5714 },
  "Ambarnath":      { lat: 19.2000, lng: 73.1667 },
  "Bhopal":         { lat: 23.2599, lng: 77.4126 },
  "Goa":            { lat: 15.2993, lng: 74.1240 },
  "Nagpur":         { lat: 21.1458, lng: 79.0882 },
  "Pune":           { lat: 18.5204, lng: 73.8567 },
  "Raipur":         { lat: 21.2514, lng: 81.6296 },
};

async function main() {
  console.log("▶ Updating lat/lng for all adv_cities…\n");

  // Fetch all cities
  const cities = await sql`
    SELECT id, name, lat, lng FROM adv_cities ORDER BY name
  ` as { id: string; name: string; lat: number | null; lng: number | null }[];

  console.log(`  Found ${cities.length} cities in DB`);

  let updated = 0, skipped = 0, missing = 0;

  for (const city of cities) {
    const coords = CITY_COORDS[city.name];
    if (!coords) {
      console.warn(`  ⚠ No coords for "${city.name}" — skipping`);
      missing++;
      continue;
    }
    await sql`
      UPDATE adv_cities SET lat = ${coords.lat}, lng = ${coords.lng}
      WHERE id = ${city.id}
    `;
    console.log(`  ✓ ${city.name.padEnd(20)} ${coords.lat}, ${coords.lng}`);
    updated++;
  }

  console.log(`\n  Updated: ${updated}  |  Missing coords: ${missing}  |  Skipped: ${skipped}`);

  // ── Check adv_disruptions schema ─────────────────────────────────────────
  console.log("\n▶ adv_disruptions columns:");
  const cols = await sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'adv_disruptions' ORDER BY ordinal_position
  ` as { column_name: string; data_type: string }[];

  if (cols.length === 0) {
    console.log("  (table not found or empty schema)");
  } else {
    cols.forEach((c) => console.log(`  ${c.column_name.padEnd(30)} ${c.data_type}`));
  }

  // ── Row counts ────────────────────────────────────────────────────────────
  const [dCount] = await sql`SELECT COUNT(*)::int AS n FROM adv_disruptions` as { n: number }[];
  console.log(`\n  adv_disruptions rows: ${dCount.n}`);

  console.log("\n✅ Done.");
  await sql.end();
}

main().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
