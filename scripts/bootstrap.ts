#!/usr/bin/env tsx
/**
 * FleetGuard — Bootstrap script
 *
 * Creates the platform org + superadmin user in Supabase on first run.
 * Safe to run multiple times — skips rows that already exist.
 * MFA is OFF by default; enable per-user via the superadmin portal.
 *
 * Usage:
 *   npm run bootstrap
 *
 * Credentials (override in .env.local):
 *   SEED_SUPERADMIN_EMAIL     (default: admin@fleetguard.dev)
 *   SEED_SUPERADMIN_PASSWORD  (default: FleetGuard@2024!)
 */

import fs from "fs";
import path from "path";
import bcrypt from "bcrypt";
import postgres from "postgres";

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

// ── Config ────────────────────────────────────────────────────────────────────
const DB_URL = process.env.SUPABASE_POOLER_URL;
if (!DB_URL) {
  console.error("❌  SUPABASE_POOLER_URL is not set in .env.local");
  process.exit(1);
}

const SUPERADMIN_EMAIL    = (process.env.SEED_SUPERADMIN_EMAIL    ?? "admin@fleetguard.dev").toLowerCase();
const SUPERADMIN_PASSWORD = process.env.SEED_SUPERADMIN_PASSWORD  ?? "FleetGuard@2024!";
const SUPERADMIN_NAME     = "Super Admin";

// Stable id so re-runs are always idempotent
const SUPERADMIN_USER_ID  = "00000000-0000-7000-8000-000000000002";

// ── Main ─────────────────────────────────────────────────────────────────────
const db = postgres(DB_URL, { ssl: { rejectUnauthorized: false }, max: 1 });

async function main() {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║   FleetGuard — Bootstrap Setup            ║");
  console.log("╚══════════════════════════════════════════╝\n");

  // Superadmin is the platform owner — has no org.
  const [existingUser] = await db`SELECT id FROM users WHERE id = ${SUPERADMIN_USER_ID}`;

  const hash = await bcrypt.hash(SUPERADMIN_PASSWORD, 12);

  if (existingUser) {
    await db`
      UPDATE users
      SET    email           = ${SUPERADMIN_EMAIL},
             org_id          = NULL,
             password_hash   = ${hash},
             full_name       = ${SUPERADMIN_NAME},
             is_active       = true,
             mfa_required    = false,
             updated_at      = now()
      WHERE  id = ${SUPERADMIN_USER_ID}
    `;
    console.log("ℹ️   Superadmin already exists — email/password refreshed, org cleared, MFA OFF");
  } else {
    await db`
      INSERT INTO users (
        id, org_id, email, email_verified,
        password_hash, role, full_name,
        is_active, mfa_required,
        created_at, updated_at
      ) VALUES (
        ${SUPERADMIN_USER_ID},
        NULL,
        ${SUPERADMIN_EMAIL},
        true,
        ${hash},
        'superadmin',
        ${SUPERADMIN_NAME},
        true,
        false,
        now(), now()
      )
    `;
    console.log("✅  Superadmin user created");
  }

  // ── 3. Summary ───────────────────────────────────────────────────────────
  console.log("");
  console.log("════════════════════════════════════════════");
  console.log("  Superadmin Credentials");
  console.log("  ─────────────────────────────────────────");
  console.log(`  Email    : ${SUPERADMIN_EMAIL}`);
  console.log(`  Password : ${SUPERADMIN_PASSWORD}`);
  console.log(`  Role     : superadmin`);
  console.log(`  MFA      : OFF  (enable per-user from /superadmin)`);
  console.log(`  URL      : http://localhost:3000/login  →  /superadmin`);
  console.log("════════════════════════════════════════════");
  console.log("");

  await db.end();
}

main().catch((err: unknown) => {
  console.error("❌ ", err instanceof Error ? err.message : err);
  process.exit(1);
});
