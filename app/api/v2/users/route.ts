import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { uuidv7 } from "@/app/_server/db/uuidv7";
import { hashPassword, validatePasswordStrength, recordPasswordHistory } from "@/app/_server/auth/password";
import { requireUser } from "@/app/_server/auth/getUser";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";

const CreateUserSchema = z.object({
  email: z.string().email().max(255).transform((s) => s.toLowerCase()),
  password: z.string().min(8).max(128),
  role: z.enum(["company_admin", "guard", "wh_manager", "regional_manager", "cso"]),
  fullName: z.string().min(1).max(200),
  mobile: z.string().max(20).optional(),
  warehouseId: z.string().optional(),
  mfaRequired: z.boolean().optional().default(false),
  orgId: z.string().min(1).optional(),
});

// POST /api/v2/users — create a new user in the org
export async function POST(req: NextRequest): Promise<NextResponse> {
  let actor;
  try {
    actor = await requireUser(req);
  } catch {
    return applySecurityHeaders(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
  }

  if (!["superadmin", "company_admin"].includes(actor.role)) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 }));
  }

  const parsed = CreateUserSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }

  const data = parsed.data;

  const strengthErr = validatePasswordStrength(data.password);
  if (strengthErr) {
    return applySecurityHeaders(
      NextResponse.json({ error: strengthErr }, { status: 422 }),
    );
  }

  // Superadmin can create users in any org via body.orgId; everyone else is pinned.
  const targetOrgId = actor.role === "superadmin" && data.orgId ? data.orgId : actor.org;

  // Enforce single company_admin per org
  if (data.role === "company_admin") {
    const [existing] = await db`
      SELECT id FROM users WHERE org_id = ${targetOrgId} AND role = 'company_admin' LIMIT 1
    `;
    if (existing && actor.role !== "superadmin") {
      return applySecurityHeaders(
        NextResponse.json({ error: "Org already has a company_admin" }, { status: 409 }),
      );
    }
  }

  // Check email uniqueness within org
  const [dup] = await db`
    SELECT id FROM users WHERE org_id = ${targetOrgId} AND email = ${data.email} LIMIT 1
  `;
  if (dup) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Email already in use" }, { status: 409 }),
    );
  }

  const id = uuidv7();
  const hash = await hashPassword(data.password);

  await db`
    INSERT INTO users (
      id, org_id, email, password_hash, role, full_name, mobile,
      warehouse_id, mfa_required
    ) VALUES (
      ${id}, ${targetOrgId}, ${data.email}, ${hash}, ${data.role},
      ${data.fullName}, ${data.mobile ?? null},
      ${data.warehouseId ?? null}, ${data.mfaRequired}
    )
  `;

  await recordPasswordHistory(id, hash);

  await writeAuditEvent({
    orgId: targetOrgId,
    actorId: actor.sub,
    actorRole: actor.role,
    action: "user.created",
    resourceType: "user",
    resourceId: id,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    payload: { email: data.email, role: data.role },
  });

  return applySecurityHeaders(
    NextResponse.json({ id, email: data.email, role: data.role }, { status: 201 }),
  );
}

// GET /api/v2/users — list users in the org. Any authenticated user can read
// (managers need this to look up the WH manager for a warehouse, etc.).
// Cross-org access via ?orgId= is gated to superadmin only.
export async function GET(req: NextRequest): Promise<NextResponse> {
  let actor;
  try {
    actor = await requireUser(req);
  } catch {
    return applySecurityHeaders(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 2000);
  const offset = Number(searchParams.get("offset") ?? 0);
  const role = searchParams.get("role");
  const requestedOrgId = searchParams.get("orgId");
  const targetOrgId = actor.role === "superadmin" && requestedOrgId ? requestedOrgId : actor.org;

  const users = role
    ? await db`
        SELECT id, org_id, email, role, full_name, mobile, warehouse_id, warehouse_ids, is_active, mfa_required, last_login_at, created_at, updated_at
        FROM   users
        WHERE  org_id = ${targetOrgId} AND role = ${role}
        ORDER  BY created_at DESC
        LIMIT  ${limit} OFFSET ${offset}
      `
    : await db`
        SELECT id, org_id, email, role, full_name, mobile, warehouse_id, warehouse_ids, is_active, mfa_required, last_login_at, created_at, updated_at
        FROM   users
        WHERE  org_id = ${targetOrgId}
        ORDER  BY created_at DESC
        LIMIT  ${limit} OFFSET ${offset}
      `;

  return applySecurityHeaders(NextResponse.json({ users, limit, offset }));
}
