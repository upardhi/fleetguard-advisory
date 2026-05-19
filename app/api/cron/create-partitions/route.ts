import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/_server/db/client";

// Runs on the 1st of each month via Vercel Cron.
// Creates the next month's partitions for gate_events and audit_events so
// there is always at least one future partition ready before data arrives.
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  // Target: two months from now
  const target = new Date(now.getFullYear(), now.getMonth() + 2, 1);
  const next   = new Date(now.getFullYear(), now.getMonth() + 3, 1);
  const year  = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, "0");
  const from  = `${year}-${month}-01`;
  const to    = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
  const suffix = `${year}_${month}`;

  await db.unsafe(`
    CREATE TABLE IF NOT EXISTS gate_events_${suffix}
      PARTITION OF gate_events FOR VALUES FROM ('${from}') TO ('${to}');
    CREATE TABLE IF NOT EXISTS audit_events_${suffix}
      PARTITION OF audit_events FOR VALUES FROM ('${from}') TO ('${to}');
  `);

  return NextResponse.json({ ok: true, job: "create-partitions", suffix });
}
