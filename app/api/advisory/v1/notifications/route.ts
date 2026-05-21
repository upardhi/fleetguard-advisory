import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/app/_server/auth/getUser";
import { db } from "@/app/_server/db/client";
import { applySecurityHeaders } from "@/app/_server/security/headers";

// GET /api/advisory/v1/notifications
// Returns the current user's notification inbox (latest 50, unread first).
export async function GET(req: NextRequest) {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const rows = await db`
    SELECT n.id, n.title, n.body, n.risk_level, n.category,
           n.region_id, r.label AS region_label, r.color AS region_color,
           n.route_id, n.is_read, n.created_at
    FROM   adv_notifications n
    LEFT   JOIN adv_regions r ON r.id = n.region_id
    WHERE  n.user_id = ${actor.sub}
    ORDER  BY n.is_read ASC, n.created_at DESC
    LIMIT  50
  ` as unknown as {
    id: string; title: string; body: string | null; risk_level: string | null;
    category: string | null; region_id: string | null; region_label: string | null;
    region_color: string | null; route_id: string | null; is_read: boolean;
    created_at: string;
  }[];

  const unreadCount = rows.filter((n) => !n.is_read).length;

  return applySecurityHeaders(NextResponse.json({ notifications: rows, unreadCount }));
}
