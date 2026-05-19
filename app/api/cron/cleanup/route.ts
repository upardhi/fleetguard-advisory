import { NextRequest, NextResponse } from "next/server";
import { cleanupRateLimitCounters } from "@/app/_server/security/rateLimit";
import { cleanupIdempotencyKeys } from "@/app/_server/security/idempotency";

// Runs daily at 02:00 UTC via Vercel Cron.
// Prunes housekeeping tables that grow over time.
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await Promise.all([
    cleanupRateLimitCounters(),
    cleanupIdempotencyKeys(),
  ]);

  return NextResponse.json({ ok: true, job: "cleanup" });
}
