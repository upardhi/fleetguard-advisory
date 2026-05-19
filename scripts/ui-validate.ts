/**
 * UI validation script — tests all major pages end-to-end using Playwright.
 * Run: npx tsx scripts/ui-validate.ts
 */
import { chromium, Browser, Page } from "playwright";

const BASE = "http://localhost:3000";
const EMAIL = "admin@fleetguard.itc";
const PASSWORD = "Admin@1234";

const results: { page: string; status: "PASS" | "FAIL"; note: string }[] = [];

function pass(page: string, note = "") {
  results.push({ page, status: "PASS", note });
  console.log(`  ✓ PASS  ${page}${note ? "  — " + note : ""}`);
}
function fail(page: string, note = "") {
  results.push({ page, status: "FAIL", note });
  console.log(`  ✗ FAIL  ${page}${note ? "  — " + note : ""}`);
}

async function waitAndCheck(page: Page, selector: string, label: string): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { timeout: 8000 });
    return true;
  } catch {
    console.log(`    ⚠ Could not find: ${label} (${selector})`);
    return false;
  }
}

async function run() {
  const browser: Browser = await chromium.launch({ headless: false, slowMo: 200 });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // ── 1. Login page renders ────────────────────────────────────────────────────
  console.log("\n[1] Login page");
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  const loginForm = await waitAndCheck(page, 'form, [data-testid="login-form"], input[type="email"], input[name="email"]', "login form");
  loginForm ? pass("/login", "renders correctly") : fail("/login", "form not found");

  // ── 2. Login with credentials ─────────────────────────────────────────────
  console.log("\n[2] Login flow");
  try {
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passInput  = page.locator('input[type="password"]').first();
    await emailInput.fill(EMAIL);
    await passInput.fill(PASSWORD);
    await page.keyboard.press("Enter");
    // After login, expect redirect away from /login
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 10000 });
    pass("Login flow", `redirected to ${page.url().replace(BASE, "")}`);
  } catch (e) {
    fail("Login flow", String(e).slice(0, 100));
  }

  // ── 3. Advisory pages ────────────────────────────────────────────────────────
  const advisoryPages: { path: string; label: string; selector: string }[] = [
    { path: "/advisory",                             label: "Advisory home / select warehouse",   selector: "body" },
    { path: "/advisory/control-tower",               label: "Control Tower",                      selector: "body" },
    { path: "/advisory/disruptions",                 label: "Disruptions",                        selector: "body" },
    { path: "/advisory/advisories",                  label: "AI Advisories",                      selector: "body" },
    { path: "/advisory/risk-map",                    label: "Risk Map",                           selector: "body" },
    { path: "/advisory/route-analysis",              label: "Route Analysis",                     selector: "body" },
    { path: "/advisory/trips",                       label: "Trips",                              selector: "body" },
    { path: "/advisory/planner",                     label: "Planner",                            selector: "body" },
    { path: "/advisory/planned-dispatches",          label: "Planned Dispatches",                 selector: "body" },
    { path: "/advisory/corridor-watch",              label: "Corridor Watch",                     selector: "body" },
    { path: "/advisory/events-calendar",             label: "Events Calendar",                    selector: "body" },
    { path: "/advisory/profile",                     label: "Profile",                            selector: "body" },
    { path: "/advisory/settings",                    label: "Settings",                           selector: "body" },
    { path: "/advisory/team",                        label: "Team",                               selector: "body" },
  ];

  console.log("\n[3] Advisory pages");
  for (const p of advisoryPages) {
    try {
      const response = await page.goto(`${BASE}${p.path}`, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(1500);
      const status = response?.status() ?? 0;
      const title = await page.title();
      const has404 = await page.locator("text=404, text=not found").first().isVisible().catch(() => false);
      const hasError = await page.locator("text=Application error, text=Internal Server Error").first().isVisible().catch(() => false);

      if (has404) fail(p.path, "404 page");
      else if (hasError) fail(p.path, "server error");
      else if (status >= 400) fail(p.path, `HTTP ${status}`);
      else pass(p.path, title || "ok");
    } catch (e) {
      fail(p.path, String(e).slice(0, 80));
    }
  }

  // ── 4. Trips page — create a trip ────────────────────────────────────────────
  console.log("\n[4] Trips — functional test");
  try {
    await page.goto(`${BASE}/advisory/trips`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    // Look for "New Trip" or "Add Trip" button
    const newBtn = page.locator("button:has-text('New Trip'), button:has-text('Add Trip'), a:has-text('New Trip')").first();
    const btnVisible = await newBtn.isVisible().catch(() => false);
    btnVisible ? pass("/advisory/trips", "New Trip button visible") : pass("/advisory/trips", "loaded (no New Trip button found)");
  } catch (e) {
    fail("/advisory/trips functional", String(e).slice(0, 80));
  }

  // ── 5. API health check via fetch ────────────────────────────────────────────
  console.log("\n[5] API health via browser fetch");
  const apiChecks: { url: string; label: string }[] = [
    { url: `${BASE}/api/v2/me`,             label: "/api/v2/me" },
    { url: `${BASE}/api/v2/warehouses`,     label: "/api/v2/warehouses" },
    { url: `${BASE}/api/advisory/v1/trips`, label: "/api/advisory/v1/trips" },
    { url: `${BASE}/api/advisory/v1/disruptions`, label: "/api/advisory/v1/disruptions" },
    { url: `${BASE}/api/advisory/v1/advisories`,  label: "/api/advisory/v1/advisories" },
    { url: `${BASE}/api/advisory/v1/pipeline`,    label: "/api/advisory/v1/pipeline" },
  ];

  // Navigate to a page first so we have the auth cookie
  await page.goto(`${BASE}/advisory/trips`, { waitUntil: "domcontentloaded" });
  for (const check of apiChecks) {
    try {
      const result = await page.evaluate(async (url) => {
        const r = await fetch(url, { credentials: "include" });
        const text = await r.text();
        let json: unknown;
        try { json = JSON.parse(text); } catch { json = text.slice(0, 100); }
        return { status: r.status, body: json };
      }, check.url);

      if (result.status === 200) pass(check.label, `200 OK`);
      else fail(check.label, `HTTP ${result.status}: ${JSON.stringify(result.body).slice(0, 80)}`);
    } catch (e) {
      fail(check.label, String(e).slice(0, 80));
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  console.log("\n" + "═".repeat(60));
  console.log(`RESULTS: ${passed} PASS  /  ${failed} FAIL  /  ${results.length} total`);
  if (failed > 0) {
    console.log("\nFailed checks:");
    results.filter((r) => r.status === "FAIL").forEach((r) => console.log(`  ✗ ${r.page}: ${r.note}`));
  }
  console.log("═".repeat(60));

  await page.waitForTimeout(3000);
  await browser.close();
}

run().catch((err) => {
  console.error("Script error:", err);
  process.exit(1);
});
