#!/usr/bin/env tsx
/**
 * Delete records for:
 *   1. Gate events where dlNumber is blank / empty string
 *   2. Gate events + driver records where dlNumber starts with "MH"
 *
 * Usage:
 *   npx tsx scripts/delete-blank-and-mh.ts           # dry-run
 *   npx tsx scripts/delete-blank-and-mh.ts --live    # live delete
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

async function main() {
  const live = process.argv.includes("--live");
  const div = "═".repeat(72);
  console.log(`\n${div}`);
  console.log(`  Delete blank-DL + MH-prefix records  (${live ? "LIVE — DELETING" : "DRY-RUN"})`);
  console.log(`  Project : ${projectId}`);
  console.log(`${div}\n`);

  // ── 1. BLANK DL gate events ──────────────────────────────────────────────────
  console.log("── Section 1: Blank DL gate events ──────────────────────────────");
  const blankSnap = await db.collection("fg_gate_events").where("dlNumber", "==", "").get();
  console.log(`  Found ${blankSnap.size} gate event(s) with blank dlNumber`);
  for (const doc of blankSnap.docs) {
    const ev = doc.data();
    const ts = (ev.createdAt?.toDate?.()?.toISOString?.() ?? "?").slice(0, 16);
    const tag = `type=${ev.eventType ?? "?"} prov=${ev.providerName ?? "(untagged)"} driver=${ev.driverName ?? "?"} ${ts}`;
    if (live) {
      await db.collection("fg_gate_events").doc(doc.id).delete();
      console.log(`  🗑  fg_gate_events/${doc.id}  (${tag})`);
    } else {
      console.log(`  [DRY] fg_gate_events/${doc.id}  (${tag})`);
    }
  }

  // ── 2. MH-prefix gate events ─────────────────────────────────────────────────
  console.log("\n── Section 2: MH-prefix gate events ─────────────────────────────");
  // Firestore range query: dlNumber >= "MH" && dlNumber < "MI"
  const mhEvSnap = await db.collection("fg_gate_events")
    .where("dlNumber", ">=", "MH")
    .where("dlNumber", "<", "MI")
    .get();
  console.log(`  Found ${mhEvSnap.size} gate event(s) with MH-prefix dlNumber`);
  for (const doc of mhEvSnap.docs) {
    const ev = doc.data();
    const ts = (ev.createdAt?.toDate?.()?.toISOString?.() ?? "?").slice(0, 16);
    const tag = `type=${ev.eventType ?? "?"} dl=${ev.dlNumber ?? "?"} prov=${ev.providerName ?? "(untagged)"} driver=${ev.driverName ?? "?"} ${ts}`;
    if (live) {
      await db.collection("fg_gate_events").doc(doc.id).delete();
      console.log(`  🗑  fg_gate_events/${doc.id}  (${tag})`);
    } else {
      console.log(`  [DRY] fg_gate_events/${doc.id}  (${tag})`);
    }
  }

  // ── 3. MH-prefix driver records ───────────────────────────────────────────────
  console.log("\n── Section 3: MH-prefix driver records ──────────────────────────");
  const mhDrSnap = await db.collection("fg_drivers")
    .where("dlNumber", ">=", "MH")
    .where("dlNumber", "<", "MI")
    .get();
  console.log(`  Found ${mhDrSnap.size} driver record(s) with MH-prefix dlNumber`);
  for (const doc of mhDrSnap.docs) {
    const dr = doc.data();
    const tag = `${dr.fullName ?? "?"} · ${dr.dlNumber}`;
    if (live) {
      await db.collection("fg_drivers").doc(doc.id).delete();
      console.log(`  🗑  fg_drivers/${doc.id}  (${tag})`);
    } else {
      console.log(`  [DRY] fg_drivers/${doc.id}  (${tag})`);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────────
  console.log(`\n${div}`);
  const total = blankSnap.size + mhEvSnap.size + mhDrSnap.size;
  if (live) {
    console.log(`  ✅  Done — deleted ${total} document(s) total`);
    console.log(`      Blank-DL gate events : ${blankSnap.size}`);
    console.log(`      MH-prefix gate events: ${mhEvSnap.size}`);
    console.log(`      MH-prefix drivers    : ${mhDrSnap.size}`);
  } else {
    console.log(`  DRY-RUN — would delete ${total} document(s) total`);
    console.log(`      Blank-DL gate events : ${blankSnap.size}`);
    console.log(`      MH-prefix gate events: ${mhEvSnap.size}`);
    console.log(`      MH-prefix drivers    : ${mhDrSnap.size}`);
    console.log(`  Re-run with --live to execute`);
  }
  console.log(`${div}\n`);
}

main().catch(err => {
  console.error("❌", err instanceof Error ? err.message : err);
  process.exit(1);
});
