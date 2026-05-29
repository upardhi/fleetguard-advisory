async function triggerCron(path: string): Promise<void> {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://fleetadvisory.fraudcheck.ai/";

  const secret = process.env.CRON_SECRET ?? "";

  await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "x-vercel-cron-auth": secret } : {}),
    },
  });
}

export async function triggerWarehouseDiscovery(): Promise<void> {
  try {
    await triggerCron("/api/cron/discover-warehouse-cities");
  } catch (err) {
    console.warn("[triggerWarehouseDiscovery] failed:", err);
  }
}