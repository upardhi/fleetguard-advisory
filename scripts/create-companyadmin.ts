#!/usr/bin/env tsx
/**
 * FleetGuard — Create / reset a company-admin account
 *
 * Creates a Firebase Auth user + fg_users Firestore document with
 * role: "company_admin" linked to the specified organisation.
 * Safe to re-run — reuses existing Auth UID and merges the Firestore doc.
 *
 * Usage:
 *   npm run create:companyadmin
 *
 * Reads from .env.local:
 *   SEED_COMPANY_ADMIN_EMAIL    (default: companyadmin@fleetguard.poc)
 *   SEED_COMPANY_ADMIN_PASSWORD (default: Company@123456)
 *   SEED_COMPANY_ADMIN_ORG_ID   (default: org_fleetguard_poc)
 *   SEED_COMPANY_ADMIN_NAME     (default: Company Admin)
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

const EMAIL = process.env.SEED_COMPANY_ADMIN_EMAIL ?? "companyadmin@fleetguard.poc";
const PASSWORD = process.env.SEED_COMPANY_ADMIN_PASSWORD ?? "Company@123456";
const ORG_ID = process.env.SEED_COMPANY_ADMIN_ORG_ID ?? "org_fleetguard_poc";
const NAME = process.env.SEED_COMPANY_ADMIN_NAME ?? "Company Admin";

async function main() {
  console.log("\nFleetGuard — Company-Admin Setup\n");

  // Verify org exists
  const orgSnap = await db.collection("fg_organisations").doc(ORG_ID).get();
  if (!orgSnap.exists) {
    console.error(`❌  Organisation "${ORG_ID}" not found in fg_organisations.`);
    console.error("    Run  npm run seed:fg  first, or set SEED_COMPANY_ADMIN_ORG_ID correctly.");
    process.exit(1);
  }
  const orgName = (orgSnap.data() as { name?: string })?.name ?? ORG_ID;
  console.log(`ℹ️   Organisation: ${orgName} (${ORG_ID})`);

  // Create or get Auth user
  let uid: string;
  try {
    const existing = await fbAuth.getUserByEmail(EMAIL);
    uid = existing.uid;
    console.log(`ℹ️   Auth user already exists (${uid}) — refreshing credentials`);
    await fbAuth.updateUser(uid, { password: PASSWORD, displayName: NAME });
  } catch {
    const created = await fbAuth.createUser({
      email: EMAIL,
      displayName: NAME,
      password: PASSWORD,
      emailVerified: true,
    });
    uid = created.uid;
    console.log(`✅  Auth user created (${uid})`);
  }

  // Write fg_users document
  await db.collection("fg_users").doc(uid).set(
    {
      uid,
      email: EMAIL,
      displayName: NAME,
      role: "company_admin",
      warehouseId: "",
      orgId: ORG_ID,
      isActive: true,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const snap = await db.collection("fg_users").doc(uid).get();
  if (!snap.data()?.createdAt) {
    await db.collection("fg_users").doc(uid).update({ createdAt: FieldValue.serverTimestamp() });
  }

  console.log("✅  fg_users document written");
  console.log("");
  console.log("════════════════════════════════════════════════════");
  console.log("  Company Admin credentials");
  console.log("  ──────────────────────────────────────────────────");
  console.log(`  Email        : ${EMAIL}`);
  console.log(`  Password     : ${PASSWORD}`);
  console.log(`  Role         : company_admin`);
  console.log(`  Organisation : ${orgName} (${ORG_ID})`);
  console.log(`  URL          : /login  →  redirects to /company`);
  console.log("════════════════════════════════════════════════════");
  console.log("");
}

main().catch((err) => {
  console.error("❌ ", err.message ?? err);
  process.exit(1);
});
