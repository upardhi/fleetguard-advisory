#!/usr/bin/env tsx
/**
 * Purge all FleetGuard records tied to a list of fake / invalid DL numbers.
 *
 * Deletes from:
 *   fg_gate_events  — all entry + exit events where driverId matches
 *   fg_drivers      — the driver record itself
 *   fg_vehicles     — only if the vehicle has no remaining gate events after purge
 *
 * Usage:
 *   npx tsx scripts/purge-invalid-dl.ts             # dry-run (default — no writes)
 *   npx tsx scripts/purge-invalid-dl.ts --live      # live delete
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";

// ── .env.local ─────────────────────────────────────────────────────────────────
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

// ── Firebase Admin ─────────────────────────────────────────────────────────────
const projectId   = process.env.FIREBASE_ADMIN_PROJECT_ID!;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL!;
const privateKey  = process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, "\n");
if (getApps().length === 0) {
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}
const db = getFirestore();

// ── DL numbers to purge ────────────────────────────────────────────────────────
const INVALID_DL_NUMBERS = [
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

/** Return all variants of a DL number that might appear in Firestore. */
function dlVariants(dl: string): string[] {
  const withHyphen    = dl.trim();
  const withoutHyphen = dl.replace(/-/g, "").trim();
  return [...new Set([withHyphen, withoutHyphen, withHyphen.toUpperCase(), withoutHyphen.toUpperCase()])];
}

async function main() {
  const live   = process.argv.includes("--live");
  const mode   = live ? "LIVE — will delete" : "DRY-RUN — no writes";
  const divider = "═".repeat(68);

  console.log(`\n${divider}`);
  console.log(`  Purge invalid DL records  (${mode})`);
  console.log(`  Project: ${projectId}`);
  console.log(`  DL numbers to purge: ${INVALID_DL_NUMBERS.length}`);
  console.log(`${divider}\n`);

  if (!live) {
    console.log("  ⚠️   DRY-RUN mode — pass --live to execute deletes\n");
  }

  let totalDrivers   = 0;
  let totalEvents    = 0;
  let totalVehicles  = 0;
  const vehicleIdsToCheck = new Set<string>();

  for (const dl of INVALID_DL_NUMBERS) {
    const variants = dlVariants(dl);

    // ── Find matching drivers ────────────────────────────────────────────────
    const driverDocs: Array<{ id: string; dlNumber: string }> = [];
    for (const variant of variants) {
      const snap = await db.collection("fg_drivers")
        .where("dlNumber", "==", variant)
        .get();
      for (const d of snap.docs) {
        if (!driverDocs.find((x) => x.id === d.id)) {
          driverDocs.push({ id: d.id, dlNumber: d.data().dlNumber as string });
        }
      }
    }

    if (driverDocs.length === 0) {
      console.log(`  ⏭️  ${dl.padEnd(28)}  — no driver found`);
      continue;
    }

    for (const driver of driverDocs) {
      // ── Find all gate events for this driver ─────────────────────────────
      const eventsSnap = await db.collection("fg_gate_events")
        .where("driverId", "==", driver.id)
        .get();

      console.log(`\n  DL: ${dl}`);
      console.log(`    driver  : fg_drivers/${driver.id}  (dlNumber="${driver.dlNumber}")`);
      console.log(`    events  : ${eventsSnap.docs.length} gate event(s)`);

      // Collect vehicle IDs before deletion
      for (const ev of eventsSnap.docs) {
        const vId = ev.data().vehicleId as string | undefined;
        if (vId) vehicleIdsToCheck.add(vId);
      }

      // Delete gate events
      for (const ev of eventsSnap.docs) {
        const d = ev.data();
        const tag = `${d.eventType ?? "event"} @ ${
          d.time?.toDate?.()?.toLocaleDateString() ?? "?"
        }  vehicle=${d.vehicleReg ?? "?"}`;
        if (live) {
          await db.collection("fg_gate_events").doc(ev.id).delete();
          console.log(`    🗑   fg_gate_events/${ev.id}  (${tag})`);
        } else {
          console.log(`    [DRY] would delete fg_gate_events/${ev.id}  (${tag})`);
        }
        totalEvents++;
      }

      // Also check gate events by dlNumber field (belt-and-suspenders)
      for (const variant of variants) {
        const byDlSnap = await db.collection("fg_gate_events")
          .where("dlNumber", "==", variant)
          .get();
        for (const ev of byDlSnap.docs) {
          if (ev.data().driverId === driver.id) continue; // already handled above
          const d = ev.data();
          const tag = `${d.eventType ?? "event"} @ ${
            d.time?.toDate?.()?.toLocaleDateString() ?? "?"
          }  driver=${d.driverId ?? "?"}`;
          if (live) {
            await db.collection("fg_gate_events").doc(ev.id).delete();
            console.log(`    🗑   fg_gate_events/${ev.id}  (by-dlNumber: ${tag})`);
          } else {
            console.log(`    [DRY] would delete fg_gate_events/${ev.id}  (by-dlNumber: ${tag})`);
          }
          totalEvents++;
        }
      }

      // Delete driver
      if (live) {
        await db.collection("fg_drivers").doc(driver.id).delete();
        console.log(`    🗑   fg_drivers/${driver.id}`);
      } else {
        console.log(`    [DRY] would delete fg_drivers/${driver.id}`);
      }
      totalDrivers++;
    }
  }

  // ── Orphan-check vehicles ──────────────────────────────────────────────────
  if (vehicleIdsToCheck.size > 0) {
    console.log(`\n  Checking ${vehicleIdsToCheck.size} vehicle(s) for remaining gate events...`);
    for (const vId of vehicleIdsToCheck) {
      const remaining = await db.collection("fg_gate_events")
        .where("vehicleId", "==", vId)
        .limit(1)
        .get();
      if (remaining.empty) {
        if (live) {
          await db.collection("fg_vehicles").doc(vId).delete();
          console.log(`  🗑   fg_vehicles/${vId}  (orphaned — no remaining events)`);
        } else {
          console.log(`  [DRY] would delete fg_vehicles/${vId}  (orphaned)`);
        }
        totalVehicles++;
      } else {
        console.log(`  KEPT fg_vehicles/${vId}  (still has other gate events)`);
      }
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n${divider}`);
  if (live) {
    console.log(`  ✅  Purge complete`);
  } else {
    console.log(`  ℹ️   Dry-run complete — re-run with --live to execute`);
  }
  console.log(`     Drivers   : ${totalDrivers}`);
  console.log(`     Events    : ${totalEvents}`);
  console.log(`     Vehicles  : ${totalVehicles}`);
  console.log(`${divider}\n`);
}

main().catch((err) => {
  console.error("❌  Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
