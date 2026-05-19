#!/usr/bin/env tsx
/**
 * FleetGuard — ITC tenant seed
 *
 * Seeds ITC-specific data:
 *   • fg_organisations (ITC)               — create if missing, else reuse
 *   • fg_users          (company admin + managers)
 *   • fg_users          (guards)
 *   • fg_warehouses     (3 ITC warehouses)
 *   • fg_warehouse_gates (gates per warehouse)
 *   • fg_service_providers
 *
 * Safe to re-run — every write is idempotent (deterministic IDs + merge:true).
 *
 * Usage:
 *   npm run seed:itc
 *
 * Optional env:
 *   SEED_ITC_ORG_ID       (default: auto-discovered by shortCode=ITC, else created)
 *   SEED_ITC_ADMIN_EMAIL  (default: itc@fleetguard.poc)
 *   SEED_ITC_ADMIN_PW     (default: ITC@123456)
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import fs from "fs";
import path from "path";

// ── Load .env.local ──────────────────────────────────────────────────────────
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

// ── Admin SDK init ───────────────────────────────────────────────────────────
const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID!;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL!;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, "\n");
if (!projectId || !clientEmail || !privateKey) {
  console.error("❌  Admin creds not set in .env.local");
  process.exit(1);
}
if (getApps().length === 0) {
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}
const db = getFirestore();
const fbAuth = getAuth();

// ── Safety guard ─────────────────────────────────────────────────────────────
function assertFg(col: string) {
  if (!col.startsWith("fg_")) throw new Error(`REFUSED: ${col} is not an fg_* collection`);
}
async function setDoc(col: string, id: string, data: Record<string, unknown>) {
  assertFg(col);
  await db
    .collection(col)
    .doc(id)
    .set({ ...data, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  // Stamp createdAt only once
  const snap = await db.collection(col).doc(id).get();
  if (!snap.data()?.createdAt) {
    await db.collection(col).doc(id).update({ createdAt: FieldValue.serverTimestamp() });
  }
}

// ── Config ───────────────────────────────────────────────────────────────────
const ADMIN_EMAIL = process.env.SEED_ITC_ADMIN_EMAIL ?? "itc@fleetguard.poc";
const ADMIN_PW = process.env.SEED_ITC_ADMIN_PW ?? "ITC@123456";

// ── Step 1: org ──────────────────────────────────────────────────────────────
async function ensureOrg(): Promise<{ orgId: string; orgName: string }> {
  // 1a) Env override
  const envOrgId = process.env.SEED_ITC_ORG_ID;
  if (envOrgId) {
    const snap = await db.collection("fg_organisations").doc(envOrgId).get();
    if (snap.exists) {
      const data = snap.data() as { name?: string };
      console.log(`ℹ️   Using SEED_ITC_ORG_ID=${envOrgId} (${data.name ?? "unnamed"})`);
      return { orgId: envOrgId, orgName: data.name ?? "ITC" };
    }
    console.warn(`⚠️   SEED_ITC_ORG_ID=${envOrgId} not found — falling back to discovery`);
  }

  // 1b) Find existing ITC org by shortCode
  const existing = await db
    .collection("fg_organisations")
    .where("shortCode", "==", "ITC")
    .limit(1)
    .get();
  if (!existing.empty) {
    const doc = existing.docs[0];
    console.log(`ℹ️   Found existing ITC org: ${doc.id}`);
    return { orgId: doc.id, orgName: (doc.data().name as string) ?? "ITC Limited" };
  }

  // 1c) Create new ITC org (deterministic id)
  const orgId = "org_itc_poc";
  await setDoc("fg_organisations", orgId, {
    name: "ITC Limited",
    shortCode: "ITC",
    contactName: "ITC Ops Admin",
    contactEmail: ADMIN_EMAIL,
    contactPhone: "+91 98200 00001",
    address: "ITC Centre, 37 J.L. Nehru Road",
    city: "Kolkata",
    state: "West Bengal",
    country: "IN",
    isActive: true,
  });
  console.log(`✅  fg_organisations — created ITC Limited (${orgId})`);
  return { orgId, orgName: "ITC Limited" };
}

// ── Step 2: warehouses ───────────────────────────────────────────────────────
interface ItcWarehouse {
  id: string;
  name: string;
  code: string;
  address: string;
  city: string;
  state: string;
  region: string;
  lat: number;
  lng: number;
}

async function seedWarehouses(orgId: string): Promise<ItcWarehouse[]> {
  const warehouses: ItcWarehouse[] = [
    {
      id: "wh_itc_bengaluru",
      name: "ITC Bengaluru Hub",
      code: "BLR-01",
      address: "Plot 12, KIADB Industrial Area, Bommasandra",
      city: "Bengaluru",
      state: "Karnataka",
      region: "South",
      lat: 12.8154,
      lng: 77.6935,
    },
    {
      id: "wh_itc_kolkata",
      name: "ITC Kolkata DC",
      code: "KOL-01",
      address: "Taratala Industrial Estate, Block B",
      city: "Kolkata",
      state: "West Bengal",
      region: "East",
      lat: 22.5105,
      lng: 88.3094,
    },
    {
      id: "wh_itc_haridwar",
      name: "ITC Haridwar Plant",
      code: "HDW-01",
      address: "SIDCUL Integrated Industrial Estate, Sector 7",
      city: "Haridwar",
      state: "Uttarakhand",
      region: "North",
      lat: 29.9457,
      lng: 78.1642,
    },
  ];

  for (const w of warehouses) {
    await setDoc("fg_warehouses", w.id, {
      name: w.name,
      code: w.code,
      address: w.address,
      city: w.city,
      state: w.state,
      region: w.region,
      orgId,
      managerId: null,
      isActive: true,
      lat: w.lat,
      lng: w.lng,
    });
  }
  console.log(`✅  fg_warehouses — ${warehouses.length} ITC warehouses`);
  return warehouses;
}

// ── Step 3: auth + fg_users (admin, managers, guards) ────────────────────────
interface UserSpec {
  uidSlug: string; // deterministic suffix
  email: string;
  displayName: string;
  role: "company_admin" | "wh_manager" | "regional_manager" | "cso" | "guard";
  warehouseId: string;
  password: string;
}

async function upsertAuthAndUser(orgId: string, u: UserSpec) {
  let uid: string;
  try {
    uid = (await fbAuth.getUserByEmail(u.email)).uid;
    await fbAuth.updateUser(uid, { displayName: u.displayName, password: u.password });
  } catch {
    uid = (
      await fbAuth.createUser({
        email: u.email,
        password: u.password,
        displayName: u.displayName,
        emailVerified: true,
      })
    ).uid;
  }
  await setDoc("fg_users", uid, {
    uid,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    warehouseId: u.warehouseId,
    orgId,
    isActive: true,
  });
  console.log(`  ↳ ${u.email.padEnd(32)} ${u.role.padEnd(18)} ${u.warehouseId || "—"}`);
}

async function seedUsers(orgId: string, warehouses: ItcWarehouse[]) {
  console.log("ℹ️   Creating auth users + fg_users docs…");

  const specs: UserSpec[] = [
    // Company admin
    {
      uidSlug: "admin",
      email: ADMIN_EMAIL,
      displayName: "ITC Admin",
      role: "company_admin",
      warehouseId: "",
      password: ADMIN_PW,
    },
    // Regional manager (all-India)
    {
      uidSlug: "rm",
      email: "itc.regional@fleetguard.poc",
      displayName: "Rohit Mehta",
      role: "regional_manager",
      warehouseId: "",
      password: "Itc@regional1",
    },
    // CSO
    {
      uidSlug: "cso",
      email: "itc.cso@fleetguard.poc",
      displayName: "Anita Sharma",
      role: "cso",
      warehouseId: "",
      password: "Itc@cso1",
    },
    // WH managers (one per warehouse)
    {
      uidSlug: "mgr-blr",
      email: "itc.manager.blr@fleetguard.poc",
      displayName: "Suresh Rao",
      role: "wh_manager",
      warehouseId: warehouses[0].id,
      password: "Itc@manager1",
    },
    {
      uidSlug: "mgr-kol",
      email: "itc.manager.kol@fleetguard.poc",
      displayName: "Debashis Ghosh",
      role: "wh_manager",
      warehouseId: warehouses[1].id,
      password: "Itc@manager1",
    },
    {
      uidSlug: "mgr-hdw",
      email: "itc.manager.hdw@fleetguard.poc",
      displayName: "Pankaj Chauhan",
      role: "wh_manager",
      warehouseId: warehouses[2].id,
      password: "Itc@manager1",
    },
    // Guards — 2 per warehouse
    {
      uidSlug: "guard-blr-1",
      email: "itc.guard.blr1@fleetguard.poc",
      displayName: "Ravi Kumar",
      role: "guard",
      warehouseId: warehouses[0].id,
      password: "Itc@guard1",
    },
    {
      uidSlug: "guard-blr-2",
      email: "itc.guard.blr2@fleetguard.poc",
      displayName: "Manjunath Shetty",
      role: "guard",
      warehouseId: warehouses[0].id,
      password: "Itc@guard1",
    },
    {
      uidSlug: "guard-kol-1",
      email: "itc.guard.kol1@fleetguard.poc",
      displayName: "Subrata Mondal",
      role: "guard",
      warehouseId: warehouses[1].id,
      password: "Itc@guard1",
    },
    {
      uidSlug: "guard-kol-2",
      email: "itc.guard.kol2@fleetguard.poc",
      displayName: "Tapan Das",
      role: "guard",
      warehouseId: warehouses[1].id,
      password: "Itc@guard1",
    },
    {
      uidSlug: "guard-hdw-1",
      email: "itc.guard.hdw1@fleetguard.poc",
      displayName: "Mahesh Negi",
      role: "guard",
      warehouseId: warehouses[2].id,
      password: "Itc@guard1",
    },
    {
      uidSlug: "guard-hdw-2",
      email: "itc.guard.hdw2@fleetguard.poc",
      displayName: "Dinesh Bisht",
      role: "guard",
      warehouseId: warehouses[2].id,
      password: "Itc@guard1",
    },
  ];

  for (const u of specs) await upsertAuthAndUser(orgId, u);
  console.log(`✅  fg_users — ${specs.length} users (1 admin, 1 RM, 1 CSO, 3 managers, 6 guards)`);
}

// ── Step 4: warehouse gates ──────────────────────────────────────────────────
async function seedGates(orgId: string, warehouses: ItcWarehouse[]) {
  type GateType = "entry" | "exit" | "both";
  const gates: {
    id: string;
    warehouseId: string;
    name: string;
    gateCode: string;
    gateType: GateType;
  }[] = [];

  for (const w of warehouses) {
    gates.push(
      {
        id: `gate_${w.id}_main`,
        warehouseId: w.id,
        name: "Main Gate",
        gateCode: `${w.code}-MG`,
        gateType: "both",
      },
      {
        id: `gate_${w.id}_inbound`,
        warehouseId: w.id,
        name: "Inbound Gate",
        gateCode: `${w.code}-IN`,
        gateType: "entry",
      },
      {
        id: `gate_${w.id}_outbound`,
        warehouseId: w.id,
        name: "Outbound Gate",
        gateCode: `${w.code}-OUT`,
        gateType: "exit",
      }
    );
  }

  for (const g of gates) {
    await setDoc("fg_warehouse_gates", g.id, {
      name: g.name,
      gateCode: g.gateCode,
      gateType: g.gateType,
      warehouseId: g.warehouseId,
      orgId,
      isActive: true,
      notes: null,
    });
  }
  console.log(`✅  fg_warehouse_gates — ${gates.length} gates (3 per warehouse)`);
}

// ── Step 5: service providers ────────────────────────────────────────────────
/**
 * ITC transport service providers — real list supplied by business.
 * All marked `transport` type and org-wide (warehouseId: null).
 */
