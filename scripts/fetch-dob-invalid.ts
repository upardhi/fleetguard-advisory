#!/usr/bin/env tsx
/**
 * Fetch DOB from fg_drivers for a list of DL numbers.
 * Also checks the correct/valid variant for confirmed typo pairs.
 *
 * Run:  npx tsx scripts/fetch-dob-invalid.ts
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";

// ── .env.local ────────────────────────────────────────────────────────────────
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

// ── Firebase Admin ────────────────────────────────────────────────────────────
const projectId   = process.env.FIREBASE_ADMIN_PROJECT_ID!;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL!;
const privateKey  = process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, "\n");
if (getApps().length === 0) {
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}
const db = getFirestore();

// ── DL numbers to check ───────────────────────────────────────────────────────
// Invalid DLs from user query + their confirmed valid variants
const DL_PAIRS: Array<{ invalid: string; validVariant?: string }> = [
  { invalid: "TN02-19950004272" },
  { invalid: "TN05-20010001589" },
  { invalid: "TN25-20000001809" },
  { invalid: "TN25-20150000522" },
  { invalid: "TN27-19940000496" },
  { invalid: "TN27-19950001407" },
  { invalid: "TN27-20030001142" },
  { invalid: "TN27-20040002620" },
  { invalid: "TN28-19910000931" },
  { invalid: "TN29-20160000397" },
  { invalid: "TN32-20050001128" },
  { invalid: "TN45-1981000454" },
  { invalid: "TN45-20180004625" },
  { invalid: "TN45-Z2009001005" },
  { invalid: "TN45-Z20250002071" },
  { invalid: "TN46-19940000794" },
  { invalid: "TN46-2002001315" },
  { invalid: "TN48-20080003239",  validVariant: "TN48-20010003239"  }, // confirmed typo
  { invalid: "TN49-19940002301" },
  { invalid: "TN49-20160006641" },
  { invalid: "TN51-20050001701" },
  { invalid: "TN55-20220000778" },
  { invalid: "TN57-19990004399" },
  { invalid: "TN58-20110002515" },
  { invalid: "TN83-20190000450" },
  // also check the two other confirmed typo valid-side DLs
  { invalid: "TN60-020020001975", validVariant: "TN60-20020001975"  },
  { invalid: "TN31-19920002457",  validVariant: "TN31-Y19920002457" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function variants(dl: string): string[] {
  const a = dl.trim();
  const b = dl.replace(/-/g, "").trim();
  return [...new Set([a, b, a.toUpperCase(), b.toUpperCase()])];
}

async function lookupDl(dl: string): Promise<{ dob: string | null; name: string | null; docId: string | null }> {
  for (const v of variants(dl)) {
    const snap = await db.collection("fg_drivers").where("dlNumber", "==", v).limit(1).get();
    if (!snap.empty) {
      const d = snap.docs[0].data();
      return {
        dob:   (d.dob   as string | null) ?? null,
        name:  (d.fullName as string | null) ?? null,
        docId: snap.docs[0].id,
      };
    }
  }
  return { dob: null, name: null, docId: null };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nProject: ${projectId}`);
  console.log("═".repeat(90));
  console.log(
    "DL Number (invalid)".padEnd(28),
    "DOB (from fg_drivers)".padEnd(18),
    "Name".padEnd(24),
    "Note"
  );
  console.log("─".repeat(90));

  for (const pair of DL_PAIRS) {
    // Try the invalid DL first
    const result = await lookupDl(pair.invalid);

    let dob  = result.dob;
    let name = result.name;
    let note = result.docId ? `docId=${result.docId}` : "not in fg_drivers";

    // If invalid DL had no DOB but we have a confirmed valid variant, try that
    if (!dob && pair.validVariant) {
      const valid = await lookupDl(pair.validVariant);
      if (valid.dob) {
        dob  = valid.dob;
        name = valid.name;
        note = `via valid variant ${pair.validVariant}`;
      }
    }

    console.log(
      pair.invalid.padEnd(28),
      (dob  ?? "—").padEnd(18),
      (name ?? "—").padEnd(24),
      note
    );
  }

  console.log("═".repeat(90));
  console.log("Done\n");
}

main().catch((err) => {
  console.error("❌", err instanceof Error ? err.message : err);
  process.exit(1);
});
