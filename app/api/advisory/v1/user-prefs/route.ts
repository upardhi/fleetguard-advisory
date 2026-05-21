import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/app/_server/auth/getUser";
import { db } from "@/app/_server/db/client";
import { applySecurityHeaders } from "@/app/_server/security/headers";

// GET /api/advisory/v1/user-prefs
export async function GET(req: NextRequest) {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const [prefs] = await db`
    SELECT p.region_id, p.city_id, c.name AS city_name, c.state AS city_state
    FROM   adv_user_prefs p
    LEFT   JOIN adv_cities c ON c.id = p.city_id
    WHERE  p.user_id = ${actor.sub}
  ` as unknown as { region_id: string | null; city_id: string | null; city_name: string | null; city_state: string | null }[];

  const cities = prefs?.region_id ? await db`
    SELECT id, name, state FROM adv_cities
    WHERE org_id = ${actor.org} AND region_id = ${prefs.region_id}
    ORDER BY name
  ` as unknown as { id: string; name: string; state: string | null }[] : [];

  return applySecurityHeaders(NextResponse.json({
    region_id:  prefs?.region_id ?? null,
    city_id:    prefs?.city_id ?? null,
    city_name:  prefs?.city_name ?? null,
    city_state: prefs?.city_state ?? null,
    cities,
  }));
}

// PUT /api/advisory/v1/user-prefs
export async function PUT(req: NextRequest) {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  const body = await req.json() as { region_id?: string | null; city_id?: string | null };

  const r1 = body.region_id ?? null;
  const c1 = body.city_id ?? null;
  await db`
    INSERT INTO adv_user_prefs (user_id, org_id, region_id, city_id, updated_at)
    VALUES (${actor.sub}, ${actor.org}, ${r1}, ${c1}, now())
    ON CONFLICT (user_id)
    DO UPDATE SET region_id = EXCLUDED.region_id, city_id = EXCLUDED.city_id, updated_at = now()
  `;

  return applySecurityHeaders(NextResponse.json({ ok: true }));
}

// PATCH /api/advisory/v1/user-prefs — admin assigns prefs to any user in same org
export async function PATCH(req: NextRequest) {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  if (!["company_admin", "super_admin", "cso"].includes(actor.role)) {
    return applySecurityHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }

  const body = await req.json() as { user_id: string; region_id?: string | null; city_id?: string | null };
  if (!body.user_id) return applySecurityHeaders(NextResponse.json({ error: "user_id required" }, { status: 400 }));

  const r2 = body.region_id ?? null;
  const c2 = body.city_id ?? null;
  await db`
    INSERT INTO adv_user_prefs (user_id, org_id, region_id, city_id, updated_at)
    VALUES (${body.user_id}, ${actor.org}, ${r2}, ${c2}, now())
    ON CONFLICT (user_id)
    DO UPDATE SET region_id = EXCLUDED.region_id, city_id = EXCLUDED.city_id, updated_at = now()
  `;

  return applySecurityHeaders(NextResponse.json({ ok: true }));
}