const ITC_TRANSPORT_PROVIDERS: string[] = [
  "A L TRANS PRIVATE LIMITED",
  "ALLCARGO LOGISTICS LIMITED",
  "AMMAN TRANSPORTS",
  "AVADH SUPPLY CHAIN SOLUTIONS",
  "COSMO CARRYING PRIVATE LIMITED",
  "DELHIVERY LIMITED",
  "GEOFAST PRIVATE LIMITED",
  "INDIA CARRIERS PVT LTD",
  "JAMSHEDPUR TRANSPORT COMPANY LIMITE",
  "JSM LOGISTICS PVT. LTD.",
  "KAPOOR DIESELS GARAGE PVT LTD",
  "LSG & CO",
  "M/S S K Transport Co",
  "OKAY LOGISTICS PRIVATE LIMITED",
  "OM LOGISTICS LTD",
  "OM LOGISTICS SUPPLY CHAIN PRIVATE L",
  "ONE POINT SUPPLY CHAIN SOLUTION",
  "ONMOVE LOGISTICS PRIVATE LIMITED",
  "PATANJALI PARIVAHAN PRIVATE LIMITED",
  "RCI LOGISTICS PVT LTD",
  "S. P. GOLDEN TRANSPORT PVT. LTD.",
  "SAFEXPRESS PRIVATE LIMITED",
  "SAKSHI FREIGHT CARRIERS",
  "SINGAL TRANSPORT CORPORATION",
  "SOUTHERN CARGO CARRIERS (INDIA)",
  "SREE KEERTHI TRANSPORT",
  "Sri Pragati Transports",
  "TIRUPATI LOGISTICS PVT. LTD",
  "VARUN LOGISTICS",
  "VAYUDOOT ROAD CARRIERS PVT LTD",
  "VINSUM AXPRESS INDIA PRIVATE LIMITE",
  "YRC LOGISTICS",
  "ZAST LOGISOLUTIONS PRIVATE LIMITED",
];

