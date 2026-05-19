/**
 * FleetGuard — Firebase Admin SDK initialisation
 *
 * IMPORT BOUNDARY (brief rule 8 + safety rule S8):
 *   This file may ONLY be imported inside app/api/[route]/route.ts files.
 *   NEVER import this from components, pages, hooks, or services.
 *
 * The ESLint rule in eslint.config.mjs enforces this at build time.
 */

import { initializeApp, getApps, cert } from "firebase-admin/app";
import type { App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import type { Auth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";

function createAdminApp(): App {
  if (getApps().length > 0) return getApps()[0]!;

  const projectId   = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  // Support both formats:
  //   • Unquoted in .env.local  → "\\n" literal  → replace to real newline
  //   • Double-quoted in .env.local → already real newlines → replace is a no-op
  const privateKey  = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

  const missing: string[] = [];
  if (!projectId)   missing.push("FIREBASE_ADMIN_PROJECT_ID");
  if (!clientEmail) missing.push("FIREBASE_ADMIN_CLIENT_EMAIL");
  if (!privateKey)  missing.push("FIREBASE_ADMIN_PRIVATE_KEY");

  if (missing.length > 0) {
    if ((process.env.TRIP_SOURCE ?? "mock") !== "mock") {
      throw new Error(
        `Firebase Admin SDK credentials are not configured. ` +
        `Missing in .env.local: ${missing.join(", ")}`
      );
    }
    return initializeApp({ projectId: "mock-project" });
  }

  // Validate the key looks like a PEM block before handing it to cert()
  if (!privateKey!.includes("-----BEGIN") || !privateKey!.includes("-----END")) {
    throw new Error(
      "FIREBASE_ADMIN_PRIVATE_KEY does not look like a valid PEM key. " +
      "Make sure it starts with -----BEGIN PRIVATE KEY----- and ends with -----END PRIVATE KEY-----. " +
      "If you pasted it unquoted, replace literal newlines with \\n."
    );
  }

  return initializeApp({
    credential: cert({ projectId: projectId!, clientEmail: clientEmail!, privateKey: privateKey! }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

const adminApp = createAdminApp();

export const adminDb: Firestore = (() => {
  const db = getFirestore(adminApp);
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {
    // Already initialized (HMR re-import) — settings are already applied
  }
  return db;
})();
export const adminAuth: Auth = getAuth(adminApp);
export const storage = getStorage(adminApp);
