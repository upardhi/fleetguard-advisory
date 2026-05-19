import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { uuidv7 } from "@/app/_server/db/uuidv7";
import { requireUser } from "@/app/_server/auth/getUser";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";

const CreateTicketSchema = z.object({
  title:       z.string().min(1).max(300),
  description: z.string().min(10).max(5000),
  priority:    z.enum(["low", "medium", "high", "critical"]).default("medium"),
  category:    z.string().max(100).optional(),
});

// GET /api/v2/support-tickets
export async function GET(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const limit  = Math.min(Number(searchParams.get("limit")  ?? 50), 2000);
  const offset = Number(searchParams.get("offset") ?? 0);

  // Superadmin sees all tickets; others see only their org's. Every branch
  // joins `users` so the client gets the creator's name + role (raised_by
  // is just a uid). Without this JOIN the "Creator" column on the
  // superadmin tickets page renders blank.
  const tickets = (actor.role === "superadmin" && status)
    ? await db`
        SELECT t.id, t.org_id, t.raised_by, t.title, t.description, t.status,
               t.priority, t.assigned_to, t.category, t.resolution,
               t.created_at, t.updated_at,
               u.full_name AS raised_by_name,
               u.role      AS raised_by_role
        FROM   support_tickets t
        LEFT JOIN users u ON u.id = t.raised_by
        WHERE  t.status = ${status}
        ORDER  BY t.created_at DESC LIMIT ${limit} OFFSET ${offset}
      `
    : (actor.role === "superadmin")
    ? await db`
        SELECT t.id, t.org_id, t.raised_by, t.title, t.description, t.status,
               t.priority, t.assigned_to, t.category, t.resolution,
               t.created_at, t.updated_at,
               u.full_name AS raised_by_name,
               u.role      AS raised_by_role
        FROM   support_tickets t
        LEFT JOIN users u ON u.id = t.raised_by
        ORDER  BY t.created_at DESC LIMIT ${limit} OFFSET ${offset}
      `
    : status
    ? await db`
        SELECT t.id, t.org_id, t.raised_by, t.title, t.description, t.status,
               t.priority, t.assigned_to, t.category, t.resolution,
               t.created_at, t.updated_at,
               u.full_name AS raised_by_name,
               u.role      AS raised_by_role
        FROM   support_tickets t
        LEFT JOIN users u ON u.id = t.raised_by
        WHERE  t.org_id = ${actor.org} AND t.status = ${status}
        ORDER  BY t.created_at DESC LIMIT ${limit} OFFSET ${offset}
      `
    : await db`
        SELECT t.id, t.org_id, t.raised_by, t.title, t.description, t.status,
               t.priority, t.assigned_to, t.category, t.resolution,
               t.created_at, t.updated_at,
               u.full_name AS raised_by_name,
               u.role      AS raised_by_role
        FROM   support_tickets t
        LEFT JOIN users u ON u.id = t.raised_by
        WHERE  t.org_id = ${actor.org}
        ORDER  BY t.created_at DESC LIMIT ${limit} OFFSET ${offset}
      `;

  return applySecurityHeaders(NextResponse.json({ tickets, limit, offset }));
}

// POST /api/v2/support-tickets
export async function POST(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  const parsed = CreateTicketSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }

  const id = uuidv7();
  await db`
    INSERT INTO support_tickets (id, org_id, raised_by, title, description, priority, category)
    VALUES (${id}, ${actor.org}, ${actor.sub}, ${parsed.data.title}, ${parsed.data.description},
            ${parsed.data.priority}, ${parsed.data.category ?? null})
  `;

  await writeAuditEvent({
    orgId: actor.org, actorId: actor.sub, actorRole: actor.role,
    action: "support_ticket.created", resourceType: "support_ticket", resourceId: id,
    payload: { title: parsed.data.title, priority: parsed.data.priority },
  });

  return applySecurityHeaders(NextResponse.json({ id }, { status: 201 }));
}
