#!/usr/bin/env tsx
/**
 * Risk breakdown for Trichy DC POC (Apr 10–23 2026)
 * Based on entry gate events → driver records
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
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
  // Get all entry events for Trichy warehouse
  const from = Timestamp.fromDate(new Date("2026-04-10T00:00:00Z"));
  const to   = Timestamp.fromDate(new Date("2026-04-24T00:00:00Z"));

  const evSnap = await db.collection("fg_gate_events")
    .where("warehouseId", "==", "wh_itc_trichy")
    .where("eventType", "in", ["entry", "contractor_entry"])
    .get();

  const entries = evSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

  // Date filter (Apr 10–23)
  const pocEntries = entries.filter(e => {
    const t = e.createdAt?.toDate?.();
    if (!t) return true; // include events with no timestamp
    return t >= from.toDate() && t < to.toDate();
  });

  console.log(`\nTotal Trichy entry events (all time): ${entries.length}`);
  console.log(`Trichy entry events Apr 10–23:         ${pocEntries.length}`);

  // Get unique driverIds from POC entries
  const driverIds = new Set(pocEntries.map(e => e.driverId).filter(Boolean));
  console.log(`Unique driverIds in POC:               ${driverIds.size}`);
  const dlNums = new Set(pocEntries.map(e => e.dlNumber).filter(Boolean));
  console.log(`Unique DL numbers in POC:              ${dlNums.size}`);

  // Look at dlInvalidReason in gate events themselves
  const byEventReason: Record<string, number> = {};
  for (const e of pocEntries) {
    const r = e.dlInvalidReason ?? "(null)";
    byEventReason[r] = (byEventReason[r] ?? 0) + 1;
  }
  console.log("\ndlInvalidReason on gate events:");
  for (const [k,v] of Object.entries(byEventReason).sort()) console.log(`  ${k.padEnd(30)} : ${v}`);

  // Load all driver records for these driverIds
  const driverMap: Record<string, any> = {};
  const batchSize = 30;
  const idArr = [...driverIds];
  for (let i = 0; i < idArr.length; i += batchSize) {
    const batch = idArr.slice(i, i + batchSize);
    const dSnap = await db.collection("fg_drivers").where("__name__", "in", batch).get();
    for (const d of dSnap.docs) {
      driverMap[d.id] = { id: d.id, ...d.data() };
    }
  }
  console.log(`\nDriver records loaded: ${Object.keys(driverMap).length} of ${driverIds.size}`);

  const drivers = Object.values(driverMap) as any[];

  // Status breakdowns
  const byDlStatus: Record<string, number> = {};
  const byApiStatus: Record<string, number> = {};
  const byReason: Record<string, number> = {};
  const byBg: Record<string, number> = {};
  for (const d of drivers) {
    const s1 = d.dlStatus ?? "(null)"; byDlStatus[s1] = (byDlStatus[s1]??0)+1;
    const s2 = d.dlApiStatus ?? "(null)"; byApiStatus[s2] = (byApiStatus[s2]??0)+1;
    const s3 = d.dlInvalidReason ?? "(null)"; byReason[s3] = (byReason[s3]??0)+1;
    const s4 = d.bgStatus ?? "(null)"; byBg[s4] = (byBg[s4]??0)+1;
  }

  console.log("\ndlStatus:");
  for (const [k,v] of Object.entries(byDlStatus).sort()) console.log(`  ${k.padEnd(20)}: ${v}`);
  console.log("\ndlApiStatus:");
  for (const [k,v] of Object.entries(byApiStatus).sort()) console.log(`  ${k.padEnd(20)}: ${v}`);
  console.log("\ndlInvalidReason:");
  for (const [k,v] of Object.entries(byReason).sort()) console.log(`  ${k.padEnd(30)}: ${v}`);
  console.log("\nbgStatus:");
  for (const [k,v] of Object.entries(byBg).sort()) console.log(`  ${k.padEnd(20)}: ${v}`);

  // Now the actual categories
  const invalidDL    = drivers.filter(d => d.dlApiStatus === "invalid" || d.dlInvalidReason === "api_invalid");
  const blocked      = drivers.filter(d => d.dlStatus === "blocked");
  const tExpired     = drivers.filter(d => d.dlInvalidReason === "transport_expired");
  const noTransport  = drivers.filter(d => d.dlInvalidReason === "personal_dl_only");
  const notFound     = drivers.filter(d => d.dlInvalidReason === "api_not_found");
  const expiredDL    = drivers.filter(d => d.dlStatus === "expired");
  const court        = drivers.filter(d => d.bgStatus === "flagged");

  console.log("\n── RISK CATEGORY COUNTS (Trichy POC drivers) ──");
  console.log(`  Invalid DL              : ${invalidDL.length}`);
  console.log(`  Blocked                 : ${blocked.length}`);
  console.log(`  Transport Expired       : ${tExpired.length}`);
  console.log(`  No Transport Endorsement: ${noTransport.length}`);
  console.log(`  DL Not Found in API     : ${notFound.length}`);
  console.log(`  Expired DL              : ${expiredDL.length}`);
  console.log(`  Court Records           : ${court.length}`);

  const allRiskyIds = new Set([...invalidDL,...blocked,...tExpired,...noTransport,...notFound,...expiredDL,...court].map(d=>d.id));
  console.log(`  UNIQUE FLAGGED          : ${allRiskyIds.size}`);

  // For the "52 drv / 44 DLs blocked" mystery — check dlHasTransport=false
  const noTransportField = drivers.filter(d => d.dlHasTransport === false);
  const noTransportDLs = new Set(noTransportField.map(d => d.dlNumber)).size;
  console.log(`\n  dlHasTransport=false    : ${noTransportField.length} drivers / ${noTransportDLs} DLs`);

  // Separately show drivers where dlApiStatus is blank/failed/null
  const apiIssue = drivers.filter(d => !d.dlApiStatus || d.dlApiStatus === "" || d.dlApiStatus === "failed");
  const apiIssueDLs = new Set(apiIssue.map(d => d.dlNumber)).size;
  console.log(`  dlApiStatus blank/failed: ${apiIssue.length} drivers / ${apiIssueDLs} DLs`);

  // Show all events that don't have a matching driver record
  const missingDriverIds = [...driverIds].filter(id => !driverMap[id]);
  console.log(`\nEntry events with no driver record: ${missingDriverIds.length} driverIds`);
  for (const id of missingDriverIds.slice(0, 10)) {
    const ev = pocEntries.find(e => e.driverId === id);
    console.log(`  driverId=${id}  dl=${ev?.dlNumber}  name=${ev?.personName ?? ev?.driverName}`);
  }
}

main().catch(console.error);
