#!/usr/bin/env tsx
/**
 * Show details for each risk category in poc-report.html
 * Schema fields:
 *   dlApiStatus  : "id_found" | "invalid" | "failed" | "" | "Active" | "success"
 *   dlStatus     : "clear" | "blocked" | "expired" | "expiring"
 *   dlInvalidReason: "api_not_found" | "personal_dl_only" | "api_invalid" | "transport_expired"
 *   bgStatus     : "flagged" | "clear"
 *   crimeTotalCases: number
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

function hdr(title: string) {
  console.log(`\n${"═".repeat(90)}`);
  console.log(`  ${title}`);
  console.log(`${"═".repeat(90)}`);
  console.log(`  ${"Name".padEnd(30)} ${"DL Number".padEnd(24)} ${"Contractor / Provider".padEnd(32)} Extra`);
  console.log(`  ${"─".repeat(86)}`);
}

async function main() {
  // Load all drivers
  const snap = await db.collection("fg_drivers").get();
  const drivers = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));

  // Load contractor info from entry events
  const evSnap = await db.collection("fg_gate_events")
    .where("eventType", "in", ["entry", "contractor_entry"])
    .get();
  const evByDriverId: Record<string, any> = {};
  for (const doc of evSnap.docs) {
    const ev = doc.data() as any;
    if (ev.driverId && !evByDriverId[ev.driverId]) {
      evByDriverId[ev.driverId] = ev;
    }
  }

  function contractor(d: any) {
    const ev = evByDriverId[d.id] ?? {};
    return ev.contractorName ?? ev.providerName ?? d.serviceProviderName ?? "-";
  }

  function printRow(d: any, extra = "") {
    const name = (d.fullName ?? d.driverName ?? "-").slice(0, 29);
    const dl   = (d.dlNumber ?? "-").slice(0, 23);
    const co   = contractor(d).slice(0, 31);
    console.log(`  ${name.padEnd(30)} ${dl.padEnd(24)} ${co.padEnd(32)} ${extra}`);
  }

  // ── 1. INVALID DL ─────────────────────────────────────────────────────────────
  // dlApiStatus === "invalid" OR dlInvalidReason === "api_invalid"
  const invalidDL = drivers.filter(d =>
    d.dlApiStatus === "invalid" ||
    d.dlInvalidReason === "api_invalid"
  );
  hdr(`1. INVALID DL — ${invalidDL.length} drivers`);
  for (const d of invalidDL.sort((a,b)=>(a.fullName??'').localeCompare(b.fullName??''))) {
    printRow(d, `reason=${d.dlInvalidReason ?? "-"}`);
  }

  // ── 2. BLOCKED / NOT IN API — dlStatus === "blocked" ─────────────────────────
  const blocked = drivers.filter(d => d.dlStatus === "blocked");
  const blockedDLs = new Set(blocked.map(d => d.dlNumber)).size;
  hdr(`2. BLOCKED / NOT IN API — ${blocked.length} drivers / ${blockedDLs} DLs`);
  for (const d of blocked.sort((a,b)=>(a.fullName??'').localeCompare(b.fullName??''))) {
    printRow(d, `dlStatus=blocked | transportValidTo=${d.dlTransportValidTo ?? "-"}`);
  }

  // ── 3. TRANSPORT DL EXPIRED — dlInvalidReason === "transport_expired" ─────────
  const tExpired = drivers.filter(d => d.dlInvalidReason === "transport_expired");
  const tExpiredDLs = new Set(tExpired.map(d => d.dlNumber)).size;
  hdr(`3. TRANSPORT DL EXPIRED — ${tExpired.length} drivers / ${tExpiredDLs} DLs`);
  for (const d of tExpired.sort((a,b)=>(a.fullName??'').localeCompare(b.fullName??''))) {
    printRow(d, `transportValidTo=${d.dlTransportValidTo ?? "-"}`);
  }

  // ── 4. NO TRANSPORT ENDORSEMENT — dlInvalidReason === "personal_dl_only" ──────
  const noTransport = drivers.filter(d => d.dlInvalidReason === "personal_dl_only");
  const noTransportDLs = new Set(noTransport.map(d => d.dlNumber)).size;
  hdr(`4. NO TRANSPORT ENDORSEMENT — ${noTransport.length} drivers / ${noTransportDLs} DLs`);
  for (const d of noTransport.sort((a,b)=>(a.fullName??'').localeCompare(b.fullName??''))) {
    printRow(d, `dlNonTransportValidTo=${d.dlNonTransportValidTo ?? "-"}`);
  }

  // ── 5. DL NOT FOUND IN API — dlInvalidReason === "api_not_found" ─────────────
  const notFound = drivers.filter(d => d.dlInvalidReason === "api_not_found");
  const notFoundDLs = new Set(notFound.map(d => d.dlNumber)).size;
  hdr(`5. DL NOT FOUND IN API — ${notFound.length} drivers / ${notFoundDLs} DLs`);
  for (const d of notFound.sort((a,b)=>(a.fullName??'').localeCompare(b.fullName??''))) {
    printRow(d, `dlApiStatus=${d.dlApiStatus ?? "-"}`);
  }

  // ── 6. EXPIRED DL — dlStatus === "expired" ────────────────────────────────────
  const expired = drivers.filter(d => d.dlStatus === "expired");
  hdr(`6. EXPIRED DL — ${expired.length} drivers`);
  for (const d of expired.sort((a,b)=>(a.fullName??'').localeCompare(b.fullName??''))) {
    printRow(d, `dlNonTransportValidTo=${d.dlNonTransportValidTo ?? "-"}`);
  }

  // ── 7. COURT RECORDS — bgStatus === "flagged" ────────────────────────────────
  const court = drivers.filter(d => d.bgStatus === "flagged");
  hdr(`7. COURT RECORDS — ${court.length} drivers`);
  for (const d of court.sort((a,b)=>(a.fullName??'').localeCompare(b.fullName??''))) {
    const cases = d.crimeTotalCases ?? 0;
    const active = d.crimeActiveCases ?? 0;
    const sections = (d.crimeCases ?? []).map((c:any) => c.sections).filter(Boolean).join(", ");
    printRow(d, `cases=${cases} active=${active} sections=[${sections}]`);
  }

  // ── 8. UNIQUE FLAGGED DRIVERS (any risk) ──────────────────────────────────────
  const allRiskyIds = new Set([
    ...invalidDL, ...blocked, ...tExpired, ...noTransport,
    ...notFound, ...expired, ...court
  ].map(d => d.id));
  console.log(`\n${"═".repeat(90)}`);
  console.log(`  SUMMARY`);
  console.log(`${"═".repeat(90)}`);
  console.log(`  Invalid DL              : ${invalidDL.length} drivers`);
  console.log(`  Blocked / Not in API    : ${blocked.length} drivers / ${blockedDLs} DLs`);
  console.log(`  Transport DL Expired    : ${tExpired.length} drivers / ${tExpiredDLs} DLs`);
  console.log(`  No Transport Endorsement: ${noTransport.length} drivers / ${noTransportDLs} DLs`);
  console.log(`  DL Not Found in API     : ${notFound.length} drivers / ${notFoundDLs} DLs`);
  console.log(`  Expired DL              : ${expired.length} drivers`);
  console.log(`  Court Records           : ${court.length} drivers`);
  console.log(`  ─────────────────────────────────────────`);
  console.log(`  UNIQUE FLAGGED DRIVERS  : ${allRiskyIds.size}`);
  console.log(`${"═".repeat(90)}\n`);
}

main().catch(console.error);
