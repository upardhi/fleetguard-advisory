#!/usr/bin/env tsx
/**
 * One-off: create itc.guard.blr@fleetguard.poc with Itc@guard1
 * Linked to ITC org (Xr4rtyWe5zqVSUn8tEEo) and wh_itc_bengaluru.
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import fs from "fs";
import path from "path";

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

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID!;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL!;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, "\n");
if (getApps().length === 0)
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore();
const fbAuth = getAuth();

async function main() {
  const email = "itc.guard.blr@fleetguard.poc";
  const pw = "Itc@guard1";
  const name = "Ravi Kumar";
  const orgId = "Xr4rtyWe5zqVSUn8tEEo";
  const warehouseId = "wh_itc_bengaluru";

  let uid: string;
  try {
    uid = (await fbAuth.getUserByEmail(email)).uid;
    await fbAuth.updateUser(uid, { password: pw, displayName: name, emailVerified: true });
    console.log(`ℹ️   Auth user exists — password reset (${uid})`);
  } catch {
    uid = (
      await fbAuth.createUser({
        email,
        password: pw,
        displayName: name,
        emailVerified: true,
      })
    ).uid;
    console.log(`✅  Auth user created (${uid})`);
  }

  await db.collection("fg_users").doc(uid).set(
    {
      uid,
      email,
      displayName: name,
      role: "guard",
      warehouseId,
      orgId,
      isActive: true,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const snap = await db.collection("fg_users").doc(uid).get();
  if (!snap.data()?.createdAt) {
    await db.collection("fg_users").doc(uid).update({
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  console.log("✅  fg_users doc written");
  console.log("");
  console.log("════════════════════════════════════════════════════");
  console.log(`  Email     : ${email}`);
  console.log(`  Password  : ${pw}`);
  console.log(`  Role      : guard`);
  console.log(`  Warehouse : ${warehouseId}`);
  console.log(`  Org       : ${orgId}`);
  console.log("════════════════════════════════════════════════════");
  process.exit(0);
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
