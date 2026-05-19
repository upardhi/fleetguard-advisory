import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { requireUser } from "@/app/_server/auth/getUser";
import { applySecurityHeaders } from "@/app/_server/security/headers";

const PatchMeSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  mobile:   z.string().max(20).optional(),
});

// PATCH /api/v2/users/me — update own profile (name, mobile)
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  const parsed = PatchMeSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.fullName) updates.full_name = parsed.data.fullName;
  if (parsed.data.mobile)   updates.mobile    = parsed.data.mobile;

  if (Object.keys(updates).length === 0) {
    return applySecurityHeaders(NextResponse.json({ ok: true }));
  }

  await db`UPDATE users SET ${db(updates)}, updated_at = now() WHERE id = ${actor.sub}`;

  return applySecurityHeaders(NextResponse.json({ ok: true }));
}
