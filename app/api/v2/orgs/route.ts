import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { uuidv7 } from "@/app/_server/db/uuidv7";
import { requireUser } from "@/app/_server/auth/getUser";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";

const CreateOrgSchema = z.object({
  name:         z.string().min(1).max(200),
  plan:         z.string().max(50).optional(),
  shortCode:    z.string().max(16).optional(),
  contactName:  z.string().max(200).optional(),
  contactEmail: z.string().max(200).optional(),
  contactPhone: z.string().max(50).optional(),
  address:      z.string().max(500).optional(),
  city:         z.string().max(100).optional(),
  state:        z.string().max(100).optional(),
  isActive:     z.boolean().optional(),
});

// GET /api/v2/orgs — list orgs (superadmin only) or current org (others)
export async function GET(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  if (actor.role === "superadmin") {
    // Counts come from sub-selects rather than fanning out via JOINs so each
    // count stays accurate independently of the others (a single
    // LEFT JOIN over multiple tables multiplies rows and miscounts).
    const orgs = await db`
      SELECT o.id, o.name, o.plan, o.is_active, o.created_at, o.updated_at,
             o.short_code, o.contact_name, o.contact_email, o.contact_phone,
             o.address, o.city, o.state,
             (SELECT COUNT(*) FROM users      u WHERE u.org_id = o.id AND u.is_active) AS user_count,
             (SELECT COUNT(*) FROM warehouses w WHERE w.org_id = o.id AND w.is_active) AS warehouse_count,
             (SELECT COUNT(*) FROM dealers    d WHERE d.org_id = o.id AND d.is_active) AS dealer_count
      FROM   orgs o
      ORDER  BY o.created_at DESC
    `;
    return applySecurityHeaders(NextResponse.json({ orgs }));
  }

  // Non-superadmin: return just their own org
  const [org] = await db`
    SELECT id, name, plan, is_active, created_at, updated_at,
           short_code, contact_name, contact_email, contact_phone, address, city, state
    FROM   orgs
    WHERE  id = ${actor.org}
    LIMIT  1
  `;
  return applySecurityHeaders(NextResponse.json({ orgs: org ? [org] : [] }));
}

// POST /api/v2/orgs — create org (superadmin only)
export async function POST(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  if (actor.role !== "superadmin") {
    return applySecurityHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  const parsed = CreateOrgSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }

  const id = uuidv7();
  const d = parsed.data;
  await db`
    INSERT INTO orgs (
      id, name, plan, is_active,
      short_code, contact_name, contact_email, contact_phone,
      address, city, state
    )
    VALUES (
      ${id}, ${d.name},
      ${d.plan ?? "standard"}, ${d.isActive ?? true},
      ${d.shortCode ?? null}, ${d.contactName ?? null},
      ${d.contactEmail ?? null}, ${d.contactPhone ?? null},
      ${d.address ?? null}, ${d.city ?? null}, ${d.state ?? null}
    )
  `;

  await writeAuditEvent({
    orgId: id, actorId: actor.sub, actorRole: actor.role,
    action: "org.created", resourceType: "org", resourceId: id,
    payload: { name: d.name },
  });

  return applySecurityHeaders(NextResponse.json({ id }, { status: 201 }));
}
