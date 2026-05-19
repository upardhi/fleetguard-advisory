#!/usr/bin/env tsx
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
  const snap = await db.collection("fg_gate_events")
    .where("dlNumber", ">=", "MH")
    .where("dlNumber", "<", "MI")
    .get();

  // Group by DL
  const byDl: Record<string, any[]> = {};
  for (const doc of snap.docs) {
    const ev = doc.data();
    const dl = ev.dlNumber ?? "";
    if (!byDl[dl]) byDl[dl] = [];
    byDl[dl].push({ id: doc.id, ...ev });
  }

  for (const [dl, events] of Object.entries(byDl).sort()) {
    console.log(`\n${"─".repeat(70)}`);
    console.log(`DL: ${dl}`);
    for (const ev of events) {
      const ts = ev.createdAt?.toDate?.()?.toISOString?.()?.slice(0, 19) ?? "?";
      console.log(`  ${ev.eventType?.padEnd(20)} | ${ts} | provider=${ev.providerName ?? "-"} | company=${ev.companyName ?? "-"} | contractor=${ev.contractorName ?? "-"} | vehicleNo=${ev.vehicleNumber ?? "-"} | driverName=${ev.driverName ?? "-"} | guardId=${ev.guardId ?? "-"} | driverId=${ev.driverId ?? "-"}`);
    }
  }
}

main().catch(console.error);
