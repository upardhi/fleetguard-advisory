import { NextRequest, NextResponse } from "next/server";
import { cleanupRateLimitCounters } from "@/app/_server/security/rateLimit";
import { cleanupIdempotencyKeys } from "@/app/_server/security/idempotency";
import { db } from "@/app/_server/db/client";

// Runs daily at 02:00 UTC via Vercel Cron.
// Prunes housekeeping tables that grow over time.
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [, , expiredResult] = await Promise.all([
    cleanupRateLimitCounters(),
    cleanupIdempotencyKeys(),

    // ── Expire stale disruption flags ──────────────────────────────────────
    // If a segment is still marked has_disruption=true but hasn't been
    // re-checked in the past 36 hours, the event has almost certainly ended
    // or the scan would have cleared it. Auto-clear to prevent zombie alerts.
    db`
      UPDATE adv_watched_segments
      SET    has_disruption        = false,
             disruption_risk_level = null,
             disruption_title      = null,
             disruption_summary    = null,
             disruption_eta_hours  = null,
             disruption_category   = null
      WHERE  has_disruption = true
        AND  last_checked_at < now() - interval '36 hours'
      RETURNING id
    `,
  ]);

  const expiredCount = Array.isArray(expiredResult) ? expiredResult.length : 0;
  if (expiredCount > 0) {
    console.info(`[cleanup] expired ${expiredCount} stale disruption flag(s)`);
  }

  return NextResponse.json({ ok: true, job: "cleanup", expiredDisruptions: expiredCount });
}
