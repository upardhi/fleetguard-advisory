#!/usr/bin/env tsx
/**
 * Probe script — read sample docs from source collections
 * "Reports" and "VerificationReports" to understand their schema.
 *
 * Run:  npx tsx scripts/probe-source-collections.ts
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";

// ── Load .env.local ───────────────────────────────────────────────────────────
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

// ── Admin SDK ─────────────────────────────────────────────────────────────────
const projectId   = process.env.FIREBASE_ADMIN_PROJECT_ID!;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL!;
const privateKey  = process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, "\n");
if (!projectId || !clientEmail || !privateKey) {
  console.error("❌  Admin creds missing from .env.local");
  process.exit(1);
}
if (getApps().length === 0) initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore();

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeStringify(obj: unknown): string {
  return JSON.stringify(obj, (_, v) => {
    if (v instanceof Timestamp) return `Timestamp(${v.toDate().toISOString()})`;
    return v;
  }, 2);
}

async function probeCollection(
  collectionName: string,
  label: string,
  dateField: string,
  ranges: Array<{ label: string; from: Date; to: Date }>,
) {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`📂  Collection: "${collectionName}"  (${label})`);
  console.log(`${"═".repeat(70)}`);

  // First: count total docs
  const totalSnap = await db.collection(collectionName).count().get();
  console.log(`   Total documents: ${totalSnap.data().count}`);

  // List all unique top-level field names from first 20 docs
  const schemaSnap = await db.collection(collectionName).limit(20).get();
  if (schemaSnap.empty) {
    console.log("   ⚠️  Collection is empty");
    return;
  }
  const allKeys = new Set<string>();
  schemaSnap.docs.forEach((d) => Object.keys(d.data()).forEach((k) => allKeys.add(k)));
  console.log(`\n   Field names (from first ${schemaSnap.size} docs):`);
  console.log(`   ${[...allKeys].sort().join(", ")}`);

  // For each date range, pull up to 3 sample docs
  for (const range of ranges) {
    console.log(`\n   ── Date range: ${range.label} ──`);
    try {
      const snap = await db.collection(collectionName)
        .where(dateField, ">=", Timestamp.fromDate(range.from))
        .where(dateField, "<=", Timestamp.fromDate(range.to))
        .orderBy(dateField, "desc")
        .limit(3)
        .get();

      if (snap.empty) {
        console.log(`   ⚠️  No docs found in range using field "${dateField}"`);
        // Try without date filter — show 3 most recent
        const fallback = await db.collection(collectionName).limit(3).get();
        console.log(`   Showing first ${fallback.size} docs (no date filter):`);
        fallback.docs.forEach((d, i) => {
          console.log(`\n   --- Doc ${i + 1}: ${d.id} ---`);
          console.log(safeStringify(d.data()));
        });
      } else {
        console.log(`   Found ${snap.size} docs`);
        snap.docs.forEach((d, i) => {
          console.log(`\n   --- Doc ${i + 1}: ${d.id} ---`);
          console.log(safeStringify(d.data()));
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`   ⚠️  Query error (likely missing index): ${msg}`);
      // Fallback: unfiltered sample
      const fallback = await db.collection(collectionName).limit(3).get();
      console.log(`   Showing first ${fallback.size} docs (unfiltered):`);
      fallback.docs.forEach((d, i) => {
        console.log(`\n   --- Doc ${i + 1}: ${d.id} ---`);
        console.log(safeStringify(d.data()));
      });
    }
  }
}

// ── Date ranges to probe ──────────────────────────────────────────────────────

const dateRanges = [
  {
    label: "April 10, 2026",
    from: new Date("2026-04-10T00:00:00.000Z"),
    to:   new Date("2026-04-10T23:59:59.999Z"),
  },
  {
    label: "April 13, 2026",
    from: new Date("2026-04-13T00:00:00.000Z"),
    to:   new Date("2026-04-13T23:59:59.999Z"),
  },
  {
    label: "After April 16, 2026",
    from: new Date("2026-04-16T00:00:00.000Z"),
    to:   new Date("2026-04-19T23:59:59.999Z"),
  },
];

// Common date field candidates
const DATE_FIELD_CANDIDATES = ["createdAt", "timestamp", "date", "entryTime", "verifiedAt", "reportedAt"];

async function main() {
  // Try each date field candidate for Reports
  let reportsDateField = "createdAt";
  for (const field of DATE_FIELD_CANDIDATES) {
    try {
      const test = await db.collection("Reports")
        .where(field, ">=", Timestamp.fromDate(dateRanges[0].from))
        .limit(1)
        .get();
      if (!test.empty) { reportsDateField = field; break; }
    } catch { /* try next */ }
  }

  let verReportsDateField = "createdAt";
  for (const field of DATE_FIELD_CANDIDATES) {
    try {
      const test = await db.collection("VerificationReports")
        .where(field, ">=", Timestamp.fromDate(dateRanges[0].from))
        .limit(1)
        .get();
      if (!test.empty) { verReportsDateField = field; break; }
    } catch { /* try next */ }
  }

  await probeCollection("Reports", "Source collection 1", reportsDateField, dateRanges);
  await probeCollection("VerificationReports", "Source collection 2", verReportsDateField, dateRanges);

  console.log(`\n${"═".repeat(70)}`);
  console.log("✅  Probe complete");
}

main().catch((err) => { console.error("❌", err); process.exit(1); });
