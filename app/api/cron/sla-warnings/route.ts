import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/app/_server/db/client";

// Runs every 15 minutes via Vercel Cron.
// Creates warning alerts for incidents approaching their SLA deadline
// (< 2 hours remaining) so assigned users have time to act.
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // TODO: implement SLA warning logic
  return NextResponse.json({ ok: true, job: "sla-warnings", processed: 0 });
}
