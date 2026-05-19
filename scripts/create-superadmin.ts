#!/usr/bin/env tsx
/**
 * FleetGuard — Create / reset super-admin credentials
 *
 * Creates a Firebase Auth user + fg_users Firestore document with
 * role: "super_admin". Safe to run multiple times — if the Auth
 * user already exists it reuses that UID; the Firestore doc is
 * merged (not overwritten).
 *
 * Usage:
 *   npm run create:superadmin
 *
 * Credentials are read from .env.local:
 *   SEED_ADMIN_EMAIL     (default: admin@fleetguard.poc)
 *   SEED_ADMIN_PASSWORD  (default: Admin@123456)
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

const EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@fleetguard.poc";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Admin@123456";
const NAME = "Super Admin";

async function main() {
  console.log("\nFleetGuard — Super-Admin Setup\n");

  // 1. Create or get Firebase Auth user
  let uid: string;
  try {
    const existing = await fbAuth.getUserByEmail(EMAIL);
    uid = existing.uid;
    console.log(`ℹ️   Auth user already exists (${uid}) — reusing`);
    // Update password in case it changed
    await fbAuth.updateUser(uid, { password: PASSWORD, displayName: NAME });
    console.log("ℹ️   Auth credentials refreshed");
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

  // 2. Write fg_users document (merge keeps createdAt if it exists)
  await db.collection("fg_users").doc(uid).set(
    {
      uid,
      email: EMAIL,
      displayName: NAME,
      role: "super_admin",
      warehouseId: "",
      orgId: "",
      isActive: true,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // Set createdAt only if it doesn't exist yet
  const snap = await db.collection("fg_users").doc(uid).get();
  if (!snap.data()?.createdAt) {
    await db.collection("fg_users").doc(uid).update({ createdAt: FieldValue.serverTimestamp() });
  }

  console.log("✅  fg_users document written");
  console.log("");
  console.log("════════════════════════════════════════════");
  console.log("  Login credentials");
  console.log("  ─────────────────────────────────────────");
  console.log(`  Email    : ${EMAIL}`);
  console.log(`  Password : ${PASSWORD}`);
  console.log(`  Role     : super_admin`);
  console.log(`  URL      : /login  →  redirects to /superadmin`);
  console.log("════════════════════════════════════════════");
  console.log("");
}

main().catch((err) => {
  console.error("❌ ", err.message ?? err);
  process.exit(1);
});
