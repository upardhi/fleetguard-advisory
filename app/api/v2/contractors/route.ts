import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { uuidv7 } from "@/app/_server/db/uuidv7";
import { requireUser } from "@/app/_server/auth/getUser";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";
import { sendMail } from "@/app/_lib/sendMail";
import { emailProviderAddedAtGate } from "@/app/_lib/serviceProviderEmails";

const CreateContractorSchema = z.object({
  name:          z.string().min(1).max(200),
  code:          z.string().max(50).optional(),
  type:          z.string().max(50).optional(),
  contactName:   z.string().max(200).optional(),
  contactMobile: z.string().max(20).optional(),
  contactPhone:  z.string().max(20).optional(),
  contactEmail:  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().email().max(200).optional(),
  ),
  address:       z.string().max(500).optional(),
  city:          z.string().max(100).optional(),
  state:         z.string().max(100).optional(),
  warehouseId:   z.string().nullable().optional(),
  isActive:      z.boolean().optional(),
  orgId:         z.string().min(1).optional(),
  notifyManager: z.boolean().optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { searchParams } = new URL(req.url);
  // Default limit is 20 for typeahead; callers that need the full list pass a higher value.
  const limit        = Math.min(Number(searchParams.get("limit") ?? 20), 2000);
  const offset       = Number(searchParams.get("offset") ?? 0);
  const requestedOrgId = searchParams.get("orgId");
  const targetOrgId  = actor.role === "superadmin" && requestedOrgId ? requestedOrgId : actor.org;
  const search       = searchParams.get("q")?.trim() ?? "";
  const warehouseId  = searchParams.get("warehouseId");

  const contractors = await db`
    SELECT c.id, c.org_id, c.name, c.code, c.type,
           c.contact_name, c.contact_mobile, c.contact_email,
           c.address, c.city, c.state, c.warehouse_id,
           c.is_active, c.status, c.created_by_uid,
           c.reviewed_at, c.reviewed_by, c.reject_reason,
           c.created_at, c.updated_at,
           COUNT(DISTINCT d.id) FILTER (WHERE d.is_active) AS active_drivers,
           COUNT(DISTINCT v.id) FILTER (WHERE v.is_active) AS active_vehicles
    FROM   contractors c
    LEFT   JOIN drivers  d ON d.contractor_id = c.id
    LEFT   JOIN vehicles v ON v.contractor_id = c.id
    WHERE  c.org_id    = ${targetOrgId}
      AND  c.is_active = true
      -- Gate typeahead (warehouseId param present) only sees approved providers,
      -- so guards never select pending/rejected at entry. Manager portal calls
      -- without warehouseId and gets every status for review.
      ${warehouseId ? db`AND c.status = 'approved'` : db``}
      ${search      ? db`AND c.name ILIKE ${"%" + search + "%"}`           : db``}
      ${warehouseId ? db`AND (c.warehouse_id = ${warehouseId} OR c.warehouse_id IS NULL)` : db``}
    GROUP  BY c.id
    ORDER  BY c.name ASC
    LIMIT  ${limit} OFFSET ${offset}
  `;

  return applySecurityHeaders(NextResponse.json({ contractors, limit, offset }));
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  if (!["superadmin", "company_admin", "wh_manager", "regional_manager", "cso", "guard"].includes(actor.role)) {
    return applySecurityHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  const parsed = CreateContractorSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }

  const d = parsed.data;
  const id = uuidv7();
  const targetOrgId = actor.role === "superadmin" && d.orgId ? d.orgId : actor.org;
  // Form sends contactPhone; legacy callers send contactMobile. Accept either.
  const mobile = d.contactMobile ?? d.contactPhone ?? "";
  // Guards add providers on the fly with only a name; route those rows to a
  // pending state so the warehouse manager can review and approve. Every other
  // role keeps creating fully-approved rows.
  const initialStatus = actor.role === "guard" ? "pending" : "approved";

  await db`
    INSERT INTO contractors (
      id, org_id, name, code, type,
      contact_name, contact_mobile, contact_email,
      address, city, state, warehouse_id, is_active,
      status, created_by_uid
    )
    VALUES (
      ${id}, ${targetOrgId}, ${d.name}, ${d.code ?? null}, ${d.type ?? null},
      ${d.contactName ?? ""}, ${mobile}, ${d.contactEmail ?? null},
      ${d.address ?? null}, ${d.city ?? null}, ${d.state ?? null},
      ${d.warehouseId ?? null}, ${d.isActive ?? true},
      ${initialStatus}, ${actor.sub}
    )
  `;

  await writeAuditEvent({
    orgId: targetOrgId,
    actorId: actor.sub,
    actorRole: actor.role,
    action: "contractor.created",
    resourceType: "contractor",
    resourceId: id,
    payload: { name: d.name, code: d.code },
  });

  // Notify the warehouse manager when a guard (or any caller that opted in)
  // adds a new provider on the fly from the gate. Best-effort — failure to
  // mail does not fail the create.
  const shouldNotify = d.notifyManager ?? actor.role === "guard";
  if (shouldNotify && d.warehouseId) {
    try {
      const [mgr] = await db`
        SELECT email, full_name
        FROM   users
        WHERE  warehouse_id = ${d.warehouseId}
          AND  role = 'wh_manager'
          AND  is_active = true
        LIMIT  1
      `;
      const [actorRow] = await db`
        SELECT full_name FROM users WHERE id = ${actor.sub} LIMIT 1
      `;
      const [whRow] = await db`
        SELECT name FROM warehouses WHERE id = ${d.warehouseId} LIMIT 1
      `;
      if (mgr?.email) {
        const { subject, html } = emailProviderAddedAtGate({
          managerName:   (mgr.full_name as string | undefined) ?? "Manager",
          warehouseName: (whRow?.name as string | undefined) ?? "your warehouse",
          addedByName:   (actorRow?.full_name as string | undefined) ?? "A gate guard",
          addedByRole:   actor.role,
          providerName:  d.name,
          providerCode:  d.code ?? null,
          providerType:  d.type ?? null,
          contactName:   d.contactName ?? null,
          contactPhone:  mobile || null,
          contactEmail:  d.contactEmail ?? null,
          city:          d.city ?? null,
          state:         d.state ?? null,
        });
        await sendMail({ to: mgr.email as string, subject, html });
      }
    } catch (err) {
      console.error("[contractors] manager notification failed", err);
    }
  }

  return applySecurityHeaders(NextResponse.json({ id }, { status: 201 }));
}
