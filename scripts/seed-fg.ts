#!/usr/bin/env tsx
/**
 * FleetGuard — full fg_* collection seed
 * Seeds: org · warehouse · users · contractors · drivers · vehicles ·
 *        trips+stops · gate_events · visitor_entries · alerts · incidents
 *
 * Safety: aborts if any collection is already non-empty (re-run = no-op).
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
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
  console.error("❌  Admin creds not set");
  process.exit(1);
}
if (getApps().length === 0)
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore();
const fbAuth = getAuth();

function assertFg(col: string) {
  if (!col.startsWith("fg_")) throw new Error(`REFUSED: ${col}`);
}
async function isEmpty(col: string): Promise<boolean> {
  assertFg(col);
  return (await db.collection(col).limit(1).get()).empty;
}

// ── Constants ────────────────────────────────────────────────────────────────
const ORG_ID = "org_fleetguard_poc";
const WH_ID = "wh_bhiwandi_hub";
const NOW = new Date();
const ts = (d: Date) => Timestamp.fromDate(d);
const min = (m: number) => new Date(NOW.getTime() - m * 60_000);
const hrs = (h: number) => min(h * 60);
const daysAhead = (d: number) => new Date(NOW.getTime() + d * 24 * 3600_000);

// ── Seed: org ────────────────────────────────────────────────────────────────
async function seedOrg() {
  if (!(await isEmpty("fg_organisations"))) {
    console.log("⚠️  fg_organisations — already seeded");
    return;
  }
  await db.collection("fg_organisations").doc(ORG_ID).set({
    name: "FleetGuard POC",
    shortCode: "FG",
    contactName: "Admin User",
    contactEmail: "admin@fleetguard.poc",
    contactPhone: "+91 98000 00001",
    address: "Shed 4, APMC Market Yard",
    city: "Bhiwandi",
    state: "Maharashtra",
    country: "IN",
    isActive: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  console.log("✅  fg_organisations");
}

// ── Seed: warehouse ──────────────────────────────────────────────────────────
async function seedWarehouse() {
  if (!(await isEmpty("fg_warehouses"))) {
    console.log("⚠️  fg_warehouses — already seeded");
    return;
  }
  await db.collection("fg_warehouses").doc(WH_ID).set({
    name: "Bhiwandi Hub",
    city: "Bhiwandi",
    state: "Maharashtra",
    region: "West",
    orgId: ORG_ID,
    isActive: true,
    lat: 19.296,
    lng: 73.065,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  console.log("✅  fg_warehouses");
}

// ── Seed: users ──────────────────────────────────────────────────────────────
async function seedUsers() {
  if (!(await isEmpty("fg_users"))) {
    console.log("⚠️  fg_users — already seeded");
    return;
  }
  const users = [
    {
      email: "guard@fleetguard.poc",
      displayName: "Gate Guard",
      role: "guard",
      pw: process.env.SEED_GUARD_PASSWORD,
    },
    {
      email: "manager@fleetguard.poc",
      displayName: "WH Manager",
      role: "wh_manager",
      pw: process.env.SEED_MANAGER_PASSWORD,
    },
    {
      email: "cso@fleetguard.poc",
      displayName: "Chief Security Officer",
      role: "cso",
      pw: process.env.SEED_CSO_PASSWORD,
    },
  ];
  for (const u of users) {
    if (!u.pw) {
      console.warn(`⚠️  No password env for ${u.email}`);
      continue;
    }
    let uid: string;
    try {
      uid = (await fbAuth.getUserByEmail(u.email)).uid;
    } catch {
      uid = (
        await fbAuth.createUser({
          email: u.email,
          displayName: u.displayName,
          password: u.pw,
          emailVerified: true,
        })
      ).uid;
    }
    await db.collection("fg_users").doc(uid).set({
      uid,
      email: u.email,
      displayName: u.displayName,
      role: u.role,
      warehouseId: WH_ID,
      orgId: ORG_ID,
      isActive: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log(`  ↳ ${u.email} (${u.role})`);
  }
  console.log("✅  fg_users");
}

// ── Seed: contractors ────────────────────────────────────────────────────────
async function seedContractors() {
  if (!(await isEmpty("fg_contractors"))) {
    console.log("⚠️  fg_contractors — already seeded");
    return;
  }
  const rows = [
    {
      id: "ct_01",
      name: "Samarth Logistics",
      contactName: "Rakesh Kulkarni",
      contactMobile: "+91 98201 11201",
      contractEnd: daysAhead(180),
      activeDrivers: 18,
      activeVehicles: 22,
      isComplete: true,
    },
    {
      id: "ct_02",
      name: "Adarsh Roadways",
      contactName: "Priya Shah",
      contactMobile: "+91 99873 41211",
      contractEnd: daysAhead(22),
      activeDrivers: 9,
      activeVehicles: 11,
      isComplete: true,
    },
    {
      id: "ct_03",
      name: "BlueArrow Transport",
      contactName: "Imran Khan",
      contactMobile: "+91 98765 41200",
      contractEnd: daysAhead(410),
      activeDrivers: 24,
      activeVehicles: 30,
      isComplete: true,
    },
    {
      id: "ct_04",
      name: "Hi-Tech Carriers",
      contactName: "",
      contactMobile: "+91 90234 55167",
      contractEnd: null,
      activeDrivers: 2,
      activeVehicles: 2,
      isComplete: false,
    },
    {
      id: "ct_05",
      name: "Laxmi Freight",
      contactName: "Sunita Joshi",
      contactMobile: "+91 96502 12123",
      contractEnd: daysAhead(55),
      activeDrivers: 14,
      activeVehicles: 17,
      isComplete: true,
    },
    {
      id: "ct_06",
      name: "Sree Ganesh Cargo",
      contactName: "Manjunath Rao",
      contactMobile: "+91 95123 77091",
      contractEnd: daysAhead(270),
      activeDrivers: 11,
      activeVehicles: 13,
      isComplete: true,
    },
    {
      id: "ct_07",
      name: "FastLane 3PL",
      contactName: "",
      contactMobile: "+91 97340 22118",
      contractEnd: null,
      activeDrivers: 4,
      activeVehicles: 4,
      isComplete: false,
    },
    {
      id: "ct_08",
      name: "Orbit Movers",
      contactName: "Ayesha Fernandes",
      contactMobile: "+91 99204 18200",
      contractEnd: daysAhead(-7),
      activeDrivers: 6,
      activeVehicles: 8,
      isComplete: true,
    },
  ];
  for (const r of rows) {
    await db
      .collection("fg_contractors")
      .doc(r.id)
      .set({
        ...r,
        warehouseId: WH_ID,
        orgId: ORG_ID,
        isActive: true,
        contractEnd: r.contractEnd ? ts(r.contractEnd) : null,
        quickAdded: !r.isComplete,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
  }
  console.log("✅  fg_contractors (8)");
}

// ── Seed: drivers ────────────────────────────────────────────────────────────
async function seedDrivers() {
  if (!(await isEmpty("fg_drivers"))) {
    console.log("⚠️  fg_drivers — already seeded");
    return;
  }
  const rows = [
    {
      id: "drv_01",
      fullName: "Rajesh Kumar",
      mobile: "+91 98111 20034",
      dlNumber: "MH03 20180012345",
      dlExpiry: daysAhead(540),
      dlStatus: "clear",
      bgStatus: "clear",
    },
    {
      id: "drv_02",
      fullName: "Suresh Yadav",
      mobile: "+91 98765 00201",
      dlNumber: "DL09 20170034982",
      dlExpiry: daysAhead(42),
      dlStatus: "expiring",
      bgStatus: "clear",
    },
    {
      id: "drv_03",
      fullName: "Mohd. Faizal",
      mobile: "+91 90123 66712",
      dlNumber: "KA01 20190066421",
      dlExpiry: daysAhead(18),
      dlStatus: "blocked",
      bgStatus: "flagged",
    },
    {
      id: "drv_04",
      fullName: "Vinod Patil",
      mobile: "+91 98220 11210",
      dlNumber: "MH12 20200087211",
      dlExpiry: daysAhead(720),
      dlStatus: "clear",
      bgStatus: "clear",
    },
    {
      id: "drv_05",
      fullName: "Harpreet Singh",
      mobile: "+91 98988 42140",
      dlNumber: "PB08 20180012990",
      dlExpiry: daysAhead(310),
      dlStatus: "clear",
      bgStatus: "pending",
    },
    {
      id: "drv_06",
      fullName: "Karthik Subramani",
      mobile: "+91 90040 33311",
      dlNumber: "TN22 20190034410",
      dlExpiry: daysAhead(210),
      dlStatus: "clear",
      bgStatus: "clear",
    },
    {
      id: "drv_07",
      fullName: "Arjun Deshmukh",
      mobile: "+91 88888 29201",
      dlNumber: "MH14 20190019903",
      dlExpiry: daysAhead(-12),
      dlStatus: "expired",
      bgStatus: "clear",
    },
    {
      id: "drv_08",
      fullName: "Bikram Das",
      mobile: "+91 90301 88021",
      dlNumber: "WB02 20170087790",
      dlExpiry: daysAhead(55),
      dlStatus: "expiring",
      bgStatus: "recheck_required",
    },
  ];
  for (const r of rows) {
    await db
      .collection("fg_drivers")
      .doc(r.id)
      .set({
        ...r,
        facePhotoUrl: null,
        facePhotoStoragePath: null,
        warehouseId: WH_ID,
        orgId: ORG_ID,
        isActive: true,
        dlExpiry: ts(r.dlExpiry),
        registeredAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
  }
  console.log("✅  fg_drivers (8)");
}

// ── Seed: vehicles ───────────────────────────────────────────────────────────
async function seedVehicles() {
  if (!(await isEmpty("fg_vehicles"))) {
    console.log("⚠️  fg_vehicles — already seeded");
    return;
  }
  const rows = [
    {
      id: "veh_01",
      reg: "MH 04 GA 1234",
      type: "14-T Container",
      owner: "contractor",
      cid: "ct_01",
      rc: daysAhead(540),
      ins: daysAhead(95),
      fit: daysAhead(300),
      puc: daysAhead(61),
      status: "clear",
    },
    {
      id: "veh_02",
      reg: "MH 12 LK 9982",
      type: "9-T Reefer",
      owner: "contractor",
      cid: "ct_02",
      rc: daysAhead(210),
      ins: daysAhead(19),
      fit: daysAhead(140),
      puc: daysAhead(110),
      status: "expiring",
    },
    {
      id: "veh_03",
      reg: "HR 55 AB 8821",
      type: "22-T Trailer",
      owner: "contractor",
      cid: "ct_03",
      rc: daysAhead(-5),
      ins: daysAhead(410),
      fit: daysAhead(45),
      puc: daysAhead(18),
      status: "blocked",
    },
    {
      id: "veh_04",
      reg: "KA 05 MN 6601",
      type: "14-T Container",
      owner: "contractor",
      cid: "ct_01",
      rc: daysAhead(720),
      ins: daysAhead(340),
      fit: daysAhead(201),
      puc: daysAhead(88),
      status: "clear",
    },
    {
      id: "veh_05",
      reg: "TN 18 XY 4410",
      type: "9-T Box Truck",
      owner: "contractor",
      cid: "ct_05",
      rc: daysAhead(140),
      ins: daysAhead(60),
      fit: daysAhead(88),
      puc: daysAhead(44),
      status: "clear",
    },
    {
      id: "veh_06",
      reg: "GJ 01 RT 7712",
      type: "32-T Multi-axle",
      owner: "contractor",
      cid: "ct_03",
      rc: daysAhead(290),
      ins: daysAhead(210),
      fit: daysAhead(140),
      puc: daysAhead(29),
      status: "expiring",
    },
    {
      id: "veh_07",
      reg: "MH 14 DK 3301",
      type: "14-T Container",
      owner: "contractor",
      cid: "ct_01",
      rc: daysAhead(385),
      ins: daysAhead(165),
      fit: daysAhead(245),
      puc: daysAhead(120),
      status: "clear",
    },
    {
      id: "veh_08",
      reg: "UP 16 LM 7520",
      type: "22-T Trailer",
      owner: "contractor",
      cid: "ct_03",
      rc: daysAhead(34),
      ins: daysAhead(122),
      fit: daysAhead(62),
      puc: daysAhead(15),
      status: "expiring",
    },
    {
      id: "veh_09",
      reg: "DL 8C AB 4411",
      type: "9-T Box Truck",
      owner: "owned",
      cid: null,
      rc: daysAhead(610),
      ins: daysAhead(420),
      fit: daysAhead(312),
      puc: daysAhead(190),
      status: "clear",
    },
    {
      id: "veh_10",
      reg: "TS 09 XP 2240",
      type: "14-T Container",
      owner: "contractor",
      cid: "ct_05",
      rc: daysAhead(-18),
      ins: daysAhead(84),
      fit: daysAhead(132),
      puc: daysAhead(71),
      status: "blocked",
    },
    {
      id: "veh_11",
      reg: "KL 07 QR 9931",
      type: "9-T Reefer",
      owner: "contractor",
      cid: "ct_02",
      rc: daysAhead(470),
      ins: daysAhead(275),
      fit: daysAhead(55),
      puc: daysAhead(42),
      status: "expiring",
    },
    {
      id: "veh_12",
      reg: "WB 22 EF 6671",
      type: "32-T Multi-axle",
      owner: "contractor",
      cid: "ct_03",
      rc: daysAhead(220),
      ins: daysAhead(180),
      fit: daysAhead(410),
      puc: daysAhead(101),
      status: "clear",
    },
  ];
  for (const r of rows) {
    await db
      .collection("fg_vehicles")
      .doc(r.id)
      .set({
        registrationNumber: r.reg,
        vehicleType: r.type,
        ownerType: r.owner,
        contractorId: r.cid,
        rcExpiry: ts(r.rc),
        insuranceExpiry: ts(r.ins),
        fitnessExpiry: ts(r.fit),
        pucExpiry: ts(r.puc),
        status: r.status,
        warehouseId: WH_ID,
        orgId: ORG_ID,
        isActive: true,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
  }
  console.log("✅  fg_vehicles (12)");
}

// ── Seed: trips + stops ──────────────────────────────────────────────────────
async function seedTrips() {
  if (!(await isEmpty("fg_trips"))) {
    console.log("⚠️  fg_trips — already seeded");
    return;
  }
  const trips = [
    {
      id: "trp_01",
      tripCode: "TRP-20260415-0142",
      vehicleId: "veh_01",
      vehicleReg: "MH 04 GA 1234",
      driverId: "drv_01",
      driverName: "Rajesh Kumar",
      contractorId: "ct_01",
      contractorName: "Samarth Logistics",
      status: "in_transit",
      warehouseId: WH_ID,
      orgId: ORG_ID,
      totalStops: 4,
      confirmedStops: 2,
      departedAt: ts(hrs(5)),
      plannedReturn: ts(daysAhead(0.3)),
      qrTokenId: null,
      pinHash: null,
      stops: [
        {
          id: "stp_01_1",
          stopOrder: 1,
          dealerName: "Shree Balaji Traders",
          dealerMobile: "+91 98201 44001",
          city: "Thane",
          invoiceCount: 3,
          invoiceNumbers: ["INV-8821", "INV-8822", "INV-8823"],
          deliveryMode: "secure",
          status: "confirmed",
          confirmedAt: ts(hrs(3)),
          dwellMinutes: 22,
        },
        {
          id: "stp_01_2",
          stopOrder: 2,
          dealerName: "Maharaja Retail",
          dealerMobile: "+91 98201 44002",
          city: "Kalyan",
          invoiceCount: 2,
          invoiceNumbers: ["INV-8824", "INV-8825"],
          deliveryMode: "simple",
          status: "confirmed",
          confirmedAt: ts(hrs(1.5)),
          dwellMinutes: 18,
        },
        {
          id: "stp_01_3",
          stopOrder: 3,
          dealerName: "New Vasai Dealers",
          dealerMobile: "+91 98201 44003",
          city: "Vasai",
          invoiceCount: 4,
          invoiceNumbers: ["INV-8826", "INV-8827", "INV-8828", "INV-8829"],
          deliveryMode: "secure",
          status: "pending",
          confirmedAt: null,
          dwellMinutes: null,
        },
        {
          id: "stp_01_4",
          stopOrder: 4,
          dealerName: "Virar Supermarket",
          dealerMobile: "+91 98201 44004",
          city: "Virar",
          invoiceCount: 3,
          invoiceNumbers: ["INV-8830", "INV-8831", "INV-8832"],
          deliveryMode: "simple",
          status: "pending",
          confirmedAt: null,
          dwellMinutes: null,
        },
      ],
    },
    {
      id: "trp_02",
      tripCode: "TRP-20260415-0143",
      vehicleId: "veh_02",
      vehicleReg: "MH 12 LK 9982",
      driverId: "drv_04",
      driverName: "Vinod Patil",
      contractorId: "ct_02",
      contractorName: "Adarsh Roadways",
      status: "in_transit",
      warehouseId: WH_ID,
      orgId: ORG_ID,
      totalStops: 3,
      confirmedStops: 1,
      departedAt: ts(hrs(2)),
      plannedReturn: ts(daysAhead(0.4)),
      qrTokenId: null,
      pinHash: null,
      stops: [
        {
          id: "stp_02_1",
          stopOrder: 1,
          dealerName: "Shivam Traders",
          dealerMobile: "+91 98201 44010",
          city: "Andheri",
          invoiceCount: 2,
          invoiceNumbers: ["INV-9001", "INV-9002"],
          deliveryMode: "secure",
          status: "confirmed",
          confirmedAt: ts(hrs(0.5)),
          dwellMinutes: 14,
        },
        {
          id: "stp_02_2",
          stopOrder: 2,
          dealerName: "Global Mart",
          dealerMobile: "+91 98201 44011",
          city: "Borivali",
          invoiceCount: 3,
          invoiceNumbers: ["INV-9003", "INV-9004", "INV-9005"],
          deliveryMode: "secure",
          status: "pending",
          confirmedAt: null,
          dwellMinutes: null,
        },
        {
          id: "stp_02_3",
          stopOrder: 3,
          dealerName: "Prime Distributors",
          dealerMobile: "+91 98201 44012",
          city: "Malad",
          invoiceCount: 1,
          invoiceNumbers: ["INV-9006"],
          deliveryMode: "simple",
          status: "pending",
          confirmedAt: null,
          dwellMinutes: null,
        },
      ],
    },
    {
      id: "trp_03",
      tripCode: "TRP-20260415-0131",
      vehicleId: "veh_04",
      vehicleReg: "KA 05 MN 6601",
      driverId: "drv_06",
      driverName: "Karthik Subramani",
      contractorId: "ct_01",
      contractorName: "Samarth Logistics",
      status: "returning",
      warehouseId: WH_ID,
      orgId: ORG_ID,
      totalStops: 5,
      confirmedStops: 4,
      departedAt: ts(hrs(9)),
      plannedReturn: ts(daysAhead(0.1)),
      qrTokenId: null,
      pinHash: null,
      stops: [
        {
          id: "stp_03_1",
          stopOrder: 1,
          dealerName: "Indiranagar Traders",
          dealerMobile: "+91 98201 44020",
          city: "Bengaluru",
          invoiceCount: 2,
          invoiceNumbers: ["INV-7701", "INV-7702"],
          deliveryMode: "secure",
          status: "confirmed",
          confirmedAt: ts(hrs(8)),
          dwellMinutes: 10,
        },
        {
          id: "stp_03_2",
          stopOrder: 2,
          dealerName: "Whitefield Cash&Carry",
          dealerMobile: "+91 98201 44021",
          city: "Bengaluru",
          invoiceCount: 4,
          invoiceNumbers: ["INV-7703", "INV-7704", "INV-7705", "INV-7706"],
          deliveryMode: "secure",
          status: "confirmed",
          confirmedAt: ts(hrs(7)),
          dwellMinutes: 24,
        },
        {
          id: "stp_03_3",
          stopOrder: 3,
          dealerName: "Electronic City Marts",
          dealerMobile: "+91 98201 44022",
          city: "Bengaluru",
          invoiceCount: 3,
          invoiceNumbers: ["INV-7707", "INV-7708", "INV-7709"],
          deliveryMode: "simple",
          status: "confirmed",
          confirmedAt: ts(hrs(5)),
          dwellMinutes: 16,
        },
        {
          id: "stp_03_4",
          stopOrder: 4,
          dealerName: "Koramangala Depot",
          dealerMobile: "+91 98201 44023",
          city: "Bengaluru",
          invoiceCount: 2,
          invoiceNumbers: ["INV-7710", "INV-7711"],
          deliveryMode: "secure",
          status: "confirmed",
          confirmedAt: ts(hrs(3)),
          dwellMinutes: 12,
        },
        {
          id: "stp_03_5",
          stopOrder: 5,
          dealerName: "Sarjapur Freshmart",
          dealerMobile: "+91 98201 44024",
          city: "Bengaluru",
          invoiceCount: 1,
          invoiceNumbers: ["INV-7712"],
          deliveryMode: "simple",
          status: "disputed",
          confirmedAt: null,
          dwellMinutes: null,
        },
      ],
    },
    {
      id: "trp_04",
      tripCode: "TRP-20260415-0148",
      vehicleId: "veh_05",
      vehicleReg: "TN 18 XY 4410",
      driverId: "drv_05",
      driverName: "Harpreet Singh",
      contractorId: "ct_05",
      contractorName: "Laxmi Freight",
      status: "planned",
      warehouseId: WH_ID,
      orgId: ORG_ID,
      totalStops: 2,
      confirmedStops: 0,
      departedAt: null,
      plannedReturn: null,
      qrTokenId: null,
      pinHash: null,
      stops: [
        {
          id: "stp_04_1",
          stopOrder: 1,
          dealerName: "Mount Road Mart",
          dealerMobile: "+91 98201 44030",
          city: "Chennai",
          invoiceCount: 5,
          invoiceNumbers: [],
          deliveryMode: "secure",
          status: "pending",
          confirmedAt: null,
          dwellMinutes: null,
        },
        {
          id: "stp_04_2",
          stopOrder: 2,
          dealerName: "Velachery Superstore",
          dealerMobile: "+91 98201 44031",
          city: "Chennai",
          invoiceCount: 3,
          invoiceNumbers: [],
          deliveryMode: "simple",
          status: "pending",
          confirmedAt: null,
          dwellMinutes: null,
        },
      ],
    },
  ];

  for (const trip of trips) {
    const { stops, ...tripData } = trip;
    await db
      .collection("fg_trips")
      .doc(trip.id)
      .set({
        ...tripData,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    for (const stop of stops) {
      const { id: stopId, ...stopData } = stop;
      await db
        .collection("fg_trips")
        .doc(trip.id)
        .collection("fg_trip_stops")
        .doc(stopId)
        .set({
          ...stopData,
          tripId: trip.id,
        });
    }
  }
  console.log("✅  fg_trips (4) + fg_trip_stops (14)");
}

// ── Seed: gate events ────────────────────────────────────────────────────────
async function seedGateEvents() {
  if (!(await isEmpty("fg_gate_events"))) {
    console.log("⚠️  fg_gate_events — already seeded");
    return;
  }
  const events = [
    {
      id: "ge_01",
      eventType: "outbound_exit",
      vehicleReg: "MH 04 GA 1234",
      personName: "Rajesh Kumar",
      contractorId: "ct_01",
      contractorName: "Samarth Logistics",
      driverId: "drv_01",
      tripId: "trp_01",
      time: hrs(5),
      status: "exited",
    },
    {
      id: "ge_02",
      eventType: "inbound_entry",
      vehicleReg: "HR 55 AB 8821",
      personName: "Mohd. Faizal",
      contractorId: "ct_03",
      contractorName: "BlueArrow Transport",
      driverId: "drv_03",
      tripId: null,
      time: hrs(2.5),
      status: "inside",
    },
    {
      id: "ge_03",
      eventType: "visitor_entry",
      vehicleReg: null,
      personName: "Deepa Menon",
      contractorId: null,
      contractorName: null,
      driverId: null,
      tripId: null,
      time: hrs(1.75),
      status: "inside",
    },
    {
      id: "ge_04",
      eventType: "contractor_entry",
      vehicleReg: "MH 47 PK 2020",
      personName: "Sachin Bhosale",
      contractorId: "ct_04",
      contractorName: "Hi-Tech Carriers",
      driverId: null,
      tripId: null,
      time: hrs(1.2),
      status: "inside",
    },
    {
      id: "ge_05",
      eventType: "outbound_entry",
      vehicleReg: "MH 12 LK 9982",
      personName: "Vinod Patil",
      contractorId: "ct_02",
      contractorName: "Adarsh Roadways",
      driverId: "drv_04",
      tripId: "trp_02",
      time: hrs(2.1),
      status: "exited",
    },
    {
      id: "ge_06",
      eventType: "outbound_exit",
      vehicleReg: "MH 12 LK 9982",
      personName: "Vinod Patil",
      contractorId: "ct_02",
      contractorName: "Adarsh Roadways",
      driverId: "drv_04",
      tripId: "trp_02",
      time: hrs(2),
      status: "exited",
    },
    {
      id: "ge_07",
      eventType: "inbound_entry",
      vehicleReg: "GJ 01 RT 7712",
      personName: "Arjun Deshmukh",
      contractorId: "ct_03",
      contractorName: "BlueArrow Transport",
      driverId: "drv_07",
      tripId: null,
      time: min(38),
      status: "inside",
    },
    {
      id: "ge_08",
      eventType: "visitor_entry",
      vehicleReg: null,
      personName: "Rohan Iyer",
      contractorId: null,
      contractorName: null,
      driverId: null,
      tripId: null,
      time: min(12),
      status: "inside",
    },
  ];
  for (const e of events) {
    await db
      .collection("fg_gate_events")
      .doc(e.id)
      .set({
        ...e,
        guardUid: "seed",
        guardName: "Rahul Patil",
        warehouseId: WH_ID,
        orgId: ORG_ID,
        photoUrl: null,
        photoStoragePath: null,
        overrideReason: null,
        overriddenByUid: null,
        time: ts(e.time),
      });
  }
  console.log("✅  fg_gate_events (8)");
}

// ── Seed: visitors ───────────────────────────────────────────────────────────
async function seedVisitors() {
  if (!(await isEmpty("fg_visitor_entries"))) {
    console.log("⚠️  fg_visitor_entries — already seeded");
    return;
  }
  const rows = [
    {
      id: "vl_01",
      visitorType: "visitor",
      fullName: "Deepa Menon",
      mobile: "+91 99001 11001",
      hostName: "Ankit Bhatia",
      purpose: "Commercial review",
      passNumber: "V-2041",
      vehicleNumber: null,
      entryTime: hrs(1.75),
      expectedExit: daysAhead(0.01),
      status: "inside",
      exitTime: null,
    },
    {
      id: "vl_02",
      visitorType: "contractor",
      fullName: "Sachin Bhosale",
      mobile: "+91 99001 11002",
      hostName: "Priya Nair",
      purpose: "Rack maintenance",
      passNumber: "C-1122",
      vehicleNumber: "MH 47 PK 2020",
      entryTime: hrs(1.2),
      expectedExit: hrs(-3),
      status: "inside",
      exitTime: null,
    },
    {
      id: "vl_03",
      visitorType: "visitor",
      fullName: "Rohan Iyer",
      mobile: "+91 99001 11003",
      hostName: "Rahul Patil",
      purpose: "Safety audit",
      passNumber: "V-2042",
      vehicleNumber: null,
      entryTime: min(12),
      expectedExit: hrs(-4),
      status: "inside",
      exitTime: null,
    },
    {
      id: "vl_04",
      visitorType: "auditor",
      fullName: "CA Nisha Rao",
      mobile: "+91 99001 11004",
      hostName: "Manoj Verma",
      purpose: "Quarterly stock audit",
      passNumber: "A-0091",
      vehicleNumber: null,
      entryTime: hrs(3),
      expectedExit: hrs(-1),
      status: "inside",
      exitTime: null,
    },
    {
      id: "vl_05",
      visitorType: "maintenance",
      fullName: "Ravi Shankar",
      mobile: "+91 99001 11005",
      hostName: "Manoj Verma",
      purpose: "AC servicing",
      passNumber: "M-0332",
      vehicleNumber: "MH 04 AT 9821",
      entryTime: hrs(6.5),
      expectedExit: hrs(3),
      status: "exited",
      exitTime: hrs(2.8),
    },
    {
      id: "vl_06",
      visitorType: "visitor",
      fullName: "Sneha Kulkarni",
      mobile: "+91 99001 11006",
      hostName: "Ankit Bhatia",
      purpose: "Logistics review",
      passNumber: "V-2038",
      vehicleNumber: null,
      entryTime: hrs(7),
      expectedExit: hrs(4),
      status: "exited",
      exitTime: hrs(3.5),
    },
    {
      id: "vl_07",
      visitorType: "contractor",
      fullName: "Irfan Sheikh",
      mobile: "+91 99001 11007",
      hostName: "Rahul Patil",
      purpose: "Electrical repair",
      passNumber: "C-1121",
      vehicleNumber: "MH 12 KK 1192",
      entryTime: hrs(5),
      expectedExit: hrs(2),
      status: "exited",
      exitTime: hrs(1.9),
    },
    {
      id: "vl_08",
      visitorType: "auditor",
      fullName: "Alok Srivastav",
      mobile: "+91 99001 11008",
      hostName: "Manoj Verma",
      purpose: "Safety inspection",
      passNumber: "A-0090",
      vehicleNumber: null,
      entryTime: hrs(8),
      expectedExit: hrs(5),
      status: "exited",
      exitTime: hrs(4.2),
    },
    {
      id: "vl_09",
      visitorType: "visitor",
      fullName: "Priyanka Gupta",
      mobile: "+91 99001 11009",
      hostName: "Priya Nair",
      purpose: "Vendor onboarding",
      passNumber: "V-2039",
      vehicleNumber: null,
      entryTime: hrs(4),
      expectedExit: hrs(1),
      status: "exited",
      exitTime: hrs(1.1),
    },
    {
      id: "vl_10",
      visitorType: "other",
      fullName: "Vijay Subramani",
      mobile: "+91 99001 11010",
      hostName: "Rahul Patil",
      purpose: "Fire drill coordinator",
      passNumber: "V-2040",
      vehicleNumber: null,
      entryTime: hrs(3.5),
      expectedExit: hrs(1),
      status: "exited",
      exitTime: hrs(0.8),
    },
  ];
  for (const r of rows) {
    await db
      .collection("fg_visitor_entries")
      .doc(r.id)
      .set({
        ...r,
        warehouseId: WH_ID,
        orgId: ORG_ID,
        guardUid: "seed",
        photoUrl: null,
        entryTime: ts(r.entryTime),
        expectedExit: ts(r.expectedExit),
        exitTime: r.exitTime ? ts(r.exitTime) : null,
      });
  }
  console.log("✅  fg_visitor_entries (10)");
}

// ── Seed: alerts ─────────────────────────────────────────────────────────────
async function seedAlerts() {
  if (!(await isEmpty("fg_alerts"))) {
    console.log("⚠️  fg_alerts — already seeded");
    return;
  }
  const rows = [
    {
      id: "al_01",
      type: "face_mismatch",
      severity: "critical",
      status: "open",
      message: "Face match 42% below threshold on return of trip TRP-20260415-0131",
      warehouseId: WH_ID,
      warehouseName: "Bhiwandi Hub",
      entityType: "gate_event",
      entityId: "ge_01",
      createdAt: min(4),
      acknowledgedAt: null,
      acknowledgedByUid: null,
      resolvedAt: null,
      resolvedByUid: null,
      escalatedTo: null,
      escalatedAt: null,
    },
    {
      id: "al_02",
      type: "pin_locked",
      severity: "critical",
      status: "open",
      message: "PIN locked after 3 wrong attempts at Sarjapur Freshmart (Stop 5)",
      warehouseId: WH_ID,
      warehouseName: "Bhiwandi Hub",
      entityType: "trip_stop",
      entityId: "stp_03_5",
      createdAt: min(9),
      acknowledgedAt: null,
      acknowledgedByUid: null,
      resolvedAt: null,
      resolvedByUid: null,
      escalatedTo: null,
      escalatedAt: null,
    },
    {
      id: "al_03",
      type: "dl_expiring",
      severity: "warning",
      status: "open",
      message: "DL for Suresh Yadav (DL09…4982) expires in 42 days",
      warehouseId: WH_ID,
      warehouseName: "Bhiwandi Hub",
      entityType: "driver",
      entityId: "drv_02",
      createdAt: hrs(1.2),
      acknowledgedAt: null,
      acknowledgedByUid: null,
      resolvedAt: null,
      resolvedByUid: null,
      escalatedTo: null,
      escalatedAt: null,
    },
    {
      id: "al_04",
      type: "vehicle_expired",
      severity: "critical",
      status: "open",
      message: "RC expired 5 days ago for HR 55 AB 8821 (BlueArrow Transport)",
      warehouseId: WH_ID,
      warehouseName: "Bhiwandi Hub",
      entityType: "vehicle",
      entityId: "veh_03",
      createdAt: hrs(2),
      acknowledgedAt: null,
      acknowledgedByUid: null,
      resolvedAt: null,
      resolvedByUid: null,
      escalatedTo: null,
      escalatedAt: null,
    },
    {
      id: "al_05",
      type: "bg_flagged",
      severity: "critical",
      status: "open",
      message: "Background check flagged: Mohd. Faizal — criminal record mismatch",
      warehouseId: WH_ID,
      warehouseName: "Bhiwandi Hub",
      entityType: "driver",
      entityId: "drv_03",
      createdAt: hrs(3),
      acknowledgedAt: null,
      acknowledgedByUid: null,
      resolvedAt: null,
      resolvedByUid: null,
      escalatedTo: null,
      escalatedAt: null,
    },
    {
      id: "al_06",
      type: "delivery_overdue",
      severity: "warning",
      status: "open",
      message: "Stop 3 (Vasai) unconfirmed for 2h 14m — SLA breach imminent",
      warehouseId: WH_ID,
      warehouseName: "Bhiwandi Hub",
      entityType: "trip_stop",
      entityId: "stp_01_3",
      createdAt: min(22),
      acknowledgedAt: null,
      acknowledgedByUid: null,
      resolvedAt: null,
      resolvedByUid: null,
      escalatedTo: null,
      escalatedAt: null,
    },
    {
      id: "al_07",
      type: "visitor_overdue",
      severity: "warning",
      status: "open",
      message: "Visitor Deepa Menon exceeded expected exit by 15m",
      warehouseId: WH_ID,
      warehouseName: "Bhiwandi Hub",
      entityType: "visitor",
      entityId: "vl_01",
      createdAt: min(15),
      acknowledgedAt: null,
      acknowledgedByUid: null,
      resolvedAt: null,
      resolvedByUid: null,
      escalatedTo: null,
      escalatedAt: null,
    },
    {
      id: "al_08",
      type: "contract_expiring",
      severity: "info",
      status: "acknowledged",
      message: "Adarsh Roadways contract expires in 22 days",
      warehouseId: WH_ID,
      warehouseName: "Bhiwandi Hub",
      entityType: "contractor",
      entityId: "ct_02",
      createdAt: hrs(6),
      acknowledgedAt: hrs(5),
      acknowledgedByUid: "seed",
      resolvedAt: null,
      resolvedByUid: null,
      escalatedTo: null,
      escalatedAt: null,
    },
  ];
  for (const r of rows) {
    await db
      .collection("fg_alerts")
      .doc(r.id)
      .set({
        ...r,
        createdAt: ts(r.createdAt),
        acknowledgedAt: r.acknowledgedAt ? ts(r.acknowledgedAt) : null,
      });
  }
  console.log("✅  fg_alerts (8)");
}

// ── Seed: incidents ──────────────────────────────────────────────────────────
async function seedIncidents() {
  if (!(await isEmpty("fg_incidents"))) {
    console.log("⚠️  fg_incidents — already seeded");
    return;
  }
  const rows = [
    {
      id: "inc_01",
      type: "face_mismatch",
      description: "Driver return face mismatch on TRP-20260415-0131",
      warehouseName: "Bhiwandi Hub",
      status: "investigating",
      assignedTo: "Ankit Bhatia",
      assignedToUid: "seed",
      slaDeadline: daysAhead(0.25),
      raisedBy: "Rahul Patil",
      raisedByUid: "seed",
      createdAt: min(4),
      linkedTripCode: "TRP-20260415-0131",
      linkedAlertId: "al_01",
      linkedGateEventId: null,
      evidenceCount: 3,
      resolutionNote: null,
      closedAt: null,
    },
    {
      id: "inc_02",
      type: "fake_pod",
      description: "PIN lock + dealer denies receiving 1 invoice",
      warehouseName: "Bhiwandi Hub",
      status: "open",
      assignedTo: null,
      assignedToUid: null,
      slaDeadline: daysAhead(0.1),
      raisedBy: "Rahul Patil",
      raisedByUid: "seed",
      createdAt: min(9),
      linkedTripCode: "TRP-20260415-0131",
      linkedAlertId: "al_02",
      linkedGateEventId: null,
      evidenceCount: 2,
      resolutionNote: null,
      closedAt: null,
    },
    {
      id: "inc_03",
      type: "vehicle_noncompliance",
      description: "RC expired vehicle HR 55 AB 8821 entered main yard",
      warehouseName: "Bhiwandi Hub",
      status: "open",
      assignedTo: "Priya Nair",
      assignedToUid: "seed",
      slaDeadline: daysAhead(0.05),
      raisedBy: "Ramesh Gupta",
      raisedByUid: "seed",
      createdAt: hrs(2),
      linkedTripCode: null,
      linkedAlertId: "al_04",
      linkedGateEventId: "ge_02",
      evidenceCount: 1,
      resolutionNote: null,
      closedAt: null,
    },
    {
      id: "inc_04",
      type: "invoice_mismatch",
      description: "2 invoices entered at gate not found in SuperProcure plan",
      warehouseName: "Bhiwandi Hub",
      status: "investigating",
      assignedTo: "Ankit Bhatia",
      assignedToUid: "seed",
      slaDeadline: daysAhead(0.2),
      raisedBy: "Rahul Patil",
      raisedByUid: "seed",
      createdAt: hrs(1.2),
      linkedTripCode: "TRP-20260415-0142",
      linkedAlertId: null,
      linkedGateEventId: null,
      evidenceCount: 4,
      resolutionNote: null,
      closedAt: null,
    },
    {
      id: "inc_05",
      type: "driver_noncompliance",
      description: "Driver attempted entry with expired DL (40d past)",
      warehouseName: "Bhiwandi Hub",
      status: "open",
      assignedTo: null,
      assignedToUid: null,
      slaDeadline: daysAhead(0.15),
      raisedBy: "Bikash Das",
      raisedByUid: "seed",
      createdAt: hrs(3.5),
      linkedTripCode: null,
      linkedAlertId: null,
      linkedGateEventId: null,
      evidenceCount: 2,
      resolutionNote: null,
      closedAt: null,
    },
    {
      id: "inc_06",
      type: "unauthorized_entry",
      description: "Visitor pass V-2041 tailgated into dispatch bay",
      warehouseName: "Bhiwandi Hub",
      status: "resolved",
      assignedTo: "Ankit Bhatia",
      assignedToUid: "seed",
      slaDeadline: daysAhead(0.5),
      raisedBy: "Rahul Patil",
      raisedByUid: "seed",
      createdAt: hrs(8),
      linkedTripCode: null,
      linkedAlertId: null,
      linkedGateEventId: "ge_03",
      evidenceCount: 1,
      resolutionNote:
        "CCTV review confirmed accidental tailgate. Verbal warning issued. Escort policy refreshed.",
      closedAt: hrs(-2),
    },
    {
      id: "inc_07",
      type: "fraud_attempt",
      description: "Suspicious PIN attempts from non-registered number",
      warehouseName: "Bhiwandi Hub",
      status: "closed",
      assignedTo: "Balaji K",
      assignedToUid: "seed",
      slaDeadline: daysAhead(1),
      raisedBy: "Balaji K",
      raisedByUid: "seed",
      createdAt: hrs(26),
      linkedTripCode: null,
      linkedAlertId: null,
      linkedGateEventId: null,
      evidenceCount: 2,
      resolutionNote: "Dealer confirmed wrong mobile number saved. No fraud.",
      closedAt: hrs(-10),
    },
    {
      id: "inc_08",
      type: "theft",
      description: "3 missing invoices on return — goods unaccounted",
      warehouseName: "Bhiwandi Hub",
      status: "investigating",
      assignedTo: "Lakshmi Rao",
      assignedToUid: "seed",
      slaDeadline: daysAhead(0.02),
      raisedBy: "Lakshmi Rao",
      raisedByUid: "seed",
      createdAt: hrs(14),
      linkedTripCode: null,
      linkedAlertId: null,
      linkedGateEventId: null,
      evidenceCount: 5,
      resolutionNote: null,
      closedAt: null,
    },
    {
      id: "inc_09",
      type: "face_mismatch",
      description: "Exit face score 58% on MH 12 LK 9982 return",
      warehouseName: "Bhiwandi Hub",
      status: "open",
      assignedTo: null,
      assignedToUid: null,
      slaDeadline: daysAhead(0.08),
      raisedBy: "Rahul Patil",
      raisedByUid: "seed",
      createdAt: min(42),
      linkedTripCode: "TRP-20260415-0143",
      linkedAlertId: "al_01",
      linkedGateEventId: null,
      evidenceCount: 2,
      resolutionNote: null,
      closedAt: null,
    },
    {
      id: "inc_10",
      type: "invoice_mismatch",
      description: "Stop 3 (New Vasai Dealers) — dealer disputes 1 of 4",
      warehouseName: "Bhiwandi Hub",
      status: "investigating",
      assignedTo: "Ankit Bhatia",
      assignedToUid: "seed",
      slaDeadline: daysAhead(0.12),
      raisedBy: "Rahul Patil",
      raisedByUid: "seed",
      createdAt: hrs(2.5),
      linkedTripCode: "TRP-20260415-0142",
      linkedAlertId: null,
      linkedGateEventId: null,
      evidenceCount: 3,
      resolutionNote: null,
      closedAt: null,
    },
    {
      id: "inc_11",
      type: "vehicle_noncompliance",
      description: "PUC lapsed 3d ago on MH 04 GA 1234 · override granted",
      warehouseName: "Bhiwandi Hub",
      status: "resolved",
      assignedTo: "Ankit Bhatia",
      assignedToUid: "seed",
      slaDeadline: daysAhead(0.6),
      raisedBy: "Rahul Patil",
      raisedByUid: "seed",
      createdAt: hrs(18),
      linkedTripCode: null,
      linkedAlertId: null,
      linkedGateEventId: null,
      evidenceCount: 1,
      resolutionNote: "Contractor submitted fresh PUC within 24h. Override audit trail captured.",
      closedAt: hrs(-6),
    },
  ];
  for (const r of rows) {
    await db
      .collection("fg_incidents")
      .doc(r.id)
      .set({
        ...r,
        warehouseId: WH_ID,
        orgId: ORG_ID,
        createdAt: ts(r.createdAt),
        updatedAt: FieldValue.serverTimestamp(),
        slaDeadline: ts(r.slaDeadline),
        closedAt: r.closedAt ? ts(r.closedAt) : null,
      });
  }
  console.log("✅  fg_incidents (11)");
}

// ── Seed: demo truck-entry records covering all DL validation scenarios ───────
//
// This function always runs (no isEmpty guard) and upserts specific document
// IDs, so it is safe to re-run. Each gate event carries a full dlVerifyData
// snapshot exactly as the truck-entry form would have written it.
//
// DL scenarios covered:
//   ge_09  MH03DEMO0000001  ARJUN MEHER       valid transport · clean crime     → normal entry
//   ge_10  TN4619940000974  ASHOK KUMAR G     valid transport · very-high crime → manager override
//   ge_11  MH02TEST0000001  GHANSHYAM PATLE   valid transport · low-risk crime  → normal entry
//   ge_12  DL0420110012345  PRIYA VERMA       personal DL only (no transport)   → manager override
//   ge_13  RJ1420100098765  SUNIL SHARMA      transport DL expired (2020)       → manager override
//   ge_14  AP0920150055432  VENKATESH REDDY   state DB unavailable              → manager override
//   ge_15  BR0120120044321  MUKESH PRASAD     inconclusive / tampered flag      → manager override
//   ge_16  OD0820140077890  SANJAY PANDA      NT expired (2019) no tr. track    → manager override
//   ge_17  PB1320160088654  GURPREET KAUR     class missing (LMV not endorsed)  → manager override
//   ge_18  GJ0120221199999  KABIR SINGH       no DL record found in DB          → manager override
//   [no gate event]  KA0520050034567  RAMESH NAIR   suspended — hard block
//   [no gate event]  UP3120200099001  DEEPAK MISHRA learner only — hard block
//
async function seedDemoEntries() {
  const capturedAt = (offsetHrs: number) =>
    new Date(NOW.getTime() - offsetHrs * 3_600_000).toISOString();

  // ── Demo drivers ────────────────────────────────────────────────────────────
  const demoDrivers = [
    // new scenarios
    {
      id: "drv_09",
      fullName: "Arjun Meher",
      mobile: "+91 99223 44010",
      dlNumber: "MH03DEMO0000001",
      dlExpiry: daysAhead(730),
      dlStatus: "clear",
      bgStatus: "clear",
    },
    {
      id: "drv_10",
      fullName: "Deepak Mishra",
      mobile: "+91 90112 55021",
      dlNumber: "UP3120200099001",
      dlExpiry: daysAhead(0), // learner permit effectively expired
      dlStatus: "blocked",
      bgStatus: "clear",
    },
    {
      id: "drv_11",
      fullName: "Venkatesh Reddy",
      mobile: "+91 98441 23301",
      dlNumber: "AP0920150055432",
      dlExpiry: daysAhead(1600),
      dlStatus: "blocked",
      bgStatus: "clear",
    },
    {
      id: "drv_12",
      fullName: "Mukesh Prasad",
      mobile: "+91 97012 66110",
      dlNumber: "BR0120120044321",
      dlExpiry: daysAhead(540),
      dlStatus: "blocked",
      bgStatus: "clear",
    },
    {
      id: "drv_13",
      fullName: "Sanjay Panda",
      mobile: "+91 94302 77190",
      dlNumber: "OD0820140077890",
      dlExpiry: daysAhead(-2555), // NT expired ~7 years ago
      dlStatus: "expired",
      bgStatus: "clear",
    },
    {
      id: "drv_14",
      fullName: "Gurpreet Kaur",
      mobile: "+91 98751 88290",
      dlNumber: "PB1320160088654",
      dlExpiry: daysAhead(1800),
      dlStatus: "blocked",
      bgStatus: "clear",
    },
    {
      id: "drv_15",
      fullName: "Kabir Singh",
      mobile: "+91 95560 12340",
      dlNumber: "GJ0120221199999",
      dlExpiry: daysAhead(300),
      dlStatus: "blocked",
      bgStatus: "clear",
    },
    // drivers for existing mock DL scenarios (needed for gate-event driverId references)
    {
      id: "drv_16",
      fullName: "Ashok Kumar G",
      mobile: "+91 99001 44001",
      dlNumber: "TN4619940000974",
      dlExpiry: daysAhead(1625),
      dlStatus: "flagged",
      bgStatus: "flagged",
    },
    {
      id: "drv_17",
      fullName: "Ghanshyam Patle",
      mobile: "+91 99001 44002",
      dlNumber: "MH02TEST0000001",
      dlExpiry: daysAhead(1150),
      dlStatus: "clear",
      bgStatus: "pending",
    },
    {
      id: "drv_18",
      fullName: "Priya Verma",
      mobile: "+91 99001 44003",
      dlNumber: "DL0420110012345",
      dlExpiry: daysAhead(1950),
      dlStatus: "blocked",
      bgStatus: "clear",
    },
    {
      id: "drv_19",
      fullName: "Ramesh Nair",
      mobile: "+91 99001 44004",
      dlNumber: "KA0520050034567",
      dlExpiry: daysAhead(1420),
      dlStatus: "blocked",
      bgStatus: "clear",
    },
    {
      id: "drv_20",
      fullName: "Sunil Sharma",
      mobile: "+91 99001 44005",
      dlNumber: "RJ1420100098765",
      dlExpiry: daysAhead(-2190), // transport expired 2020
      dlStatus: "expired",
      bgStatus: "clear",
    },
  ];

  for (const r of demoDrivers) {
    await db
      .collection("fg_drivers")
      .doc(r.id)
      .set(
        {
          ...r,
          facePhotoUrl: null,
          facePhotoStoragePath: null,
          warehouseId: WH_ID,
          orgId: ORG_ID,
          isActive: true,
          dlExpiry: ts(r.dlExpiry),
          registeredAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
  }
  console.log(`✅  demo drivers (${demoDrivers.length})`);

  // ── Raw DL vendor snapshots (docu-fast format) ─────────────────────────────
  // These mirror what the mock API returns so the gate-event snapshot is authentic.
  const dlRaw = {
    MH03DEMO0000001: {
      code: 200,
      result: {
        dlNumber: "MH03DEMO0000001",
        dob: "15/08/1990",
        badgeDetails: [{ classOfVehicle: ["HMV", "LMV"] }],
        dlValidity: {
          nonTransport: { from: "22/03/2018", to: "21/03/2028" },
          transport: { from: "22/03/2023", to: "21/03/2028" },
          hazardousValidTill: "",
          hillValidTill: "",
        },
        detailsOfDrivingLicence: {
          dateOfIssue: "22/03/2018",
          status: "Active",
          name: "ARJUN MEHER",
          fatherOrHusbandName: "PRAKASH MEHER",
          gender: "M",
          state: "Maharashtra",
          issuingRtoName: "RTO NASHIK",
          address: "PLOT 7, PANCHAVATI, NASHIK, MAHARASHTRA",
          photo: "https://placehold.co/120x160/e2e8f0/64748b?text=Photo",
          covDetails: [{ cov: "HMV" }, { cov: "LMV" }],
        },
      },
    },
    TN4619940000974: {
      code: 200,
      result: {
        dlNumber: "TN4619940000974",
        dob: "01/11/1970",
        badgeDetails: [{ classOfVehicle: ["LMV-TR", "TRANS", "LMV"] }],
        dlValidity: {
          nonTransport: { from: "30/09/2020", to: "29/09/2030" },
          transport: { from: "30/09/2025", to: "29/09/2030" },
          hazardousValidTill: "",
          hillValidTill: "",
        },
        detailsOfDrivingLicence: {
          dateOfIssue: "30/09/2020",
          status: "Active",
          name: "ASHOK KUMAR G",
          fatherOrHusbandName: "GURUSAMY",
          gender: "M",
          state: "Tamil Nadu",
          issuingRtoName: "UNIT OFFICE, LALKUDI",
          address: "NO 4/4 B, SOUTH STREET, NEDUNGUR, NEIKULAM, LALGUDI TK, TIRUCHIRAPPALLI DT TN",
          photo: "https://placehold.co/120x160/e2e8f0/64748b?text=Photo",
          covDetails: [{ cov: "LMV-TR" }, { cov: "TRANS" }, { cov: "LMV" }],
        },
      },
    },
    MH02TEST0000001: {
      code: 200,
      result: {
        dlNumber: "MH02TEST0000001",
        dob: "24/03/1972",
        badgeDetails: [{ classOfVehicle: ["HMV", "LMV"] }],
        dlValidity: {
          nonTransport: { from: "15/06/2019", to: "14/06/2029" },
          transport: { from: "15/06/2024", to: "14/06/2029" },
          hazardousValidTill: "",
          hillValidTill: "",
        },
        detailsOfDrivingLicence: {
          dateOfIssue: "15/06/2019",
          status: "Active",
          name: "GHANSHYAM PATLE",
          fatherOrHusbandName: "DEOCHAND PATLE",
          gender: "M",
          state: "Maharashtra",
          issuingRtoName: "RTO GONDIYA",
          address: "AT.WARD NO.1, NEAR HANUMAN MANDIR, CHILHATI, PO. BHASGAON, GONDIYA",
          photo: "https://placehold.co/120x160/e2e8f0/64748b?text=Photo",
          covDetails: [{ cov: "HMV" }, { cov: "LMV" }],
        },
      },
    },
    DL0420110012345: {
      code: 200,
      result: {
        dlNumber: "DL0420110012345",
        dob: "10/05/1988",
        badgeDetails: [{ classOfVehicle: ["LMV"] }],
        dlValidity: {
          nonTransport: { from: "22/08/2021", to: "21/08/2031" },
          transport: { from: "", to: "" },
          hazardousValidTill: "",
          hillValidTill: "",
        },
        detailsOfDrivingLicence: {
          dateOfIssue: "22/08/2021",
          status: "Active",
          name: "PRIYA VERMA",
          fatherOrHusbandName: "SURESH VERMA",
          gender: "F",
          state: "Delhi",
          issuingRtoName: "RTO DELHI WEST",
          address: "D-42, SECTOR 7, ROHINI, NORTH WEST DELHI, DL",
          photo: "https://placehold.co/120x160/e2e8f0/64748b?text=Photo",
          covDetails: [{ cov: "LMV" }],
        },
      },
    },
    RJ1420100098765: {
      code: 200,
      result: {
        dlNumber: "RJ1420100098765",
        dob: "22/09/1979",
        badgeDetails: [{ classOfVehicle: ["HMV", "HGMV", "LMV"] }],
        dlValidity: {
          nonTransport: { from: "05/11/2010", to: "04/11/2030" },
          transport: { from: "05/11/2015", to: "04/11/2020" },
          hazardousValidTill: "",
          hillValidTill: "",
        },
        detailsOfDrivingLicence: {
          dateOfIssue: "05/11/2010",
          status: "Active",
          name: "SUNIL SHARMA",
          fatherOrHusbandName: "RAJESH SHARMA",
          gender: "M",
          state: "Rajasthan",
          issuingRtoName: "RTO JAIPUR",
          address: "B-45, CIVIL LINES, JAIPUR, RAJASTHAN",
          photo: "https://placehold.co/120x160/e2e8f0/64748b?text=Photo",
          covDetails: [{ cov: "HMV" }, { cov: "HGMV" }, { cov: "LMV" }],
        },
      },
    },
    AP0920150055432: {
      code: 200,
      result: {
        dlNumber: "AP0920150055432",
        dob: "14/06/1980",
        badgeDetails: [{ classOfVehicle: ["HMV", "LMV"] }],
        dlValidity: {
          nonTransport: { from: "05/09/2015", to: "04/09/2035" },
          transport: { from: "05/09/2020", to: "04/09/2030" },
          hazardousValidTill: "",
          hillValidTill: "",
        },
        detailsOfDrivingLicence: {
          dateOfIssue: "05/09/2015",
          status: "State Database Not Available",
          name: "VENKATESH REDDY",
          fatherOrHusbandName: "NARAYANA REDDY",
          gender: "M",
          state: "Andhra Pradesh",
          issuingRtoName: "RTO VIJAYAWADA",
          address: "DOOR NO 12-44, MG ROAD, VIJAYAWADA, ANDHRA PRADESH",
          photo: "https://placehold.co/120x160/e2e8f0/64748b?text=Photo",
          covDetails: [{ cov: "HMV" }, { cov: "LMV" }],
        },
      },
    },
    BR0120120044321: {
      code: 200,
      result: {
        dlNumber: "BR0120120044321",
        dob: "07/03/1977",
        badgeDetails: [{ classOfVehicle: ["HMV", "LMV"] }],
        dlValidity: {
          nonTransport: { from: "12/11/2012", to: "11/11/2032" },
          transport: { from: "12/11/2017", to: "11/11/2027" },
          hazardousValidTill: "",
          hillValidTill: "",
        },
        detailsOfDrivingLicence: {
          dateOfIssue: "12/11/2012",
          status: "Inconclusive — Manual Verification Required",
          name: "MUKESH PRASAD",
          fatherOrHusbandName: "SHIV PRASAD",
          gender: "M",
          state: "Bihar",
          issuingRtoName: "RTO PATNA",
          address: "VILLAGE RAMPUR, POST BEUR, PATNA, BIHAR",
          photo: "https://placehold.co/120x160/e2e8f0/64748b?text=Photo",
          covDetails: [{ cov: "HMV" }, { cov: "LMV" }],
        },
      },
    },
    OD0820140077890: {
      code: 200,
      result: {
        dlNumber: "OD0820140077890",
        dob: "21/05/1975",
        badgeDetails: [{ classOfVehicle: ["HMV", "LMV"] }],
        dlValidity: {
          nonTransport: { from: "18/08/2014", to: "17/08/2019" },
          transport: { from: "", to: "" },
          hazardousValidTill: "",
          hillValidTill: "",
        },
        detailsOfDrivingLicence: {
          dateOfIssue: "18/08/2014",
          status: "Active",
          name: "SANJAY PANDA",
          fatherOrHusbandName: "BIJAYA PANDA",
          gender: "M",
          state: "Odisha",
          issuingRtoName: "RTO BHUBANESWAR",
          address: "PLOT NO 44, SAHID NAGAR, BHUBANESWAR, ODISHA",
          photo: "https://placehold.co/120x160/e2e8f0/64748b?text=Photo",
          covDetails: [{ cov: "HMV" }, { cov: "LMV" }],
        },
      },
    },
    PB1320160088654: {
      code: 200,
      result: {
        dlNumber: "PB1320160088654",
        dob: "03/11/1985",
        badgeDetails: [{ classOfVehicle: ["LMV"] }],
        dlValidity: {
          nonTransport: { from: "15/04/2016", to: "14/04/2036" },
          transport: { from: "15/04/2021", to: "14/04/2031" },
          hazardousValidTill: "",
          hillValidTill: "",
        },
        detailsOfDrivingLicence: {
          dateOfIssue: "15/04/2016",
          status: "Active",
          name: "GURPREET KAUR",
          fatherOrHusbandName: "JASWINDER SINGH",
          gender: "F",
          state: "Punjab",
          issuingRtoName: "RTO LUDHIANA",
          address: "H.NO 221-B, RAJGURU NAGAR, LUDHIANA, PUNJAB",
          photo: "https://placehold.co/120x160/e2e8f0/64748b?text=Photo",
          covDetails: [{ cov: "LMV" }],
        },
      },
    },
    GJ0120221199999: {
      code: 200,
      result: {
        dlNumber: "",
        dob: "",
        badgeDetails: [],
        dlValidity: {
          nonTransport: { from: "", to: "" },
          transport: { from: "", to: "" },
          hazardousValidTill: "",
          hillValidTill: "",
        },
        detailsOfDrivingLicence: {
          dateOfIssue: "",
          status: "Not Found",
          name: "",
          fatherOrHusbandName: "",
          gender: "",
          state: "Gujarat",
          issuingRtoName: "RTO AHMEDABAD",
          address: "",
          photo: "",
          covDetails: [],
        },
      },
    },
  } as Record<string, Record<string, unknown>>;

  // ── Crime-check snapshots ──────────────────────────────────────────────────
  const crimeClean = { total: 0, status: 1, cases: [] };
  const crimeHighRisk = {
    total: 1,
    status: 1,
    cases: [
      {
        id: "75cf9a8c90c6ade07ca1fc5c718845d8",
        name: "G.Ashok Kumar S/o.Gurusamy",
        caseNo: "233000001002025",
        cnr: "TNKP180001722025",
        caseType: "CP",
        caseCategory: "civil",
        caseStatus: "Disposed",
        courtName: "Labour Court, Kancheepuram",
        distName: "Kancheepuram",
        stateName: "Tamil Nadu",
        algoRisk: "very high risk",
        score: 95,
        source: "ecourt",
      },
    ],
  };
  const crimeLowRisk = {
    status: "OK",
    riskType: "Low Risk",
    riskSummary: "7 cases registered. Low-risk borrower.",
    numberOfCases: 7,
    caseDetails: [
      {
        slNo: 1,
        petitioner: "GITA SHIKSHAN SANSTHA",
        respondent: "GHANSHYAM DEVCHAND PATLE",
        caseTypeName: "Letter Patent Appeal",
        courtName: "High Court of Bombay",
        state: "Maharashtra",
        caseNo: "LPA/47/2012",
        caseStatus: "Disposed",
        caseType: "Civil",
        riskType: "Low Risk",
      },
    ],
  };

  // ── Demo gate events ────────────────────────────────────────────────────────
  type GEPayload = {
    id: string;
    eventType: string;
    vehicleReg: string;
    personName: string;
    contractorId: string;
    contractorName: string;
    driverId: string | null;
    dlNumber: string;
    driverDob: string;
    time: Date;
    status: "inside" | "exited";
    overrideReason: string | null;
    crimeProvider: string;
    crimeRaw: Record<string, unknown>;
  };

  const gateEvents: GEPayload[] = [
    // ── ge_09: valid transport DL · clean crime → normal entry ────────────────
    {
      id: "ge_09",
      eventType: "inbound_entry",
      vehicleReg: "MH 03 DM 5050",
      personName: "Arjun Meher",
      contractorId: "ct_01",
      contractorName: "Samarth Logistics",
      driverId: "drv_09",
      dlNumber: "MH03DEMO0000001",
      driverDob: "15/08/1990",
      time: hrs(3.5),
      status: "inside",
      overrideReason: null,
      crimeProvider: "wizer",
      crimeRaw: crimeClean,
    },
    // ── ge_10: valid transport DL · very-high crime → manager override ────────
    {
      id: "ge_10",
      eventType: "inbound_entry",
      vehicleReg: "TN 22 BK 1100",
      personName: "Ashok Kumar G",
      contractorId: "ct_06",
      contractorName: "Sree Ganesh Cargo",
      driverId: "drv_16",
      dlNumber: "TN4619940000974",
      driverDob: "01/11/1970",
      time: hrs(4),
      status: "inside",
      overrideReason:
        "Crime case is a civil labour dispute (court: Labour Court, Kancheepuram). Manager Ankit Bhatia approved entry per SOP 4.2 — civil cases do not trigger automatic block.",
      crimeProvider: "wizer",
      crimeRaw: crimeHighRisk,
    },
    // ── ge_11: valid transport DL · low-risk crime → normal entry ─────────────
    {
      id: "ge_11",
      eventType: "inbound_entry",
      vehicleReg: "MH 02 GP 6010",
      personName: "Ghanshyam Patle",
      contractorId: "ct_01",
      contractorName: "Samarth Logistics",
      driverId: "drv_17",
      dlNumber: "MH02TEST0000001",
      driverDob: "24/03/1972",
      time: hrs(5.5),
      status: "exited",
      overrideReason: null,
      crimeProvider: "gfc",
      crimeRaw: crimeLowRisk,
    },
    // ── ge_12: personal DL only (no transport endorsement) → override ──────────
    {
      id: "ge_12",
      eventType: "inbound_entry",
      vehicleReg: "DL 08 AB 7700",
      personName: "Priya Verma",
      contractorId: "ct_07",
      contractorName: "FastLane 3PL",
      driverId: "drv_18",
      dlNumber: "DL0420110012345",
      driverDob: "10/05/1988",
      time: hrs(6),
      status: "exited",
      overrideReason:
        "Driver carries accompanying transport permit issued by state authority. Security manager approved single-trip entry for last-mile delivery. Original permit photocopied and filed.",
      crimeProvider: "wizer",
      crimeRaw: crimeClean,
    },
    // ── ge_13: transport DL expired (2020) → override ─────────────────────────
    {
      id: "ge_13",
      eventType: "inbound_entry",
      vehicleReg: "RJ 14 GH 5501",
      personName: "Sunil Sharma",
      contractorId: "ct_05",
      contractorName: "Laxmi Freight",
      driverId: "drv_20",
      dlNumber: "RJ1420100098765",
      driverDob: "22/09/1979",
      time: hrs(7.5),
      status: "exited",
      overrideReason:
        "Contractor submitted DL renewal receipt dated 3 days prior. Regional RTO Jaipur confirmed pending renewal via phone. One-time entry granted for urgent delivery. Renewal copy archived.",
      crimeProvider: "wizer",
      crimeRaw: crimeClean,
    },
    // ── ge_14: state RTO database unavailable → override ─────────────────────
    {
      id: "ge_14",
      eventType: "contractor_entry",
      vehicleReg: "AP 09 YZ 2200",
      personName: "Venkatesh Reddy",
      contractorId: "ct_06",
      contractorName: "Sree Ganesh Cargo",
      driverId: "drv_11",
      dlNumber: "AP0920150055432",
      driverDob: "14/06/1980",
      time: hrs(8.5),
      status: "inside",
      overrideReason:
        "Andhra Pradesh RTO database not yet integrated with verification provider. Physical DL inspected and verified by guard. Entry approved by site manager pending state DB integration.",
      crimeProvider: "wizer",
      crimeRaw: crimeClean,
    },
    // ── ge_15: inconclusive / manual verification required → override ─────────
    {
      id: "ge_15",
      eventType: "contractor_entry",
      vehicleReg: "BR 01 MK 0092",
      personName: "Mukesh Prasad",
      contractorId: "ct_03",
      contractorName: "BlueArrow Transport",
      driverId: "drv_12",
      dlNumber: "BR0120120044321",
      driverDob: "07/03/1977",
      time: hrs(10),
      status: "exited",
      overrideReason:
        "DL physically inspected — no signs of tampering. Contractor confirmed driver identity with photo ID. Site manager approved entry after manual review. Incident log raised for follow-up with RTO.",
      crimeProvider: "wizer",
      crimeRaw: crimeClean,
    },
    // ── ge_16: NT expired (2019) no transport track → override ────────────────
    {
      id: "ge_16",
      eventType: "inbound_entry",
      vehicleReg: "OD 08 SP 3301",
      personName: "Sanjay Panda",
      contractorId: "ct_02",
      contractorName: "Adarsh Roadways",
      driverId: "drv_13",
      dlNumber: "OD0820140077890",
      driverDob: "21/05/1975",
      time: hrs(12),
      status: "exited",
      overrideReason:
        "Driver submitted Odisha RTO renewal acknowledgement. Contractor Adarsh Roadways filed an affidavit of responsibility. One-time entry for urgent perishable delivery approved by warehouse manager.",
      crimeProvider: "wizer",
      crimeRaw: crimeClean,
    },
    // ── ge_17: transport dates valid but COV class not endorsed → override ─────
    {
      id: "ge_17",
      eventType: "contractor_entry",
      vehicleReg: "PB 13 GK 7700",
      personName: "Gurpreet Kaur",
      contractorId: "ct_01",
      contractorName: "Samarth Logistics",
      driverId: "drv_14",
      dlNumber: "PB1320160088654",
      driverDob: "03/11/1985",
      time: hrs(9),
      status: "inside",
      overrideReason:
        "Driver's HMV endorsement is shown on the physical DL but not reflected in the digital record (known Punjab RTO data-sync delay). Transport department issued a verification letter confirming HMV endorsement. Entry granted.",
      crimeProvider: "wizer",
      crimeRaw: crimeClean,
    },
    // ── ge_18: no record found in DL database → override ─────────────────────
    {
      id: "ge_18",
      eventType: "inbound_entry",
      vehicleReg: "GJ 01 KS 9910",
      personName: "Kabir Singh",
      contractorId: "ct_03",
      contractorName: "BlueArrow Transport",
      driverId: "drv_15",
      dlNumber: "GJ0120221199999",
      driverDob: "12/04/1988",
      time: hrs(11),
      status: "exited",
      overrideReason:
        "DL not found in Sarathi database. Physical DL original presented and checked. Gujarat RTO confirmed valid licence via helpline. Manager override approved; driver advised to apply for smart card DL immediately.",
      crimeProvider: "wizer",
      crimeRaw: crimeClean,
    },
  ];

  for (const e of gateEvents) {
    const reg = e.vehicleReg.toUpperCase().trim();
    const vehicleRegKeys = [reg, reg.replace(/[\s\-]/g, "")];

    await db
      .collection("fg_gate_events")
      .doc(e.id)
      .set(
        {
          eventType: e.eventType,
          vehicleReg: e.vehicleReg,
          vehicleRegKeys,
          personName: e.personName,
          contractorId: e.contractorId,
          contractorName: e.contractorName,
          contractorIds: [e.contractorId],
          driverId: e.driverId,
          tripId: null,
          entryEventId: null,
          guardUid: "seed",
          guardName: "Rahul Patil",
          time: ts(e.time),
          status: e.status,
          warehouseId: WH_ID,
          orgId: ORG_ID,
          photoUrl: null,
          photoStoragePath: null,
          dlNumber: e.dlNumber,
          driverDob: e.driverDob,
          dlImageUrl: null,
          overrideReason: e.overrideReason,
          overriddenByUid: e.overrideReason ? "seed" : null,
          dlVerifyData: {
            provider: "fleetguard-f",
            capturedAt: capturedAt(e.time.getHours() + 0.05),
            data: dlRaw[e.dlNumber] ?? null,
          },
          crimeCheckData: {
            provider: e.crimeProvider,
            caseId: `mock_${e.crimeProvider}_${e.id}`,
            capturedAt: capturedAt(e.time.getHours() + 0.02),
            initiateData: { caseId: `mock_${e.crimeProvider}_${e.id}`, status: 1 },
            pollData: e.crimeRaw,
          },
        },
        { merge: true }
      );
  }
  console.log(`✅  demo gate events (${gateEvents.length})`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔥  Seeding FleetGuard on: ${projectId}\n`);
  await seedOrg();
  await seedWarehouse();
  await seedUsers();
  await seedContractors();
  await seedDrivers();
  await seedVehicles();
  await seedTrips();
  await seedGateEvents();
  await seedVisitors();
  await seedAlerts();
  await seedIncidents();
  await seedDemoEntries();
  console.log("\n✨  All done.\n");
  process.exit(0);
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
