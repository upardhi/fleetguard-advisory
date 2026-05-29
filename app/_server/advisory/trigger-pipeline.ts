
function buildHeaders(): HeadersInit {
  const secret = process.env.CRON_SECRET ?? "";
  return {
    "Content-Type": "application/json",
    ...(secret ? { "x-vercel-cron-auth": secret } : {}),
  };
}

function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://fleetadvisory.fraudcheck.ai/"
  ).replace(/\/$/, "");
}

async function callCron(path: string): Promise<void> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method:  "POST",
    headers: buildHeaders(),
  });
  if (!res.ok) {
    console.warn(`[pipeline] ${path} responded ${res.status}`);
  }
}

/**
 * Entry point — call this after any event that adds new cities/warehouses.
 * Kicks off step 1; steps 2 and 3 are triggered from within their own routes.
 */
export function triggerAdvisoryPipeline(): void {
  // Fully detached — never blocks the caller
  void (async () => {
    try {
      // Step 1 — news for main cities
      await callCron("/api/cron/run-city-intelligence");
    } catch (err) {
      console.warn("[pipeline] run-city-intelligence failed:", err);
    }
  })();
}

/**
 * Call this at the END of discover-warehouse-cities route.
 * Kicks off step 2; step 3 is triggered from within discover-nearby-cities.
 */
export function triggerNearbyDiscoveryPipeline(): void {
  void (async () => {
    try {
      // Step 2 — discover nearby cities for any new adv_cities
      await callCron("/api/cron/discover-nearby-cities");
    } catch (err) {
      console.warn("[pipeline] discover-nearby-cities failed:", err);
    }
  })();
}

/**
 * Call this at the END of discover-nearby-cities route.
 * Kicks off step 3 — the final leg of the pipeline.
 */
export function triggerNearbyCityIntelligence(): void {
  void (async () => {
    try {
      // Step 3 — news for nearby cities
      await callCron("/api/cron/run-nearby-city-intelligence");
    } catch (err) {
      console.warn("[pipeline] run-nearby-city-intelligence failed:", err);
    }
  })();
}