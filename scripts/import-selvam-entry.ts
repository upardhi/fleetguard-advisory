#!/usr/bin/env tsx
/**
 * One-time import: SELVAM T driver-verification-v3 record
 *
 * Creates (or skips if already present):
 *   1. fg_drivers   — SELVAM T  (DL: TN63-20080005069)
 *   2. fg_vehicles  — TN58BF4597
 *   3. fg_gate_events — entry (2026-04-15 ~00:39) + exit (2026-04-15 20:05)
 *
 * Run:  npx tsx scripts/import-selvam-entry.ts
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";

// ── .env.local ───────────────────────────────────────────────────────────────
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

// ── Admin SDK ────────────────────────────────────────────────────────────────
const projectId   = process.env.FIREBASE_ADMIN_PROJECT_ID!;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL!;
const privateKey  = process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, "\n");
if (!projectId || !clientEmail || !privateKey) {
  console.error("❌  Admin creds missing from .env.local");
  process.exit(1);
}
if (getApps().length === 0) initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore();

// ── Safety guard ─────────────────────────────────────────────────────────────
function col(c: string) {
  if (!c.startsWith("fg_")) throw new Error(`REFUSED: ${c}`);
  return db.collection(c);
}

// ── Source document data ──────────────────────────────────────────────────────

const DRIVER_NAME   = "SELVAM T";
const DL_NUMBER     = "TN63-20080005069";
const FATHER_NAME   = "THANGARAJU";
const VEHICLE_REG   = "TN58BF4597";
const PHOTO_URL     =
  "https://storage.googleapis.com/fleetguard-f.firebasestorage.app/driver-photos/TN63-20080005069.jpg";

// Timestamps from the original doc
const ENTRY_TIME = new Date(1776254399 * 1000); // 2026-04-15
const EXIT_TIME  = new Date("2026-04-15T20:05:23.892Z");

// Signzy crime-check snapshot
const SIGNZY_POLL_DATA: Record<string, unknown> = {
  total: 1,
  // cases is a single object (signzy quirk for 1 result)
  cases: {
    caseNo:           "",
    cnr:              "",
    caseType:         "Criminal",
    caseCategory:     "criminal",
    caseStatus:       "Pending",
    caseStage:        "Pending",
    courtName:        "CJM Court Tiruchirappalli",
    distName:         "Tiruchirappalli",
    stateName:        "Tamil Nadu",
    underSections:    "138",
    underActs:        "Negotiable Instruments Act",
    registrationDate: "",
    filingDate:       "",
    filingNo:         "",
    firstHearingDate: "",
    nextHearingDate:  "",
    decisionDate:     "",
    name:             DRIVER_NAME,
    oparty:           "",
    algoRisk:         "high risk",
    algo_risk:        "high risk",
    riskType:         "High Risk",
    score:            0,
    fatherMatchType:  "",
    source:           "ecourt",
    f:                "Pending",
  },
  signzyTotalCases: 1,
  signzyTransformedResult: {
    caseDetails: [
      {
        caseNo:      "",
        caseType:    "Criminal",
        caseStatus:  "Pending",
        courtName:   "CJM Court Tiruchirappalli",
        underActs:   "Negotiable Instruments Act",
        underSections: "138 - Cheque Dishonour",
        riskType:    "High Risk",
        distName:    "Tiruchirappalli",
        stateName:   "Tamil Nadu",
      },
    ],
  },
};

const DL_VERIFY_DATA: Record<string, unknown> = {
  licenseStatus: "valid",
  dlNumber: DL_NUMBER,
  name: DRIVER_NAME,
  fatherName: FATHER_NAME,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function normReg(r: string) { return r.replace(/[\s\-]/g, "").toUpperCase(); }

async function findWarehouse(): Promise<{ warehouseId: string; orgId: string; name: string }> {
  // Try common patterns for a Tiruchirappalli / trichy warehouse
  const candidates = [
    db.collection("fg_warehouses").where("city", "==", "Tiruchirappalli").limit(1).get(),
    db.collection("fg_warehouses").where("code", "==", "TRI-01").limit(1).get(),
    db.collection("fg_warehouses").where("name", ">=", "Trichy").where("name", "<=", "Trichy\uf8ff").limit(1).get(),
    db.collection("fg_warehouses").where("name", ">=", "Tiruchi").where("name", "<=", "Tiruchi\uf8ff").limit(1).get(),
  ];

  for (const q of candidates) {
    const snap = await q;
    if (!snap.empty) {
      const d = snap.docs[0]!;
      const data = d.data() as { orgId?: string; name?: string };
      if (data.orgId) return { warehouseId: d.id, orgId: data.orgId, name: data.name ?? d.id };
    }
  }

  // Fallback: list all warehouses so user can see what's available
  const all = await db.collection("fg_warehouses").get();
  console.log("\n⚠️  No Tiruchirappalli warehouse found. Available warehouses:");
  all.docs.forEach((d) => {
    const x = d.data() as { name?: string; city?: string; code?: string; orgId?: string };
    console.log(`   ${d.id}  |  ${x.name}  |  ${x.city}  |  ${x.code}  |  orgId=${x.orgId}`);
  });
  throw new Error("Cannot proceed — set IMPORT_WAREHOUSE_ID and IMPORT_ORG_ID env vars and re-run.");
}

async function findOrCreateDriver(warehouseId: string, orgId: string): Promise<string> {
  // Check by DL number
  const snap = await col("fg_drivers")
    .where("dlNumber", "==", DL_NUMBER)
    .where("isActive", "==", true)
    .limit(1)
    .get();

  if (!snap.empty) {
    const id = snap.docs[0]!.id;
    console.log(`ℹ️   Driver already exists: ${id} — updating bgStatus → flagged`);
    await col("fg_drivers").doc(id).update({ bgStatus: "flagged", updatedAt: FieldValue.serverTimestamp() });
    return id;
  }

  const far = new Date();
  far.setFullYear(far.getFullYear() + 5);

  const ref = await col("fg_drivers").add({
    fullName:              DRIVER_NAME,
    mobile:                "",
    dlNumber:              DL_NUMBER,
    dlExpiry:              Timestamp.fromDate(far),
    dlStatus:              "clear",
    bgStatus:              "flagged",
    facePhotoUrl:          PHOTO_URL,
    facePhotoStoragePath:  null,
    warehouseId,
    orgId,
    isActive:              true,
    registeredAt:          FieldValue.serverTimestamp(),
    updatedAt:             FieldValue.serverTimestamp(),
  });
  console.log(`✅  fg_drivers   — created SELVAM T (${ref.id})`);
  return ref.id;
}

async function findOrCreateVehicle(warehouseId: string, orgId: string, contractorId: string | null): Promise<string> {
  const normalized = normReg(VEHICLE_REG);

  for (const candidate of [normalized, VEHICLE_REG]) {
    const snap = await col("fg_vehicles")
      .where("registrationNumber", "==", candidate)
      .where("isActive", "==", true)
      .limit(1)
      .get();
    if (!snap.empty) {
      const id = snap.docs[0]!.id;
      console.log(`ℹ️   Vehicle already exists: ${id}`);
      return id;
    }
  }

  const far = new Date();
  far.setFullYear(far.getFullYear() + 5);

  const ref = await col("fg_vehicles").add({
    registrationNumber: normalized,
    vehicleType:        "truck",
    ownerType:          contractorId ? "contractor" : "owned",
    contractorId,
    rcExpiry:           Timestamp.fromDate(far),
    insuranceExpiry:    Timestamp.fromDate(far),
    fitnessExpiry:      Timestamp.fromDate(far),
    pucExpiry:          Timestamp.fromDate(far),
    status:             "clear",
    warehouseId,
    orgId,
    isActive:           true,
    createdAt:          FieldValue.serverTimestamp(),
    updatedAt:          FieldValue.serverTimestamp(),
  });
  console.log(`✅  fg_vehicles  — created ${normalized} (${ref.id})`);
  return ref.id;
}

function vehicleRegVariants(reg: string): string[] {
  const up = reg.toUpperCase().trim();
  return [...new Set([up, up.replace(/[\s\-]/g, "")])];
}

async function createGateEvents(
  driverId: string,
  vehicleId: string | null,
  warehouseId: string,
  orgId: string,
  contractorId: string | null,
): Promise<void> {
  const GUARD_UID  = "system-import";
  const GUARD_NAME = "System Import";

  const crimeCheckData = {
    provider:     "signzy",
    caseId:       "imported",
    capturedAt:   ENTRY_TIME.toISOString(),
    initiateData: {},
    pollData:     SIGNZY_POLL_DATA,
  };

  const dlVerifyDataForEvent = {
    provider:    "signzy",
    capturedAt:  ENTRY_TIME.toISOString(),
    data:        DL_VERIFY_DATA,
  };

  // ── Entry event ──────────────────────────────────────────────────────────
  const entryRef = await col("fg_gate_events").add({
    eventType:        "contractor_entry",
    vehicleReg:       VEHICLE_REG,
    vehicleRegKeys:   vehicleRegVariants(VEHICLE_REG),
    personName:       DRIVER_NAME,
    contractorId,
    contractorName:   null,
    contractorIds:    contractorId ? [contractorId] : [],
    driverId,
    tripId:           null,
    guardUid:         GUARD_UID,
    guardName:        GUARD_NAME,
    time:             Timestamp.fromDate(ENTRY_TIME),
    status:           "exited",          // already exited — will be closed below
    warehouseId,
    orgId,
    photoUrl:         PHOTO_URL,
    photoStoragePath: null,
    overrideReason:   null,
    overriddenByUid:  null,
    entryEventId:     null,
    dlVerifyData:     dlVerifyDataForEvent,
    crimeCheckData,
  });
  console.log(`✅  fg_gate_events — entry event (${entryRef.id})`);

  // ── Exit event ───────────────────────────────────────────────────────────
  const exitRef = await col("fg_gate_events").add({
    eventType:        "contractor_exit",
    vehicleReg:       VEHICLE_REG,
    vehicleRegKeys:   vehicleRegVariants(VEHICLE_REG),
    personName:       DRIVER_NAME,
    contractorId,
    contractorName:   null,
    contractorIds:    contractorId ? [contractorId] : [],
    driverId,
    tripId:           null,
    guardUid:         GUARD_UID,
    guardName:        GUARD_NAME,
    time:             Timestamp.fromDate(EXIT_TIME),
    status:           "exited",
    warehouseId,
    orgId,
    photoUrl:         null,
    photoStoragePath: null,
    overrideReason:   null,
    overriddenByUid:  null,
    entryEventId:     entryRef.id,
    dlVerifyData:     null,
    crimeCheckData:   null,
  });
  console.log(`✅  fg_gate_events — exit event  (${exitRef.id})`);
}

// ── Resolve service provider ──────────────────────────────────────────────────
async function resolveContractor(orgId: string): Promise<string | null> {
  // The external doc had contractorId "401146" — try to find matching FleetGuard provider
  const snap = await col("fg_service_providers")
    .where("orgId", "==", orgId)
    .where("isActive", "==", true)
    .limit(50)
    .get();

  if (snap.empty) {
    console.log("ℹ️   No service providers found for this org — contractorId will be null");
    return null;
  }

  // Try to match the first active transport provider (heuristic — adjust if needed)
  const transport = snap.docs.find((d) => {
    const t = (d.data().type ?? "").toLowerCase();
    return t === "transport" || t === "3pl";
  });
  const match = transport ?? snap.docs[0]!;
  console.log(`ℹ️   Resolved service provider: ${match.id} (${match.data().name})`);
  return match.id;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  // Allow env override
  const envWhId  = process.env.IMPORT_WAREHOUSE_ID;
  const envOrgId = process.env.IMPORT_ORG_ID;

  let warehouseId: string;
  let orgId: string;
  let whName: string;

  if (envWhId && envOrgId) {
    warehouseId = envWhId;
    orgId       = envOrgId;
    whName      = envWhId;
    console.log(`ℹ️   Using env override: warehouseId=${warehouseId} orgId=${orgId}`);
  } else {
    const wh = await findWarehouse();
    warehouseId = wh.warehouseId;
    orgId       = wh.orgId;
    whName      = wh.name;
    console.log(`ℹ️   Warehouse: ${whName} (${warehouseId}) · org: ${orgId}`);
  }

  const contractorId = await resolveContractor(orgId);
  const driverId     = await findOrCreateDriver(warehouseId, orgId);
  const vehicleId    = await findOrCreateVehicle(warehouseId, orgId, contractorId);
  await createGateEvents(driverId, vehicleId, warehouseId, orgId, contractorId);

  console.log("\n🎉  Import complete.");
  console.log(`   Driver  : ${driverId}`);
  console.log(`   Vehicle : ${vehicleId}`);
}

main().catch((err) => { console.error("❌", err); process.exit(1); });
