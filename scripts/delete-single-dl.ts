#!/usr/bin/env tsx
/**
 * Delete all records for a single DL number.
 * Usage:
 *   npx tsx scripts/delete-single-dl.ts           # dry-run
 *   npx tsx scripts/delete-single-dl.ts --live    # live delete
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";

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

const projectId   = process.env.FIREBASE_ADMIN_PROJECT_ID!;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL!;
const privateKey  = process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, "\n");
if (getApps().length === 0) {
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}
const db = getFirestore();

const DL = "MH35-20050004527";

function variants(dl: string): string[] {
  const a = dl.trim();
  const b = dl.replace(/-/g, "").trim();
  return [...new Set([a, b, a.toUpperCase(), b.toUpperCase()])];
}

async function main() {
  const live = process.argv.includes("--live");
  console.log(`\nProject : ${projectId}`);
  console.log(`DL      : ${DL}`);
  console.log(`Mode    : ${live ? "LIVE — DELETING" : "DRY-RUN"}`);
  console.log("─".repeat(60));

  const eventIds = new Set<string>();

  // Collect gate events by dlNumber
  for (const v of variants(DL)) {
    const snap = await db.collection("fg_gate_events").where("dlNumber", "==", v).get();
    snap.docs.forEach(d => eventIds.add(d.id));
  }

  // Collect gate events by driverId
  for (const v of variants(DL)) {
    const dSnap = await db.collection("fg_drivers").where("dlNumber", "==", v).get();
    for (const dr of dSnap.docs) {
      const eSnap = await db.collection("fg_gate_events").where("driverId", "==", dr.id).get();
      eSnap.docs.forEach(d => eventIds.add(d.id));
    }
  }

  console.log(`\nGate events found: ${eventIds.size}`);
  for (const id of eventIds) {
    const doc = await db.collection("fg_gate_events").doc(id).get();
    const ev = doc.data()!;
    const ts = (ev.createdAt?.toDate?.()?.toISOString?.() ?? "?").slice(0, 16);
    const tag = `type=${ev.eventType ?? "?"} dl=${ev.dlNumber ?? "?"} prov=${ev.providerName ?? "(untagged)"} ${ts}`;
    if (live) {
      await db.collection("fg_gate_events").doc(id).delete();
      console.log(`  🗑  fg_gate_events/${id}  (${tag})`);
    } else {
      console.log(`  [DRY] fg_gate_events/${id}  (${tag})`);
    }
  }

  // Driver records
  let driverCount = 0;
  for (const v of variants(DL)) {
    const dSnap = await db.collection("fg_drivers").where("dlNumber", "==", v).get();
    for (const dr of dSnap.docs) {
      if (live) {
        await db.collection("fg_drivers").doc(dr.id).delete();
        console.log(`  🗑  fg_drivers/${dr.id}  (${dr.data().fullName ?? "?"} · ${dr.data().dlNumber})`);
      } else {
        console.log(`  [DRY] fg_drivers/${dr.id}  (${dr.data().fullName ?? "?"} · ${dr.data().dlNumber})`);
      }
      driverCount++;
    }
  }

  console.log("\n" + "─".repeat(60));
  if (live) {
    console.log(`✅  Done — deleted ${eventIds.size} gate event(s) + ${driverCount} driver record(s)`);
  } else {
    console.log(`DRY-RUN — would delete ${eventIds.size} gate event(s) + ${driverCount} driver record(s)`);
    console.log(`Re-run with --live to execute`);
  }
}

main().catch(err => {
  console.error("❌", err instanceof Error ? err.message : err);
  process.exit(1);
});
