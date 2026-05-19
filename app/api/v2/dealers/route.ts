import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { uuidv7 } from "@/app/_server/db/uuidv7";
import { requireUser } from "@/app/_server/auth/getUser";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";

const CreateDealerSchema = z.object({
  name:        z.string().min(1).max(200),
  code:        z.string().max(50).optional(),
  contactName: z.string().max(200).optional(),
  mobile:      z.string().max(20).optional(),
  contactPhone:z.string().max(20).optional(),
  city:        z.string().max(100).optional(),
  state:       z.string().max(100).optional(),
  address:     z.string().max(500).optional(),
  pinCode:     z.string().max(10).optional(),
  isActive:    z.boolean().optional(),
  orgId:       z.string().min(1).optional(),
});

// GET /api/v2/dealers
export async function GET(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { searchParams } = new URL(req.url);
  const limit  = Math.min(Number(searchParams.get("limit")  ?? 200), 2000);
  const offset = Number(searchParams.get("offset") ?? 0);
  const requestedOrgId = searchParams.get("orgId");
  const targetOrgId = actor.role === "superadmin" && requestedOrgId ? requestedOrgId : actor.org;

  const dealers = await db`
    SELECT id, org_id, name, code, contact_name, mobile, city, state, address, pin_code,
           is_active, created_at, updated_at
    FROM   dealers
    WHERE  org_id = ${targetOrgId} AND is_active = true
    ORDER  BY name
    LIMIT  ${limit} OFFSET ${offset}
  `;

  return applySecurityHeaders(NextResponse.json({ dealers, limit, offset }));
}

// POST /api/v2/dealers
export async function POST(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  if (!["superadmin", "company_admin", "wh_manager", "regional_manager"].includes(actor.role)) {
    return applySecurityHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  const parsed = CreateDealerSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }

  const d = parsed.data;
  const id = uuidv7();
  const targetOrgId = actor.role === "superadmin" && d.orgId ? d.orgId : actor.org;
  const mobile = d.mobile ?? d.contactPhone ?? null;

  await db`
    INSERT INTO dealers (
      id, org_id, name, code, contact_name, mobile, city, state, address, pin_code, is_active
    )
    VALUES (
      ${id}, ${targetOrgId}, ${d.name}, ${d.code ?? null},
      ${d.contactName ?? null}, ${mobile},
      ${d.city ?? null}, ${d.state ?? null}, ${d.address ?? null},
      ${d.pinCode ?? null}, ${d.isActive ?? true}
    )
  `;

  await writeAuditEvent({
    orgId: targetOrgId, actorId: actor.sub, actorRole: actor.role,
    action: "dealer.created", resourceType: "dealer", resourceId: id,
    payload: { name: d.name, code: d.code },
  });

  return applySecurityHeaders(NextResponse.json({ id }, { status: 201 }));
}
