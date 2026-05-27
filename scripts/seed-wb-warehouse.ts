/**
 * Seeds West Bengal test warehouses so the 40km geofence can be demonstrated.
 * Run: npx tsx --env-file=.env.local scripts/seed-wb-warehouse.ts
 */
import postgres from "postgres";

const sql = postgres(process.env.SUPABASE_POOLER_URL!, {
  ssl: { rejectUnauthorized: false }, prepare: false,
});

// West Bengal ITC depot coordinates — warehouses to seed
const WB_WAREHOUSES = [
  {
    name: "Kolkata - Dhulagarh",
    city: "Dhulagarh",
    state: "West Bengal",
    region: "east",
    address: "Dhulagarh Industrial Area, Howrah, West Bengal",
    code: "WB-DHL",
    lat: 22.5448,
    lng: 88.2356,
  },
  {
    name: "Kolkata - Panchla",
    city: "Panchla",
    state: "West Bengal",
    region: "east",
    address: "Panchla, Howrah District, West Bengal",
    code: "WB-PCH",
    lat: 22.4845,
    lng: 88.1567,
  },
  {
    name: "Siliguri",
    city: "Siliguri",
    state: "West Bengal",
    region: "east",
    address: "Siliguri Industrial Area, West Bengal",
    code: "WB-SLG",
    lat: 26.7271,
    lng: 88.3953,
  },
];

async function main() {
  // Get the ITC org
  const user = await sql`
    SELECT org_id FROM users WHERE email = 'admin@fleetguard.itc' LIMIT 1
  `;
  if (!user.length) {
    console.error("User admin@fleetguard.itc not found — check email");
    await sql.end();
    return;
  }
  const orgId = user[0].org_id;
  console.log(`▶ Seeding West Bengal warehouses for org: ${orgId}\n`);

  for (const wh of WB_WAREHOUSES) {
    // Delete existing by code+org so re-run is idempotent
    await sql`DELETE FROM warehouses WHERE org_id = ${orgId} AND code = ${wh.code}`;
    const result = await sql`
      INSERT INTO warehouses (id, org_id, name, city, state, region, address, code, lat, lng, is_active)
      VALUES (gen_random_uuid(), ${orgId}, ${wh.name}, ${wh.city}, ${wh.state}, ${wh.region},
              ${wh.address}, ${wh.code}, ${wh.lat}, ${wh.lng}, true)
      RETURNING id, name, city
    `;
    console.log(`  ✓ ${result[0].name} (${result[0].city}) → id: ${result[0].id}`);
  }

  // Show what the geofence will now compute for each warehouse
  console.log("\n📍 Expected 40km geofence results:");

  const EAST_CITIES = [
    { name: "Agartala",       lat: 23.8315, lng: 91.2868 },
    { name: "Andal",          lat: 23.6060, lng: 87.2011 },
    { name: "Chandaka",       lat: 20.3372, lng: 85.7380 },
    { name: "Cuttack",        lat: 20.4625, lng: 85.8828 },
    { name: "Dhulagarh New",  lat: 22.5448, lng: 88.2356 },
    { name: "Jamshedpur New", lat: 22.8046, lng: 86.2029 },
    { name: "Jorhat",         lat: 26.7500, lng: 94.2167 },
    { name: "Madanpur",       lat: 22.4177, lng: 88.3668 },
    { name: "Panchla New",    lat: 22.4845, lng: 88.1567 },
    { name: "Patna",          lat: 25.5941, lng: 85.1376 },
    { name: "Sambalpur",      lat: 21.4669, lng: 83.9756 },
    { name: "Siliguri New",   lat: 26.7271, lng: 88.3953 },
    { name: "Vijayawada PC",  lat: 16.5062, lng: 80.6480 },
    { name: "Vizag 2",        lat: 17.6868, lng: 83.2185 },
  ];

  function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  for (const wh of WB_WAREHOUSES) {
    const nearby = EAST_CITIES
      .map(c => ({ ...c, km: Math.round(haversineKm(wh.lat, wh.lng, c.lat, c.lng)) }))
      .filter(c => c.km <= 40)
      .sort((a, b) => a.km - b.km);
    console.log(`\n  ${wh.name} (${wh.lat}, ${wh.lng}):`);
    if (nearby.length === 0) {
      console.log("    → No EAST depot cities within 40km");
    } else {
      nearby.forEach(c => console.log(`    → ${c.name}: ${c.km}km`));
    }
  }

  console.log("\n✅ Done. Reload /api/advisory/v1/warehouse-geofence to see live results.");
  await sql.end();
}
main().catch(console.error);
