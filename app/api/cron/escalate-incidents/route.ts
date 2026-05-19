import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/app/_server/db/client";

// Runs every 5 minutes via Vercel Cron.
// Finds incidents past their sla_deadline that haven't been escalated at
// the current level, looks up the matching escalation_policy, and fires
// notifications. Full implementation deferred to post-migration sprint.
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // TODO: implement escalation logic
  return NextResponse.json({ ok: true, job: "escalate-incidents", processed: 0 });
}
