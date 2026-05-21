/**
 * Migration: Advisory Region Architecture
 *
 * Creates:
 *  - adv_regions        — North/East/West/South reference table
 *  - adv_cities         — depot + key cities per region
 *  - adv_user_prefs     — user → region + city assignment
 *  - adv_notifications  — in-app alert inbox per user
 *
 * Alters:
 *  - adv_watched_routes — adds region_id column
 *
 * Run:  npx tsx scripts/migrate-advisory-regions.ts
 */

import postgres from "postgres";

const sql = postgres(process.env.SUPABASE_POOLER_URL!, {
  ssl: { rejectUnauthorized: false },
  prepare: false,
});

// ITC depot cities per region (seeded automatically)
const DEPOT_CITIES: Record<string, { name: string; state: string }[]> = {
  north: [
    { name: "Delhi New",    state: "Delhi" },
    { name: "Ghaziabad",    state: "Uttar Pradesh" },
    { name: "Haridwar",     state: "Uttarakhand" },
    { name: "Hassangarh",   state: "Haryana" },
    { name: "Jaipur",       state: "Rajasthan" },
    { name: "Jammu",        state: "Jammu and Kashmir" },
    { name: "Jodhpur",      state: "Rajasthan" },
    { name: "Kanpur",       state: "Uttar Pradesh" },
    { name: "Kapurthala",   state: "Punjab" },
    { name: "Lucknow",      state: "Uttar Pradesh" },
    { name: "Srinagar",     state: "Jammu and Kashmir" },
    { name: "Varanasi",     state: "Uttar Pradesh" },
  ],
  east: [
    { name: "Agartala",         state: "Tripura" },
    { name: "Andal",            state: "West Bengal" },
    { name: "Chandaka",         state: "Odisha" },
    { name: "Cuttack",          state: "Odisha" },
    { name: "Dhulagarh New",    state: "West Bengal" },
    { name: "Jamshedpur New",   state: "Jharkhand" },
    { name: "Jorhat",           state: "Assam" },
    { name: "Madanpur",         state: "West Bengal" },
    { name: "Panchla New",      state: "West Bengal" },
    { name: "Patna",            state: "Bihar" },
    { name: "Sambalpur",        state: "Odisha" },
    { name: "Siliguri New",     state: "West Bengal" },
    { name: "Vijayawada PC",    state: "Andhra Pradesh" },
    { name: "Vizag 2",          state: "Andhra Pradesh" },
  ],
  west: [
    { name: "Ahmedabad",  state: "Gujarat" },
    { name: "Ambarnath",  state: "Maharashtra" },
    { name: "Bhopal",     state: "Madhya Pradesh" },
    { name: "Goa",        state: "Goa" },
    { name: "Nagpur",     state: "Maharashtra" },
    { name: "Pune",       state: "Maharashtra" },
    { name: "Raipur",     state: "Chhattisgarh" },
  ],
  south: [
    { name: "Chennai",      state: "Tamil Nadu" },
    { name: "Cochin",       state: "Kerala" },
    { name: "Coimbatore",   state: "Tamil Nadu" },
    { name: "Dabaspet",     state: "Karnataka" },
    { name: "Hubli",        state: "Karnataka" },
    { name: "Hyderabad",    state: "Telangana" },
    { name: "Kakancherry",  state: "Kerala" },
    { name: "Malur",        state: "Karnataka" },
    { name: "Trichy",       state: "Tamil Nadu" },
  ],
};

