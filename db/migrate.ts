/**
 * Advisory platform migrations.
 * Run: npm run db:migrate
 *
 * This script only creates tables specific to fleetguard-advisory.
 * It DOES NOT touch the shared users, sessions, or organisations tables.
 */
import postgres from "postgres";

async function migrate() {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL is not set");
  const sql = postgres(url, { ssl: { rejectUnauthorized: false } });

  console.log("Running advisory migrations…");

  await sql`
    CREATE TABLE IF NOT EXISTS advisory_disruptions (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
      title           TEXT NOT NULL,
      category        TEXT NOT NULL,
      risk_level      TEXT NOT NULL,
      region          TEXT NOT NULL,
      state           TEXT NOT NULL,
      highway         TEXT,
      lat             NUMERIC(9,6),
      lng             NUMERIC(9,6),
      summary         TEXT,
      detail          TEXT,
      source          TEXT,
      impact          TEXT,
      eta_impact_hrs  NUMERIC(5,1) DEFAULT 0,
      started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      expected_clear  TIMESTAMPTZ,
      verified        BOOLEAN DEFAULT FALSE,
      affected_routes JSONB DEFAULT '[]',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS advisory_route_analyses (
      id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
      org_id           TEXT NOT NULL,
      user_id          TEXT NOT NULL,
      origin           TEXT NOT NULL,
      destination      TEXT NOT NULL,
      vehicle_type     TEXT,
      cargo_type       TEXT,
      dispatch_time    TIMESTAMPTZ,
      risk_score       INTEGER,
      risk_level       TEXT,
      recommendation   TEXT,
      result_json      JSONB,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS advisory_alerts (
      id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
      disruption_id    TEXT REFERENCES advisory_disruptions(id),
      title            TEXT NOT NULL,
      advisory_type    TEXT NOT NULL,
      region           TEXT,
      risk_level       TEXT,
      confidence       INTEGER,
      narrative        TEXT,
      recommended_action TEXT,
      is_urgent        BOOLEAN DEFAULT FALSE,
      valid_from       TIMESTAMPTZ NOT NULL DEFAULT now(),
      valid_until      TIMESTAMPTZ,
      affected_zones   JSONB DEFAULT '[]',
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_advisory_disruptions_risk
      ON advisory_disruptions(risk_level, started_at DESC)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_advisory_alerts_urgent
      ON advisory_alerts(is_urgent, valid_until DESC)
  `;

  console.log("✅ Advisory migrations complete.");
  await sql.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
