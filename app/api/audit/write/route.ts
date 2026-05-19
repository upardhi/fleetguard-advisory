/**
 * POST /api/audit/write
 *
 * Single server-side entry point for all audit log writes.
 * fg_audit_events is append-only — this route is the ONLY writer (brief §14 rule 3).
 * Uses Admin SDK → correct server boundary (S8).
 */

import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog, type AuditPayload } from "../../_lib/audit";

export async function POST(req: NextRequest) {
  let body: AuditPayload;
  try {
    body = (await req.json()) as AuditPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const required = [
    "action",
    "actorId",
    "actorName",
    "actorRole",
    "entityType",
    "entityId",
    "warehouseId",
    "orgId",
  ] as const;
  for (const field of required) {
    if (!body[field]) {
      return NextResponse.json({ error: `Missing field: ${field}` }, { status: 400 });
    }
  }

  try {
    const id = await writeAuditLog(body);
    return NextResponse.json({ ok: true, id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Audit write failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