async function main() {
  console.log("▶ Migrating Advisory Region Architecture…\n");

  // ── 1. adv_regions ────────────────────────────────────────────────────────
  console.log("  Creating adv_regions…");
  await sql`
    CREATE TABLE IF NOT EXISTS adv_regions (
      id         text PRIMARY KEY,
      label      text NOT NULL,
      color      text NOT NULL,
      states     text[] NOT NULL DEFAULT '{}'
    )
  `;
  await sql`
    INSERT INTO adv_regions (id, label, color, states) VALUES
      ('north', 'North', '#3b82f6',
       ARRAY['Delhi','Uttar Pradesh','Rajasthan','Haryana','Punjab','Uttarakhand',
             'Jammu and Kashmir','Jammu & Kashmir','Himachal Pradesh','Chandigarh']),
      ('east',  'East',  '#f97316',
       ARRAY['West Bengal','Odisha','Jharkhand','Bihar','Assam','Tripura',
             'Andhra Pradesh','Manipur','Meghalaya','Arunachal Pradesh',
             'Nagaland','Mizoram','Sikkim']),
      ('west',  'West',  '#8b5cf6',
       ARRAY['Maharashtra','Gujarat','Goa','Madhya Pradesh','Chhattisgarh']),
      ('south', 'South', '#10b981',
       ARRAY['Tamil Nadu','Karnataka','Kerala','Telangana','Puducherry'])
    ON CONFLICT (id) DO NOTHING
  `;
  console.log("  ✓ adv_regions");

  // ── 2. adv_cities ─────────────────────────────────────────────────────────
  console.log("  Creating adv_cities…");
  await sql`
    CREATE TABLE IF NOT EXISTS adv_cities (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id     text NOT NULL,
      region_id  text NOT NULL REFERENCES adv_regions(id),
      name       text NOT NULL,
      state      text,
      is_depot   boolean NOT NULL DEFAULT false,
      lat        numeric(10,6),
      lng        numeric(10,6),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (org_id, name)
    )
  `;
  console.log("  ✓ adv_cities");

  // ── 3. adv_user_prefs ─────────────────────────────────────────────────────
  console.log("  Creating adv_user_prefs…");
  await sql`
    CREATE TABLE IF NOT EXISTS adv_user_prefs (
      user_id    text PRIMARY KEY,
      org_id     text NOT NULL,
      region_id  text REFERENCES adv_regions(id),
      city_id    uuid REFERENCES adv_cities(id),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  console.log("  ✓ adv_user_prefs");

  // ── 4. adv_notifications ──────────────────────────────────────────────────
  console.log("  Creating adv_notifications…");
  await sql`
    CREATE TABLE IF NOT EXISTS adv_notifications (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id      text NOT NULL,
      user_id     text NOT NULL,
      region_id   text REFERENCES adv_regions(id),
      city_id     uuid REFERENCES adv_cities(id),
      title       text NOT NULL,
      body        text,
      risk_level  text,
      category    text,
      segment_id  uuid,
      route_id    uuid,
      is_read     boolean NOT NULL DEFAULT false,
      created_at  timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS adv_notif_user_idx
    ON adv_notifications (user_id, is_read, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS adv_notif_org_idx
    ON adv_notifications (org_id, created_at DESC)`;
  console.log("  ✓ adv_notifications");

  // ── 5. adv_watched_routes — add region_id ─────────────────────────────────
  console.log("  Patching adv_watched_routes…");
  await sql`ALTER TABLE adv_watched_routes
    ADD COLUMN IF NOT EXISTS region_id text REFERENCES adv_regions(id)`;
  console.log("  ✓ adv_watched_routes.region_id");

  // ── 6. Seed depot cities for the ITC org ─────────────────────────────────
  // Only seeds once — subsequent runs are idempotent via ON CONFLICT DO NOTHING.
  console.log("  Seeding depot cities…");

  // Find the ITC org (first org that has corridors, or all orgs)
  const orgs = await sql<{ org_id: string }[]>`
    SELECT DISTINCT org_id FROM adv_watched_routes LIMIT 20
  `;

  let totalCities = 0;
  for (const { org_id } of orgs) {
    for (const [regionId, cities] of Object.entries(DEPOT_CITIES)) {
      for (const city of cities) {
        await sql`
          INSERT INTO adv_cities (org_id, region_id, name, state, is_depot)
          VALUES (${org_id}, ${regionId}, ${city.name}, ${city.state}, true)
          ON CONFLICT (org_id, name) DO NOTHING
        `;
        totalCities++;
      }
    }
  }
  console.log(`  ✓ Seeded ${totalCities} depot city records`);

  console.log("\n✅ Migration complete.");
  await sql.end();
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
