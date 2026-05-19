#!/usr/bin/env tsx
/**
 * Clean invalid driver records + their gate events.
 *
 * Deletes from:
 *   fg_gate_events  — by driverId match + by dlNumber field match
 *   fg_drivers      — the driver document itself
 *
 * Usage:
 *   npx tsx scripts/clean-invalid-drivers.ts           # dry-run (default)
 *   npx tsx scripts/clean-invalid-drivers.ts --live    # live delete
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";

// ── .env.local ────────────────────────────────────────────────────────────────
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

// ── Firebase Admin ────────────────────────────────────────────────────────────
const projectId   = process.env.FIREBASE_ADMIN_PROJECT_ID!;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL!;
const privateKey  = process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, "\n");
if (getApps().length === 0) {
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}
const db = getFirestore();

// ── Invalid DL list ───────────────────────────────────────────────────────────
const INVALID_DLS = [
  "MH02-20190056789",
  "MH12-2010149313",
  "MH14-20100053690",
  "MH20-200300200",
  "MH20-20120005484",
  "MH31-20090083965",
  "MH32-20130001716",
  "MH32-223232",
  "MH35-20240003526",
  "MH35-20250010200",
  "MH76-88989",
  "MH78-7878787878787",
  "TN45-1981000454",
  "TN45-200312083",
  "TN45-200618914",
  "TN45-20145871",
  "TN45-Z20160074",
  "TN46-2002001315",
  "TN46-20193981",
  "TN49-19940002301DL",
  "TN57-19994399",
  "UP26-202000135226",
  "UP34-20160001578",
  "UP70-20250033711",
  "WB23-20150223071",
];

function variants(dl: string): string[] {
  const a = dl.trim();
  const b = dl.replace(/-/g, "").trim();
  return [...new Set([a, b, a.toUpperCase(), b.toUpperCase()])];
}

async function main() {
  const live = process.argv.includes("--live");
  const mode = live ? "LIVE — DELETING" : "DRY-RUN — no writes";
  const div  = "═".repeat(72);

  console.log(`\n${div}`);
  console.log(`  Clean invalid DL records  (${mode})`);
  console.log(`  Project : ${projectId}`);
  console.log(`  DLs     : ${INVALID_DLS.length}`);
  console.log(`  Scope   : fg_gate_events + fg_drivers`);
  console.log(`${div}\n`);

  let totalEvents  = 0;
  let totalDrivers = 0;

  for (const dl of INVALID_DLS) {
    const eventIds = new Set<string>();

    // ── Collect gate events by dlNumber ──────────────────────────────────────
    for (const v of variants(dl)) {
      const snap = await db.collection("fg_gate_events").where("dlNumber", "==", v).get();
      snap.docs.forEach(d => eventIds.add(d.id));
    }

    // ── Collect gate events by driverId (for docs with a driver record) ──────
    for (const v of variants(dl)) {
      const dSnap = await db.collection("fg_drivers").where("dlNumber", "==", v).get();
      for (const driverDoc of dSnap.docs) {
        const eSnap = await db.collection("fg_gate_events")
          .where("driverId", "==", driverDoc.id).get();
        eSnap.docs.forEach(d => eventIds.add(d.id));
      }
    }

    // ── Delete / report gate events ───────────────────────────────────────────
    if (eventIds.size > 0) {
      console.log(`  ${dl}  →  ${eventIds.size} gate event(s)`);
      for (const evId of eventIds) {
        if (live) {
          await db.collection("fg_gate_events").doc(evId).delete();
          console.log(`    🗑  fg_gate_events/${evId}`);
        } else {
          console.log(`    [DRY] fg_gate_events/${evId}`);
        }
        totalEvents++;
      }
    } else {
      console.log(`  ${dl}  →  0 gate events`);
    }

    // ── Delete / report driver record ─────────────────────────────────────────
    for (const v of variants(dl)) {
      const dSnap = await db.collection("fg_drivers").where("dlNumber", "==", v).get();
      for (const driverDoc of dSnap.docs) {
        if (live) {
          await db.collection("fg_drivers").doc(driverDoc.id).delete();
          console.log(`    🗑  fg_drivers/${driverDoc.id}`);
        } else {
          console.log(`    [DRY] fg_drivers/${driverDoc.id}`);
        }
        totalDrivers++;
      }
    }
  }

  console.log(`\n${div}`);
  if (live) {
    console.log(`  ✅  Done`);
    console.log(`  Deleted  ${totalEvents} gate event(s)  from fg_gate_events`);
    console.log(`  Deleted  ${totalDrivers} driver record(s)  from fg_drivers`);
    console.log(`  Total    ${totalEvents + totalDrivers} documents removed`);
  } else {
    console.log(`  DRY-RUN complete`);
    console.log(`  Would delete  ${totalEvents} gate event(s)  from fg_gate_events`);
    console.log(`  Would delete  ${totalDrivers} driver record(s)  from fg_drivers`);
    console.log(`  Total         ${totalEvents + totalDrivers} documents`);
    console.log(`  Re-run with --live to execute`);
  }
  console.log(`${div}\n`);
}

main().catch(err => {
  console.error("❌", err instanceof Error ? err.message : err);
  process.exit(1);
});
