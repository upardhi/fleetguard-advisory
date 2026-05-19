import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/_server/db/client";
import { requireUser } from "@/app/_server/auth/getUser";
import { applySecurityHeaders } from "@/app/_server/security/headers";

// GET /api/v2/audit?warehouseId=&actorId=&action=&limit=&offset=
export async function GET(req: NextRequest): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const { searchParams } = new URL(req.url);
  const warehouseId = searchParams.get("warehouseId");
  const actorId     = searchParams.get("actorId");
  const action      = searchParams.get("action");
  const limit       = Math.min(Number(searchParams.get("limit")  ?? 50), 2000);
  const offset      = Number(searchParams.get("offset") ?? 0);

  // Build WHERE clauses dynamically. LEFT JOIN users so we can return the
  // actor's display name; it's omitted from the table itself by design.
  const events = (warehouseId && actorId)
    ? await db`
        SELECT a.id, a.actor_id, u.full_name AS actor_name, a.actor_role,
               a.action, a.resource_type, a.resource_id,
               a.warehouse_id, a.payload, a.occurred_at
        FROM   audit_events a
        LEFT JOIN users u ON u.id = a.actor_id
        WHERE  a.org_id = ${actor.org} AND a.warehouse_id = ${warehouseId} AND a.actor_id = ${actorId}
        ORDER  BY a.occurred_at DESC LIMIT ${limit} OFFSET ${offset}
      `
    : warehouseId
    ? await db`
        SELECT a.id, a.actor_id, u.full_name AS actor_name, a.actor_role,
               a.action, a.resource_type, a.resource_id,
               a.warehouse_id, a.payload, a.occurred_at
        FROM   audit_events a
        LEFT JOIN users u ON u.id = a.actor_id
        WHERE  a.org_id = ${actor.org} AND a.warehouse_id = ${warehouseId}
        ORDER  BY a.occurred_at DESC LIMIT ${limit} OFFSET ${offset}
      `
    : actorId
    ? await db`
        SELECT a.id, a.actor_id, u.full_name AS actor_name, a.actor_role,
               a.action, a.resource_type, a.resource_id,
               a.warehouse_id, a.payload, a.occurred_at
        FROM   audit_events a
        LEFT JOIN users u ON u.id = a.actor_id
        WHERE  a.org_id = ${actor.org} AND a.actor_id = ${actorId}
        ORDER  BY a.occurred_at DESC LIMIT ${limit} OFFSET ${offset}
      `
    : action
    ? await db`
        SELECT a.id, a.actor_id, u.full_name AS actor_name, a.actor_role,
               a.action, a.resource_type, a.resource_id,
               a.warehouse_id, a.payload, a.occurred_at
        FROM   audit_events a
        LEFT JOIN users u ON u.id = a.actor_id
        WHERE  a.org_id = ${actor.org} AND a.action = ${action}
        ORDER  BY a.occurred_at DESC LIMIT ${limit} OFFSET ${offset}
      `
    : await db`
        SELECT a.id, a.actor_id, u.full_name AS actor_name, a.actor_role,
               a.action, a.resource_type, a.resource_id,
               a.warehouse_id, a.payload, a.occurred_at
        FROM   audit_events a
        LEFT JOIN users u ON u.id = a.actor_id
        WHERE  a.org_id = ${actor.org}
        ORDER  BY a.occurred_at DESC LIMIT ${limit} OFFSET ${offset}
      `;

  return applySecurityHeaders(NextResponse.json({ events, limit, offset }));
}
