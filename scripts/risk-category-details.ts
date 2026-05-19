#!/usr/bin/env tsx
/**
 * Show details for each risk category displayed in poc-report.html
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

function div(title: string) {
  console.log(`\n${"═".repeat(80)}`);
  console.log(`  ${title}`);
  console.log("═".repeat(80));
}

async function main() {
  // Fetch all drivers
  const driversSnap = await db.collection("fg_drivers").get();
  const drivers = driversSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

  // Fetch all entry gate events to get contractor info
  const entrySnap = await db.collection("fg_gate_events")
    .where("eventType", "in", ["entry", "contractor_entry"])
    .get();
  const entryByDriverId: Record<string, any> = {};
  for (const doc of entrySnap.docs) {
    const ev = doc.data() as any;
    if (ev.driverId && !entryByDriverId[ev.driverId]) {
      entryByDriverId[ev.driverId] = ev;
    }
  }

  function row(drv: any) {
    const ev = entryByDriverId[drv.id] ?? {};
    const contractor = ev.contractorName ?? drv.contractorName ?? "-";
    const provider   = ev.providerName   ?? drv.providerName   ?? "-";
    const name = drv.fullName ?? drv.driverName ?? "-";
    const dl   = drv.dlNumber ?? "-";
    return `  ${name.padEnd(28)} | ${dl.padEnd(22)} | contractor=${contractor} | provider=${provider}`;
  }

  // ── 1. Invalid DL ────────────────────────────────────────────────────────────
  div("1. INVALID DL (licenseStatus = invalid)");
  const invalid = drivers.filter(d => d.licenseStatus === "invalid");
  console.log(`  Count: ${invalid.length} drivers`);
  console.log(`  ${"Name".padEnd(28)} | ${"DL Number".padEnd(22)} | Contractor | Provider`);
  console.log("  " + "─".repeat(76));
  for (const d of invalid.sort((a,b) => (a.fullName??'').localeCompare(b.fullName??''))) {
    console.log(row(d));
  }

  // ── 2. Blocked / Not in API (transport DL blocked) ───────────────────────────
  div("2. BLOCKED / NOT IN API");
  const blocked = drivers.filter(d =>
    d.licenseStatus === "blocked" ||
    d.transportStatus === "blocked" ||
    (d.verificationDetails?.transportStatus ?? "").toLowerCase().includes("block") ||
    (d.dlVerification?.transportStatus ?? "").toLowerCase().includes("block") ||
    (d.apiStatus ?? "").toLowerCase().includes("block")
  );
  console.log(`  Count: ${blocked.length} drivers`);
  console.log(`  ${"Name".padEnd(28)} | ${"DL Number".padEnd(22)} | transportStatus | licenseStatus`);
  console.log("  " + "─".repeat(76));
  for (const d of blocked.sort((a,b) => (a.fullName??'').localeCompare(b.fullName??''))) {
    const ts = d.transportStatus ?? d.verificationDetails?.transportStatus ?? d.dlVerification?.transportStatus ?? "-";
    console.log(`  ${(d.fullName??'-').padEnd(28)} | ${(d.dlNumber??'-').padEnd(22)} | ts=${ts} | ls=${d.licenseStatus??'-'}`);
  }

  // ── 3. All unique statuses/fields to understand schema ───────────────────────
  div("3. SCHEMA EXPLORATION — unique field values across all drivers");
  const statusFields = new Set<string>();
  const statusValues: Record<string, Set<string>> = {};
  for (const d of drivers) {
    for (const [k, v] of Object.entries(d)) {
      if (typeof v === "string" && (
        k.toLowerCase().includes("status") ||
        k.toLowerCase().includes("risk") ||
        k.toLowerCase().includes("flag") ||
        k.toLowerCase().includes("court") ||
        k.toLowerCase().includes("expired") ||
        k.toLowerCase().includes("endorse") ||
        k.toLowerCase().includes("verify") ||
        k.toLowerCase().includes("valid")
      )) {
        statusFields.add(k);
        if (!statusValues[k]) statusValues[k] = new Set();
        statusValues[k].add(v);
      }
    }
    // Check nested verificationDetails / dlVerification
    for (const nested of ["verificationDetails", "dlVerification", "apiResponse"]) {
      if (d[nested] && typeof d[nested] === "object") {
        for (const [k, v] of Object.entries(d[nested])) {
          const fk = `${nested}.${k}`;
          if (typeof v === "string") {
            statusFields.add(fk);
            if (!statusValues[fk]) statusValues[fk] = new Set();
            statusValues[fk].add(v as string);
          }
        }
      }
    }
  }
  for (const f of [...statusFields].sort()) {
    const vals = [...statusValues[f]].slice(0, 10).join(" | ");
    console.log(`  ${f.padEnd(45)} → ${vals}`);
  }

  // ── 4. Print a sample driver document (full) ─────────────────────────────────
  div("4. SAMPLE DRIVER DOCUMENT (first driver, full data)");
  if (drivers[0]) {
    console.log(JSON.stringify(drivers[0], null, 2));
  }
}

main().catch(console.error);
