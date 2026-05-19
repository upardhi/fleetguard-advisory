import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/app/_server/auth/getUser";
import { db } from "@/app/_server/db/client";
import { uuidv7 } from "@/app/_server/db/uuidv7";
import { applySecurityHeaders } from "@/app/_server/security/headers";
import { fetchWatchedRouteSegments } from "@/app/_server/advisory/watcher-pipeline";

const CreateSchema = z.object({
  name:        z.string().trim().max(100).default(""),
  origin:      z.string().trim().min(1).max(100),
  destination: z.string().trim().min(1).max(100),
});

// GET /api/advisory/v1/watched-routes — list routes for the authenticated org
export async function GET(req: NextRequest) {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const routes = await db`
    SELECT id, org_id, name, origin, destination, is_active,
           routes_fetched, last_intel_at, max_risk_level, disruption_count, created_at
    FROM   adv_watched_routes
    WHERE  org_id = ${actor.org} AND is_active = true
    ORDER  BY created_at DESC
  `;

  return applySecurityHeaders(NextResponse.json({ routes }));
}

// POST /api/advisory/v1/watched-routes — add a new watched corridor
export async function POST(req: NextRequest) {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  let body: unknown;
  try { body = await req.json(); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 })); }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 }),
    );
  }

  const { name, origin, destination } = parsed.data;
  const id = uuidv7();

  await db`
    INSERT INTO adv_watched_routes (id, org_id, name, origin, destination)
    VALUES (${id}, ${actor.org}, ${name || `${origin} → ${destination}`}, ${origin}, ${destination})
  `;

  // Kick off route decomposition in the background — don't block the response
  fetchWatchedRouteSegments(id, origin, destination)
    .catch((err) => console.error("[watcher] bg fetch failed:", err));

  return applySecurityHeaders(NextResponse.json({ id }, { status: 201 }));
}
