import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { requireUser } from "@/app/_server/auth/getUser";
import { applySecurityHeaders } from "@/app/_server/security/headers";

const UpdateSchema = z.object({
  status: z.enum(["unloading", "completed", "rejected"]).optional(),
  notes: z.string().max(500).optional(),
});

// PATCH /api/v2/inbound-entries/[id] — update status (complete or reject)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { id } = await params;
  const [existing] = await db`SELECT id FROM inbound_entries WHERE id = ${id} AND org_id = ${actor.org} LIMIT 1`;
  if (!existing) return applySecurityHeaders(NextResponse.json({ error: "Not found" }, { status: 404 }));

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }

  const { status, notes } = parsed.data;
  const exitTime = (status === "completed" || status === "rejected") ? new Date() : null;

  if (status !== undefined || notes !== undefined) {
    await db`
      UPDATE inbound_entries
      SET
        ${status !== undefined ? db`status = ${status},` : db``}
        ${exitTime ? db`exit_time = ${exitTime},` : db``}
        ${notes !== undefined ? db`notes = ${notes},` : db``}
        updated_at = now()
      WHERE id = ${id} AND org_id = ${actor.org}
    `;
  }

  return applySecurityHeaders(NextResponse.json({ ok: true }));
}