/** Generate a stable slug from a company name, safe for use as a Firestore doc id. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

/** Generate a short code (first letters of up to 4 words, uppercased). */
function shortCode(name: string): string {
  const words = name
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !/^(PVT|LTD|LIMITED|PRIVATE|CO|COMPANY|THE|AND)$/i.test(w));
  const letters = words
    .slice(0, 4)
    .map((w) => w[0].toUpperCase())
    .join("");
  return letters || name.slice(0, 4).toUpperCase();
}

async function seedServiceProviders(orgId: string) {
  // Dedupe (SAFEXPRESS appears twice in source list)
  const unique = Array.from(new Set(ITC_TRANSPORT_PROVIDERS));

  for (const name of unique) {
    const id = `sp_itc_${slugify(name)}`;
    await setDoc("fg_service_providers", id, {
      name,
      code: shortCode(name),
      type: "transport",
      contactName: "",
      contactPhone: "",
      contactEmail: "",
      address: "",
      city: "",
      state: "",
      orgId,
      warehouseId: null, // org-wide — available at every ITC warehouse gate
      isActive: true,
      notes: null,
    });
  }
  console.log(`✅  fg_service_providers — ${unique.length} ITC transport providers`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🌱  Seeding ITC tenant on: ${projectId}\n`);
  const { orgId, orgName } = await ensureOrg();
  const warehouses = await seedWarehouses(orgId);
  await seedUsers(orgId, warehouses);
  await seedGates(orgId, warehouses);
  await seedServiceProviders(orgId);

  console.log("");
  console.log("════════════════════════════════════════════════════");
  console.log("  ITC tenant ready");
  console.log("  ──────────────────────────────────────────────────");
  console.log(`  Organisation : ${orgName} (${orgId})`);
  console.log(`  Admin login  : ${ADMIN_EMAIL}`);
  console.log(`  Admin pw     : ${ADMIN_PW}`);
  console.log(`  URL          : /superadmin/companies/${orgId}`);
  console.log("════════════════════════════════════════════════════\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌", err);
  process.exit(1);
});
