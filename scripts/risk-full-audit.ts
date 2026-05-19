#!/usr/bin/env tsx
/**
 * Full audit: count all drivers by every status combination
 * to understand the source of report numbers
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
  const snap = await db.collection("fg_drivers").get();
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));

  console.log(`\nTotal fg_drivers: ${all.length}`);

  // Count by dlStatus
  const byDlStatus: Record<string, number> = {};
  for (const d of all) {
    const s = d.dlStatus ?? "(null)";
    byDlStatus[s] = (byDlStatus[s] ?? 0) + 1;
  }
  console.log("\ndlStatus breakdown:");
  for (const [k,v] of Object.entries(byDlStatus).sort()) console.log(`  ${k.padEnd(20)} : ${v}`);

  // Count by dlApiStatus
  const byApiStatus: Record<string, number> = {};
  for (const d of all) {
    const s = d.dlApiStatus ?? "(null)";
    byApiStatus[s] = (byApiStatus[s] ?? 0) + 1;
  }
  console.log("\ndlApiStatus breakdown:");
  for (const [k,v] of Object.entries(byApiStatus).sort()) console.log(`  ${k.padEnd(20)} : ${v}`);

  // Count by dlInvalidReason
  const byReason: Record<string, number> = {};
  for (const d of all) {
    const s = d.dlInvalidReason ?? "(null)";
    byReason[s] = (byReason[s] ?? 0) + 1;
  }
  console.log("\ndlInvalidReason breakdown:");
  for (const [k,v] of Object.entries(byReason).sort()) console.log(`  ${k.padEnd(30)} : ${v}`);

  // Count by bgStatus
  const byBg: Record<string, number> = {};
  for (const d of all) {
    const s = d.bgStatus ?? "(null)";
    byBg[s] = (byBg[s] ?? 0) + 1;
  }
  console.log("\nbgStatus breakdown:");
  for (const [k,v] of Object.entries(byBg).sort()) console.log(`  ${k.padEnd(20)} : ${v}`);

  // Count by dlHasTransport
  const byTransport: Record<string, number> = {};
  for (const d of all) {
    const s = String(d.dlHasTransport ?? "(null)");
    byTransport[s] = (byTransport[s] ?? 0) + 1;
  }
  console.log("\ndlHasTransport breakdown:");
  for (const [k,v] of Object.entries(byTransport).sort()) console.log(`  ${k.padEnd(20)} : ${v}`);

  // Cross: dlStatus=blocked details
  console.log("\n── dlStatus=blocked DETAILS ──");
  const blockedAll = all.filter(d => d.dlStatus === "blocked");
  for (const d of blockedAll) {
    console.log(`  ${d.fullName ?? "(unknown)"} | ${d.dlNumber} | dlApiStatus=${d.dlApiStatus} | dlInvalidReason=${d.dlInvalidReason} | bgStatus=${d.bgStatus}`);
  }

  // Check gate events for a broader count of DL invalid records
  console.log("\n── GATE EVENTS: total entry events ──");
  const evSnap = await db.collection("fg_gate_events").get();
  const allEvents = evSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
  const entries = allEvents.filter(e => e.eventType === "entry" || e.eventType === "contractor_entry");
  const exits   = allEvents.filter(e => e.eventType === "exit" || e.eventType === "contractor_exit");
  console.log(`  Total gate events : ${allEvents.length}`);
  console.log(`  Entry events      : ${entries.length}`);
  console.log(`  Exit events       : ${exits.length}`);

  // Check what risk fields gate events have
  const riskFields = new Set<string>();
  for (const e of entries.slice(0, 50)) {
    for (const k of Object.keys(e)) {
      if (k.toLowerCase().includes("risk") || k.toLowerCase().includes("flag") || k.toLowerCase().includes("invalid") || k.toLowerCase().includes("status")) {
        riskFields.add(k);
      }
    }
  }
  console.log(`  Risk-related fields in gate events: ${[...riskFields].join(", ")}`);

  // Unique driverIds in entries
  const uniqueDriverIds = new Set(entries.map(e => e.driverId).filter(Boolean));
  const uniqueDlNums = new Set(entries.map(e => e.dlNumber).filter(Boolean));
  console.log(`  Unique driverIds  : ${uniqueDriverIds.size}`);
  console.log(`  Unique DL numbers : ${uniqueDlNums.size}`);

  // Print full sample of ALL status fields on first 5 entry events
  console.log("\n── SAMPLE ENTRY EVENT (first one, full data) ──");
  const sampleEntry = entries[0];
  if (sampleEntry) {
    const slim: any = {};
    for (const [k, v] of Object.entries(sampleEntry)) {
      if (typeof v !== "object" || v === null) slim[k] = v;
    }
    console.log(JSON.stringify(slim, null, 2));
  }
}

main().catch(console.error);
