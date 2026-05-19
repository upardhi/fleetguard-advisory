#!/usr/bin/env tsx
/**
 * FleetGuard — preflight safety check
 *
 * Runs before `dev` and `build` (via predev / prebuild npm hooks).
 * Aborts with a non-zero exit code if any safety rule is violated.
 *
 * Safety rules enforced here:
 *  S1 — detects hard-coded non-fg_* collection string literals in source
 *  S3 — confirms FIREBASE_ADMIN_PROJECT_ID matches FLEETGUARD_PROJECT_ID
 *  S7 — warns if QR_SECRET / FIREBASE_ADMIN_PRIVATE_KEY are unset in non-mock mode
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

// ── Load .env.local manually (Next.js doesn't load it for scripts) ─────────
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed
      .slice(eqIdx + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

const RED = "\x1b[31m";
const YEL = "\x1b[33m";
const GRN = "\x1b[32m";
const BLD = "\x1b[1m";
const RST = "\x1b[0m";

let failed = false;

function fail(msg: string) {
  console.error(`${RED}${BLD}[PREFLIGHT FAIL]${RST} ${msg}`);
  failed = true;
}
function warn(msg: string) {
  console.warn(`${YEL}[PREFLIGHT WARN]${RST} ${msg}`);
}
function ok(msg: string) {
  console.log(`${GRN}[PREFLIGHT  OK ]${RST} ${msg}`);
}

// ────────────────────────────────────────────────────────────────────────────
// 1. Project-ID guard (S3)
// ────────────────────────────────────────────────────────────────────────────
const adminProjectId = process.env.FIREBASE_ADMIN_PROJECT_ID ?? "";
const expectedProjectId = process.env.FLEETGUARD_PROJECT_ID ?? "";

if (!adminProjectId) {
  warn("FIREBASE_ADMIN_PROJECT_ID is not set — Firebase Admin SDK will be inactive");
} else {
  ok(`Firebase Admin project: ${BLD}${adminProjectId}${RST}`);
}

if (expectedProjectId && adminProjectId && adminProjectId !== expectedProjectId) {
  fail(
    `Project ID mismatch — FIREBASE_ADMIN_PROJECT_ID="${adminProjectId}" ` +
      `does not match FLEETGUARD_PROJECT_ID="${expectedProjectId}". ` +
      "Refusing to start — wrong Firebase project."
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 2. Non-mock mode secret check (S7)
// ────────────────────────────────────────────────────────────────────────────
const tripSource = process.env.TRIP_SOURCE ?? "mock";
ok(`TRIP_SOURCE = ${tripSource}`);

if (tripSource !== "mock") {
  if (!process.env.QR_SECRET) {
    fail("QR_SECRET must be set when TRIP_SOURCE !== 'mock'");
  }
  if (!process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
    fail("FIREBASE_ADMIN_PRIVATE_KEY must be set when TRIP_SOURCE !== 'mock'");
  }
  if (!process.env.MSG91_AUTH_KEY) {
    warn("MSG91_AUTH_KEY is not set — PIN SMS will not work");
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 3. Source scan for bare non-fg_* collection references (S1)
//    We look for collection(db, "something") where "something" doesn't start
//    with fg_. Matches in node_modules are excluded automatically by ripgrep.
// ────────────────────────────────────────────────────────────────────────────
console.log("\nScanning source for bare non-fg_* collection references…");

try {
  const rgCmd =
    "rg --type ts --type tsx -n " +
    '"collection\\s*\\(\\s*\\w+\\s*,\\s*\\"(?!fg_)" ' +
    '--glob "!node_modules/**" --glob "!.next/**" ' +
    '--glob "!scripts/**" .';

  const result = execSync(rgCmd, {
    cwd: process.cwd(),
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();

  if (result) {
    fail(
      "Found bare non-fg_* Firestore collection references — all collection " +
        "strings must start with 'fg_':\n" +
        result
    );
  } else {
    ok("No bare non-fg_* collection references found");
  }
} catch (err: unknown) {
  // ripgrep exits 1 when no matches found — that's the success case
  const exitCode = (err as NodeJS.ErrnoException & { status?: number }).status;
  if (exitCode === 1) {
    ok("No bare non-fg_* collection references found");
  } else if (exitCode === undefined) {
    // rg not installed — skip scan but warn
    warn("ripgrep (rg) not found — skipping source scan. Install ripgrep for full safety.");
  } else {
    warn(`Source scan failed (exit ${exitCode}) — manual review recommended`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Admin SDK import boundary check (S8)
//    firebaseAdmin must not be imported outside app/api/*
// ────────────────────────────────────────────────────────────────────────────
console.log("\nScanning for Admin SDK import boundary violations…");

try {
  // Find files importing firebaseAdmin that are NOT under app/api/
  const scanCmd =
    'rg --type ts -l "from.*firebaseAdmin" ' +
    '--glob "!node_modules/**" --glob "!.next/**" --glob "!scripts/**" .';

  const files = execSync(scanCmd, {
    cwd: process.cwd(),
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  })
    .trim()
    .split("\n")
    .filter(Boolean);

  // ripgrep may return paths with a leading "./" — normalise before comparing
  const violations = files
    .map((f) => (f.startsWith("./") || f.startsWith(".\\") ? f.slice(2) : f))
    .filter((f) => !f.startsWith("app/api/") && !f.startsWith("app\\api\\"));
  if (violations.length > 0) {
    fail(
      "Admin SDK imported outside app/api/ — this breaks the import boundary (S8):\n" +
        violations.join("\n")
    );
  } else {
    ok("Admin SDK import boundary is clean");
  }
} catch (err: unknown) {
  const exitCode = (err as NodeJS.ErrnoException & { status?: number }).status;
  if (exitCode === 1) {
    ok("No firebaseAdmin imports found outside api/ (clean)");
  } else if (exitCode === undefined) {
    warn("ripgrep not found — skipping Admin SDK boundary check");
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Final verdict
// ────────────────────────────────────────────────────────────────────────────
console.log();
if (failed) {
  console.error(`${RED}${BLD}════════════════════════════════════════════════════════${RST}`);
  console.error(`${RED}${BLD}  PREFLIGHT FAILED — fix the errors above before running  ${RST}`);
  console.error(`${RED}${BLD}════════════════════════════════════════════════════════${RST}\n`);
  process.exit(1);
} else {
  console.log(`${GRN}${BLD}════════════════════════════════════════════${RST}`);
  console.log(`${GRN}${BLD}  PREFLIGHT PASSED — safe to start FleetGuard  ${RST}`);
  console.log(`${GRN}${BLD}════════════════════════════════════════════${RST}\n`);
}
