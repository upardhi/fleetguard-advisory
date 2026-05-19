#!/usr/bin/env tsx
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs"; import path from "path";

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
if (getApps().length === 0) initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore();

const DRIVERS = [
  { id: "drv_itc_MH2020120005484",   dl: "MH20-20120005484",   name: "KAILASH KHARAT"   },
  { id: "drv_itc_TN4919940002301DL", dl: "TN49-19940002301DL", name: "(unknown)"         },
  { id: "drv_itc_WB2320150223071",   dl: "WB23-20150223071",   name: "BHASKAR ADHIKARY"  },
];

// Also check gate events for ALL 25 invalid DLs even if no driver record
const ALL_DLS = [
  "MH02-20190056789","MH12-2010149313","MH14-20100053690",
  "MH20-200300200","MH20-20120005484","MH31-20090083965",
  "MH32-20130001716","MH32-223232","MH35-20240003526",
  "MH35-20250010200","MH76-88989","MH78-7878787878787",
  "TN45-1981000454","TN45-200312083","TN45-200618914",
  "TN45-20145871","TN45-Z20160074","TN46-2002001315",
  "TN46-20193981","TN49-19940002301DL","TN57-19994399",
  "UP26-202000135226","UP34-20160001578","UP70-20250033711",
  "WB23-20150223071",
];

async function main() {
  console.log(`\nProject: ${projectId}`);
  console.log("═".repeat(80));

  // 1. Check by driverId for the 3 known records
  console.log("\n── By driverId (3 records with fg_drivers docs) ─────────────────────────\n");
  let totalById = 0;
  for (const d of DRIVERS) {
    const snap = await db.collection("fg_gate_events").where("driverId", "==", d.id).get();
    totalById += snap.size;
    console.log(`  ${d.dl.padEnd(26)} ${d.name.padEnd(22)} → ${snap.size} events`);
    for (const doc of snap.docs) {
      const ev = doc.data();
      const ts = ev.createdAt?.toDate?.()?.toISOString?.() ?? ev.time?.toDate?.()?.toISOString?.() ?? "?";
      console.log(`    ${doc.id}  type=${ev.eventType ?? "?"}  ${ts.slice(0,10)}`);
    }
  }
  console.log(`\n  Total by driverId: ${totalById}`);

  // 2. Check by dlNumber field across all 25
  console.log("\n── By dlNumber field (all 25 invalid DLs) ───────────────────────────────\n");
  let totalByDl = 0;
  for (const dl of ALL_DLS) {
    const snap = await db.collection("fg_gate_events").where("dlNumber", "==", dl).get();
    if (snap.size > 0) {
      totalByDl += snap.size;
      console.log(`  ${dl.padEnd(26)} → ${snap.size} event(s)`);
      for (const doc of snap.docs) {
        const ev = doc.data();
        const ts = ev.createdAt?.toDate?.()?.toISOString?.() ?? ev.time?.toDate?.()?.toISOString?.() ?? "?";
        console.log(`    ${doc.id}  type=${ev.eventType ?? "?"}  ${ts.slice(0,10)}`);
      }
    } else {
      console.log(`  ${dl.padEnd(26)} → 0`);
    }
  }
  console.log(`\n  Total by dlNumber: ${totalByDl}`);
  console.log("\n" + "═".repeat(80) + "\n");
}

main().catch(e => { console.error("❌", e); process.exit(1); });
