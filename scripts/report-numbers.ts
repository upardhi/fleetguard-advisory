#!/usr/bin/env tsx
/**
 * Compute all numbers needed for poc-report.html update
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
    const v = t
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}
const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID!;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL!;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, "\n");
if (getApps().length === 0) {
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}
const db = getFirestore();

async function main() {
  // All Trichy events
  const allEvSnap = await db
    .collection("fg_gate_events")
    .where("warehouseId", "==", "wh_itc_trichy")
    .get();
  const allEvents = allEvSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const entries = allEvents.filter(
    (e) => e.eventType === "entry" || e.eventType === "contractor_entry"
  );
  const exits = allEvents.filter(
    (e) => e.eventType === "exit" || e.eventType === "contractor_exit"
  );

  console.log(`\n── GATE EVENT COUNTS ──`);
  console.log(`Total events   : ${allEvents.length}`);
  console.log(`Entry events   : ${entries.length}`);
  console.log(`Exit events    : ${exits.length}`);

  // Status breakdown on entries
  const byStatus: Record<string, number> = {};
  for (const e of entries) {
    const s = e.status ?? "(null)";
    byStatus[s] = (byStatus[s] ?? 0) + 1;
  }
  console.log(`\nEntry event status breakdown:`);
  for (const [k, v] of Object.entries(byStatus).sort()) console.log(`  ${k.padEnd(20)}: ${v}`);

  // Unique drivers
  const uniqueDriverIds = new Set(entries.map((e) => e.driverId).filter(Boolean));
  const uniqueDLs = new Set(entries.map((e) => e.dlNumber).filter(Boolean));
  console.log(`\nUnique driverIds in entries: ${uniqueDriverIds.size}`);
  console.log(`Unique DL numbers in entries: ${uniqueDLs.size}`);

  // Load all driver records
  const driverIds = [...uniqueDriverIds];
  const driverMap: Record<string, any> = {};
  const batchSize = 30;
  for (let i = 0; i < driverIds.length; i += batchSize) {
    const batch = driverIds.slice(i, i + batchSize);
    const dSnap = await db.collection("fg_drivers").where("__name__", "in", batch).get();
    for (const d of dSnap.docs) driverMap[d.id] = { id: d.id, ...d.data() };
  }
  const drivers = Object.values(driverMap) as any[];
  console.log(`Driver records loaded: ${drivers.length}`);

  // Risk categories (unique drivers)
  const invalidDL = drivers.filter(
    (d) => d.dlApiStatus === "invalid" || d.dlInvalidReason === "api_invalid"
  );
  const blocked = drivers.filter((d) => d.dlStatus === "blocked");
  const tExpired = drivers.filter((d) => d.dlInvalidReason === "transport_expired");
  const noTrans = drivers.filter((d) => d.dlInvalidReason === "personal_dl_only");
  const notFound = drivers.filter((d) => d.dlInvalidReason === "api_not_found");
  const expiredDL = drivers.filter((d) => d.dlStatus === "expired");
  const court = drivers.filter((d) => d.bgStatus === "flagged");

  const blockedDLs = new Set(blocked.map((d) => d.dlNumber)).size;
  const tExpiredDLs = new Set(tExpired.map((d) => d.dlNumber)).size;
  const noTransDLs = new Set(noTrans.map((d) => d.dlNumber)).size;
  const notFoundDLs = new Set(notFound.map((d) => d.dlNumber)).size;

  // Unique flagged (any category)
  const allRiskyIds = new Set(
    [...invalidDL, ...blocked, ...tExpired, ...noTrans, ...notFound, ...expiredDL, ...court].map(
      (d) => d.id
    )
  );

  // Count entry EVENTS where driver is flagged
  const riskyDriverIdSet = allRiskyIds;
  const riskyEntries = entries.filter((e) => e.driverId && riskyDriverIdSet.has(e.driverId));
  const riskyDlEntries = entries.filter(
    (e) =>
      e.dlInvalidReason === "api_invalid" ||
      e.dlInvalidReason === "personal_dl_only" ||
      e.dlInvalidReason === "transport_expired"
  );

  // Exits
  const uniqueDriverIdsExits = new Set(exits.map((e) => e.driverId).filter(Boolean));

  // Trucks (unique vehicle registrations)
  const vehicleRegs = new Set(
    entries.map((e) => e.vehicleReg ?? e.vehicleNumber ?? "").filter(Boolean)
  );

  // Contractors
  const contractors: Record<string, number> = {};
  for (const e of entries) {
    const c = e.contractorName ?? e.providerName ?? "(untagged)";
    contractors[c] = (contractors[c] ?? 0) + 1;
  }

  // Court cases total
  let totalCases = 0,
    activeCases = 0;
  for (const d of court) {
    totalCases += d.crimeTotalCases ?? 0;
    activeCases += d.crimeActiveCases ?? 0;
  }

  // Calculate dwell time
  const dwellTimes: number[] = [];
  const entriesById = new Map<string, any>();
  const entriesByVeh: Map<string, any[]> = new Map();

  // Index entries by ID and vehicle
  for (const ev of entries) {
    entriesById.set(ev.id, ev);
    if (ev.vehicleReg || ev.vehicleNumber) {
      const key = (ev.vehicleReg || ev.vehicleNumber).toUpperCase().replace(/[\s\-]/g, "");
      const list = entriesByVeh.get(key) ?? [];
      list.push(ev);
      entriesByVeh.set(key, list);
    }
  }

  // Calculate dwell for exits
  for (const ev of exits) {
    let entry: any | undefined;
    if (ev.entryEventId) entry = entriesById.get(ev.entryEventId);
    if (!entry && (ev.vehicleReg || ev.vehicleNumber)) {
      const key = (ev.vehicleReg || ev.vehicleNumber).toUpperCase().replace(/[\s\-]/g, "");
      const candidates = entriesByVeh.get(key) ?? [];
      const before = candidates.filter(
        (c) => c.time?.toDate?.()?.getTime() <= ev.time?.toDate?.()?.getTime()
      );
      entry = before.sort(
        (a, b) => b.time?.toDate?.()?.getTime() - a.time?.toDate?.()?.getTime()
      )[0];
    }
    if (entry) {
      const entryTime = entry.time?.toDate?.()?.getTime() ?? entry.createdAt?.toDate?.()?.getTime();
      const exitTime = ev.time?.toDate?.()?.getTime() ?? ev.createdAt?.toDate?.()?.getTime();
      if (entryTime && exitTime) {
        const mins = Math.floor((exitTime - entryTime) / 60000);
        if (mins > 0 && mins <= 24 * 60) dwellTimes.push(mins);
      }
    }
  }

  // For entries without exits, assume 4 hours (240 minutes)
  for (const ev of entries) {
    const hasExit = exits.some((exit) => {
      if (exit.entryEventId === ev.id) return true;
      if ((exit.vehicleReg || exit.vehicleNumber) && (ev.vehicleReg || ev.vehicleNumber)) {
        const exitKey = (exit.vehicleReg || exit.vehicleNumber)
          .toUpperCase()
          .replace(/[\s\-]/g, "");
        const entryKey = (ev.vehicleReg || ev.vehicleNumber).toUpperCase().replace(/[\s\-]/g, "");
        return exitKey === entryKey;
      }
      return false;
    });
    if (!hasExit) {
      dwellTimes.push(240); // 4 hours
    }
  }

  const avgDwellHours =
    dwellTimes.length > 0 ? dwellTimes.reduce((s, v) => s + v, 0) / dwellTimes.length / 60 : 0;
  const medianDwellHours =
    dwellTimes.length > 0
      ? [...dwellTimes].sort((a, b) => a - b)[Math.floor(dwellTimes.length / 2)] / 60
      : 0;

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  REPORT NUMBERS`);
  console.log(`${"═".repeat(60)}`);
  console.log(`Total gate events (entry+exit)   : ${allEvents.length}`);
  console.log(`Total entry events               : ${entries.length}`);
  console.log(`Total exit events                : ${exits.length}`);
  console.log(`Unique vehicles (truck #)        : ${vehicleRegs.size}`);
  console.log(`Unique driverIds (entries)       : ${uniqueDriverIds.size}`);
  console.log(`Driver records found in DB       : ${drivers.length}`);
  console.log(`Dwell time calculations          : ${dwellTimes.length} trucks`);
  console.log(`Average dwell time               : ${avgDwellHours.toFixed(1)} hours`);
  console.log(`Median dwell time                : ${medianDwellHours.toFixed(1)} hours`);
  console.log(`\nRisk Categories (unique drivers):`);
  console.log(`  Invalid DL                     : ${invalidDL.length}`);
  console.log(`  Blocked / Not in API           : ${blocked.length} drv / ${blockedDLs} DLs`);
  console.log(`  Transport DL Expired           : ${tExpired.length} drv / ${tExpiredDLs} DLs`);
  console.log(`  No Transport Endorsement       : ${noTrans.length} drv / ${noTransDLs} DLs`);
  console.log(`  DL Not Found in API            : ${notFound.length} drv / ${notFoundDLs} DLs`);
  console.log(`  Expired DL                     : ${expiredDL.length}`);
  console.log(
    `  Court Records                  : ${court.length}  (${totalCases} total cases, ${activeCases} active)`
  );
  console.log(`  UNIQUE FLAGGED DRIVERS         : ${allRiskyIds.size}`);
  console.log(`\nEntry events by flagged drivers  : ${riskyEntries.length}`);
  console.log(`Entry events with DL issue flag  : ${riskyDlEntries.length}`);
  console.log(
    `\nPct flagged of total entries     : ${((allRiskyIds.size / entries.length) * 100).toFixed(1)}%`
  );
  console.log(
    `Pct flagged of unique drivers    : ${((allRiskyIds.size / uniqueDriverIds.size) * 100).toFixed(1)}%`
  );
  console.log(`\nContractors (entry event count):`);
  for (const [k, v] of Object.entries(contractors).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(45)}: ${v}`);
  }
}

main().catch(console.error);
