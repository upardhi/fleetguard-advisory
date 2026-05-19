#!/usr/bin/env tsx
/**
 * Final risk details for all categories — Trichy DC POC
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
  // All Trichy entry events
  const evSnap = await db.collection("fg_gate_events")
    .where("warehouseId", "==", "wh_itc_trichy")
    .where("eventType", "in", ["entry", "contractor_entry"])
    .get();
  const entries = evSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

  // Load all driver records
  const driverIds = [...new Set(entries.map(e => e.driverId).filter(Boolean))];
  const driverMap: Record<string, any> = {};
  const batchSize = 30;
  for (let i = 0; i < driverIds.length; i += batchSize) {
    const batch = driverIds.slice(i, i + batchSize);
    const dSnap = await db.collection("fg_drivers").where("__name__", "in", batch).get();
    for (const d of dSnap.docs) driverMap[d.id] = { id: d.id, ...d.data() };
  }

  function getContractor(driverId: string): string {
    const ev = entries.find(e => e.driverId === driverId);
    return ev?.contractorName ?? ev?.providerName ?? driverMap[driverId]?.serviceProviderName ?? "-";
  }

  function hdr(title: string) {
    const w = 100;
    console.log(`\n${"═".repeat(w)}`);
    console.log(`  ${title}`);
    console.log(`${"═".repeat(w)}`);
    console.log(`  ${"#".padEnd(4)}${"Name".padEnd(28)}${"DL Number".padEnd(24)}${"Contractor".padEnd(35)}Extra`);
    console.log(`  ${"─".repeat(94)}`);
  }

  function row(i: number, d: any, extra: string) {
    const name = (d.fullName ?? d.driverName ?? "(unknown)").slice(0, 27);
    const dl   = (d.dlNumber ?? "-").slice(0, 23);
    const co   = getContractor(d.id).slice(0, 34);
    console.log(`  ${String(i).padEnd(4)}${name.padEnd(28)}${dl.padEnd(24)}${co.padEnd(35)}${extra}`);
  }

  const drivers = Object.values(driverMap) as any[];

  // ── 1. INVALID DL ─────────────────────────────────────────────────────────────
  const invalidDL = drivers.filter(d => d.dlApiStatus === "invalid" || d.dlInvalidReason === "api_invalid");
  hdr(`1. INVALID DL — ${invalidDL.length} drivers`);
  invalidDL.sort((a,b)=>(a.fullName??'').localeCompare(b.fullName??'')).forEach((d,i)=>row(i+1,d,""));

  // ── 2. BLOCKED / NOT IN API ───────────────────────────────────────────────────
  // dlStatus=blocked OR (dlApiStatus is blank/failed AND dlInvalidReason is null — no API result)
  const blocked = drivers.filter(d => d.dlStatus === "blocked");
  const uniqueBlockedDLs = new Set(blocked.map(d => d.dlNumber)).size;
  hdr(`2. BLOCKED / NOT IN API — ${blocked.length} drivers / ${uniqueBlockedDLs} DL`);
  blocked.sort((a,b)=>(a.fullName??'').localeCompare(b.fullName??'')).forEach((d,i)=>
    row(i+1, d, `dlStatus=${d.dlStatus}`)
  );

  // ── 3. TRANSPORT DL EXPIRED ───────────────────────────────────────────────────
  const tExpired = drivers.filter(d => d.dlInvalidReason === "transport_expired");
  const tExpiredDLs = new Set(tExpired.map(d => d.dlNumber)).size;
  hdr(`3. TRANSPORT DL EXPIRED — ${tExpired.length} drivers / ${tExpiredDLs} DLs`);
  tExpired.sort((a,b)=>(a.fullName??'').localeCompare(b.fullName??'')).forEach((d,i)=>
    row(i+1, d, `transportValidTo=${d.dlTransportValidTo ?? "-"}`)
  );

  // ── 4. NO TRANSPORT ENDORSEMENT ───────────────────────────────────────────────
  const noTrans = drivers.filter(d => d.dlInvalidReason === "personal_dl_only");
  const noTransDLs = new Set(noTrans.map(d => d.dlNumber)).size;
  hdr(`4. NO TRANSPORT ENDORSEMENT — ${noTrans.length} drivers / ${noTransDLs} DLs`);
  noTrans.sort((a,b)=>(a.fullName??'').localeCompare(b.fullName??'')).forEach((d,i)=>
    row(i+1, d, `dlNonTransportValidTo=${d.dlNonTransportValidTo ?? "-"}`)
  );

  // ── 5. DL NOT FOUND IN API ────────────────────────────────────────────────────
  const notFound = drivers.filter(d => d.dlInvalidReason === "api_not_found");
  const notFoundDLs = new Set(notFound.map(d => d.dlNumber)).size;
  hdr(`5. DL NOT FOUND IN API — ${notFound.length} drivers / ${notFoundDLs} DL`);
  notFound.sort((a,b)=>(a.fullName??'').localeCompare(b.fullName??'')).forEach((d,i)=>
    row(i+1, d, `dlApiStatus=${d.dlApiStatus ?? "-"}`)
  );

  // ── 6. EXPIRED DL ─────────────────────────────────────────────────────────────
  const expired = drivers.filter(d => d.dlStatus === "expired");
  hdr(`6. EXPIRED DL — ${expired.length} drivers`);
  expired.sort((a,b)=>(a.fullName??'').localeCompare(b.fullName??'')).forEach((d,i)=>
    row(i+1, d, `dlNonTransportValidTo=${d.dlNonTransportValidTo ?? "-"}`)
  );

  // ── 7. COURT RECORDS ──────────────────────────────────────────────────────────
  const court = drivers.filter(d => d.bgStatus === "flagged");
  hdr(`7. COURT RECORDS — ${court.length} drivers`);
  court.sort((a,b)=>(a.fullName??'').localeCompare(b.fullName??'')).forEach((d,i) => {
    const cases = d.crimeTotalCases ?? 0;
    const active = d.crimeActiveCases ?? 0;
    const sections = (d.crimeCases ?? []).map((c:any) => c.sections).filter(Boolean).slice(0,2).join(" | ");
    row(i+1, d, `cases=${cases} active=${active} [${sections}]`);
  });

  // ── SUMMARY ───────────────────────────────────────────────────────────────────
  const allRiskyIds = new Set([...invalidDL,...blocked,...tExpired,...noTrans,...notFound,...expired,...court].map(d=>d.id));
  console.log(`\n${"═".repeat(100)}`);
  console.log(`  SUMMARY`);
  console.log(`${"═".repeat(100)}`);
  console.log(`  1. Invalid DL               : ${invalidDL.length} drivers`);
  console.log(`  2. Blocked / Not in API      : ${blocked.length} drivers / ${uniqueBlockedDLs} DLs`);
  console.log(`  3. Transport DL Expired      : ${tExpired.length} drivers / ${tExpiredDLs} DLs`);
  console.log(`  4. No Transport Endorsement  : ${noTrans.length} drivers / ${noTransDLs} DLs`);
  console.log(`  5. DL Not Found in API       : ${notFound.length} drivers / ${notFoundDLs} DLs`);
  console.log(`  6. Expired DL                : ${expired.length} drivers`);
  console.log(`  7. Court Records             : ${court.length} drivers`);
  console.log(`  ${"─".repeat(50)}`);
  console.log(`  UNIQUE FLAGGED DRIVERS       : ${allRiskyIds.size}`);
  console.log(`  Total Trichy entry events    : ${entries.length}`);
  console.log(`  Unique driverIds screened    : ${driverIds.length}`);
  console.log(`  Driver records in DB         : ${drivers.length} (${driverIds.length - drivers.length} deleted/missing)`);
  console.log(`${"═".repeat(100)}\n`);
}

main().catch(console.error);
