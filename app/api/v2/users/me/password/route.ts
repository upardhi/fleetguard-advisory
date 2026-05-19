import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { requireUser } from "@/app/_server/auth/getUser";
import { applySecurityHeaders } from "@/app/_server/security/headers";
import { hashPassword, verifyPassword, validatePasswordStrength } from "@/app/_server/auth/password";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { uuidv7 } from "@/app/_server/db/uuidv7";

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).optional(),
  newPassword:     z.string().min(8),
});

// POST /api/v2/users/me/password — self-service password change
export async function POST(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  const parsed = ChangePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }

  if (validatePasswordStrength(parsed.data.newPassword) !== null) {
    return applySecurityHeaders(
      NextResponse.json({
        error: "Password must be at least 8 characters and include upper, lower, digit, and special character.",
      }, { status: 422 }),
    );
  }

  const [user] = await db`SELECT password_hash FROM users WHERE id = ${actor.sub} LIMIT 1`;
  if (!user) {
    return applySecurityHeaders(NextResponse.json({ error: "User not found" }, { status: 404 }));
  }

  if (parsed.data.currentPassword) {
    // Trim — temp passwords copied from email often pick up an invisible
    // trailing space (some clients add one to span-wrapped text on double-click).
    // Generated temp passwords never contain whitespace so this is safe.
    const cleaned = parsed.data.currentPassword.trim();
    const ok = await verifyPassword(cleaned, user.password_hash as string);
    if (!ok) {
      return applySecurityHeaders(NextResponse.json({ error: "Current password is incorrect." }, { status: 401 }));
    }
  }

  const newHash = await hashPassword(parsed.data.newPassword);

  await db`
    UPDATE users
    SET    password_hash        = ${newHash},
           password_changed_at  = now(),
           force_password_reset = false,
           updated_at           = now()
    WHERE  id = ${actor.sub}
  `;

  await db`
    INSERT INTO password_history (id, user_id, hash)
    VALUES (${uuidv7()}, ${actor.sub}, ${newHash})
  `;

  await writeAuditEvent({
    orgId:        actor.org,
    actorId:      actor.sub,
    actorRole:    actor.role,
    action:       "user.password_changed",
    resourceType: "user",
    resourceId:   actor.sub,
    payload:      { selfService: true },
  });

  return applySecurityHeaders(NextResponse.json({ ok: true }));
}
