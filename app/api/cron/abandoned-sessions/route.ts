import { NextRequest, NextResponse } from "next/server";
import { cleanupExpiredSessions } from "@/app/_server/auth/sessions";

// Runs hourly via Vercel Cron.
// Hard-deletes rows for sessions that are already expired or revoked so the
// sessions table doesn't grow unbounded.
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const removed = await cleanupExpiredSessions();
  return NextResponse.json({ ok: true, job: "abandoned-sessions", removed });
}
