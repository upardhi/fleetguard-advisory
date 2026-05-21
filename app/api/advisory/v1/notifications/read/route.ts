import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/app/_server/auth/getUser";
import { db } from "@/app/_server/db/client";
import { applySecurityHeaders } from "@/app/_server/security/headers";

// POST /api/advisory/v1/notifications/read
// Marks all notifications as read for the current user (or specific IDs if body.ids provided).
export async function POST(req: NextRequest) {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const body = await req.json().catch(() => ({})) as { ids?: string[] };

  if (body.ids && body.ids.length > 0) {
    await db`
      UPDATE adv_notifications
      SET    is_read = true
      WHERE  user_id = ${actor.sub}
        AND  id = ANY(${db.array(body.ids)})
    `;
  } else {
    await db`
      UPDATE adv_notifications SET is_read = true
      WHERE  user_id = ${actor.sub} AND is_read = false
    `;
  }

  return applySecurityHeaders(NextResponse.json({ ok: true }));
}
